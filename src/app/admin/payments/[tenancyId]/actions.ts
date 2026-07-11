'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ChargeCategory, LedgerEntryType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { addLedgerEntry } from '@/lib/ledger';
import { parseDollarsToCents } from '@/lib/money';
import { laDateToUtc } from '@/lib/dates';
import { CHARGE_CATEGORY_OPTIONS } from '@/lib/modules/payments/helpers';

function backToLedger(tenancyId: string, params: { notice?: string; error?: string }): never {
  const qs = new URLSearchParams();
  if (params.notice) qs.set('notice', params.notice);
  if (params.error) qs.set('error', params.error);
  redirect(`/admin/payments/${tenancyId}?${qs.toString()}`);
}

/**
 * Add a manual CHARGE or CREDIT to a tenancy's ledger. PAYMENT entries are
 * deliberately excluded — they're only created by payment reconciliation.
 */
export async function addLedgerEntryAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const tenancyId = String(formData.get('tenancyId') ?? '');

  const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId } });
  if (!tenancy) {
    redirect('/admin/payments?error=Tenancy+not+found');
  }

  const typeRaw = String(formData.get('type') ?? '');
  const type: LedgerEntryType | null =
    typeRaw === 'CHARGE' ? 'CHARGE' : typeRaw === 'CREDIT' ? 'CREDIT' : null;
  if (!type) {
    backToLedger(tenancyId, { error: 'Entry type must be Charge or Credit.' });
  }

  const categoryRaw = String(formData.get('category') ?? '');
  const category = CHARGE_CATEGORY_OPTIONS.find((c) => c.value === categoryRaw)?.value as
    | ChargeCategory
    | undefined;
  if (!category) {
    backToLedger(tenancyId, { error: 'Choose a category.' });
  }

  const amountCents = parseDollarsToCents(String(formData.get('amount') ?? ''));
  if (amountCents == null || amountCents <= 0) {
    backToLedger(tenancyId, { error: 'Enter an amount greater than zero.' });
  }

  const description = String(formData.get('description') ?? '').trim();
  if (!description) {
    backToLedger(tenancyId, { error: 'Enter a description — it appears on the tenant statement.' });
  }

  const dateRaw = String(formData.get('effectiveDate') ?? '');
  const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? laDateToUtc(dateRaw) : undefined;

  let error: string | null = null;
  try {
    // addLedgerEntry writes the audit log entry itself.
    await addLedgerEntry({
      tenancyId,
      type,
      category,
      amountCents,
      description,
      effectiveDate,
      actorId: user.id,
    });
  } catch (err) {
    console.error('[payments] add ledger entry failed', err);
    error = 'Failed to add the entry. Try again.';
  }

  revalidatePath(`/admin/payments/${tenancyId}`);
  revalidatePath('/admin/payments');
  revalidatePath('/tenant/payments');
  if (error) backToLedger(tenancyId, { error });
  backToLedger(tenancyId, {
    notice: `${type === 'CHARGE' ? 'Charge' : 'Credit'} added to the ledger.`,
  });
}
