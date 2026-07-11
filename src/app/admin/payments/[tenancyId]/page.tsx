import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { fmt, fmtDateTime, toDateInputValue } from '@/lib/dates';
import { computeBalance, getLedgerWithRunningBalance } from '@/lib/ledger';
import {
  Badge,
  ButtonLink,
  CardSection,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import {
  CHARGE_CATEGORY_OPTIONS,
  nextRentDueDate,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
} from '@/lib/modules/payments/helpers';
import { Flash } from '@/lib/modules/payments/Flash';
import { addLedgerEntryAction } from './actions';

export const dynamic = 'force-dynamic';

const TENANCY_STATUS_TONES = { PENDING: 'blue', ACTIVE: 'green', ENDED: 'gray' } as const;

export default async function AdminLedgerDetailPage({
  params,
  searchParams,
}: {
  params: { tenancyId: string };
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: params.tenancyId },
    include: {
      unit: { include: { property: true } },
      tenants: { include: { user: true } },
    },
  });
  if (!tenancy) notFound();

  const [balance, ledger, payments] = await Promise.all([
    computeBalance(tenancy.id),
    getLedgerWithRunningBalance(tenancy.id),
    prisma.payment.findMany({
      where: { tenancyId: tenancy.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const unitLabel = `${tenancy.unit.property.street}, Unit ${tenancy.unit.unitNumber}`;

  return (
    <div>
      <PageHeader
        title={unitLabel}
        description={
          <>
            {tenancy.tenants.map((t) => t.user.name).join(', ') || 'No tenants linked'} · rent{' '}
            {formatCents(tenancy.rentCents)}/mo due day {tenancy.rentDueDay} (next{' '}
            {fmt(nextRentDueDate(tenancy.rentDueDay))})
          </>
        }
        actions={
          <ButtonLink variant="secondary" size="sm" href="/admin/payments">
            Back to rent roll
          </ButtonLink>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={TENANCY_STATUS_TONES[tenancy.status]}>{tenancy.status}</Badge>
        <span className="text-sm text-gray-600">
          {fmt(tenancy.startDate)} – {tenancy.endDate ? fmt(tenancy.endDate) : 'ongoing'}
        </span>
        <span
          className={`text-sm font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-700'}`}
        >
          Balance: {formatCents(balance)}
          {balance <= 0 && ' (paid up)'}
        </span>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        {/* Add entry */}
        <CardSection title="Add ledger entry" className="lg:col-span-1">
          <form action={addLedgerEntryAction} className="space-y-4">
            <input type="hidden" name="tenancyId" value={tenancy.id} />
            <FormField label="Type" htmlFor="entry-type" required>
              <Select id="entry-type" name="type" defaultValue="CHARGE">
                <option value="CHARGE">Charge (increases balance)</option>
                <option value="CREDIT">Credit (reduces balance)</option>
              </Select>
            </FormField>
            <FormField label="Category" htmlFor="entry-category" required>
              <Select id="entry-category" name="category" defaultValue="OTHER">
                {CHARGE_CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Amount (USD)" htmlFor="entry-amount" required>
              <Input
                id="entry-amount"
                name="amount"
                type="text"
                inputMode="decimal"
                required
                placeholder="0.00"
              />
            </FormField>
            <FormField
              label="Description"
              htmlFor="entry-description"
              required
              hint="Shown on the tenant's statement."
            >
              <Input
                id="entry-description"
                name="description"
                type="text"
                required
                placeholder="e.g. Late fee — May rent"
              />
            </FormField>
            <FormField label="Effective date" htmlFor="entry-date" required>
              <Input
                id="entry-date"
                name="effectiveDate"
                type="date"
                required
                defaultValue={toDateInputValue(new Date())}
              />
            </FormField>
            <SubmitButton pendingText="Adding…">Add entry</SubmitButton>
          </form>
          <p className="mt-3 text-xs text-gray-500">
            Payment entries can&apos;t be added manually — they post automatically when a payment
            succeeds.
          </p>
        </CardSection>

        {/* Payments */}
        <CardSection title="Payments" className="lg:col-span-2">
          {payments.length === 0 ? (
            <EmptyState title="No payments" description="This tenancy has no payment attempts yet." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Date</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Method</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {payments.map((payment) => {
                  const isMock = payment.providerId?.startsWith('mock_') ?? false;
                  return (
                    <tr key={payment.id}>
                      <Td className="whitespace-nowrap">{fmtDateTime(payment.createdAt)}</Td>
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
                        {payment.failureReason && (
                          <p className="mt-1 text-xs text-red-600">{payment.failureReason}</p>
                        )}
                      </Td>
                      <Td>
                        {isMock && (payment.status === 'PROCESSING' || payment.status === 'PENDING') && (
                          <Link
                            href={`/admin/payments/simulator?focus=${payment.id}`}
                            className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
                          >
                            Simulate
                          </Link>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardSection>
      </div>

      {/* Ledger */}
      <CardSection title="Ledger">
        {ledger.length === 0 ? (
          <EmptyState
            title="No ledger activity"
            description="Post rent charges from the rent roll, or add a manual entry."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
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
                  <Td className="whitespace-nowrap text-xs uppercase tracking-wide text-gray-500">
                    {entry.category.replaceAll('_', ' ').toLowerCase()}
                  </Td>
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
      </CardSection>
    </div>
  );
}
