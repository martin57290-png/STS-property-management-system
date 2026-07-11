import Stripe from 'stripe';
import type { PaymentMethod } from '@prisma/client';
import type { CreatePaymentResult, NormalizedPaymentEvent, PaymentProvider } from './index';

/**
 * Real Stripe implementation. ACH via us_bank_account (lower fees, preferred),
 * card as fallback. Webhooks must be pointed at /api/webhooks/payments and
 * STRIPE_WEBHOOK_SECRET set for signature verification.
 */
export class StripePaymentProvider implements PaymentProvider {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-06-20',
    });
  }

  async createPayment(params: {
    paymentId: string;
    tenancyId: string;
    amountCents: number;
    method: PaymentMethod;
    description: string;
  }): Promise<CreatePaymentResult> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: 'usd',
      description: params.description,
      payment_method_types: params.method === 'ACH' ? ['us_bank_account'] : ['card'],
      metadata: {
        paymentId: params.paymentId,
        tenancyId: params.tenancyId,
      },
    });
    return {
      providerId: intent.id,
      status: 'PENDING',
      clientSecret: intent.client_secret ?? undefined,
    };
  }

  async parseWebhookEvent(
    rawBody: string,
    signature: string | null,
  ): Promise<NormalizedPaymentEvent | null> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !signature) {
      throw new Error('Stripe webhook signature verification is not configured');
    }
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);

    switch (event.type) {
      case 'payment_intent.processing': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return { type: 'payment_processing', providerId: pi.id };
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return { type: 'payment_succeeded', providerId: pi.id };
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        return {
          type: 'payment_failed',
          providerId: pi.id,
          failureReason: pi.last_payment_error?.message ?? 'Payment failed',
        };
      }
      // ACH returns after settlement arrive as refund/dispute-style events on
      // the charge; treat them as returns against the original intent.
      case 'charge.refunded':
      case 'charge.dispute.created': {
        const charge = event.data.object as Stripe.Charge | Stripe.Dispute;
        const piId =
          typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (!piId) return null;
        return { type: 'payment_returned', providerId: piId, failureReason: 'ACH return' };
      }
      default:
        return null;
    }
  }
}
