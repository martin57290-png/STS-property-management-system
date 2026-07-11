import type { PaymentMethod } from '@prisma/client';
import type { CreatePaymentResult, NormalizedPaymentEvent, PaymentProvider } from './index';

/**
 * Mock payment provider so the app runs end-to-end with no Stripe keys.
 *
 * Behavior:
 * - Card payments succeed synchronously.
 * - ACH payments land in PROCESSING; the admin "payment simulator"
 *   (/admin/payments/simulator) applies simulated webhook events through the
 *   same reconciliation path a real Stripe webhook would (see
 *   /api/webhooks/payments).
 */
export class MockPaymentProvider implements PaymentProvider {
  async createPayment(params: {
    paymentId: string;
    tenancyId: string;
    amountCents: number;
    method: PaymentMethod;
    description: string;
  }): Promise<CreatePaymentResult> {
    const providerId = `mock_pi_${params.paymentId}`;
    if (params.method === 'CARD') {
      return { providerId, status: 'SUCCEEDED' };
    }
    return { providerId, status: 'PROCESSING' };
  }

  async parseWebhookEvent(
    rawBody: string,
    _signature: string | null,
  ): Promise<NormalizedPaymentEvent | null> {
    // Simulated events are plain JSON: { type, providerId, failureReason? }
    const parsed = JSON.parse(rawBody) as Partial<NormalizedPaymentEvent>;
    if (
      !parsed.providerId ||
      !parsed.type ||
      !['payment_processing', 'payment_succeeded', 'payment_failed', 'payment_returned'].includes(
        parsed.type,
      )
    ) {
      return null;
    }
    return {
      type: parsed.type,
      providerId: parsed.providerId,
      failureReason: parsed.failureReason,
    };
  }
}
