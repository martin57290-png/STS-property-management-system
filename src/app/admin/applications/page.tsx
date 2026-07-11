import type { Metadata } from 'next';
import Link from 'next/link';
import type { ApplicationStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { fmt } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Select,
  StatCard,
  Table,
  TBody,
  Td,
  Th,
  THead,
} from '@/components/ui';
import { STATUS_LABELS, STATUS_TONES } from '@/lib/modules/applications/helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Applications' };

const QUEUE_STATUSES: ApplicationStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'DENIED',
  'WAITLISTED',
];

export default async function ApplicationsQueuePage({
  searchParams,
}: {
  searchParams: { status?: string; unit?: string };
}) {
  const statusFilter = QUEUE_STATUSES.find((s) => s === searchParams.status);
  const unitFilter = searchParams.unit || undefined;

  const where: Prisma.ApplicationWhereInput = {
    status: statusFilter ? statusFilter : { not: 'DRAFT' },
    ...(unitFilter ? { unitId: unitFilter } : {}),
  };

  const [apps, units, statusCounts, activePerUnit] = await Promise.all([
    prisma.application.findMany({
      where,
      include: {
        unit: { include: { property: true } },
        _count: { select: { documents: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.unit.findMany({
      include: { property: true },
      orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    }),
    prisma.application.groupBy({
      by: ['status'],
      where: { status: { not: 'DRAFT' } },
      _count: { _all: true },
    }),
    prisma.application.groupBy({
      by: ['unitId'],
      where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      _count: { _all: true },
    }),
  ]);

  const countFor = (status: ApplicationStatus) =>
    statusCounts.find((c) => c.status === status)?._count._all ?? 0;

  const compareUnits = activePerUnit
    .filter((g) => g._count._all >= 2)
    .map((g) => ({
      unit: units.find((u) => u.id === g.unitId),
      count: g._count._all,
    }))
    .filter((g) => g.unit != null);

  return (
    <div>
      <PageHeader
        title="Rental applications"
        description="Review, screen, and decide on incoming applications."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="New / submitted"
          value={countFor('SUBMITTED')}
          href="/admin/applications?status=SUBMITTED"
          tone={countFor('SUBMITTED') > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Under review"
          value={countFor('UNDER_REVIEW')}
          href="/admin/applications?status=UNDER_REVIEW"
        />
        <StatCard
          label="Approved"
          value={countFor('APPROVED')}
          href="/admin/applications?status=APPROVED"
          tone="good"
        />
        <StatCard
          label="Waitlisted"
          value={countFor('WAITLISTED')}
          href="/admin/applications?status=WAITLISTED"
        />
      </div>

      {compareUnits.length > 0 && (
        <Card className="mb-6">
          <p className="text-sm font-semibold text-gray-900">
            Units with multiple active applicants
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {compareUnits.map(({ unit, count }) => (
              <ButtonLink
                key={unit!.id}
                href={`/admin/applications/compare?unit=${unit!.id}`}
                variant="secondary"
                size="sm"
              >
                Compare {count} applicants — {unit!.property.name} #{unit!.unitNumber}
              </ButtonLink>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-4" padded>
        <form method="GET" action="/admin/applications" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-800">
              Status
            </label>
            <Select id="status" name="status" defaultValue={statusFilter ?? ''} className="w-44">
              <option value="">All (except drafts)</option>
              {QUEUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="unit" className="mb-1 block text-sm font-medium text-gray-800">
              Unit
            </label>
            <Select id="unit" name="unit" defaultValue={unitFilter ?? ''} className="w-56">
              <option value="">All units</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.property.name} — Unit {u.unitNumber}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {(statusFilter || unitFilter) && (
            <ButtonLink href="/admin/applications" variant="ghost" size="sm">
              Clear
            </ButtonLink>
          )}
        </form>
      </Card>

      {apps.length === 0 ? (
        <EmptyState
          title="No applications found"
          description={
            statusFilter || unitFilter
              ? 'Nothing matches these filters. Try clearing them.'
              : 'Applications submitted through the public “Apply” page will appear here.'
          }
        />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <tr>
                <Th>Applicant</Th>
                <Th>Unit</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
                <Th>Monthly income</Th>
                <Th>Docs</Th>
                <Th>Fee</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {apps.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <Td>
                    <Link
                      href={`/admin/applications/${app.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {app.firstName} {app.lastName}
                    </Link>
                    <p className="text-xs text-gray-500">{app.email}</p>
                  </Td>
                  <Td>
                    {app.unit.property.name} #{app.unit.unitNumber}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONES[app.status]}>{STATUS_LABELS[app.status]}</Badge>
                  </Td>
                  <Td>{app.submittedAt ? fmt(app.submittedAt) : '—'}</Td>
                  <Td>
                    {app.monthlyIncomeCents != null ? formatCents(app.monthlyIncomeCents) : '—'}
                  </Td>
                  <Td>{app._count.documents}</Td>
                  <Td>
                    {app.feePaidAt ? (
                      <Badge tone="green">Paid</Badge>
                    ) : (
                      <Badge tone="gray">Unpaid</Badge>
                    )}
                  </Td>
                  <Td>
                    <ButtonLink
                      href={`/admin/applications/${app.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      Review
                    </ButtonLink>
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
