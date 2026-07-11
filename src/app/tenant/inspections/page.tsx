import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import {
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  TYPE_TONES,
  shortUnitLabel,
} from '@/lib/modules/inspections/helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Inspections' };

export default async function TenantInspectionsPage() {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);

  if (!tenancy) {
    return (
      <div>
        <PageHeader
          title="Inspections"
          description="Move-in and move-out condition reports for your home."
        />
        <EmptyState
          title="No tenancy on file"
          description="Once your tenancy is set up, your inspection reports will appear here."
        />
      </div>
    );
  }

  const inspections = await prisma.inspection.findMany({
    where: { tenancyId: tenancy.id },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <div>
      <PageHeader
        title="Inspections"
        description={`Move-in and move-out condition reports for ${shortUnitLabel(tenancy.unit)}.`}
      />

      {inspections.length === 0 ? (
        <EmptyState
          title="No inspections yet"
          description="When your landlord schedules a move-in or move-out inspection, it will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {inspections.map((inspection) => {
            const needsSignature =
              inspection.status === 'PENDING_SIGNATURES' && !inspection.tenantAckAt;
            return (
              <li key={inspection.id}>
                <Link href={`/tenant/inspections/${inspection.id}`} className="block">
                  <Card className="transition-shadow hover:shadow">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-semibold text-gray-900">
                        {TYPE_LABELS[inspection.type]} inspection
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={TYPE_TONES[inspection.type]}>
                          {TYPE_LABELS[inspection.type]}
                        </Badge>
                        <Badge tone={STATUS_TONES[inspection.status]}>
                          {STATUS_LABELS[inspection.status]}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {inspection.scheduledAt
                        ? `Scheduled for ${fmtDateTime(inspection.scheduledAt)}`
                        : 'Not yet scheduled'}
                      {' · '}
                      {inspection._count.items} checklist item(s)
                    </p>
                    {needsSignature && (
                      <p className="mt-2">
                        <Badge tone="orange">Your review & signature are needed</Badge>
                      </p>
                    )}
                    {inspection.tenantAckAt && (
                      <p className="mt-2 text-xs text-green-700">
                        You acknowledged this report on {fmtDateTime(inspection.tenantAckAt)}.
                      </p>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
