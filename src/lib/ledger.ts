import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { formatCents } from '@/lib/money';
import { notifyTenancyTenants } from '@/lib/notifications';
import { startOfCurrentMonthLA, fmt } from '@/lib/dates';
import type { LedgerEntry, Prisma } from '@prisma/client';
import type { NormalizedPaymentEvent } from '@/lib/payments';

/**
 * Ledger conventions: every entry has positive amountCents.
 * CHARGE increases the balance owed; PAYMENT and CREDIT decrease it.
 */
export function entrySign(type: LedgerEntry['type']): 1 | -1 {
  return type === 'CHARGE' ? 1 : -1;
}

/** Current balance owed for a tenancy (positive = tenant owes). */
export async function computeBalance(tenancyId: string): Promise<number> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { tenancyId },
    select: { type: true, amountCents: true },
  });
  return entries.reduce((sum, e) => sum + entrySign(e.type) * e.amountCents, 0);
}

/** Full ledger with a running balance, oldest first. */
export async function getLedgerWithRunningBalance(tenancyId: string) {
  const entries = await prisma.ledgerEntry.findMany({
    where: { tenancyId },
    orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
    include: { payment: true },
  });
  let balance = 0;
  return entries.map((entry) => {
    balance += entrySign(entry.type) * entry.amountCents;
    return { ...entry, runningBalance: balance };
  });
}

/**
 * Post this month's rent charge for every ACTIVE tenancy that doesn't have
 * one yet. Idempotent. Returns the number of charges posted.
 */
export async function postMonthlyRentCharges(actorId?: string): Promise<number> {
  const monthStart = startOfCurrentMonthLA();
  const tenancies = await prisma.tenancy.findMany({ where: { status: 'ACTIVE' } });
  let posted = 0;
  for (const tenancy of tenancies) {
    const existing = await prisma.ledgerEntry.findFirst({
      where: {
        tenancyId: tenancy.id,
        type: 'CHARGE',
        category: 'RENT',
        effectiveDate: { gte: monthStart },
      },
    });
    if (existing) continue;
    const entry = await prisma.ledgerEntry.create({
      data: {
        tenancyId: tenancy.id,
        type: 'CHARGE',
        category: 'RENT',
        amountCents: tenancy.rentCents,
        description: `Rent — ${fmt(monthStart, 'MMMM yyyy')}`,
        effectiveDate: monthStart,
      },
    });
    await audit({
      actorId,
      action: 'ledger.rent_charge_posted',
      entityType: 'LedgerEntry',
      entityId: entry.id,
      meta: { tenancyId: tenancy.id, amountCents: tenancy.rentCents },
    });
    posted += 1;
  }
  return posted;
}

/** Add an arbitrary ledger entry (admin action). */
export async function addLedgerEntry(params: {
  tenancyId: string;
  type: LedgerEntry['type'];
  category: LedgerEntry['category'];
  amountCents: number;
  description: string;
  effectiveDate?: Date;
  actorId?: string;
  paymentId?: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = params.tx ?? prisma;
  const entry = await db.ledgerEntry.create({
    data: {
      tenancyId: params.tenancyId,
      type: params.type,
      category: params.category,
      amountCents: params.amountCents,
      description: params.description,
      effectiveDate: params.effectiveDate ?? new Date(),
      paymentId: params.paymentId,
    },
  });
  await audit({
    actorId: params.actorId,
    action: `ledger.${params.type.toLowerCase()}_added`,
    entityType: 'LedgerEntry',
    entityId: entry.id,
    meta: { tenancyId: params.tenancyId, amountCents: params.amountCents, category: params.category },
  });
  return entry;
}

/**
 * Reconcile a normalized payment event (from a Stripe webhook or the mock
 * simulator) into Payment status + ledger entries. Idempotent per event type.
 */
export async function applyPaymentEvent(event: NormalizedPaymentEvent): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { providerId: event.providerId },
    include: { ledgerEntries: true },
  });
  if (!payment) {
    console.warn(`[payments] webhook for unknown providerId ${event.providerId}`);
    return;
  }

  switch (event.type) {
    case 'payment_processing': {
      if (payment.status === 'PENDING') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'PROCESSING' },
        });
      }
      break;
    }

    case 'payment_succeeded': {
      if (payment.status === 'SUCCEEDED') return; // already reconciled
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED' },
      });
      const alreadyPosted = payment.ledgerEntries.some((e) => e.type === 'PAYMENT');
      if (!alreadyPosted) {
        await addLedgerEntry({
          tenancyId: payment.tenancyId,
          type: 'PAYMENT',
          category: 'RENT',
          amountCents: payment.amountCents,
          description: `${payment.method === 'ACH' ? 'ACH' : 'Card'} payment received`,
          paymentId: payment.id,
        });
      }
      await audit({
        action: 'payment.succeeded',
        entityType: 'Payment',
        entityId: payment.id,
        meta: { amountCents: payment.amountCents },
      });
      await notifyTenancyTenants(payment.tenancyId, {
        event: 'PAYMENT_RECEIVED',
        subject: 'Payment received',
        body: `We received your payment of ${formatCents(payment.amountCents)}. Thank you!`,
        smsBody: `STS: payment of ${formatCents(payment.amountCents)} received. Thank you!`,
      });
      break;
    }

    case 'payment_failed': {
      // A failure on an already-settled payment is effectively a return.
      if (payment.status === 'SUCCEEDED') {
        return applyPaymentEvent({ ...event, type: 'payment_returned' });
      }
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: event.failureReason ?? 'Payment failed' },
      });
      await audit({
        action: 'payment.failed',
        entityType: 'Payment',
        entityId: payment.id,
        meta: { reason: event.failureReason },
      });
      await notifyTenancyTenants(payment.tenancyId, {
        event: 'PAYMENT_FAILED',
        subject: 'Payment failed',
        body: `Your payment of ${formatCents(payment.amountCents)} did not go through (${event.failureReason ?? 'payment failed'}). Please try again or contact your landlord.`,
        smsBody: `STS: your payment of ${formatCents(payment.amountCents)} failed. Please log in to retry.`,
      });
      break;
    }

    case 'payment_returned': {
      if (payment.status === 'RETURNED') return;
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'RETURNED', failureReason: event.failureReason ?? 'ACH return' },
      });
      // Offset the earlier PAYMENT entry so the balance is owed again.
      const hadPosted = payment.ledgerEntries.some((e) => e.type === 'PAYMENT');
      if (hadPosted) {
        await addLedgerEntry({
          tenancyId: payment.tenancyId,
          type: 'CHARGE',
          category: 'OTHER',
          amountCents: payment.amountCents,
          description: `ACH payment returned (${event.failureReason ?? 'bank return'})`,
          paymentId: payment.id,
        });
      }
      await audit({
        action: 'payment.returned',
        entityType: 'Payment',
        entityId: payment.id,
        meta: { reason: event.failureReason },
      });
      await notifyTenancyTenants(payment.tenancyId, {
        event: 'PAYMENT_FAILED',
        subject: 'Payment returned by your bank',
        body: `Your payment of ${formatCents(payment.amountCents)} was returned by your bank (${event.failureReason ?? 'ACH return'}). The amount has been added back to your balance.`,
        smsBody: `STS: your ${formatCents(payment.amountCents)} payment was returned by your bank. Balance updated.`,
      });
      break;
    }
  }
}
