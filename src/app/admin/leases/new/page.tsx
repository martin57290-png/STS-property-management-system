import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fmt, toDateInputValue } from '@/lib/dates';
import { centsToDollarString, formatCents } from '@/lib/money';
import { Badge, ButtonLink, CardSection, EmptyState, PageHeader } from '@/components/ui';
import {
  deriveDisclosures,
  shiftYmd,
  suggestPetTerms,
  LEASE_STATUS_LABELS,
  LEASE_STATUS_TONES,
} from '@/lib/modules/leases/helpers';
import { LeaseForm, type LeaseFormDefaults } from '../_components/lease-form';
import { createLeaseAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewLeasePage({
  searchParams,
}: {
  searchParams: { applicationId?: string; tenancyId?: string };
}) {
  await requireLandlord();

  const templates = await prisma.leaseTemplate.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, isDefault: true },
  });

  if (searchParams.applicationId) {
    return (
      <FromApplication
        applicationId={searchParams.applicationId}
        templates={templates}
      />
    );
  }
  if (searchParams.tenancyId) {
    return <FromTenancy tenancyId={searchParams.tenancyId} templates={templates} />;
  }
  return <SourcePicker />;
}

type TemplateOption = { id: string; name: string; isDefault: boolean };

function NoTemplates() {
  return (
    <EmptyState
      title="No lease templates yet"
      description="A lease template is required before a lease can be created. Restore the built-in California template first."
      action={<ButtonLink href="/admin/leases/templates">Go to templates</ButtonLink>}
    />
  );
}

