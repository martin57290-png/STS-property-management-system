/**
 * Server-side helpers for the rent-collection module: payment initiation on
 * the provider abstraction, autopay runs, rent-due reminders, and the
 * delinquency-aging report. Shared by tenant/admin server actions and the
 * cron routes so all callers go through identical logic.
 */
import { formatInTimeZone } from 'date-fns-tz';
import type { Payment, PaymentMethod } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { formatCents } from '@/lib/money';
import { APP_TZ, fmt } from '@/lib/dates';
import { notifyTenancyTenants } from '@/lib/notifications';
import { getPaymentProvider, type CreatePaymentResult } from '@/lib/payments';
import { applyPaymentEvent, computeBalance, entrySign } from '@/lib/ledger';
import { agingBucketForDays, nextRentDueDate, type AgingBucket } from './helpers';

// ─── Payment initiation ──────────────────────────────────────────────────────

export type InitiatedPayment = {
  payment: Payment;
  result: CreatePaymentResult;
};

/**
 * Create a Payment row (PENDING) and hand it to the payment provider.
 * - Mock driver: CARD settles synchronously (payment_succeeded applied here);
 *   ACH lands in PROCESSING and clears later via the webhook/simulator.
 * - Stripe driver: may return PENDING + clientSecret; the Elements
 *   confirmation flow completes client-side once keys are configured. The
 *   Payment model has no column for the client secret, so it is only returned
 *   to the caller (never logged) — reconciliation still arrives via webhook.
 */
export async function initiatePayment(params: {
  tenancyId: string;
  amountCents: number;
  method: PaymentMethod;
  isAutopay: boolean;
  actorId?: string | null;
  description?: string;
}): Promise<InitiatedPayment> {
  const payment = await prisma.payment.create({
    data: {
      tenancyId: params.tenancyId,
      amountCents: params.amountCents,
      method: params.method,
      status: 'PENDING',
      isAutopay: params.isAutopay,
    },
  });

  await audit({
    actorId: params.actorId,
    action: 'payment.initiated',
    entityType: 'Payment',
    entityId: payment.id,
    meta: {
      tenancyId: params.tenancyId,
      amountCents: params.amountCents,
      method: params.method,
      isAutopay: params.isAutopay,
    },
  });

  let result: CreatePaymentResult;
  try {
    result = await getPaymentProvider().createPayment({
      paymentId: payment.id,
      tenancyId: params.tenancyId,
      amountCents: params.amountCents,
      method: params.method,
      description: params.description ?? `Rent payment ${formatCents(params.amountCents)}`,
    });
  } catch (err) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        failureReason: err instanceof Error ? err.message : 'Payment provider error',
      },
    });
    await audit({
      actorId: params.actorId,
      action: 'payment.failed',
      entityType: 'Payment',
      entityId: payment.id,
      meta: { reason: 'provider_error' },
    });
    throw err;
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { providerId: result.providerId },
  });

  if (result.status === 'SUCCEEDED') {
    // Card payments settle instantly in mock mode — run the same
    // reconciliation path a webhook would (ledger entry + notification).
    await applyPaymentEvent({ type: 'payment_succeeded', providerId: result.providerId });
  } else if (result.status === 'PROCESSING') {
    await applyPaymentEvent({ type: 'payment_processing', providerId: result.providerId });
  }

  const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
  return { payment: fresh ?? updated, result };
}

// ─── Autopay ─────────────────────────────────────────────────────────────────

export type AutopayRunResult = {
  /** Payments actually initiated. */
  initiated: number;
  /** Enrollments considered but skipped (no balance, in-flight cover, etc.). */
  skipped: number;
};

