'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { postMonthlyRentCharges } from '@/lib/ledger';
import {
  computeAllBalances,
  runAutopay,
  sendRentReminder,
} from '@/lib/modules/payments/service';

function backToRentRoll(params: { notice?: string; error?: string }): never {
  const qs = new URLSearchParams();
  if (params.notice) qs.set('notice', params.notice);
  if (params.error) qs.set('error', params.error);
  redirect(`/admin/payments?${qs.toString()}`);
}

function revalidateRentRoll(): void {
  revalidatePath('/admin/payments');
  revalidatePath('/tenant/payments');
}

/** Post this month's rent charge for every ACTIVE tenancy (idempotent). */
export async function postRentChargesAction(): Promise<void> {
  const user = await requireLandlord();
  let outcome: { notice?: string; error?: string };
  try {
    const posted = await postMonthlyRentCharges(user.id);
    outcome = {
      notice:
        posted === 0
          ? "No new charges posted — every active tenancy already has this month's rent charge."
          : `Posted ${posted} rent charge${posted === 1 ? '' : 's'} for this month.`,
    };
  } catch (err) {
    console.error('[payments] post rent charges failed', err);
    outcome = { error: 'Failed to post rent charges. Try again.' };
  }
  revalidateRentRoll();
  backToRentRoll(outcome);
}

/** Run autopay immediately for every active enrollment with a balance owed. */
export async function runAutopayAction(): Promise<void> {
  const user = await requireLandlord();
  let outcome: { notice?: string; error?: string };
  try {
    const result = await runAutopay({ actorId: user.id });
    outcome = {
      notice: `Autopay run complete: ${result.initiated} payment${result.initiated === 1 ? '' : 's'} initiated, ${result.skipped} enrollment${result.skipped === 1 ? '' : 's'} skipped (no balance or already in flight).`,
    };
  } catch (err) {
    console.error('[payments] autopay run failed', err);
    outcome = { error: 'Autopay run failed. Check the server logs.' };
  }
  revalidateRentRoll();
  backToRentRoll(outcome);
}

/** Send a rent-due reminder (email + SMS) to every tenant on one tenancy. */
export async function sendReminderAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const tenancyId = String(formData.get('tenancyId') ?? '');
  let outcome: { notice?: string; error?: string };
  try {
    const ok = await sendRentReminder(tenancyId, user.id);
    outcome = ok
      ? { notice: 'Reminder sent to all tenants on the tenancy.' }
      : { error: 'Tenancy not found.' };
  } catch (err) {
    console.error('[payments] send reminder failed', err);
    outcome = { error: 'Failed to send the reminder.' };
  }
  revalidateRentRoll();
  backToRentRoll(outcome);
}

/** Send reminders to every ACTIVE tenancy with a balance owed. */
export async function remindAllUnpaidAction(): Promise<void> {
  const user = await requireLandlord();
  let outcome: { notice?: string; error?: string };
  try {
    const balances = await computeAllBalances();
    const active = await prisma.tenancy.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    let sent = 0;
    for (const tenancy of active) {
      if ((balances.get(tenancy.id) ?? 0) <= 0) continue;
      const ok = await sendRentReminder(tenancy.id, user.id);
      if (ok) sent += 1;
    }
    outcome = {
      notice:
        sent === 0
          ? 'Nothing to send — no active tenancy has a balance owed.'
          : `Reminders sent to ${sent} tenanc${sent === 1 ? 'y' : 'ies'} with a balance owed.`,
    };
  } catch (err) {
    console.error('[payments] remind all failed', err);
    outcome = { error: 'Failed to send reminders.' };
  }
  revalidateRentRoll();
  backToRentRoll(outcome);
}