async function FromApplication({
  applicationId,
  templates,
}: {
  applicationId: string;
  templates: TemplateOption[];
}) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      unit: { include: { property: true } },
      coApplicants: true,
      pets: true,
      lease: { select: { id: true } },
    },
  });

  if (!application) {
    return (
      <div>
        <PageHeader title="New lease" />
        <EmptyState
          title="Application not found"
          description="The application may have been removed."
          action={<ButtonLink href="/admin/applications">Back to applications</ButtonLink>}
        />
      </div>
    );
  }
  if (application.lease) redirect(`/admin/leases/${application.lease.id}`);

  const settings = await getSettings();
  const { unit } = application;
  const { property } = unit;

  const startYmd = application.moveInDate
    ? toDateInputValue(application.moveInDate)
    : toDateInputValue(new Date());
  const defaults: LeaseFormDefaults = {
    startDate: startYmd,
    endDate: shiftYmd(startYmd, { months: 12, days: -1 }),
    rent: centsToDollarString(unit.marketRentCents),
    // Default the deposit to the AB 12 cap (one month's rent) when the unit's
    // configured deposit exceeds it.
    deposit: centsToDollarString(Math.min(unit.depositCents, unit.marketRentCents)),
    lateFee: centsToDollarString(settings.defaultLateFeeCents),
    lateFeeGraceDays: String(settings.defaultLateFeeGraceDays),
    utilities: [],
    petTerms: suggestPetTerms(application.pets),
    petRent: '',
    additionalTerms: '',
    templateId: templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? '',
  };

  const futureTenants = [
    {
      name: `${application.firstName} ${application.lastName}`,
      email: application.email,
      isPrimary: true,
    },
    ...application.coApplicants
      .filter((co) => co.email && !co.isOccupantOnly)
      .map((co) => ({
        name: `${co.firstName} ${co.lastName}`,
        email: co.email as string,
        isPrimary: false,
      })),
  ];

  return (
    <div>
      <PageHeader
        title="New lease from application"
        description={`${application.firstName} ${application.lastName} — ${property.street}, Unit ${unit.unitNumber}, ${property.city}`}
        actions={
          <ButtonLink variant="secondary" href={`/admin/applications/${application.id}`}>
            View application
          </ButtonLink>
        }
      />

      {application.status !== 'APPROVED' && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900" role="alert">
          This application is not approved yet (current status:{' '}
          {application.status.replaceAll('_', ' ').toLowerCase()}). You can still draft the lease,
          but approve the application first if that was unintended.
        </div>
      )}

      {templates.length === 0 ? (
        <NoTemplates />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LeaseForm
              action={createLeaseAction}
              hidden={{ applicationId: application.id }}
              defaults={defaults}
              templates={templates}
              disclosures={deriveDisclosures(property)}
              submitLabel="Create draft lease"
            />
          </div>
          <div className="space-y-6">
            <CardSection title="Unit">
              <dl className="space-y-2 text-sm">
                <SummaryRow label="Address" value={`${property.street}, Unit ${unit.unitNumber}`} />
                <SummaryRow label="City" value={`${property.city}, ${property.state} ${property.zip}`} />
                <SummaryRow
                  label="Year built"
                  value={property.yearBuilt ? String(property.yearBuilt) : 'Unknown'}
                />
                <SummaryRow label="Market rent" value={formatCents(unit.marketRentCents)} />
                <SummaryRow label="Configured deposit" value={formatCents(unit.depositCents)} />
              </dl>
            </CardSection>
            <CardSection title="Tenant portal accounts">
              <p className="mb-3 text-xs text-gray-500">
                Creating the lease also creates the tenancy and these tenant accounts (without
                passwords — you set initial portal passwords from the lease page).
              </p>
              <ul className="space-y-2 text-sm">
                {futureTenants.map((tenant) => (
                  <li key={tenant.email} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{tenant.name}</span>
                    <span className="text-gray-500">{tenant.email}</span>
                    {tenant.isPrimary && <Badge tone="blue">Primary</Badge>}
                  </li>
                ))}
              </ul>
              {application.coApplicants.some((co) => !co.email || co.isOccupantOnly) && (
                <p className="mt-3 text-xs text-gray-500">
                  Co-applicants without an email address (or marked occupant-only) do not get
                  portal accounts.
                </p>
              )}
            </CardSection>
            {application.pets.length > 0 && (
              <CardSection title="Pets on application">
                <ul className="space-y-1 text-sm text-gray-700">
                  {application.pets.map((pet) => (
                    <li key={pet.id}>
                      {pet.type}
                      {pet.breed ? ` — ${pet.breed}` : ''}
                      {pet.name ? ` “${pet.name}”` : ''}
                      {pet.weightLbs ? `, ${pet.weightLbs} lbs` : ''}
                      {pet.isServiceAnimal ? ' (service animal)' : ''}
                    </li>
                  ))}
                </ul>
              </CardSection>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

async function FromTenancy({
  tenancyId,
  templates,
}: {
  tenancyId: string;
  templates: TemplateOption[];
}) {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: {
      unit: { include: { property: true } },
      tenants: { include: { user: true } },
    },
  });

  if (!tenancy) {
    return (
      <div>
        <PageHeader title="New lease" />
        <EmptyState
          title="Tenancy not found"
          description="The tenancy may have been removed."
          action={<ButtonLink href="/admin/leases">Back to leases</ButtonLink>}
        />
      </div>
    );
  }

  const settings = await getSettings();
  const { unit } = tenancy;
  const { property } = unit;
  const startYmd = toDateInputValue(new Date());
  const defaults: LeaseFormDefaults = {
    startDate: startYmd,
    endDate: shiftYmd(startYmd, { months: 12, days: -1 }),
    rent: centsToDollarString(tenancy.rentCents),
    deposit: centsToDollarString(Math.min(tenancy.depositCents, tenancy.rentCents)),
    lateFee: centsToDollarString(settings.defaultLateFeeCents),
    lateFeeGraceDays: String(settings.defaultLateFeeGraceDays),
    utilities: [],
    petTerms: '',
    petRent: '',
    additionalTerms: '',
    templateId: templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? '',
  };

  const sortedTenants = [...tenancy.tenants].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  return (
    <div>
      <PageHeader
        title="New lease for existing tenancy"
        description={`${property.street}, Unit ${unit.unitNumber}, ${property.city} — current tenants keep their accounts.`}
      />
      {templates.length === 0 ? (
        <NoTemplates />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LeaseForm
              action={createLeaseAction}
              hidden={{ tenancyId: tenancy.id }}
              defaults={defaults}
              templates={templates}
              disclosures={deriveDisclosures(property)}
              submitLabel="Create draft lease"
            />
          </div>
          <div className="space-y-6">
            <CardSection title="Tenancy">
              <dl className="space-y-2 text-sm">
                <SummaryRow label="Unit" value={`${property.street}, Unit ${unit.unitNumber}`} />
                <SummaryRow label="Status" value={tenancy.status} />
                <SummaryRow label="Current rent" value={formatCents(tenancy.rentCents)} />
                <SummaryRow label="Deposit held" value={formatCents(tenancy.depositCents)} />
                <SummaryRow
                  label="Current term"
                  value={`${fmt(tenancy.startDate)} – ${tenancy.endDate ? fmt(tenancy.endDate) : 'open-ended'}`}
                />
              </dl>
            </CardSection>
            <CardSection title="Tenants on this tenancy">
              <ul className="space-y-2 text-sm">
                {sortedTenants.map((tenant) => (
                  <li key={tenant.userId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{tenant.user.name}</span>
                    <span className="text-gray-500">{tenant.user.email}</span>
                    {tenant.isPrimary && <Badge tone="blue">Primary</Badge>}
                  </li>
                ))}
              </ul>
            </CardSection>
          </div>
        </div>
      )}
    </div>
  );
}

/** No source given: pick an approved application or an existing tenancy. */
async function SourcePicker() {
  const [applications, tenancies] = await Promise.all([
    prisma.application.findMany({
      where: { status: 'APPROVED', lease: null },
      include: { unit: { include: { property: true } } },
      orderBy: { decisionAt: 'desc' },
      take: 50,
    }),
    prisma.tenancy.findMany({
      where: { status: { in: ['PENDING', 'ACTIVE'] } },
      include: {
        unit: { include: { property: true } },
        tenants: { include: { user: true } },
        leases: { select: { id: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { startDate: 'desc' },
      take: 50,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="New lease"
        description="Start from an approved application (creates the tenancy and tenant accounts) or draft a fresh lease for an existing tenancy."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <CardSection title="Approved applications without a lease">
          {applications.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              description="Approve an application and it will appear here."
              action={<ButtonLink variant="secondary" href="/admin/applications">Applications</ButtonLink>}
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {applications.map((application) => (
                <li key={application.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {application.firstName} {application.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {application.unit.property.street}, Unit {application.unit.unitNumber} · approved{' '}
                      {fmt(application.decisionAt)}
                    </p>
                  </div>
                  <ButtonLink size="sm" href={`/admin/leases/new?applicationId=${application.id}`}>
                    Start lease
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
        <CardSection title="Existing tenancies">
          {tenancies.length === 0 ? (
            <EmptyState title="No tenancies yet" description="Tenancies are created by the lease wizard." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {tenancies.map((tenancy) => {
                const latest = tenancy.leases[0];
                return (
                  <li key={tenancy.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {tenancy.unit.property.street}, Unit {tenancy.unit.unitNumber}
                      </p>
                      <p className="text-xs text-gray-500">
                        {tenancy.tenants.map((t) => t.user.name).join(', ') || 'No tenants'}
                        {latest && (
                          <>
                            {' · latest lease: '}
                            <Link href={`/admin/leases/${latest.id}`} className="underline">
                              {LEASE_STATUS_LABELS[latest.status]}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {latest && (
                        <Badge tone={LEASE_STATUS_TONES[latest.status]}>
                          {LEASE_STATUS_LABELS[latest.status]}
                        </Badge>
                      )}
                      <ButtonLink size="sm" variant="secondary" href={`/admin/leases/new?tenancyId=${tenancy.id}`}>
                        New lease
                      </ButtonLink>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardSection>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}
