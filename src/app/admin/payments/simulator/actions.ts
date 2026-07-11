'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { applyPaymentEvent } from '@/lib/ledger';
import type { PaymentEventType } from '@/lib/payments';

const SIMULATABLE: PaymentEventType[] = ['payment_succeeded', 'payment_failed', 'payment_returned'];

function backToSimulator(params: { notice?: string; error?: string; focus?: string }): never {
  const qs = new URLSearchParams();
  if (params.notice) qs.set('notice', params.notice);
  if (params.error) qs.set('error', params.error);
  if (params.focus) qs.set('focus', params.focus);
  redirect(`/admin/payments/simulator?${qs.toString()}`);
}

/**
 * Simulate a provider webhook for a mock payment. We call applyPaymentEvent()
 * directly — the exact function the real webhook route
 * (/api/webhooks/payments) invokes after parsing — so the reconciliation
 * path is identical. For full HTTP parity you could instead POST JSON
 * { type, providerId, failureReason } to /api/webhooks/payments; the mock
 * provider's parseWebhookEvent accepts exactly that shape.
 */
export async function simulateWebhookAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const paymentId = String(formData.get('paymentId') ?? '');
  const typeRaw = String(formData.get('type') ?? '');
  const failureReason = String(formData.get('failureReason') ?? '').trim() || undefined;

  const type = SIMULATABLE.find((t) => t === typeRaw);
  if (!type) {
    backToSimulator({ error: 'Unknown event type.' });
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !payment.providerId) {
    backToSimulator({ error: 'Payment not found or has no provider id yet.' });
  }
  if (!payment.providerId.startsWith('mock_')) {
    // Real Stripe payments reconcile via genuine Stripe webhooks only.
    backToSimulator({
      error: 'Only mock payments can be simulated. Stripe payments reconcile via real webhooks.',
      focus: payment.id,
    });
  }

  let error: string | null = null;
  try {
    await applyPaymentEvent({ type, providerId: payment.providerId, failureReason });
    await audit({
      actorId: user.id,
      action: 'payment.simulated_event',
      entityType: 'Payment',
      entityId: payment.id,
      meta: { type, failureReason: failureReason ?? null },
    });
  } catch (err) {
    console.error('[simulator] applyPaymentEvent failed', err);
    error = 'Failed to apply the simulated event.';
  }

  revalidatePath('/admin/payments/simulator');
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/payments/${payment.tenancyId}`);
  revalidatePath('/tenant/payments');
  if (error) backToSimulator({ error, focus: payment.id });

  const label =
    type === 'payment_succeeded'
      ? 'cleared (succeeded)'
      : type === 'payment_failed'
        ? 'failed'
        : 'returned (ACH return)';
  backToSimulator({ notice: `Simulated webhook applied — payment ${label}.`, focus: payment.id });
}
