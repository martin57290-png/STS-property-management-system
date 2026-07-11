import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma, TenancyStatus } from '@prisma/client';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { fmt } from '@/lib/dates';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import {
  TENANCY_STATUS_LABELS,
  TENANCY_STATUS_TONES,
} from '@/lib/modules/dashboard/helpers';
import { computeBalancesByTenancy } from '@/lib/modules/dashboard/reports';
import { Flash } from '@/lib/modules/dashboard/Flash';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tenancies' };

const STATUSES: TenancyStatus[] = ['PENDING', 'ACTIVE', 'ENDED'];

export default async function TenanciesPage({
  searchParams,
}: {
  searchParams: { status?: string; notice?: string; error?: string };
}) {
  await requireLandlord();

  const statusFilter = STATUSES.find((s) => s === searchParams.status);
  const where: Prisma.TenancyWhereInput = statusFilter ? { status: statusFilter } : {};

  const [tenancies, balances] = await Promise.all([
    prisma.tenancy.findMany({
      where,
      include: {
        unit: { include: { property: true } },
        tenants: { include: { user: true } },
      },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    }),
    computeBalancesByTenancy(),
  ]);

  return (
    <div>
      <PageHeader
        title="Tenancies"
        description="Every occupancy of every unit — the hub linking leases, ledgers, inspections, and documents."
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <Card className="mb-4">
        <form method="GET" action="/admin/tenancies" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-800">
              Status
            </label>
            <Select id="status" name="status" defaultValue={statusFilter ?? ''} className="w-44">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TENANCY_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {statusFilter && (
            <ButtonLink href="/admin/tenancies" variant="ghost" size="sm">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      {tenancies.length === 0 ? (
        <EmptyState
          title="No tenancies found"
          description={
            statusFilter
              ? 'Nothing matches this filter.'
              : 'Tenancies are created when you approve an application and generate a lease.'
          }
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th>Unit</Th>
                <Th>Tenants</Th>
                <Th>Status</Th>
                <Th>Term</Th>
                <Th>Rent</Th>
                <Th>Balance</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {tenancies.map((tenancy) => {
                const balance = balances.get(tenancy.id) ?? 0;
                return (
                  <tr key={tenancy.id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/admin/tenancies/${tenancy.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {tenancy.unit.property.name} #{tenancy.unit.unitNumber}
                      </Link>
                    </Td>
                    <Td>
                      {tenancy.tenants.length === 0
                        ? '—'
                        : tenancy.tenants.map((t) => t.user.name).join(', ')}
                    </Td>
                    <Td>
                      <Badge tone={TENANCY_STATUS_TONES[tenancy.status]}>
                        {TENANCY_STATUS_LABELS[tenancy.status]}
                      </Badge>
                    </Td>
                    <Td>
                      {fmt(tenancy.startDate)} —{' '}
                      {tenancy.endDate ? fmt(tenancy.endDate) : 'ongoing'}
                    </Td>
                    <Td>{formatCents(tenancy.rentCents)}/mo</Td>
                    <Td>
                      {balance > 0 ? (
                        <span className="font-semibold text-red-600">{formatCents(balance)}</span>
                      ) : balance < 0 ? (
                        <span className="text-green-700">{formatCents(balance)} credit</span>
                      ) : (
                        <span className="text-gray-500">{formatCents(0)}</span>
                      )}
                    </Td>
                    <Td>
                      <ButtonLink
                        href={`/admin/tenancies/${tenancy.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Open
                      </ButtonLink>
                    </Td>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
