import Link from 'next/link';
import type { LeaseStatus } from '@prisma/client';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fmt } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import {
  Badge,
  ButtonLink,
  Card,
  CardSection,
  EmptyState,
  PageHeader,
  StatCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import {
  daysUntil,
  expiringBucket,
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
} from '@/lib/modules/leases/helpers';

export const dynamic = 'force-dynamic';

const STATUS_VALUES: LeaseStatus[] = [
  'DRAFT',
  'GENERATED',
  'EXECUTED',
  'ACTIVE',
  'EXPIRED',
  'TERMINATED',
];

export default async function LeasesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireLandlord();
  const statusFilter = STATUS_VALUES.includes(searchParams.status as LeaseStatus)
    ? (searchParams.status as LeaseStatus)
    : undefined;

  const include = {
    tenancy: {
      include: {
        unit: { include: { property: true } },
        tenants: { include: { user: true } },
      },
    },
    renewedTo: { select: { id: true } },
  } as const;

  const in90Days = new Date(Date.now() + 90 * 86_400_000);
  const [leases, expiring, activeCount] = await Promise.all([
    prisma.lease.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      include,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lease.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXECUTED'] },
        endDate: { gte: new Date(), lte: in90Days },
      },
      include,
      orderBy: { endDate: 'asc' },
    }),
    prisma.lease.count({ where: { status: 'ACTIVE' } }),
  ]);
  const expiringWithoutRenewal = expiring.filter((lease) => !lease.renewedTo);

  return (
    <div>
      <PageHeader
        title="Leases"
        description="Generate California leases from templates, collect wet signatures, and track renewals."
        actions={
          <>
            <ButtonLink variant="secondary" href="/admin/leases/templates">
              Templates
            </ButtonLink>
            <ButtonLink href="/admin/leases/new">New lease</ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Leases shown"
          value={leases.length}
          sub={statusFilter ? `filtered: ${LEASE_STATUS_LABELS[statusFilter]}` : 'all statuses'}
        />
        <StatCard label="Active" value={activeCount} tone="good" href="/admin/leases?status=ACTIVE" />
        <StatCard
          label="Expiring ≤ 90 days"
          value={expiringWithoutRenewal.length}
          tone={expiringWithoutRenewal.length > 0 ? 'warn' : 'default'}
          sub="without a renewal started"
        />
      </div>

      {expiringWithoutRenewal.length > 0 && (
        <CardSection title="Expiring soon" className="mb-6">
          <ul className="divide-y divide-gray-100">
            {expiringWithoutRenewal.map((lease) => {
              const bucket = expiringBucket(lease.endDate);
              const days = daysUntil(lease.endDate);
              return (
                <li key={lease.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link
                      href={`/admin/leases/${lease.id}`}
                      className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
                    >
                      {lease.tenancy.unit.property.street}, Unit {lease.tenancy.unit.unitNumber}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {lease.tenancy.tenants.map((t) => t.user.name).join(', ') || 'No tenants'} · ends{' '}
                      {fmt(lease.endDate)} ({days} day{days === 1 ? '' : 's'})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={bucket === '60' ? 'red' : 'orange'}>
                      {bucket === '60' ? 'Within 60 days' : 'Within 90 days'}
                    </Badge>
                    <ButtonLink size="sm" href={`/admin/leases/${lease.id}/renew`}>
                      Generate renewal
                    </ButtonLink>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardSection>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filter by status">
        <FilterChip href="/admin/leases" label="All" active={!statusFilter} />
        {STATUS_VALUES.map((status) => (
          <FilterChip
            key={status}
            href={`/admin/leases?status=${status}`}
            label={LEASE_STATUS_LABELS[status]}
            active={statusFilter === status}
          />
        ))}
      </div>

      {leases.length === 0 ? (
        <EmptyState
          title={statusFilter ? `No ${LEASE_STATUS_LABELS[statusFilter].toLowerCase()} leases` : 'No leases yet'}
          description={
            statusFilter
              ? 'Try a different status filter.'
              : 'Approve an application and start the lease wizard, or draft a lease for an existing tenancy.'
          }
          action={<ButtonLink href="/admin/leases/new">New lease</ButtonLink>}
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th>Unit</Th>
                <Th>Tenants</Th>
                <Th>Term</Th>
                <Th>Rent</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {leases.map((lease) => (
                <tr key={lease.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/admin/leases/${lease.id}`}
                      className="font-medium text-brand-700 underline hover:text-brand-900"
                    >
                      {lease.tenancy.unit.property.street}, Unit {lease.tenancy.unit.unitNumber}
                    </Link>
                    <p className="text-xs text-gray-500">{lease.tenancy.unit.property.city}</p>
                  </Td>
                  <Td>{lease.tenancy.tenants.map((t) => t.user.name).join(', ') || '—'}</Td>
                  <Td className="whitespace-nowrap">
                    {fmt(lease.startDate)} – {fmt(lease.endDate)}
                  </Td>
                  <Td className="whitespace-nowrap">{formatCents(lease.rentCents)}</Td>
                  <Td>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <Badge tone={LEASE_STATUS_TONES[lease.status]}>
                        {LEASE_STATUS_LABELS[lease.status]}
                      </Badge>
                      {lease.isRenewal && <Badge tone="purple">Renewal</Badge>}
                    </span>
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
        active
          ? 'bg-brand-600 text-white ring-brand-600'
          : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}
