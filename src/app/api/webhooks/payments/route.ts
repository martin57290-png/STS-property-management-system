import { NextRequest, NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import { applyPaymentEvent } from '@/lib/ledger';

export const dynamic = 'force-dynamic';

/**
 * Payment webhook endpoint. With PAYMENTS_DRIVER=stripe, point Stripe's
 * webhook here (signature verified via STRIPE_WEBHOOK_SECRET). With the mock
 * driver, the admin payment simulator posts simulated events to the same
 * endpoint so the reconciliation path is identical.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = await getPaymentProvider().parseWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error('[webhook] signature/parse failure', err);
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  if (!event) return NextResponse.json({ received: true, ignored: true });

  await applyPaymentEvent(event);
  return NextResponse.json({ received: true });
}
