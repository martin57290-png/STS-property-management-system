import Link from 'next/link';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents, centsToDollarString } from '@/lib/money';
import { fmt, fmtDateTime } from '@/lib/dates';
import { computeBalance, getLedgerWithRunningBalance } from '@/lib/ledger';
import {
  Badge,
  ButtonLink,
  CardSection,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  StatCard,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import {
  nextRentDueDate,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
} from '@/lib/modules/payments/helpers';
import { Flash } from '@/lib/modules/payments/Flash';
import { makePaymentAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function TenantPaymentsPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);

  if (!tenancy) {
    return (
      <div>
        <PageHeader title="Rent & Payments" />
        <EmptyState
          title="No tenancy on file"
          description="Your account isn't linked to a rental yet. Contact your landlord if this seems wrong."
        />
      </div>
    );
  }

  const [balance, ledger, payments, enrollment] = await Promise.all([
    computeBalance(tenancy.id),
    getLedgerWithRunningBalance(tenancy.id),
    prisma.payment.findMany({
      where: { tenancyId: tenancy.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.autopayEnrollment.findUnique({
      where: { tenancyId_userId: { tenancyId: tenancy.id, userId: user.id } },
    }),
  ]);

  const dueDate = nextRentDueDate(tenancy.rentDueDay);
  const unitLabel = `${tenancy.unit.property.street}, Unit ${tenancy.unit.unitNumber}`;
  const hasPendingConfirmation = payments.some(
    (p) => p.status === 'PENDING' && p.providerId && !p.providerId.startsWith('mock_'),
  );

  return (
    <div>
      <PageHeader
        title="Rent & Payments"
        description={`${unitLabel} · ${tenancy.unit.property.city}, ${tenancy.unit.property.state}`}
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      {/* Header cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Current balance"
          value={balance > 0 ? formatCents(balance) : formatCents(0)}
          tone={balance > 0 ? 'bad' : 'good'}
          sub={balance > 0 ? 'amount owed' : balance < 0 ? `credit of ${formatCents(-balance)}` : "you're all paid up"}
        />
        <StatCard
          label="Monthly rent"
          value={formatCents(tenancy.rentCents)}
          sub={`next due ${fmt(dueDate)}`}
        />
        <StatCard
          label="Autopay"
          value={enrollment?.active ? 'On' : enrollment ? 'Paused' : 'Off'}
          tone={enrollment?.active ? 'good' : enrollment ? 'warn' : 'default'}
          sub={
            enrollment
              ? `day ${enrollment.dayOfMonth} · ${PAYMENT_METHOD_LABELS[enrollment.method]}`
              : 'set it and forget it'
          }
          href="/tenant/payments/autopay"
        />
      </div>

      {/* Pay form */}
      <CardSection
        title="Make a payment"
        className="mb-6"
        actions={
          <ButtonLink variant="secondary" size="sm" href="/tenant/payments/autopay">
            Manage autopay
          </ButtonLink>
        }
      >
        <form action={makePaymentAction} className="space-y-4">
          <FormField
            label="Amount (USD)"
            htmlFor="pay-amount"
            required
            hint="Prefilled with your current balance — you can pay any amount. Partial payments are accepted."
          >
            <Input
              id="pay-amount"
              name="amount"
              type="text"
              inputMode="decimal"
              required
              defaultValue={balance > 0 ? centsToDollarString(balance) : ''}
              placeholder="0.00"
              className="max-w-xs"
            />
          </FormField>

          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-gray-800">
              Payment method <span className="text-red-600" aria-hidden> *</span>
            </legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 text-sm text-gray-800 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input
                  type="radio"
                  name="method"
                  value="ACH"
                  defaultChecked
                  className="mt-0.5 h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                />
                <span>
                  <span className="font-medium">Bank account (ACH)</span> — preferred, no card fees.
                  Takes 3–5 business days to clear.
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 text-sm text-gray-800 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input
                  type="radio"
                  name="method"
                  value="CARD"
                  className="mt-0.5 h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                />
                <span>
                  <span className="font-medium">Card</span> — settles right away.
                </span>
              </label>
            </div>
          </fieldset>

          <SubmitButton pendingText="Submitting payment…">Pay now</SubmitButton>
        </form>

        {hasPendingConfirmation && (
          <p className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            You have a payment awaiting card/bank confirmation. Confirmation completes via Stripe
            once payment keys are configured.
          </p>
        )}
      </CardSection>

      {/* Payment history */}
      <CardSection title="Payment history" className="mb-6">
        {payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Payments you make will show up here with their status."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Amount</Th>
                <Th>Method</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(payment.createdAt)}</Td>
                  <Td className="whitespace-nowrap font-medium">{formatCents(payment.amountCents)}</Td>
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
                    {payment.status === 'PROCESSING' && (
                      <p className="mt-1 text-xs text-gray-500">ACH payments take 3–5 business days</p>
                    )}
                    {payment.failureReason && (
                      <p className="mt-1 text-xs text-red-600">{payment.failureReason}</p>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </CardSection>

      {/* Full statement */}
      <CardSection title="Account statement">
        {ledger.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Charges and payments will appear here once your ledger has activity."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th className="text-right">Charge</Th>
                <Th className="text-right">Payment / credit</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </THead>
            <TBody>
              {ledger.map((entry) => (
                <tr key={entry.id}>
                  <Td className="whitespace-nowrap">{fmt(entry.effectiveDate)}</Td>
                  <Td>{entry.description}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {entry.type === 'CHARGE' ? formatCents(entry.amountCents) : ''}
                  </Td>
                  <Td className="whitespace-nowrap text-right text-green-700">
                    {entry.type !== 'CHARGE' ? `−${formatCents(entry.amountCents)}` : ''}
                  </Td>
                  <Td
                    className={`whitespace-nowrap text-right font-medium ${
                      entry.runningBalance > 0 ? 'text-gray-900' : 'text-green-700'
                    }`}
                  >
                    {formatCents(entry.runningBalance)}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Questions about a charge?{' '}
          <Link href="/tenant" className="text-brand-700 underline hover:text-brand-900">
            Contact your landlord
          </Link>{' '}
          and reference the charge date and description.
        </p>
      </CardSection>
    </div>
  );
}
