import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import {
  Badge,
  ButtonLink,
  Card,
  CardSection,
  Checkbox,
  FormField,
  Input,
  PageHeader,
  SubmitButton,
} from '@/components/ui';
import { MediaGrid } from '@/components/documents';
import {
  CONDITION_LABELS,
  CONDITION_TONES,
  STATUS_LABELS,
  STATUS_TONES,
  TYPE_LABELS,
  TYPE_TONES,
  groupItemsByRoom,
  shortUnitLabel,
} from '@/lib/modules/inspections/helpers';
import { acknowledgeInspection } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Inspection report' };

export default async function TenantInspectionDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; notice?: string };
}) {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);
  if (!tenancy) notFound();

  // Scope strictly to this tenant's tenancy.
  const inspection = await prisma.inspection.findFirst({
    where: { id: params.id, tenancyId: tenancy.id },
    include: {
      items: {
        include: { documents: { orderBy: { createdAt: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!inspection) notFound();

  const rooms = groupItemsByRoom(inspection.items);
  const canSign = inspection.status === 'PENDING_SIGNATURES' && !inspection.tenantAckAt;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`${TYPE_LABELS[inspection.type]} inspection report`}
        description={shortUnitLabel(tenancy.unit)}
        actions={
          <ButtonLink href="/tenant/inspections" variant="ghost" size="sm">
            All inspections
          </ButtonLink>
        }
      />

      {searchParams.error && (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {searchParams.error}
        </div>
      )}
      {searchParams.notice && (
        <div
          className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          role="status"
        >
          {searchParams.notice}
        </div>
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TYPE_TONES[inspection.type]}>{TYPE_LABELS[inspection.type]}</Badge>
          <Badge tone={STATUS_TONES[inspection.status]}>{STATUS_LABELS[inspection.status]}</Badge>
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Scheduled</dt>
            <dd className="text-right text-gray-900">
              {inspection.scheduledAt ? fmtDateTime(inspection.scheduledAt) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Completed</dt>
            <dd className="text-right text-gray-900">
              {inspection.completedAt ? fmtDateTime(inspection.completedAt) : '—'}
            </dd>
          </div>
        </dl>
        {inspection.notes && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{inspection.notes}</p>
        )}
      </Card>

      {canSign && (
        <CardSection title="Review & acknowledge" className="mb-6 border-orange-200">
          <p className="mb-4 text-sm text-gray-700">
            Please review the room-by-room condition report below. When you are done, acknowledge
            it by typing your full name — this records your electronic signature on the report.
          </p>
          <form action={acknowledgeInspection.bind(null, inspection.id)} className="space-y-4">
            <Checkbox name="confirm" required label="I have reviewed this inspection report." />
            <FormField label="Type your full name to sign" htmlFor="tenant-ack-name" required>
              <Input
                id="tenant-ack-name"
                name="name"
                required
                placeholder="Full legal name"
                autoComplete="name"
              />
            </FormField>
            <SubmitButton pendingText="Signing…" className="w-full sm:w-auto">
              Acknowledge inspection report
            </SubmitButton>
          </form>
        </CardSection>
      )}

      {inspection.tenantAckAt && (
        <div
          className="mb-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
          role="status"
        >
          You acknowledged this report as{' '}
          <span className="font-semibold">{inspection.tenantAckName}</span> on{' '}
          {fmtDateTime(inspection.tenantAckAt)}.
        </div>
      )}

      {inspection.items.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">
            The checklist for this inspection has not been filled in yet.
          </p>
        </Card>
      ) : (
        rooms.map(({ room, items }) => (
          <CardSection key={room} title={room} className="mb-4">
            <ul className="divide-y divide-gray-100">
              {items.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{item.item}</p>
                    {item.condition ? (
                      <Badge tone={CONDITION_TONES[item.condition]}>
                        {CONDITION_LABELS[item.condition]}
                      </Badge>
                    ) : (
                      <Badge tone="gray">Not assessed</Badge>
                    )}
                  </div>
                  {item.notes && <p className="mt-1 text-sm text-gray-600">{item.notes}</p>}
                  {item.documents.length > 0 && (
                    <div className="mt-2">
                      <MediaGrid docs={item.documents} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardSection>
        ))
      )}
    </div>
  );
}
