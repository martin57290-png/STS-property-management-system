import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCents } from '@/lib/money';
import { fmt, toDateInputValue } from '@/lib/dates';
import { computeBalance } from '@/lib/ledger';
import {
  Badge,
  ButtonLink,
  Card,
  CardSection,
  FormField,
  Input,
  PageHeader,
  SubmitButton,
} from '@/components/ui';
import { DocumentList } from '@/components/documents';
import {
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
  TENANCY_STATUS_LABELS,
  TENANCY_STATUS_TONES,
} from '@/lib/modules/dashboard/helpers';
import { Flash } from '@/lib/modules/dashboard/Flash';
import { endTenancyAction, setTenantPortalPasswordAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tenancy' };

export default async function TenancyDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { notice?: string; error?: string };
}) {
  await requireLandlord();

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: params.id },
    include: {
      unit: { include: { property: true } },
      tenants: { include: { user: true }, orderBy: { isPrimary: 'desc' } },
      leases: { orderBy: { createdAt: 'desc' } },
      documents: { orderBy: { createdAt: 'desc' } },
      inspections: true,
      depositDisposition: true,
    },
  });
  if (!tenancy) notFound();

  const balance = await computeBalance(tenancy.id);
  const unitLabel = `${tenancy.unit.property.name} #${tenancy.unit.unitNumber}`;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {unitLabel}
            <Badge tone={TENANCY_STATUS_TONES[tenancy.status]}>
              {TENANCY_STATUS_LABELS[tenancy.status]}
            </Badge>
          </span>
        }
        description={`${tenancy.unit.property.street}, ${tenancy.unit.property.city}, ${tenancy.unit.property.state} ${tenancy.unit.property.zip}`}
        actions={
          <ButtonLink href="/admin/tenancies" variant="secondary">
            All tenancies
          </ButtonLink>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CardSection title="Overview">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Term</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">
                  {fmt(tenancy.startDate)} — {tenancy.endDate ? fmt(tenancy.endDate) : 'ongoing'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Rent</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">
                  {formatCents(tenancy.rentCents)}/mo
                  <span className="ml-1 text-xs font-normal text-gray-500">
                    due day {tenancy.rentDueDay}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Deposit
                </dt>
                <dd className="mt-0.5 font-semibold text-gray-900">
                  {formatCents(tenancy.depositCents)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Balance owed
                </dt>
                <dd
                  className={`mt-0.5 font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-700'}`}
                >
                  {formatCents(balance)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Unit</dt>
                <dd className="mt-0.5">
                  <Link
                    href={`/admin/properties/${tenancy.unit.propertyId}/units/${tenancy.unitId}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {unitLabel}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Inspections
                </dt>
                <dd className="mt-0.5 text-gray-800">
                  {tenancy.inspections.length === 0
                    ? 'None yet'
                    : tenancy.inspections
                        .map((i) => (i.type === 'MOVE_IN' ? 'Move-in' : 'Move-out'))
                        .join(', ')}
                </dd>
              </div>
            </dl>
          </CardSection>

          <CardSection title="Tenant portal access">
            {tenancy.tenants.length === 0 ? (
              <p className="text-sm text-gray-500">No tenants are linked to this tenancy yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {tenancy.tenants.map(({ user, isPrimary }) => (
                  <li key={user.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">{user.name}</p>
                      {isPrimary && <Badge tone="blue">Primary</Badge>}
                      {user.passwordHash ? (
                        <Badge tone="green">Portal enabled</Badge>
                      ) : (
                        <Badge tone="yellow">No password set</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">
                      {user.email}
                      {user.phone ? ` · ${user.phone}` : ' · no phone on file'}
                    </p>
                    <form
                      action={setTenantPortalPasswordAction}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="tenancyId" value={tenancy.id} />
                      <input type="hidden" name="userId" value={user.id} />
                      <FormField
                        label={user.passwordHash ? 'Reset portal password' : 'Set portal password'}
                        htmlFor={`password-${user.id}`}
                        className="w-full max-w-xs"
                      >
                        <Input
                          id={`password-${user.id}`}
                          name="password"
                          type="password"
                          minLength={8}
                          required
                          autoComplete="new-password"
                          placeholder="At least 8 characters"
                        />
                      </FormField>
                      <SubmitButton variant="secondary" pendingText="Saving…">
                        {user.passwordHash ? 'Reset password' : 'Set password'}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardSection>

          <CardSection title="Documents">
            <DocumentList docs={tenancy.documents} />
          </CardSection>
        </div>

        <div className="space-y-4">
          <CardSection title="Quick links">
            <div className="flex flex-col gap-2">
              <ButtonLink href={`/admin/payments/${tenancy.id}`} variant="secondary">
                Ledger &amp; payments
              </ButtonLink>
              <ButtonLink href="/admin/inspections" variant="secondary">
                Inspections
              </ButtonLink>
              <ButtonLink
                href={`/admin/inspections/disposition/${tenancy.id}`}
                variant="secondary"
              >
                Deposit disposition
                {tenancy.depositDisposition?.finalizedAt ? ' (finalized)' : ''}
              </ButtonLink>
              <ButtonLink href={`/admin/work-orders?tenancy=${tenancy.id}`} variant="secondary">
                Work orders
              </ButtonLink>
            </div>
          </CardSection>

          <CardSection title="Leases">
            {tenancy.leases.length === 0 ? (
              <p className="text-sm text-gray-500">
                No leases yet.{' '}
                <Link href="/admin/leases/new" className="text-brand-700 underline">
                  Generate one
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {tenancy.leases.map((lease) => (
                  <li key={lease.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <Link
                        href={`/admin/leases/${lease.id}`}
                        className="text-sm font-medium text-brand-700 hover:underline"
                      >
                        {fmt(lease.startDate)} — {fmt(lease.endDate)}
                      </Link>
                      <p className="text-xs text-gray-500">{formatCents(lease.rentCents)}/mo</p>
                    </div>
                    <Badge tone={LEASE_STATUS_TONES[lease.status]}>
                      {LEASE_STATUS_LABELS[lease.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardSection>

          {tenancy.status !== 'ENDED' ? (
            <Card>
              <h2 className="text-base font-semibold text-gray-900">End tenancy</h2>
              <p className="mt-1 text-sm text-gray-500">
                Marks the tenancy ended as of the date below. Then run the move-out inspection and
                complete the deposit disposition — CA law gives you 21 days from move-out to send
                the itemized statement.
              </p>
              <form action={endTenancyAction} className="mt-3 space-y-3">
                <input type="hidden" name="tenancyId" value={tenancy.id} />
                <FormField label="Move-out date" htmlFor="endDate" required>
                  <Input
                    id="endDate"
                    name="endDate"
                    type="date"
                    required
                    defaultValue={toDateInputValue(new Date())}
                  />
                </FormField>
                <SubmitButton variant="danger" pendingText="Ending…">
                  End tenancy
                </SubmitButton>
              </form>
            </Card>
          ) : (
            <Card>
              <h2 className="text-base font-semibold text-gray-900">Tenancy ended</h2>
              <p className="mt-1 text-sm text-gray-600">
                Ended {tenancy.endDate ? fmt(tenancy.endDate) : '—'}.{' '}
                <Link
                  href={`/admin/inspections/disposition/${tenancy.id}`}
                  className="text-brand-700 underline"
                >
                  Review the deposit disposition
                </Link>
                .
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
