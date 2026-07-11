import Link from 'next/link';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { fmt, startOfCurrentMonthLA } from '@/lib/dates';
import {
  Badge,
  ButtonLink,
  Card,
  CardSection,
  EmptyState,
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
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  AGING_BUCKET_TONES,
  paidThisMonthStatus,
  type AgingBucket,
} from '@/lib/modules/payments/helpers';
import {
  computeAllBalances,
  getDelinquencyReport,
} from '@/lib/modules/payments/service';
import { Flash } from '@/lib/modules/payments/Flash';
import {
  postRentChargesAction,
  remindAllUnpaidAction,
  runAutopayAction,
  sendReminderAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function RentRollPage({
  searchParams,
}: {
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();
  const monthStart = startOfCurrentMonthLA();

  const [units, balances, delinquency, paidThisMonth, lastPayments] = await Promise.all([
    prisma.unit.findMany({
      include: {
        property: true,
        tenancies: {
          where: { status: 'ACTIVE' },
          include: { tenants: { include: { user: true } } },
        },
      },
      orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    }),
    computeAllBalances(),
    getDelinquencyReport(),
    prisma.payment.groupBy({
      by: ['tenancyId'],
      where: { status: 'SUCCEEDED', createdAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    prisma.payment.groupBy({
      by: ['tenancyId'],
      where: { status: 'SUCCEEDED' },
      _max: { createdAt: true },
    }),
  ]);

  const paidByTenancy = new Map(paidThisMonth.map((r) => [r.tenancyId, r._sum.amountCents ?? 0]));
  const lastPaymentByTenancy = new Map(lastPayments.map((r) => [r.tenancyId, r._max.createdAt]));

  const activeTenancies = units.flatMap((unit) => unit.tenancies);
  const expectedCents = activeTenancies.reduce((sum, t) => sum + t.rentCents, 0);
  const collectedCents = paidThisMonth.reduce((sum, r) => sum + (r._sum.amountCents ?? 0), 0);
  const outstandingCents = [...balances.values()]
    .filter((b) => b > 0)
    .reduce((sum, b) => sum + b, 0);

  const bucketTotals = new Map<AgingBucket, number>(AGING_BUCKETS.map((b) => [b, 0]));
  for (const row of delinquency) {
    bucketTotals.set(row.bucket, (bucketTotals.get(row.bucket) ?? 0) + row.balanceCents);
  }

  const anyUnpaid = activeTenancies.some((t) => (balances.get(t.id) ?? 0) > 0);

  return (
    <div>
      <PageHeader
        title="Rent & Payments"
        description="Rent roll, collections, delinquency aging, and payment tools for all units."
        actions={
          <>
            <ButtonLink variant="secondary" size="sm" href="/admin/payments/simulator">
              Payment simulator
            </ButtonLink>
            <form action={postRentChargesAction}>
              <SubmitButton variant="secondary" pendingText="Posting…">
                Post this month&apos;s rent charges
              </SubmitButton>
            </form>
            <form action={runAutopayAction}>
              <SubmitButton pendingText="Running…">Run autopay now</SubmitButton>
            </form>
          </>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Expected this month"
          value={formatCents(expectedCents)}
          sub={`${activeTenancies.length} active tenanc${activeTenancies.length === 1 ? 'y' : 'ies'}`}
        />
        <StatCard
          label="Collected this month"
          value={formatCents(collectedCents)}
          tone={expectedCents > 0 && collectedCents >= expectedCents ? 'good' : 'default'}
          sub={`since ${fmt(monthStart)}`}
        />
        <StatCard
          label="Outstanding balances"
          value={formatCents(outstandingCents)}
          tone={outstandingCents > 0 ? 'warn' : 'good'}
          sub="across all tenancies"
        />
        <StatCard
          label="Delinquent tenancies"
          value={delinquency.length}
          tone={delinquency.length > 0 ? 'bad' : 'good'}
          sub="balance owed > $0"
        />
      </div>

      {/* Rent roll */}
      <CardSection
        title="Rent roll"
        className="mb-6"
        actions={
          anyUnpaid ? (
            <form action={remindAllUnpaidAction}>
              <SubmitButton variant="secondary" pendingText="Sending…">
                Remind all unpaid
              </SubmitButton>
            </form>
          ) : undefined
        }
      >
        {units.length === 0 ? (
          <EmptyState
            title="No units yet"
            description="Add properties and units, then activate tenancies to see the rent roll."
            action={<ButtonLink href="/admin/properties">Properties & Units</ButtonLink>}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Unit</Th>
                <Th>Tenants</Th>
                <Th className="text-right">Rent</Th>
                <Th className="text-right">Balance</Th>
                <Th>This month</Th>
                <Th>Last payment</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {units.map((unit) => {
                const tenancy = unit.tenancies[0];
                if (!tenancy) {
                  return (
                    <tr key={unit.id} className="bg-gray-50/50">
                      <Td>
                        <span className="font-medium">
                          {unit.property.street}, Unit {unit.unitNumber}
                        </span>
                        <p className="text-xs text-gray-500">{unit.property.city}</p>
                      </Td>
                      <Td>
                        <Badge tone="gray">Vacant</Badge>
                      </Td>
                      <Td className="text-right text-gray-400">
                        {formatCents(unit.marketRentCents)}
                      </Td>
                      <Td className="text-right">—</Td>
                      <Td>—</Td>
                      <Td>—</Td>
                      <Td />
                    </tr>
                  );
                }
                const balance = balances.get(tenancy.id) ?? 0;
                const paid = paidByTenancy.get(tenancy.id) ?? 0;
                const paidStatus = paidThisMonthStatus(paid, tenancy.rentCents);
                const lastPaid = lastPaymentByTenancy.get(tenancy.id) ?? null;
                return (
                  <tr key={unit.id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/admin/payments/${tenancy.id}`}
                        className="font-medium text-brand-700 underline hover:text-brand-900"
                      >
                        {unit.property.street}, Unit {unit.unitNumber}
                      </Link>
                      <p className="text-xs text-gray-500">{unit.property.city}</p>
                    </Td>
                    <Td>{tenancy.tenants.map((t) => t.user.name).join(', ') || '—'}</Td>
                    <Td className="whitespace-nowrap text-right">{formatCents(tenancy.rentCents)}</Td>
                    <Td
                      className={`whitespace-nowrap text-right font-medium ${
                        balance > 0 ? 'text-red-600' : 'text-green-700'
                      }`}
                    >
                      {formatCents(balance)}
                    </Td>
                    <Td>
                      {paidStatus === 'paid' ? (
                        <Badge tone="green">
                          <span aria-hidden>✓</span> Paid
                        </Badge>
                      ) : paidStatus === 'partial' ? (
                        <Badge tone="yellow">Partial · {formatCents(paid)}</Badge>
                      ) : (
                        <Badge tone="red">Unpaid</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">{lastPaid ? fmt(lastPaid) : 'Never'}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <ButtonLink variant="secondary" size="sm" href={`/admin/payments/${tenancy.id}`}>
                          Ledger
                        </ButtonLink>
                        <form action={sendReminderAction}>
                          <input type="hidden" name="tenancyId" value={tenancy.id} />
                          <SubmitButton variant="ghost" pendingText="Sending…">
                            Send reminder
                          </SubmitButton>
                        </form>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardSection>

      {/* Delinquency aging */}
      <CardSection title="Delinquency aging">
        <p className="mb-4 text-sm text-gray-600">
          Tenancies with a balance owed, bucketed by the age of the oldest charge not yet fully
          offset by payments and credits (FIFO).
        </p>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {AGING_BUCKETS.map((bucket) => (
            <StatCard
              key={bucket}
              label={AGING_BUCKET_LABELS[bucket]}
              value={formatCents(bucketTotals.get(bucket) ?? 0)}
              tone={
                (bucketTotals.get(bucket) ?? 0) === 0
                  ? 'default'
                  : bucket === '0-30'
                    ? 'default'
                    : bucket === '31-60'
                      ? 'warn'
                      : 'bad'
              }
              sub={`${delinquency.filter((r) => r.bucket === bucket).length} tenanc${
                delinquency.filter((r) => r.bucket === bucket).length === 1 ? 'y' : 'ies'
              }`}
            />
          ))}
        </div>
        {delinquency.length === 0 ? (
          <EmptyState
            title="No delinquent tenancies"
            description="Every tenancy is paid up. Nice."
          />
        ) : (
          <Card padded={false}>
            <Table>
              <THead>
                <tr>
                  <Th>Tenants</Th>
                  <Th>Unit</Th>
                  <Th className="text-right">Balance</Th>
                  <Th>Oldest unpaid charge</Th>
                  <Th>Bucket</Th>
                </tr>
              </THead>
              <TBody>
                {delinquency.map((row) => (
                  <tr key={row.tenancyId} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/admin/payments/${row.tenancyId}`}
                        className="font-medium text-brand-700 underline hover:text-brand-900"
                      >
                        {row.tenantNames}
                      </Link>
                      {row.tenancyStatus !== 'ACTIVE' && (
                        <Badge tone="gray" className="ml-1.5">
                          {row.tenancyStatus.toLowerCase()}
                        </Badge>
                      )}
                    </Td>
                    <Td>{row.unitLabel}</Td>
                    <Td className="whitespace-nowrap text-right font-medium text-red-600">
                      {formatCents(row.balanceCents)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {row.oldestUnpaidChargeDate
                        ? `${fmt(row.oldestUnpaidChargeDate)} (${row.daysOverdue}d)`
                        : '—'}
                    </Td>
                    <Td>
                      <Badge tone={AGING_BUCKET_TONES[row.bucket]}>
                        {AGING_BUCKET_LABELS[row.bucket]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </CardSection>
    </div>
  );
}
