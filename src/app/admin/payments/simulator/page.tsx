import Link from 'next/link';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import {
  Badge,
  ButtonLink,
  CardSection,
  EmptyState,
  PageHeader,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
} from '@/lib/modules/payments/helpers';
import { Flash } from '@/lib/modules/payments/Flash';
import { simulateWebhookAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Dev tool for the mock payment driver: replays the webhook reconciliation
 * path (clear / fail / ACH return) against in-flight mock payments so the
 * whole ACH lifecycle can be demonstrated end-to-end without Stripe keys.
 */
export default async function PaymentSimulatorPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string; focus?: string };
}) {
  await requireLandlord();
  const stripeActive = process.env.PAYMENTS_DRIVER === 'stripe';

  const payments = await prisma.payment.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING', 'SUCCEEDED'] } },
    include: {
      tenancy: {
        include: {
          unit: { include: { property: true } },
          tenants: { include: { user: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div>
      <PageHeader
        title="Payment simulator"
        description="Simulate provider webhooks (clear, fail, ACH return) for mock payments — exercises the same reconciliation path as a real Stripe webhook."
        actions={
          <ButtonLink variant="secondary" size="sm" href="/admin/payments">
            Back to rent roll
          </ButtonLink>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      {stripeActive && (
        <p className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          The Stripe driver is active (PAYMENTS_DRIVER=stripe). This tool only affects mock
          payments — real Stripe payments reconcile via genuine Stripe webhooks.
        </p>
      )}

      <CardSection title="Recent payments (pending, processing, succeeded)">
        {payments.length === 0 ? (
          <EmptyState
            title="No payments to simulate"
            description="Make a payment from the tenant portal (an ACH payment will sit in Processing until you clear it here)."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Created</Th>
                <Th>Tenancy</Th>
                <Th className="text-right">Amount</Th>
                <Th>Method</Th>
                <Th>Status</Th>
                <Th>Simulate webhook</Th>
              </tr>
            </THead>
            <TBody>
              {payments.map((payment) => {
                const isMock = payment.providerId?.startsWith('mock_') ?? false;
                const focused = searchParams.focus === payment.id;
                const inFlight = payment.status === 'PENDING' || payment.status === 'PROCESSING';
                return (
                  <tr key={payment.id} className={focused ? 'bg-brand-50' : undefined}>
                    <Td className="whitespace-nowrap">{fmtDateTime(payment.createdAt)}</Td>
                    <Td>
                      <Link
                        href={`/admin/payments/${payment.tenancyId}`}
                        className="font-medium text-brand-700 underline hover:text-brand-900"
                      >
                        {payment.tenancy.unit.property.street}, Unit{' '}
                        {payment.tenancy.unit.unitNumber}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {payment.tenancy.tenants.map((t) => t.user.name).join(', ') || '—'}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap text-right font-medium">
                      {formatCents(payment.amountCents)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {PAYMENT_METHOD_LABELS[payment.method]}
                      {payment.isAutopay && (
                        <Badge tone="blue" className="ml-1.5">
                          Autopay
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={PAYMENT_STATUS_TONES[payment.status]}>
                        {PAYMENT_STATUS_LABELS[payment.status]}
                      </Badge>
                    </Td>
                    <Td>
                      {!isMock ? (
                        <span className="text-xs text-gray-500">
                          Stripe payment — real webhooks only
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {inFlight && (
                            <>
                              <form action={simulateWebhookAction}>
                                <input type="hidden" name="paymentId" value={payment.id} />
                                <input type="hidden" name="type" value="payment_succeeded" />
                                <SubmitButton variant="secondary" pendingText="Applying…">
                                  Clear (succeed)
                                </SubmitButton>
                              </form>
                              <form action={simulateWebhookAction}>
                                <input type="hidden" name="paymentId" value={payment.id} />
                                <input type="hidden" name="type" value="payment_failed" />
                                <input
                                  type="hidden"
                                  name="failureReason"
                                  value="Insufficient funds"
                                />
                                <SubmitButton variant="danger" pendingText="Applying…">
                                  Fail
                                </SubmitButton>
                              </form>
                            </>
                          )}
                          {(payment.status === 'SUCCEEDED' || inFlight) && (
                            <form action={simulateWebhookAction}>
                              <input type="hidden" name="paymentId" value={payment.id} />
                              <input type="hidden" name="type" value="payment_returned" />
                              <input
                                type="hidden"
                                name="failureReason"
                                value="R01 — insufficient funds (ACH return)"
                              />
                              <SubmitButton variant="danger" pendingText="Applying…">
                                ACH return
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        )}
        <p className="mt-3 text-xs text-gray-500">
          How it works: buttons apply a normalized event via applyPaymentEvent() — the same
          function the /api/webhooks/payments route calls after parsing a provider webhook.
          Clearing posts a PAYMENT ledger entry and notifies the tenants; an ACH return on a
          settled payment posts an offsetting charge so the balance is owed again.
        </p>
      </CardSection>
    </div>
  );
}
