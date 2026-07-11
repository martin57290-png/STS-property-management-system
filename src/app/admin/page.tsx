import type { Metadata } from 'next';
import Link from 'next/link';
import type { WorkOrderPriority } from '@prisma/client';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { fmt, fmtDateTime, startOfCurrentMonthLA } from '@/lib/dates';
import { getSettings } from '@/lib/settings';
import { effectivePriority, PRIORITY_STYLES } from '@/lib/escalation';
import { ButtonLink, Card, CardSection, EmptyState, PageHeader, StatCard } from '@/components/ui';
import { occupancyPct, OPEN_WORK_ORDER_STATUSES } from '@/lib/modules/dashboard/helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Dashboard' };

const PRIORITY_ORDER: WorkOrderPriority[] = ['EMERGENCY', 'URGENT', 'ROUTINE', 'LOW'];

export default async function AdminDashboardPage() {
  await requireLandlord();
  const settings = await getSettings();

  const now = new Date();
  const monthStart = startOfCurrentMonthLA();
  const in60 = new Date(now.getTime() + 60 * 86_400_000);
  const in90 = new Date(now.getTime() + 90 * 86_400_000);

  const [
    totalUnits,
    activeTenancies,
    collected,
    openWorkOrders,
    pendingApplications,
    expiringLeases,
    upcomingInspections,
  ] = await Promise.all([
    prisma.unit.count(),
    prisma.tenancy.findMany({
      where: { status: 'ACTIVE' },
      select: { unitId: true, rentCents: true },
    }),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: 'SUCCEEDED', createdAt: { gte: monthStart } },
    }),
    prisma.workOrder.findMany({
      where: { status: { in: OPEN_WORK_ORDER_STATUSES } },
      select: { id: true, priority: true, status: true, createdAt: true },
    }),
    prisma.application.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.lease.findMany({
      where: { status: { in: ['ACTIVE', 'EXECUTED'] }, endDate: { gte: now, lte: in90 } },
      include: { tenancy: { include: { unit: { include: { property: true } } } } },
      orderBy: { endDate: 'asc' },
    }),
    prisma.inspection.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { gte: now } },
      include: { tenancy: { include: { unit: { include: { property: true } } } } },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
    }),
  ]);

  // Occupancy
  const occupiedUnits = new Set(activeTenancies.map((t) => t.unitId)).size;
  const occupancy = occupancyPct(occupiedUnits, totalUnits);

  // Rent this month
  const collectedCents = collected._sum.amountCents ?? 0;
  const expectedCents = activeTenancies.reduce((sum, t) => sum + t.rentCents, 0);
  const rentPct =
    expectedCents > 0 ? Math.min(100, Math.round((collectedCents / expectedCents) * 100)) : 0;

  // Work orders by effective (escalated) priority
  const priorityCounts: Record<WorkOrderPriority, number> = {
    EMERGENCY: 0,
    URGENT: 0,
    ROUTINE: 0,
    LOW: 0,
  };
  for (const wo of openWorkOrders) {
    priorityCounts[effectivePriority(wo, settings)] += 1;
  }

  // Lease expiration buckets
  const expiring60 = expiringLeases.filter((l) => l.endDate <= in60);
  const expiring90 = expiringLeases.filter((l) => l.endDate > in60);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`${settings.businessName} — portfolio at a glance.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Occupancy"
          value={totalUnits === 0 ? '—' : `${occupancy}%`}
          sub={
            totalUnits === 0
              ? 'No units yet — add your first property'
              : `${occupiedUnits} of ${totalUnits} units occupied`
          }
          href="/admin/properties"
          tone={totalUnits > 0 && occupancy < 90 ? 'warn' : 'default'}
        />
        <StatCard
          label="Open work orders"
          value={openWorkOrders.length}
          sub={
            priorityCounts.EMERGENCY > 0
              ? `${priorityCounts.EMERGENCY} at emergency severity`
              : 'Across all units'
          }
          href="/admin/work-orders"
          tone={priorityCounts.EMERGENCY > 0 ? 'bad' : openWorkOrders.length > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label="Pending applications"
          value={pendingApplications}
          sub="Submitted or under review"
          href="/admin/applications"
          tone={pendingApplications > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Leases expiring ≤ 90d"
          value={expiringLeases.length}
          sub={`${expiring60.length} within 60 days`}
          href="/admin/leases"
          tone={expiring60.length > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <CardSection
          title="Rent this month"
          actions={
            <ButtonLink href="/admin/payments" variant="secondary" size="sm">
              Rent &amp; payments
            </ButtonLink>
          }
        >
          {expectedCents === 0 && collectedCents === 0 ? (
            <EmptyState
              title="No rent expected yet"
              description="Activate a tenancy and this card will track collections against the monthly rent roll."
            />
          ) : (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-2xl font-bold text-gray-900">{formatCents(collectedCents)}</p>
                <p className="text-sm text-gray-500">
                  of {formatCents(expectedCents)} expected ({rentPct}%)
                </p>
              </div>
              <div
                className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100"
                role="progressbar"
                aria-label="Rent collected this month"
                aria-valuenow={rentPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-2.5 rounded-full ${rentPct >= 100 ? 'bg-green-600' : 'bg-brand-600'}`}
                  style={{ width: `${rentPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Succeeded payments since {fmt(monthStart)} vs. total monthly rent on active
                tenancies.
              </p>
            </div>
          )}
        </CardSection>

        <CardSection
          title="Open work orders by priority"
          actions={
            <ButtonLink href="/admin/work-orders" variant="secondary" size="sm">
              Work orders
            </ButtonLink>
          }
        >
          {openWorkOrders.length === 0 ? (
            <EmptyState
              title="No open work orders"
              description="Tenant maintenance requests will show up here, escalating in color the longer they sit."
            />
          ) : (
            <ul className="space-y-2">
              {PRIORITY_ORDER.map((priority) => (
                <li key={priority} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-gray-800">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${PRIORITY_STYLES[priority].dot}`}
                      aria-hidden
                    />
                    {PRIORITY_STYLES[priority].label}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-sm font-semibold ${PRIORITY_STYLES[priority].badge}`}
                  >
                    {priorityCounts[priority]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Counts use effective priority: routine tickets escalate after{' '}
            {settings.escalateRoutineToUrgentDays} days, urgent after{' '}
            {settings.escalateUrgentToEmergencyDays}.
          </p>
        </CardSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CardSection
          title="Leases expiring soon"
          actions={
            <ButtonLink href="/admin/leases" variant="secondary" size="sm">
              All leases
            </ButtonLink>
          }
        >
          <div className="mb-3 flex gap-4 text-sm">
            <p>
              <span className="font-semibold text-orange-600">{expiring60.length}</span>{' '}
              <span className="text-gray-600">within 60 days</span>
            </p>
            <p>
              <span className="font-semibold text-gray-900">{expiring90.length}</span>{' '}
              <span className="text-gray-600">in 61–90 days</span>
            </p>
          </div>
          {expiringLeases.length === 0 ? (
            <p className="text-sm text-gray-500">
              No executed or active leases end in the next 90 days.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {expiringLeases.slice(0, 5).map((lease) => (
                <li key={lease.id} className="flex items-center justify-between gap-2 py-2">
                  <Link
                    href={`/admin/leases/${lease.id}`}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    {lease.tenancy.unit.property.name} — Unit {lease.tenancy.unit.unitNumber}
                  </Link>
                  <span
                    className={`text-sm ${lease.endDate <= in60 ? 'font-semibold text-orange-600' : 'text-gray-600'}`}
                  >
                    {fmt(lease.endDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardSection>

        <CardSection
          title="Upcoming inspections"
          actions={
            <ButtonLink href="/admin/inspections" variant="secondary" size="sm">
              All inspections
            </ButtonLink>
          }
        >
          {upcomingInspections.length === 0 ? (
            <p className="text-sm text-gray-500">No inspections scheduled.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {upcomingInspections.map((inspection) => (
                <li key={inspection.id} className="flex items-center justify-between gap-2 py-2">
                  <Link
                    href={`/admin/inspections/${inspection.id}`}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    {inspection.type === 'MOVE_IN' ? 'Move-in' : 'Move-out'} —{' '}
                    {inspection.tenancy.unit.property.name} #{inspection.tenancy.unit.unitNumber}
                  </Link>
                  <span className="text-sm text-gray-600">
                    {fmtDateTime(inspection.scheduledAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </div>

      {totalUnits === 0 && (
        <Card className="mt-6">
          <EmptyState
            title="Welcome to STS Property Management"
            description="Start by adding your first property and its units. Everything else — applications, leases, rent, and maintenance — hangs off the portfolio."
            action={<ButtonLink href="/admin/properties/new">Add a property</ButtonLink>}
          />
        </Card>
      )}
    </div>
  );
}
