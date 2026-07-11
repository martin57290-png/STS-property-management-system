'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PaymentMethod } from '@prisma/client';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { parseDollarsToCents, formatCents } from '@/lib/money';
import { initiatePayment } from '@/lib/modules/payments/service';

/** Sanity ceiling on a single online payment. */
const MAX_PAYMENT_CENTS = 5_000_000; // $50,000

function backToPayments(params: { notice?: string; error?: string }): never {
  const qs = new URLSearchParams();
  if (params.notice) qs.set('notice', params.notice);
  if (params.error) qs.set('error', params.error);
  redirect(`/tenant/payments?${qs.toString()}`);
}

/**
 * Tenant-initiated payment. Partial payments are allowed — any amount > 0.
 * The tenancy is always derived from the signed-in tenant's session; hidden
 * form fields are never trusted for scoping.
 */
export async function makePaymentAction(formData: FormData): Promise<void> {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);
  if (!tenancy) {
    backToPayments({ error: 'No tenancy is linked to your account. Contact your landlord.' });
  }

  const amountCents = parseDollarsToCents(String(formData.get('amount') ?? ''));
  if (amountCents == null || amountCents <= 0) {
    backToPayments({ error: 'Enter a payment amount greater than zero.' });
  }
  if (amountCents > MAX_PAYMENT_CENTS) {
    backToPayments({
      error: `Online payments are limited to ${formatCents(MAX_PAYMENT_CENTS)}. Contact your landlord for larger payments.`,
    });
  }

  const methodRaw = String(formData.get('method') ?? '');
  const method: PaymentMethod | null =
    methodRaw === 'ACH' ? 'ACH' : methodRaw === 'CARD' ? 'CARD' : null;
  if (!method) {
    backToPayments({ error: 'Choose a payment method.' });
  }

  let outcome: { notice?: string; error?: string };
  try {
    const { result } = await initiatePayment({
      tenancyId: tenancy.id,
      amountCents,
      method,
      isAutopay: false,
      actorId: user.id,
      description: `Rent payment — ${tenancy.unit.property.street}, Unit ${tenancy.unit.unitNumber}`,
    });

    if (result.status === 'SUCCEEDED') {
      outcome = { notice: `Payment of ${formatCents(amountCents)} received. Thank you!` };
    } else if (result.status === 'PROCESSING') {
      outcome = {
        notice: `Payment of ${formatCents(amountCents)} initiated. ACH payments take 3–5 business days to clear — you'll get a confirmation once it settles.`,
      };
    } else {
      // PENDING with a clientSecret (real Stripe): card/bank confirmation
      // completes via the Stripe Elements flow once keys are configured.
      outcome = {
        notice: `Payment of ${formatCents(amountCents)} created and awaiting confirmation. Card/bank confirmation completes via Stripe once payment keys are configured.`,
      };
    }
  } catch (err) {
    console.error('[payments] tenant payment failed', err);
    outcome = { error: 'We could not start your payment. Please try again in a moment.' };
  }

  revalidatePath('/tenant/payments');
  revalidatePath('/admin/payments');
  backToPayments(outcome);
}
