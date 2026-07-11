import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fmtDateTime, openAge, daysSince } from '@/lib/dates';
import { centsToDollarString } from '@/lib/money';
import {
  Badge,
  ButtonLink,
  CardSection,
  Checkbox,
  FormField,
  Input,
  PageHeader,
  Select,
  SubmitButton,
  Textarea,
} from '@/components/ui';
import { MediaGrid } from '@/components/documents';
import {
  effectivePriority,
  isOpenStatus,
  PRIORITY_STYLES,
  STATUS_LABELS,
} from '@/lib/escalation';
import {
  ALL_PRIORITIES,
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  shortUnitLabel,
  STATUS_TONES,
  toDateTimeLocalValue,
  woNumber,
} from '@/lib/modules/work-orders/helpers';
import { Flash } from '@/lib/modules/work-orders/flash';
import {
  addAdminComment,
  addCompletionPhotos,
  transitionStatus,
  updateTicket,
} from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Work order' };

export default async function AdminWorkOrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { notice?: string; error?: string };
}) {
  const [workOrder, vendors, settings] = await Promise.all([
    prisma.workOrder.findUnique({
      where: { id: params.id },
      include: {
        unit: { include: { property: true } },
        tenancy: { include: { tenants: { include: { user: true } } } },
        vendor: true,
        createdBy: true,
        documents: { orderBy: { createdAt: 'asc' } },
        comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.vendor.findMany({ orderBy: { name: 'asc' } }),
    getSettings(),
  ]);
  if (!workOrder) notFound();

  const effective = effectivePriority(workOrder, settings);
  const escalated = isOpenStatus(workOrder.status) && effective !== workOrder.priority;
  const open = isOpenStatus(workOrder.status);

  const tenantMedia = workOrder.documents.filter((d) => d.category === 'WORK_ORDER_MEDIA');
  const completionPhotos = workOrder.documents.filter((d) => d.category === 'COMPLETION_PHOTO');
  const otherDocs = workOrder.documents.filter(
    (d) => d.category !== 'WORK_ORDER_MEDIA' && d.category !== 'COMPLETION_PHOTO',
  );

  const timeline: { label: string; at: Date | null }[] = [
    { label: 'Submitted', at: workOrder.createdAt },
    { label: 'Acknowledged', at: workOrder.acknowledgedAt },
    { label: 'Scheduled', at: workOrder.scheduledAt },
    { label: 'Work started', at: workOrder.startedAt },
    { label: 'Completed', at: workOrder.completedAt },
    { label: workOrder.status === 'CANCELLED' ? 'Cancelled' : 'Closed', at: workOrder.closedAt },
  ];

  const acknowledge = transitionStatus.bind(null, workOrder.id, 'ACKNOWLEDGED');
  const schedule = transitionStatus.bind(null, workOrder.id, 'SCHEDULED');
  const start = transitionStatus.bind(null, workOrder.id, 'IN_PROGRESS');
  const complete = transitionStatus.bind(null, workOrder.id, 'COMPLETED');
  const close = transitionStatus.bind(null, workOrder.id, 'CLOSED');
  const cancel = transitionStatus.bind(null, workOrder.id, 'CANCELLED');
  const saveTicket = updateTicket.bind(null, workOrder.id);
  const uploadPhotos = addCompletionPhotos.bind(null, workOrder.id);
  const comment = addAdminComment.bind(null, workOrder.id);

  return (
    <div>
      <PageHeader
        title={
          <>
            {woNumber(workOrder.number)} — {workOrder.title}
          </>
        }
        description={shortUnitLabel(workOrder.unit)}
        actions={
          <ButtonLink href="/admin/work-orders" variant="ghost" size="sm">
            Back to board
          </ButtonLink>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[workOrder.status]}>{STATUS_LABELS[workOrder.status]}</Badge>
        {escalated ? (
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[workOrder.priority].badge}`}
            >
              {PRIORITY_STYLES[workOrder.priority].label}
            </span>
            <span aria-hidden className="text-xs font-bold text-gray-500">
              ↑
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[effective].badge}`}
            >
              {PRIORITY_STYLES[effective].label}
            </span>
            <span className="text-xs text-gray-500">
              (escalated — open {daysSince(workOrder.createdAt)} days)
            </span>
          </span>
        ) : (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[effective].badge}`}
          >
            {PRIORITY_STYLES[effective].label}
          </span>
        )}
        {workOrder.isHabitability && (
          <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            Habitability — CA repair-and-deduct exposure
          </span>
        )}
        {open && (
          <span className="text-sm font-medium text-gray-600">
            open {openAge(workOrder.createdAt)}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">
          <CardSection title="Tenant & access">
            <div
              className={`mb-3 rounded-md border p-3 text-sm font-medium ${
                workOrder.permissionToEnter
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              {workOrder.permissionToEnter
                ? 'Permission to enter granted — entry authorized to complete this repair, including when the tenant is not home.'
                : 'NO permission to enter on file — coordinate access with the tenant before sending anyone.'}
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-gray-600">Preferred access times:</dt>
                <dd className="text-gray-900">{workOrder.preferredAccessTimes || '—'}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-gray-600">Submitted by:</dt>
                <dd className="text-gray-900">
                  {workOrder.createdBy?.name ?? 'Landlord'} · {fmtDateTime(workOrder.createdAt)}
                </dd>
              </div>
              {workOrder.tenancy && workOrder.tenancy.tenants.length > 0 && (
                <div>
                  <dt className="font-medium text-gray-600">Tenants on this tenancy</dt>
                  <dd className="mt-1">
                    <ul className="space-y-1 text-gray-900">
                      {workOrder.tenancy.tenants.map((t) => (
                        <li key={t.userId}>
                          {t.user.name}
                          {t.user.phone && <> · {t.user.phone}</>}
                          {t.user.email && <> · {t.user.email}</>}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          </CardSection>

          <CardSection title="Problem description">
            <p className="text-sm text-gray-600">
              Category: <span className="font-medium text-gray-900">{CATEGORY_LABELS[workOrder.category]}</span>
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
              {workOrder.description}
            </p>
          </CardSection>

          <CardSection title={`Tenant photos & videos (${tenantMedia.length})`}>
            <MediaGrid docs={tenantMedia} />
          </CardSection>

          <CardSection title={`Completion photos (${completionPhotos.length})`}>
            <MediaGrid docs={completionPhotos} />
            <form action={uploadPhotos} className="mt-4 flex flex-wrap items-end gap-3">
              <FormField label="Add completion photos" htmlFor="photos" className="grow">
                <input
                  id="photos"
                  name="photos"
                  type="file"
                  multiple
                  required
                  accept="image/*"
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                />
              </FormField>
              <SubmitButton variant="secondary" pendingText="Uploading…">
                Upload
              </SubmitButton>
            </form>
            {otherDocs.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                {otherDocs.length} other document(s) attached to this ticket.
              </p>
            )}
          </CardSection>

          <CardSection title={`Comments (${workOrder.comments.length})`}>
            {workOrder.comments.length === 0 ? (
              <p className="text-sm text-gray-500">No comments yet.</p>
            ) : (
              <ul className="space-y-4">
                {workOrder.comments.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded-md p-3 ${c.visibleToTenant ? 'bg-gray-50' : 'border border-dashed border-gray-300 bg-yellow-50/50'}`}
                  >
                    <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span className="font-semibold text-gray-800">{c.author.name}</span>
                      <Badge tone={c.author.role === 'LANDLORD' ? 'purple' : 'blue'}>
                        {c.author.role === 'LANDLORD' ? 'Management' : 'Tenant'}
                      </Badge>
                      {c.visibleToTenant ? (
                        <Badge tone="green">Visible to tenant</Badge>
                      ) : (
                        <Badge tone="yellow">Internal only</Badge>
                      )}
                      <span>{fmtDateTime(c.createdAt)}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}

            <form action={comment} className="mt-4 space-y-3">
              <FormField label="Add a comment" htmlFor="comment-body">
                <Textarea id="comment-body" name="body" required rows={3} />
              </FormField>
              <Checkbox
                name="visibleToTenant"
                defaultChecked
                label="Visible to tenant (they will be notified)"
              />
              <SubmitButton pendingText="Posting…">Post comment</SubmitButton>
            </form>
          </CardSection>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="space-y-6">
          <CardSection title="Status workflow">
            <div className="space-y-3">
              {workOrder.status === 'SUBMITTED' && (
                <form action={acknowledge}>
                  <SubmitButton className="w-full" pendingText="Saving…">
                    Acknowledge request
                  </SubmitButton>
                </form>
              )}

              {(workOrder.status === 'ACKNOWLEDGED' || workOrder.status === 'SCHEDULED') && (
                <form action={schedule} className="space-y-2">
                  <FormField
                    label={workOrder.status === 'SCHEDULED' ? 'Reschedule repair for' : 'Schedule repair for'}
                    htmlFor="scheduledFor"
                    required
                  >
                    <Input
                      id="scheduledFor"
                      name="scheduledFor"
                      type="datetime-local"
                      required
                      defaultValue={toDateTimeLocalValue(workOrder.scheduledFor)}
                    />
                  </FormField>
                  <SubmitButton className="w-full" pendingText="Saving…">
                    {workOrder.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
                  </SubmitButton>
                </form>
              )}

              {workOrder.status === 'SCHEDULED' && (
                <form action={start}>
                  <SubmitButton className="w-full" variant="secondary" pendingText="Saving…">
                    Start work
                  </SubmitButton>
                </form>
              )}

              {workOrder.status === 'IN_PROGRESS' && (
                <form action={complete}>
                  <SubmitButton className="w-full" pendingText="Saving…">
                    Mark completed
                  </SubmitButton>
                </form>
              )}

              {workOrder.status === 'COMPLETED' && (
                <form action={close}>
                  <SubmitButton className="w-full" pendingText="Saving…">
                    Close ticket
                  </SubmitButton>
                </form>
              )}

              {open && (
                <form action={cancel}>
                  <SubmitButton className="w-full" variant="danger" pendingText="Saving…">
                    Cancel ticket
                  </SubmitButton>
                </form>
              )}

              {!open && (
                <p className="text-sm text-gray-500">
                  This ticket is {STATUS_LABELS[workOrder.status].toLowerCase()} — no further
                  transitions.
                </p>
              )}
            </div>
            {workOrder.scheduledFor && (
              <p className="mt-3 text-sm text-gray-600">
                Scheduled for:{' '}
                <span className="font-semibold text-gray-900">
                  {fmtDateTime(workOrder.scheduledFor)}
                </span>
              </p>
            )}
          </CardSection>

          <CardSection title="Manage ticket">
            <form action={saveTicket} className="space-y-4">
              <FormField
                label="Priority (base)"
                htmlFor="priority"
                hint={
                  escalated
                    ? `Displaying as ${PRIORITY_STYLES[effective].label} due to age-based escalation.`
                    : undefined
                }
              >
                <Select id="priority" name="priority" defaultValue={workOrder.priority}>
                  {ALL_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_STYLES[p].label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Category" htmlFor="edit-category">
                <Select id="edit-category" name="category" defaultValue={workOrder.category}>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField
                label="Assigned vendor"
                htmlFor="vendorId"
                hint={
                  <Link href="/admin/vendors" className="text-brand-700 underline">
                    Manage vendors
                  </Link>
                }
              >
                <Select id="vendorId" name="vendorId" defaultValue={workOrder.vendorId ?? ''}>
                  <option value="">— Unassigned —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.specialty ? ` (${v.specialty})` : ''}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Cost ($)" htmlFor="cost" hint="Leave blank if not yet known.">
                <Input
                  id="cost"
                  name="cost"
                  inputMode="decimal"
                  placeholder="0.00"
                  defaultValue={centsToDollarString(workOrder.costCents)}
                />
              </FormField>

              <SubmitButton className="w-full" variant="secondary" pendingText="Saving…">
                Save changes
              </SubmitButton>
            </form>
          </CardSection>

          <CardSection title="Timeline">
            <ol className="space-y-2 text-sm">
              {timeline.map((step) => (
                <li key={step.label} className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${step.at ? 'bg-brand-600' : 'bg-gray-300'}`}
                  />
                  <span className={step.at ? 'font-medium text-gray-900' : 'text-gray-400'}>
                    {step.label}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">
                    {step.at ? fmtDateTime(step.at) : '—'}
                  </span>
                </li>
              ))}
            </ol>
          </CardSection>
        </div>
      </div>
    </div>
  );
}
