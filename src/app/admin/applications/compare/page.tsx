import type { Metadata } from 'next';
import Link from 'next/link';
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
} from '@/components/ui';
import { getActiveApplicationsForUnit } from '@/lib/modules/applications/queries';
import {
  householdSize,
  incomeToRentRatio,
  monthsLabel,
  residenceHistoryMonths,
  STATUS_LABELS,
  STATUS_TONES,
} from '@/lib/modules/applications/helpers';
import { quickDecide } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Compare applicants' };

function CompareRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-1.5 text-sm last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}

export default async function CompareApplicantsPage({
  searchParams,
}: {
  searchParams: { unit?: string };
}) {
  const unitId = searchParams.unit;

  if (!unitId) {
    const groups = await prisma.application.groupBy({
      by: ['unitId'],
      where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      _count: { _all: true },
    });
    const units = await prisma.unit.findMany({
      where: { id: { in: groups.map((g) => g.unitId) } },
      include: { property: true },
      orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
    });
    return (
      <div>
        <PageHeader
          title="Compare applicants"
          description="Pick a unit to compare its active applications side by side."
        />
        {units.length === 0 ? (
          <EmptyState
            title="No active applications to compare"
            description="When a unit has submitted or under-review applications, it will appear here."
            action={
              <ButtonLink href="/admin/applications" variant="secondary">
                Back to applications
              </ButtonLink>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((unit) => {
              const count = groups.find((g) => g.unitId === unit.id)?._count._all ?? 0;
              return (
                <Link
                  key={unit.id}
                  href={`/admin/applications/compare?unit=${unit.id}`}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow"
                >
                  <p className="font-semibold text-gray-900">
                    {unit.property.name} — Unit {unit.unitNumber}
                  </p>
                  <p className="text-sm text-gray-600">
                    {count} active {count === 1 ? 'application' : 'applications'} · asking{' '}
                    {formatCents(unit.marketRentCents)}/mo
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: { property: true },
  });
  if (!unit) {
    return (
      <div>
        <PageHeader title="Compare applicants" />
        <EmptyState
          title="Unit not found"
          action={
            <ButtonLink href="/admin/applications/compare" variant="secondary">
              Choose a unit
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const apps = await getActiveApplicationsForUnit(unit.id);

  return (
    <div>
      <PageHeader
        title={`Compare applicants — ${unit.property.name} #${unit.unitNumber}`}
        description={`Asking ${formatCents(unit.marketRentCents)}/mo · ${apps.length} active ${apps.length === 1 ? 'application' : 'applications'} (submitted or under review).`}
        actions={
          <ButtonLink href="/admin/applications" variant="ghost" size="sm">
            ← All applications
          </ButtonLink>
        }
      />

      {apps.length === 0 ? (
        <EmptyState
          title="No active applications for this unit"
          description="Approved, denied, and waitlisted applications are not shown here."
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => {
            const currentJob = app.employments.find((e) => e.isCurrent) ?? app.employments[0];
            const serviceAnimals = app.pets.filter((p) => p.isServiceAnimal).length;
            return (
              <Card key={app.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/admin/applications/${app.id}`}
                    className="text-base font-semibold text-brand-700 hover:underline"
                  >
                    {app.firstName} {app.lastName}
                  </Link>
                  <Badge tone={STATUS_TONES[app.status]}>{STATUS_LABELS[app.status]}</Badge>
                </div>

                <CompareRow
                  label="Submitted"
                  value={app.submittedAt ? fmt(app.submittedAt) : '—'}
                />
                <CompareRow
                  label="Monthly income"
                  value={app.monthlyIncomeCents != null ? formatCents(app.monthlyIncomeCents) : '—'}
                />
                <CompareRow
                  label="Income / rent"
                  value={incomeToRentRatio(app.monthlyIncomeCents, unit.marketRentCents)}
                />
                <CompareRow label="Household size" value={householdSize(app)} />
                <CompareRow
                  label="Pets"
                  value={
                    app.pets.length === 0
                      ? 'None'
                      : `${app.pets.length}${serviceAnimals > 0 ? ` (${serviceAnimals} service)` : ''}`
                  }
                />
                <CompareRow
                  label="Vehicles"
                  value={app.vehicles.length === 0 ? 'None' : app.vehicles.length}
                />
                <CompareRow
                  label="Employment"
                  value={
                    currentJob
                      ? `${currentJob.employer}${currentJob.position ? ` — ${currentJob.position}` : ''}`
                      : '—'
                  }
                />
                <CompareRow
                  label="Residence history"
                  value={monthsLabel(residenceHistoryMonths(app.residences))}
                />
                <CompareRow label="Documents" value={app.documents.length} />
                <CompareRow
                  label="Screening consent"
                  value={
                    app.screeningConsentAt ? (
                      <Badge tone="green">Signed {fmt(app.screeningConsentAt)}</Badge>
                    ) : (
                      <Badge tone="red">Missing</Badge>
                    )
                  }
                />
                <CompareRow
                  label="Fee"
                  value={
                    app.feePaidAt ? <Badge tone="green">Paid</Badge> : <Badge tone="gray">Unpaid</Badge>
                  }
                />

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={quickDecide.bind(null, unit.id)}>
                    <input type="hidden" name="applicationId" value={app.id} />
                    <input type="hidden" name="decision" value="APPROVED" />
                    <Button type="submit" size="sm">
                      Approve
                    </Button>
                  </form>
                  <form action={quickDecide.bind(null, unit.id)}>
                    <input type="hidden" name="applicationId" value={app.id} />
                    <input type="hidden" name="decision" value="DENIED" />
                    <Button type="submit" size="sm" variant="danger">
                      Deny
                    </Button>
                  </form>
                  <ButtonLink
                    href={`/admin/applications/${app.id}`}
                    variant="secondary"
                    size="sm"
                  >
                    Full detail
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
