import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
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
  Textarea,
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
  tenantNames,
} from '@/lib/modules/inspections/helpers';
import { ConditionSelect } from './condition-select';
import {
  addItem,
  landlordAcknowledge,
  markReadyForSignatures,
  reopenInspection,
  saveRoom,
  startInspection,
  updateNotes,
} from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Inspection' };

export default async function InspectionDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; notice?: string };
}) {
  const inspection = await prisma.inspection.findUnique({
    where: { id: params.id },
    include: {
      tenancy: {
        include: {
          unit: { include: { property: true } },
          tenants: { include: { user: true } },
        },
      },
      items: {
        include: { documents: { orderBy: { createdAt: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!inspection) notFound();

  const editable = inspection.status !== 'COMPLETED';
  const rooms = groupItemsByRoom(inspection.items);
  const roomNames = rooms.map((r) => r.room);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {TYPE_LABELS[inspection.type]} inspection — {shortUnitLabel(inspection.tenancy.unit)}
            <Badge tone={TYPE_TONES[inspection.type]}>{TYPE_LABELS[inspection.type]}</Badge>
            <Badge tone={STATUS_TONES[inspection.status]}>
              {STATUS_LABELS[inspection.status]}
            </Badge>
          </span>
        }
        description={`${inspection.tenancy.unit.property.street}, ${inspection.tenancy.unit.property.city} · Tenants: ${tenantNames(inspection.tenancy.tenants) || '—'}`}
        actions={
          <>
            <ButtonLink href="/admin/inspections" variant="ghost" size="sm">
              All inspections
            </ButtonLink>
            {inspection.type === 'MOVE_OUT' && (
              <>
                <ButtonLink
                  href={`/admin/inspections/${inspection.id}/compare`}
                  variant="secondary"
                  size="sm"
                >
                  Compare with move-in
                </ButtonLink>
                <ButtonLink
                  href={`/admin/inspections/disposition/${inspection.tenancyId}`}
                  variant="secondary"
                  size="sm"
                >
                  Deposit disposition
                </ButtonLink>
              </>
            )}
            {inspection.status === 'SCHEDULED' && (
              <form action={startInspection.bind(null, inspection.id)}>
                <SubmitButton pendingText="Starting…">Start inspection</SubmitButton>
              </form>
            )}
            {inspection.status === 'IN_PROGRESS' && (
              <form action={markReadyForSignatures.bind(null, inspection.id)}>
                <SubmitButton pendingText="Updating…">Mark ready for signatures</SubmitButton>
              </form>
            )}
            {inspection.status === 'PENDING_SIGNATURES' &&
              !inspection.tenantAckAt &&
              !inspection.landlordAckAt && (
                <form action={reopenInspection.bind(null, inspection.id)}>
                  <SubmitButton variant="secondary" pendingText="Reopening…">
                    Reopen for edits
                  </SubmitButton>
                </form>
              )}
          </>
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

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <CardSection title="Details">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Scheduled</dt>
              <dd className="text-gray-900">
                {inspection.scheduledAt ? fmtDateTime(inspection.scheduledAt) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Completed</dt>
              <dd className="text-gray-900">
                {inspection.completedAt ? fmtDateTime(inspection.completedAt) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Checklist items</dt>
              <dd className="text-gray-900">{inspection.items.length}</dd>
            </div>
          </dl>
          {editable ? (
            <form action={updateNotes.bind(null, inspection.id)} className="mt-4 space-y-3">
              <FormField label="General notes" htmlFor="inspection-notes">
                <Textarea
                  id="inspection-notes"
                  name="notes"
                  rows={3}
                  defaultValue={inspection.notes ?? ''}
                  placeholder="Anything that applies to the whole unit…"
                />
              </FormField>
              <SubmitButton variant="secondary" pendingText="Saving…">
                Save notes
              </SubmitButton>
            </form>
          ) : (
            inspection.notes && (
              <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{inspection.notes}</p>
            )
          )}
        </CardSection>

        <CardSection title="Signatures">
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-gray-200 p-3">
              <p className="font-medium text-gray-900">Tenant acknowledgement</p>
              {inspection.tenantAckAt ? (
                <p className="mt-1 text-green-700">
                  Signed by {inspection.tenantAckName} on {fmtDateTime(inspection.tenantAckAt)}
                </p>
              ) : (
                <p className="mt-1 text-gray-500">
                  {inspection.status === 'PENDING_SIGNATURES'
                    ? 'Waiting — the tenant can sign from their resident portal.'
                    : 'Not yet requested.'}
                </p>
              )}
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <p className="font-medium text-gray-900">Landlord acknowledgement</p>
              {inspection.landlordAckAt ? (
                <p className="mt-1 text-green-700">
                  Signed by {inspection.landlordAckName} on {fmtDateTime(inspection.landlordAckAt)}
                </p>
              ) : inspection.status === 'PENDING_SIGNATURES' ? (
                <form
                  action={landlordAcknowledge.bind(null, inspection.id)}
                  className="mt-2 space-y-3"
                >
                  <Checkbox
                    name="confirm"
                    required
                    label="I have reviewed this inspection report and agree it accurately reflects the condition of the unit."
                  />
                  <FormField label="Type your full name to sign" htmlFor="landlord-ack-name" required>
                    <Input
                      id="landlord-ack-name"
                      name="name"
                      required
                      placeholder="Full legal name"
                      autoComplete="name"
                    />
                  </FormField>
                  <SubmitButton pendingText="Signing…">Sign as landlord</SubmitButton>
                </form>
              ) : (
                <p className="mt-1 text-gray-500">
                  Available once the report is marked ready for signatures.
                </p>
              )}
            </div>
          </div>
        </CardSection>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-gray-900">Room-by-room checklist</h2>

      {rooms.map(({ room, items }) => (
        <CardSection key={room} title={room} className="mb-6">
          {editable ? (
            <form action={saveRoom.bind(null, inspection.id, room)} className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-md border border-gray-100 bg-gray-50/50 p-3 sm:p-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                    <p className="text-sm font-semibold text-gray-900 sm:pt-2">{item.item}</p>
                    <FormField label="Condition" htmlFor={`condition-${item.id}`}>
                      <ConditionSelect
                        id={`condition-${item.id}`}
                        name={`condition-${item.id}`}
                        defaultValue={item.condition ?? ''}
                      />
                    </FormField>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <FormField label="Notes" htmlFor={`notes-${item.id}`}>
                      <Input
                        id={`notes-${item.id}`}
                        name={`notes-${item.id}`}
                        defaultValue={item.notes ?? ''}
                        placeholder="e.g. scuff near door, small crack…"
                      />
                    </FormField>
                    <FormField
                      label="Add photos"
                      htmlFor={`photos-${item.id}`}
                      hint="JPEG, PNG, WebP, or HEIC — up to 15 MB each."
                    >
                      <input
                        id={`photos-${item.id}`}
                        name={`photos-${item.id}`}
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
                      />
                    </FormField>
                  </div>
                  {item.documents.length > 0 && (
                    <div className="mt-3">
                      <MediaGrid docs={item.documents} />
                    </div>
                  )}
                </div>
              ))}
              <SubmitButton pendingText="Saving…">Save {room}</SubmitButton>
            </form>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.id} className="rounded-md border border-gray-100 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{item.item}</p>
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
                    <div className="mt-3">
                      <MediaGrid docs={item.documents} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      ))}

      {editable && (
        <CardSection title="Add a custom line item" className="mb-6">
          <form
            action={addItem.bind(null, inspection.id)}
            className="grid gap-4 sm:grid-cols-3 sm:items-end"
          >
            <FormField label="Room" htmlFor="custom-room" required>
              <Input
                id="custom-room"
                name="room"
                required
                list="inspection-rooms"
                placeholder="e.g. Garage"
              />
              <datalist id="inspection-rooms">
                {roomNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </FormField>
            <FormField label="Item" htmlFor="custom-item" required>
              <Input id="custom-item" name="item" required placeholder="e.g. Garage Door Opener" />
            </FormField>
            <div>
              <SubmitButton variant="secondary" pendingText="Adding…">
                Add line item
              </SubmitButton>
            </div>
          </form>
        </CardSection>
      )}

      {inspection.items.length === 0 && (
        <Card>
          <p className="text-sm text-gray-500">
            This inspection has no checklist items. Add custom line items above to build one.
          </p>
        </Card>
      )}
    </div>
  );
}
