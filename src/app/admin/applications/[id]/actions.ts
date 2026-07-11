'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { notifyContact } from '@/lib/notifications';
import { applyDecision, type DecisionStatus } from '@/lib/modules/applications/decisions';
import { generateFeeReceipt, type ReceiptLine } from '@/lib/modules/applications/receipt';
import { shortUnitLabel, trackingUrl } from '@/lib/modules/applications/helpers';

const DECISIONS: DecisionStatus[] = ['UNDER_REVIEW', 'APPROVED', 'DENIED', 'WAITLISTED'];

function refresh(id: string): void {
  revalidatePath('/admin/applications');
  revalidatePath(`/admin/applications/${id}`);
}

/**
 * Status action: the submitting button provides `decision`
 * (UNDER_REVIEW | APPROVED | DENIED | WAITLISTED); an optional note is shared.
 */
export async function decideApplication(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const decision = String(formData.get('decision') ?? '') as DecisionStatus;
  if (!DECISIONS.includes(decision)) {
    redirect(`/admin/applications/${id}?error=${encodeURIComponent('Unknown action.')}`);
  }
  const note = String(formData.get('note') ?? '').trim() || null;
  await applyDecision({ applicationId: id, status: decision, note, actorId: user.id });
  refresh(id);
  redirect(`/admin/applications/${id}`);
}

/** Add an internal note (never shown to the applicant). */
export async function addNote(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) {
    redirect(`/admin/applications/${id}?error=${encodeURIComponent('Note cannot be empty.')}`);
  }
  const note = await prisma.applicationNote.create({
    data: { applicationId: id, authorId: user.id, body },
  });
  await audit({
    actorId: user.id,
    action: 'application.note_added',
    entityType: 'Application',
    entityId: id,
    meta: { noteId: note.id },
  });
  refresh(id);
  redirect(`/admin/applications/${id}`);
}

/**
 * Record the application screening fee as collected, generate the itemized
 * receipt PDF required by CA Civ. Code § 1950.6, and email the applicant.
 */
export async function recordFee(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const failUrl = (message: string) =>
    `/admin/applications/${id}?feeError=${encodeURIComponent(message)}`;

  const app = await prisma.application.findUnique({
    where: { id },
    include: { unit: { include: { property: true } } },
  });
  if (!app) redirect(failUrl('Application not found.'));
  if (app.feePaidAt) redirect(failUrl('The fee has already been recorded for this application.'));

  const amountCents = parseDollarsToCents(String(formData.get('amount') ?? ''));
  if (amountCents == null || amountCents <= 0) {
    redirect(failUrl('Enter a valid fee amount in dollars.'));
  }
  const paymentRef = String(formData.get('paymentRef') ?? '').trim() || null;

  const lines: ReceiptLine[] = [];
  for (let i = 1; i <= 4; i += 1) {
    const description = String(formData.get(`lineDesc${i}`) ?? '').trim();
    const amountRaw = String(formData.get(`lineAmount${i}`) ?? '').trim();
    if (!description && !amountRaw) continue;
    const cents = parseDollarsToCents(amountRaw);
    if (!description || cents == null) {
      redirect(failUrl(`Itemization line ${i} needs both a description and a valid dollar amount.`));
    }
    lines.push({ description, amountCents: cents });
  }
  if (lines.length === 0) {
    lines.push({
      description: 'Tenant screening services (credit report and application processing)',
      amountCents,
    });
  }
  const linesTotal = lines.reduce((sum, l) => sum + l.amountCents, 0);
  if (linesTotal !== amountCents) {
    redirect(
      failUrl(
        `Itemized lines total ${formatCents(linesTotal)} but the fee amount is ${formatCents(amountCents)} — they must match (§ 1950.6 receipts must itemize the full fee).`,
      ),
    );
  }

  const receiptKey = await generateFeeReceipt({
    application: app,
    lines,
    totalCents: amountCents,
    paymentRef,
    actorId: user.id,
  });

  await prisma.application.update({
    where: { id: app.id },
    data: {
      feeCents: amountCents,
      feePaidAt: new Date(),
      feePaymentRef: paymentRef,
      feeReceiptKey: receiptKey,
    },
  });

  await audit({
    actorId: user.id,
    action: 'application.fee_recorded',
    entityType: 'Application',
    entityId: app.id,
    meta: {
      amountCents,
      paymentRef: paymentRef ?? undefined,
      receiptKey,
      lines: lines.map((l) => ({ description: l.description, amountCents: l.amountCents })),
    },
  });

  await notifyContact({
    email: app.email,
    phone: app.phone,
    event: 'GENERAL',
    subject: `Receipt for your application screening fee — ${shortUnitLabel(app.unit)}`,
    body:
      `Hi ${app.firstName},\n\nWe collected your application screening fee of ` +
      `${formatCents(amountCents)} for ${shortUnitLabel(app.unit)}. An itemized receipt ` +
      `(required by California Civil Code § 1950.6) is now available on your application ` +
      `status page:\n\n${trackingUrl(app.trackingToken)}\n\n— STS Property Management`,
    smsBody: `STS: your ${formatCents(amountCents)} screening fee was received. Itemized receipt: ${trackingUrl(app.trackingToken)}`,
  });

  refresh(id);
  redirect(`/admin/applications/${id}`);
}
