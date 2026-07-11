import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireTenant } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { fmtDateTime, openAge } from '@/lib/dates';
import {
  Badge,
  ButtonLink,
  CardSection,
  FormField,
  PageHeader,
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
  CATEGORY_LABELS,
  shortUnitLabel,
  STATUS_TONES,
  woNumber,
} from '@/lib/modules/work-orders/helpers';
import { Flash } from '@/lib/modules/work-orders/flash';
import { addTenantComment } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Maintenance request' };

export default async function TenantWorkOrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { notice?: string; error?: string };
}) {
  const user = await requireTenant();

  // Ownership check: the ticket must belong to a tenancy this user is on.
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: params.id, tenancy: { tenants: { some: { userId: user.id } } } },
    include: {
      unit: { include: { property: true } },
      vendor: true,
      documents: { orderBy: { createdAt: 'asc' } },
      comments: {
        where: { visibleToTenant: true },
        include: { author: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!workOrder) notFound();

  const settings = await getSettings();
  const effective = effectivePriority(workOrder, settings);
  const open = isOpenStatus(workOrder.status);

  const tenantMedia = workOrder.documents.filter((d) => d.category === 'WORK_ORDER_MEDIA');
  const completionPhotos = workOrder.documents.filter((d) => d.category === 'COMPLETION_PHOTO');

  const timeline: { label: string; at: Date | null }[] = [
    { label: 'Submitted', at: workOrder.createdAt },
    { label: 'Acknowledged', at: workOrder.acknowledgedAt },
    { label: 'Scheduled', at: workOrder.scheduledAt },
    { label: 'Work started', at: workOrder.startedAt },
    { label: 'Completed', at: workOrder.completedAt },
    { label: workOrder.status === 'CANCELLED' ? 'Cancelled' : 'Closed', at: workOrder.closedAt },
  ];

  const commentAction = addTenantComment.bind(null, workOrder.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={
          <>
            {woNumber(workOrder.number)} — {workOrder.title}
          </>
        }
        description={shortUnitLabel(workOrder.unit)}
        actions={
          <ButtonLink href="/tenant/work-orders" variant="ghost" size="sm">
            Back to requests
          </ButtonLink>
        }
      />

      <Flash notice={searchParams.notice} error={searchParams.error} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONES[workOrder.status]}>{STATUS_LABELS[workOrder.status]}</Badge>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[effective].badge}`}
        >
          {PRIORITY_STYLES[effective].label}
        </span>
        {open && <span className="text-xs text-gray-500">open {openAge(workOrder.createdAt)}</span>}
      </div>

      <div className="space-y-6">
        <CardSection title="Details">
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-gray-600">Category:</dt>
              <dd className="text-gray-900">{CATEGORY_LABELS[workOrder.category]}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-600">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-900">{workOrder.description}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-medium text-gray-600">Permission to enter:</dt>
              <dd className="text-gray-900">
                {workOrder.permissionToEnter
                  ? 'Yes — entry authorized, including when you are not home'
                  : 'No — we will coordinate access with you first'}
              </dd>
            </div>
            {workOrder.preferredAccessTimes && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-gray-600">Preferred access times:</dt>
                <dd className="text-gray-900">{workOrder.preferredAccessTimes}</dd>
              </div>
            )}
            {workOrder.scheduledFor && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-gray-600">Repair scheduled for:</dt>
                <dd className="font-semibold text-gray-900">{fmtDateTime(workOrder.scheduledFor)}</dd>
              </div>
            )}
            {workOrder.vendor && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-gray-600">Assigned to:</dt>
                <dd className="text-gray-900">
                  {workOrder.vendor.name}
                  {workOrder.vendor.company ? ` (${workOrder.vendor.company})` : ''}
                </dd>
              </div>
            )}
          </dl>
        </CardSection>

        <CardSection title="Status timeline">
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

        <CardSection title={`Photos & videos (${tenantMedia.length})`}>
          <MediaGrid docs={tenantMedia} />
        </CardSection>

        {completionPhotos.length > 0 && (
          <CardSection title={`Completion photos (${completionPhotos.length})`}>
            <MediaGrid docs={completionPhotos} />
          </CardSection>
        )}

        <CardSection title={`Comments (${workOrder.comments.length})`}>
          {workOrder.comments.length === 0 ? (
            <p className="text-sm text-gray-500">No comments yet.</p>
          ) : (
            <ul className="space-y-4">
              {workOrder.comments.map((comment) => (
                <li key={comment.id} className="rounded-md bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-800">{comment.author.name}</span>
                    {comment.author.role === 'LANDLORD' ? ' (management)' : ''} ·{' '}
                    {fmtDateTime(comment.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}

          <form action={commentAction} className="mt-4 space-y-3">
            <FormField label="Add a comment" htmlFor="body">
              <Textarea
                id="body"
                name="body"
                required
                rows={3}
                placeholder="Add an update or question for management…"
              />
            </FormField>
            <SubmitButton pendingText="Posting…">Post comment</SubmitButton>
          </form>
        </CardSection>
      </div>
    </div>
  );
}
