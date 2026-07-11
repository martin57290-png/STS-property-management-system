import type { PaymentMethod } from '@prisma/client';
import { MockPaymentProvider } from './mock';
import { StripePaymentProvider } from './stripe';

/**
 * Payment provider abstraction. PAYMENTS_DRIVER=mock simulates ACH/card
 * end-to-end with no keys; PAYMENTS_DRIVER=stripe uses the real Stripe API.
 */

export type CreatePaymentResult = {
  providerId: string;
  /** Initial provider status right after creation. */
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED';
  /** Stripe client secret when the client must confirm (Elements flow). */
  clientSecret?: string;
};

export type PaymentEventType =
  | 'payment_processing'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'payment_returned';

export type NormalizedPaymentEvent = {
  type: PaymentEventType;
  providerId: string;
  failureReason?: string;
};

export interface PaymentProvider {
  /**
   * Initiate a payment for the given internal Payment row.
   * ACH typically lands in PROCESSING; card may succeed synchronously.
   */
  createPayment(params: {
    paymentId: string;
    tenancyId: string;
    amountCents: number;
    method: PaymentMethod;
    description: string;
  }): Promise<CreatePaymentResult>;

  /**
   * Verify + normalize an incoming webhook. Returns null for event types
   * this app does not care about.
   */
  parseWebhookEvent(rawBody: string, signature: string | null): Promise<NormalizedPaymentEvent | null>;
}

let instance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!instance) {
    instance =
      process.env.PAYMENTS_DRIVER === 'stripe' && process.env.STRIPE_SECRET_KEY
        ? new StripePaymentProvider()
        : new MockPaymentProvider();
  }
  return instance;
}