/**
 * Run autopay for active enrollments on ACTIVE tenancies with a balance owed.
 *
 * Guards (documented deviations from the naive "pay full balance for every
 * enrollment"):
 * - One payment per tenancy per run: joint tenants may both enroll (the
 *   unique key is tenancyId+userId), but charging each of them the full
 *   balance would double-pay. The earliest-created enrollment wins.
 * - In-flight payments (PENDING/PROCESSING, e.g. ACH still clearing) count
 *   against the balance so autopay never double-charges while a prior
 *   payment settles. The amount charged is balance minus in-flight.
 * - `onlyDueTodayLA` restricts the run to enrollments whose dayOfMonth is
 *   today on the LA calendar (used by the daily cron; the admin "run now"
 *   button runs all).
 */
export async function runAutopay(params: {
  actorId?: string | null;
  onlyDueTodayLA?: boolean;
}): Promise<AutopayRunResult> {
  const enrollments = await prisma.autopayEnrollment.findMany({
    where: { active: true, tenancy: { status: 'ACTIVE' } },
    orderBy: { createdAt: 'asc' },
  });

  const todayLA = Number(formatInTimeZone(new Date(), APP_TZ, 'd'));
  const handledTenancies = new Set<string>();
  let initiated = 0;
  let skipped = 0;

  for (const enrollment of enrollments) {
    if (params.onlyDueTodayLA && enrollment.dayOfMonth !== todayLA) continue;
    if (handledTenancies.has(enrollment.tenancyId)) {
      skipped += 1;
      continue;
    }
    handledTenancies.add(enrollment.tenancyId);

    const balance = await computeBalance(enrollment.tenancyId);
    if (balance <= 0) {
      skipped += 1;
      continue;
    }

    const inFlight = await prisma.payment.aggregate({
      where: { tenancyId: enrollment.tenancyId, status: { in: ['PENDING', 'PROCESSING'] } },
      _sum: { amountCents: true },
    });
    const amountCents = balance - (inFlight._sum.amountCents ?? 0);
    if (amountCents <= 0) {
      skipped += 1;
      continue;
    }

    try {
      const { payment } = await initiatePayment({
        tenancyId: enrollment.tenancyId,
        amountCents,
        method: enrollment.method,
        isAutopay: true,
        actorId: params.actorId,
        description: `Autopay rent payment ${formatCents(amountCents)}`,
      });
      await audit({
        actorId: params.actorId,
        action: 'autopay.run',
        entityType: 'AutopayEnrollment',
        entityId: enrollment.id,
        meta: { tenancyId: enrollment.tenancyId, paymentId: payment.id, amountCents },
      });
      initiated += 1;
    } catch (err) {
      console.error('[autopay] failed for enrollment', enrollment.id, err);
      skipped += 1;
    }
  }

  return { initiated, skipped };
}

// ─── Rent-due reminders ──────────────────────────────────────────────────────

/**
 * Email + SMS every tenant on the tenancy with their balance and next due
 * date. Returns false when the tenancy doesn't exist.
 */
export async function sendRentReminder(
  tenancyId: string,
  actorId?: string | null,
): Promise<boolean> {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: { unit: { include: { property: true } } },
  });
  if (!tenancy) return false;

  const balance = await computeBalance(tenancyId);
  const dueDate = nextRentDueDate(tenancy.rentDueDay);
  const unitLabel = `${tenancy.unit.property.street}, Unit ${tenancy.unit.unitNumber}`;

  await notifyTenancyTenants(tenancyId, {
    event: 'RENT_DUE_REMINDER',
    subject: `Rent reminder — ${unitLabel}`,
    body: `This is a friendly reminder for ${unitLabel}. Your current balance is ${formatCents(Math.max(balance, 0))}, with rent of ${formatCents(tenancy.rentCents)} due on ${fmt(dueDate)}. You can pay online from the resident portal (Rent & Payments).`,
    smsBody: `STS: rent reminder — balance ${formatCents(Math.max(balance, 0))}, due ${fmt(dueDate)}. Pay in the resident portal.`,
  });

  await audit({
    actorId,
    action: 'payment.reminder_sent',
    entityType: 'Tenancy',
    entityId: tenancyId,
    meta: { balanceCents: balance, dueDate: dueDate.toISOString() },
  });

  return true;
}

