'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { addDays } from 'date-fns';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { laDateToUtc, fmt } from '@/lib/dates';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { notifyTenancyTenants } from '@/lib/notifications';
import {
  appBaseUrl,
  DEDUCTION_CATEGORIES,
  photoKeyList,
  shortUnitLabel,
} from '@/lib/modules/inspections/helpers';
import { generateDispositionPdf } from '@/lib/modules/inspections/disposition-pdf';

function basePath(tenancyId: string): string {
  return `/admin/inspections/disposition/${tenancyId}`;
}

function refresh(tenancyId: string): void {
  revalidatePath(basePath(tenancyId));
  revalidatePath('/admin/inspections');
}

function failUrl(tenancyId: string, message: string): string {
  return `${basePath(tenancyId)}?error=${encodeURIComponent(message)}`;
}

function noticeUrl(tenancyId: string, message: string): string {
  return `${basePath(tenancyId)}?notice=${encodeURIComponent(message)}`;
}

/** Set the move-out date; the 21-day statement deadline is derived from it. */
export async function setMoveOutDate(tenancyId: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const disposition = await prisma.depositDisposition.findUnique({ where: { tenancyId } });
  if (!disposition) redirect(failUrl(tenancyId, 'Deposit disposition not found.'));
  if (disposition.finalizedAt) {
    redirect(failUrl(tenancyId, 'The statement has been finalized and can no longer be changed.'));
  }

  const raw = String(formData.get('moveOutDate') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    redirect(failUrl(tenancyId, 'Enter a valid move-out date.'));
  }
  const moveOutDate = laDateToUtc(raw);
  const statementDueDate = addDays(moveOutDate, 21);

  await prisma.depositDisposition.update({
    where: { tenancyId },
    data: { moveOutDate, statementDueDate },
  });
  await audit({
    actorId: user.id,
    action: 'deposit_disposition.move_out_date_set',
    entityType: 'DepositDisposition',
    entityId: disposition.id,
    meta: {
      tenancyId,
      moveOutDate: moveOutDate.toISOString(),
      statementDueDate: statementDueDate.toISOString(),
    },
  });

  refresh(tenancyId);
  redirect(
    noticeUrl(
      tenancyId,
      `Move-out date saved — the itemized statement is due by ${fmt(statementDueDate)} (21 days, Civ. Code § 1950.5(g)).`,
    ),
  );
}

/** Add an itemized deduction, optionally referencing move-out inspection photos. */
export async function addDeduction(tenancyId: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const disposition = await prisma.depositDisposition.findUnique({ where: { tenancyId } });
  if (!disposition) redirect(failUrl(tenancyId, 'Deposit disposition not found.'));
  if (disposition.finalizedAt) {
    redirect(failUrl(tenancyId, 'The statement has been finalized — deductions can no longer be changed.'));
  }

  const categoryRaw = String(formData.get('category') ?? '');
  const category = DEDUCTION_CATEGORIES.find((c) => c === categoryRaw);
  const description = String(formData.get('description') ?? '').trim();
  const amountCents = parseDollarsToCents(String(formData.get('amount') ?? ''));

  if (!category) redirect(failUrl(tenancyId, 'Choose a deduction category.'));
  if (!description) redirect(failUrl(tenancyId, 'Describe the deduction — the statement must be itemized.'));
  if (amountCents == null || amountCents <= 0) {
    redirect(failUrl(tenancyId, 'Enter a valid deduction amount in dollars.'));
  }

  // Keep only photo keys that really belong to inspection photos.
  const requestedKeys = formData
    .getAll('photoKeys')
    .map((v) => String(v))
    .filter(Boolean);
  let photoKeys: string[] = [];
  if (requestedKeys.length > 0) {
    const docs = await prisma.document.findMany({
      where: { storageKey: { in: requestedKeys }, category: 'INSPECTION_PHOTO' },
      select: { storageKey: true },
    });
    photoKeys = docs.map((d) => d.storageKey);
  }

  const deduction = await prisma.depositDeduction.create({
    data: {
      dispositionId: disposition.id,
      category,
      description,
      amountCents,
      photoKeys: photoKeys.length > 0 ? photoKeys : undefined,
    },
  });
  await audit({
    actorId: user.id,
    action: 'deposit_disposition.deduction_added',
    entityType: 'DepositDeduction',
    entityId: deduction.id,
    meta: { tenancyId, category, amountCents, photoKeys },
  });

  refresh(tenancyId);
  redirect(noticeUrl(tenancyId, `Deduction added — ${category}, ${formatCents(amountCents)}.`));
}

