import { notFound, redirect } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fmt, toDateInputValue } from '@/lib/dates';
import { centsToDollarString, formatCents } from '@/lib/money';
import { Badge, ButtonLink, CardSection, EmptyState, PageHeader } from '@/components/ui';
import {
  deriveDisclosures,
  shiftYmd,
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
} from '@/lib/modules/leases/helpers';
import { LeaseForm, type LeaseFormDefaults } from '../../_components/lease-form';
import { createRenewalAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function RenewLeasePage({ params }: { params: { id: string } }) {
  await requireLandlord();
  const lease = await prisma.lease.findUnique({
    where: { id: params.id },
    include: {
      tenancy: {
        include: {
          unit: { include: { property: true } },
          tenants: { include: { user: true } },
        },
      },
      renewedTo: { select: { id: true } },
    },
  });
  if (!lease) notFound();
  if (lease.renewedTo) redirect(`/admin/leases/${lease.renewedTo.id}`);

  const templates = await prisma.leaseTemplate.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, isDefault: true },
  });

  const { unit } = lease.tenancy;
  const { property } = unit;
  const utilities = Array.isArray(lease.utilitiesIncluded)
    ? (lease.utilitiesIncluded as unknown[]).map(String)
    : [];

  const newStart = shiftYmd(toDateInputValue(lease.endDate), { days: 1 });
  const defaults: LeaseFormDefaults = {
    startDate: newStart,
    endDate: shiftYmd(newStart, { months: 12, days: -1 }),
    rent: centsToDollarString(lease.rentCents),
    deposit: centsToDollarString(Math.min(lease.depositCents, lease.rentCents)),
    lateFee: centsToDollarString(lease.lateFeeCents),
    lateFeeGraceDays: lease.lateFeeGraceDays !== null ? String(lease.lateFeeGraceDays) : '',
    utilities,
    petTerms: lease.petTerms ?? '',
    petRent: centsToDollarString(lease.petRentCents),
    additionalTerms: lease.additionalTerms ?? '',
    templateId:
      (lease.templateId && templates.some((t) => t.id === lease.templateId)
        ? lease.templateId
        : templates.find((t) => t.isDefault)?.id ?? templates[0]?.id) ?? '',
  };

  const tenants = [...lease.tenancy.tenants].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
  );

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Renew lease — {property.street}, Unit {unit.unitNumber}
            <Badge tone={LEASE_STATUS_TONES[lease.status]}>{LEASE_STATUS_LABELS[lease.status]}</Badge>
          </span>
        }
        description={`Current term ${fmt(lease.startDate)} – ${fmt(lease.endDate)} at ${formatCents(lease.rentCents)}/month. The current lease keeps running until you activate the renewal.`}
        actions={
          <ButtonLink variant="ghost" href={`/admin/leases/${lease.id}`}>
            Back to lease
          </ButtonLink>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          title="No lease templates yet"
          description="A lease template is required before a renewal can be created."
          action={<ButtonLink href="/admin/leases/templates">Go to templates</ButtonLink>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LeaseForm
              action={createRenewalAction}
              hidden={{ renewOfId: lease.id }}
              defaults={defaults}
              templates={templates}
              disclosures={deriveDisclosures(property)}
              previousRentCents={lease.rentCents}
              submitLabel="Create renewal (draft)"
            />
          </div>
          <div className="space-y-6">
            <CardSection title="Current lease">
              <dl className="space-y-2 text-sm">
                <Row label="Term" value={`${fmt(lease.startDate)} – ${fmt(lease.endDate)}`} />
                <Row label="Rent" value={`${formatCents(lease.rentCents)}/month`} />
                <Row label="Deposit" value={formatCents(lease.depositCents)} />
                <Row
                  label="Late fee"
                  value={
                    lease.lateFeeCents
                      ? `${formatCents(lease.lateFeeCents)} after ${lease.lateFeeGraceDays ?? 0} days`
                      : 'None'
                  }
                />
              </dl>
            </CardSection>
            <CardSection title="Tenants (unchanged)">
              <ul className="space-y-2 text-sm">
                {tenants.map((tenant) => (
                  <li key={tenant.userId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{tenant.user.name}</span>
                    <span className="text-gray-500">{tenant.user.email}</span>
                    {tenant.isPrimary && <Badge tone="blue">Primary</Badge>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-gray-500">
                The renewal stays on the same tenancy, so tenants, ledger history, and portal
                accounts carry over. Activating the renewal expires the current lease and updates
                the tenancy to the new term and rent.
              </p>
            </CardSection>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}