// ─── Balances in bulk ────────────────────────────────────────────────────────

/**
 * Balance for every tenancy that has ledger activity, in one grouped query
 * (positive = owed). Tenancies without entries simply won't appear.
 */
export async function computeAllBalances(): Promise<Map<string, number>> {
  const grouped = await prisma.ledgerEntry.groupBy({
    by: ['tenancyId', 'type'],
    _sum: { amountCents: true },
  });
  const balances = new Map<string, number>();
  for (const row of grouped) {
    const current = balances.get(row.tenancyId) ?? 0;
    balances.set(row.tenancyId, current + entrySign(row.type) * (row._sum.amountCents ?? 0));
  }
  return balances;
}

// ─── Delinquency aging ───────────────────────────────────────────────────────

export type DelinquencyRow = {
  tenancyId: string;
  unitLabel: string;
  tenantNames: string;
  tenancyStatus: string;
  balanceCents: number;
  oldestUnpaidChargeDate: Date | null;
  daysOverdue: number;
  bucket: AgingBucket;
};

/**
 * Aging approach (FIFO): for each tenancy with balance > 0, walk the ledger
 * oldest-first and apply the total pool of PAYMENTs + CREDITs against CHARGEs
 * in chronological order. The first charge the pool cannot fully cover is the
 * "oldest unpaid charge"; days since its effectiveDate pick the bucket.
 * This is simpler than per-payment matching but gives the same answer for
 * the common case of sequential rent charges and payments.
 */
export async function getDelinquencyReport(): Promise<DelinquencyRow[]> {
  const balances = await computeAllBalances();
  const delinquentIds = [...balances.entries()]
    .filter(([, balance]) => balance > 0)
    .map(([tenancyId]) => tenancyId);
  if (delinquentIds.length === 0) return [];

  const [tenancies, entries] = await Promise.all([
    prisma.tenancy.findMany({
      where: { id: { in: delinquentIds } },
      include: {
        unit: { include: { property: true } },
        tenants: { include: { user: true } },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: { tenancyId: { in: delinquentIds } },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
      select: { tenancyId: true, type: true, amountCents: true, effectiveDate: true },
    }),
  ]);

  const entriesByTenancy = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entriesByTenancy.get(entry.tenancyId);
    if (list) list.push(entry);
    else entriesByTenancy.set(entry.tenancyId, [entry]);
  }

  const rows: DelinquencyRow[] = [];
  for (const tenancy of tenancies) {
    const balanceCents = balances.get(tenancy.id) ?? 0;
    const ledger = entriesByTenancy.get(tenancy.id) ?? [];
    // Total credits available to offset charges, oldest charge first.
    let creditPool = ledger
      .filter((e) => e.type !== 'CHARGE')
      .reduce((sum, e) => sum + e.amountCents, 0);
    let oldestUnpaid: Date | null = null;
    for (const entry of ledger) {
      if (entry.type !== 'CHARGE') continue;
      if (creditPool >= entry.amountCents) {
        creditPool -= entry.amountCents;
      } else {
        oldestUnpaid = entry.effectiveDate;
        break;
      }
    }
    const daysOverdue = oldestUnpaid
      ? Math.max(0, Math.floor((Date.now() - oldestUnpaid.getTime()) / 86_400_000))
      : 0;
    rows.push({
      tenancyId: tenancy.id,
      unitLabel: `${tenancy.unit.property.street}, Unit ${tenancy.unit.unitNumber}`,
      tenantNames: tenancy.tenants.map((t) => t.user.name).join(', ') || '—',
      tenancyStatus: tenancy.status,
      balanceCents,
      oldestUnpaidChargeDate: oldestUnpaid,
      daysOverdue,
      bucket: agingBucketForDays(daysOverdue),
    });
  }

  rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balanceCents - a.balanceCents);
  return rows;
}