/** Remove a deduction from the worksheet. */
export async function removeDeduction(tenancyId: string, deductionId: string): Promise<void> {
  const user = await requireLandlord();
  const disposition = await prisma.depositDisposition.findUnique({ where: { tenancyId } });
  if (!disposition) redirect(failUrl(tenancyId, 'Deposit disposition not found.'));
  if (disposition.finalizedAt) {
    redirect(failUrl(tenancyId, 'The statement has been finalized — deductions can no longer be changed.'));
  }

  const deduction = await prisma.depositDeduction.findUnique({ where: { id: deductionId } });
  if (!deduction || deduction.dispositionId !== disposition.id) {
    redirect(failUrl(tenancyId, 'Deduction not found.'));
  }

  await prisma.depositDeduction.delete({ where: { id: deductionId } });
  await audit({
    actorId: user.id,
    action: 'deposit_disposition.deduction_removed',
    entityType: 'DepositDeduction',
    entityId: deductionId,
    meta: {
      tenancyId,
      category: deduction.category,
      amountCents: deduction.amountCents,
      photoKeys: photoKeyList(deduction.photoKeys),
    },
  });

  refresh(tenancyId);
  redirect(noticeUrl(tenancyId, 'Deduction removed.'));
}

/** Finalize the disposition: render + store the itemized statement PDF. */
export async function finalizeDisposition(tenancyId: string): Promise<void> {
  const user = await requireLandlord();
  const disposition = await prisma.depositDisposition.findUnique({
    where: { tenancyId },
    include: {
      deductions: true,
      tenancy: { include: { unit: { include: { property: true } } } },
    },
  });
  if (!disposition) redirect(failUrl(tenancyId, 'Deposit disposition not found.'));
  if (disposition.finalizedAt) {
    redirect(failUrl(tenancyId, 'This disposition has already been finalized.'));
  }
  if (!disposition.moveOutDate) {
    redirect(failUrl(tenancyId, 'Set the move-out date before finalizing — it anchors the 21-day statutory deadline.'));
  }

  const pdfKey = await generateDispositionPdf({ tenancyId, actorId: user.id });

  const finalizedAt = new Date();
  await prisma.depositDisposition.update({
    where: { tenancyId },
    data: { pdfKey, finalizedAt },
  });

  const totalDeductions = disposition.deductions.reduce((sum, d) => sum + d.amountCents, 0);
  const refundCents = disposition.depositCents - totalDeductions;

  await audit({
    actorId: user.id,
    action: 'deposit_disposition.finalized',
    entityType: 'DepositDisposition',
    entityId: disposition.id,
    meta: {
      tenancyId,
      pdfKey,
      depositCents: disposition.depositCents,
      totalDeductionCents: totalDeductions,
      refundCents,
      deductionCount: disposition.deductions.length,
    },
  });

  const unitLabel = shortUnitLabel(disposition.tenancy.unit);
  const refundLine =
    refundCents >= 0
      ? `Amount refunded to you: ${formatCents(refundCents)}.`
      : `Balance due after applying your deposit: ${formatCents(Math.abs(refundCents))}.`;
  await notifyTenancyTenants(tenancyId, {
    event: 'GENERAL',
    subject: `Security deposit disposition statement — ${unitLabel}`,
    body:
      `Your itemized security deposit disposition statement for ${unitLabel} is ready ` +
      `(California Civil Code § 1950.5(g)).\n\nDeposit held: ${formatCents(disposition.depositCents)}\n` +
      `Total deductions: ${formatCents(totalDeductions)}\n${refundLine}\n\n` +
      `The full statement is available in your resident portal: ${appBaseUrl()}/tenant\n\n— STS Property Management`,
    smsBody: `STS: your security deposit statement for ${unitLabel} is ready. ${refundLine}`,
  });

  refresh(tenancyId);
  redirect(noticeUrl(tenancyId, 'Disposition finalized — the itemized statement PDF is ready below.'));
}
