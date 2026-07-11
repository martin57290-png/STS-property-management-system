import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { fmt, fmtDateTime } from '@/lib/dates';
import { computeBalance } from '@/lib/ledger';
import { Badge, ButtonLink, Card, CardSection, EmptyState, PageHeader } from '@/components/ui';
import {
  nextRentDueDateLA,
  OPEN_WORK_ORDER_STATUSES,
} from '@/lib/modules/dashboard/helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Home' };

export default async function TenantHomePage() {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);
  const firstName = user.name.split(' ')[0] || user.name;

  if (!tenancy) {
    return (
      <div>
        <PageHeader title={`Welcome, ${firstName}`} />
        <EmptyState
          title="No tenancy on file"
          description="Your account isn't linked to a rental yet. Contact your landlord if this seems wrong."
        />
      </div>
    );
  }

  const [balance, openWorkOrders, activeLease, notifications] = await Promise.all([
    computeBalance(tenancy.id),
    prisma.workOrder.count({
      where: { tenancyId: tenancy.id, status: { in: OPEN_WORK_ORDER_STATUSES } },
    }),
    prisma.lease.findFirst({
      where: { tenancyId: tenancy.id, status: { in: ['ACTIVE', 'EXECUTED'] } },
      orderBy: { endDate: 'desc' },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const dueDate = nextRentDueDateLA(tenancy.rentDueDay);
  const address = `${tenancy.unit.property.street}, Unit ${tenancy.unit.unitNumber}, ${tenancy.unit.property.city}, ${tenancy.unit.property.state} ${tenancy.unit.property.zip}`;
  const leaseStart = activeLease?.startDate ?? tenancy.startDate;
  const leaseEnd = activeLease?.endDate ?? tenancy.endDate;
  const rentCents = activeLease?.rentCents ?? tenancy.rentCents;

  return (
    <div>
      <PageHeader title={`Welcome, ${firstName}`} description={address} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Current balance
          </p>
          <p
            className={`mt-1 text-3xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-700'}`}
          >
            {formatCents(Math.max(balance, 0))}
          </p>
          {balance > 0 ? (
            <div className="mt-3">
              <ButtonLink href="/tenant/payments" className="w-full sm:w-auto">
                Pay now
              </ButtonLink>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              {balance < 0
                ? `You have a ${formatCents(-balance)} credit. Nothing due right now.`
                : "You're all paid up."}
            </p>
          )}
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Next rent due
          </p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{fmt(dueDate)}</p>
          <p className="mt-2 text-sm text-gray-600">
            {formatCents(rentCents)}/month, due on day {tenancy.rentDueDay}.
          </p>
          <div className="mt-3">
            <ButtonLink href="/tenant/payments" variant="secondary" size="sm">
              Rent &amp; payments
            </ButtonLink>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Maintenance requests
          </p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{openWorkOrders}</p>
          <p className="mt-2 text-sm text-gray-600">
            {openWorkOrders === 0
              ? 'No open requests. Something broken?'
              : `Open request${openWorkOrders === 1 ? '' : 's'} being worked on.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/tenant/work-orders" variant="secondary" size="sm">
              View requests
            </ButtonLink>
            <ButtonLink href="/tenant/work-orders/new" size="sm">
              Report an issue
            </ButtonLink>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Your lease</p>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Term</dt>
              <dd className="text-right font-medium text-gray-900">
                {fmt(leaseStart)} — {leaseEnd ? fmt(leaseEnd) : 'ongoing'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Rent</dt>
              <dd className="font-medium text-gray-900">{formatCents(rentCents)}/mo</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Deposit</dt>
              <dd className="font-medium text-gray-900">{formatCents(tenancy.depositCents)}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <ButtonLink href="/tenant/documents" variant="secondary" size="sm">
              Lease &amp; documents
            </ButtonLink>
          </div>
        </Card>
      </div>

      <CardSection title="Recent notifications" className="mt-4">
        {notifications.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing yet. Rent reminders and updates will appear here.{' '}
            <Link href="/tenant/settings" className="text-brand-700 underline">
              Manage preferences
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {notifications.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {n.subject ?? n.body.slice(0, 80)}
                  </p>
                  <p className="text-xs text-gray-500">{fmtDateTime(n.createdAt)}</p>
                </div>
                <Badge tone={n.channel === 'EMAIL' ? 'blue' : 'purple'}>
                  {n.channel === 'EMAIL' ? 'Email' : 'SMS'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardSection>
    </div>
  );
}
