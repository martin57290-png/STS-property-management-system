'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Prisma, WorkOrderStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notifyTenancyTenants } from '@/lib/notifications';
import { saveUpload, UploadValidationError } from '@/lib/uploads';
import { fmtDateTime } from '@/lib/dates';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { PRIORITY_STYLES, STATUS_LABELS } from '@/lib/escalation';
import {
  ALLOWED_TRANSITIONS,
  appBaseUrl,
  laDateTimeLocalToUtc,
  parseCategory,
  parsePriority,
  parseStatus,
  shortUnitLabel,
  TRANSITION_TIMESTAMP,
  woNumber,
} from '@/lib/modules/work-orders/helpers';

function detailPath(id: string): string {
  return `/admin/work-orders/${id}`;
}

function refresh(id: string): void {
  revalidatePath('/admin/work-orders');
  revalidatePath(detailPath(id));
  revalidatePath('/tenant/work-orders');
  revalidatePath(`/tenant/work-orders/${id}`);
}

function failUrl(id: string, message: string): string {
  return `${detailPath(id)}?error=${encodeURIComponent(message)}`;
}

function noticeUrl(id: string, message: string): string {
  return `${detailPath(id)}?notice=${encodeURIComponent(message)}`;
}

async function getWorkOrderOr404(id: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: { unit: { include: { property: true } } },
  });
  if (!workOrder) {
    redirect(`/admin/work-orders?error=${encodeURIComponent('Work order not found.')}`);
  }
  return workOrder;
}

/** Friendly tenant-facing copy for each status transition. */
function tenantStatusMessage(params: {
  target: WorkOrderStatus;
  label: string;
  title: string;
  unitLabel: string;
  scheduledFor: Date | null;
  workOrderId: string;
}): { subject: string; body: string; smsBody: string } {
  const { target, label, title, scheduledFor, workOrderId } = params;
  const link = `${appBaseUrl()}/tenant/work-orders/${workOrderId}`;
  const footer = `\n\nView the request: ${link}\n\n— STS Property Management`;

  switch (target) {
    case 'ACKNOWLEDGED':
      return {
        subject: `Maintenance request ${label} received — we're on it`,
        body:
          `We've reviewed your maintenance request ${label} (“${title}”) and are arranging the repair. ` +
          `We'll let you know as soon as it's scheduled.` +
          footer,
        smsBody: `STS: request ${label} (“${title}”) acknowledged — we're arranging the repair.`,
      };
    case 'SCHEDULED':
      return {
        subject: `Repair scheduled — ${label} on ${fmtDateTime(scheduledFor)}`,
        body:
          `Your repair for ${label} (“${title}”) is scheduled for ${fmtDateTime(scheduledFor)}. ` +
          `If that time doesn't work, please comment on the request or contact the office as soon as possible.` +
          footer,
        smsBody: `STS: repair for ${label} scheduled for ${fmtDateTime(scheduledFor)}.`,
      };
    case 'IN_PROGRESS':
      return {
        subject: `Work has started on ${label}`,
        body: `Work is now underway on your maintenance request ${label} (“${title}”).` + footer,
        smsBody: `STS: work has started on request ${label} (“${title}”).`,
      };
    case 'COMPLETED':
      return {
        subject: `Maintenance request ${label} completed`,
        body:
          `The work on your maintenance request ${label} (“${title}”) has been completed. ` +
          `If anything still isn't right, please add a comment on the request and we'll take another look.` +
          footer,
        smsBody: `STS: request ${label} (“${title}”) is completed. Comment on it if anything isn't right.`,
      };
    case 'CLOSED':
      return {
        subject: `Maintenance request ${label} closed`,
        body: `Your maintenance request ${label} (“${title}”) is now closed. Thanks for letting us know about the issue.` + footer,
        smsBody: `STS: request ${label} (“${title}”) is now closed.`,
      };
    case 'CANCELLED':
      return {
        subject: `Maintenance request ${label} cancelled`,
        body:
          `Your maintenance request ${label} (“${title}”) has been cancelled. ` +
          `If this is unexpected, please contact the office or submit a new request.` +
          footer,
        smsBody: `STS: request ${label} (“${title}”) was cancelled. Contact us if unexpected.`,
      };
    default:
      return {
        subject: `Update on maintenance request ${label}`,
        body: `The status of your maintenance request ${label} (“${title}”) changed to ${STATUS_LABELS[target]}.` + footer,
        smsBody: `STS: request ${label} status is now ${STATUS_LABELS[target]}.`,
      };
  }
}

/**
 * Move a ticket through the workflow. The SCHEDULED transition additionally
 * requires a scheduledFor datetime in the form data.
 */
export async function transitionStatus(
  id: string,
  targetRaw: string,
  formData: FormData,
): Promise<void> {
  const user = await requireLandlord();
  const workOrder = await getWorkOrderOr404(id);

  const target = parseStatus(targetRaw);
  if (!target) redirect(failUrl(id, 'Unknown status.'));
  if (!ALLOWED_TRANSITIONS[workOrder.status].includes(target)) {
    redirect(
      failUrl(
        id,
        `Cannot move a ${STATUS_LABELS[workOrder.status].toLowerCase()} ticket to ${STATUS_LABELS[target].toLowerCase()}.`,
      ),
    );
  }

  const now = new Date();
  const data: Prisma.WorkOrderUpdateInput = { status: target };

  let scheduledFor: Date | null = workOrder.scheduledFor;
  if (target === 'SCHEDULED') {
    scheduledFor = laDateTimeLocalToUtc(String(formData.get('scheduledFor') ?? ''));
    if (!scheduledFor) {
      redirect(failUrl(id, 'Pick a date and time to schedule the repair.'));
    }
    data.scheduledFor = scheduledFor;
  }

  const stampField = TRANSITION_TIMESTAMP[target];
  if (stampField) data[stampField] = now;

  await prisma.workOrder.update({ where: { id }, data });

  await audit({
    actorId: user.id,
    action: 'work_order.status_changed',
    entityType: 'WorkOrder',
    entityId: id,
    meta: {
      number: workOrder.number,
      from: workOrder.status,
      to: target,
      ...(target === 'SCHEDULED' && scheduledFor
        ? { scheduledFor: scheduledFor.toISOString() }
        : {}),
    },
  });

  if (workOrder.tenancyId) {
    const message = tenantStatusMessage({
      target,
      label: woNumber(workOrder.number),
      title: workOrder.title,
      unitLabel: shortUnitLabel(workOrder.unit),
      scheduledFor,
      workOrderId: id,
    });
    await notifyTenancyTenants(workOrder.tenancyId, {
      event: 'WORK_ORDER_STATUS_CHANGED',
      ...message,
    });
  }

  refresh(id);
  const wasReschedule = target === 'SCHEDULED' && workOrder.status === 'SCHEDULED';
  redirect(
    noticeUrl(
      id,
      target === 'SCHEDULED'
        ? `${wasReschedule ? 'Rescheduled' : 'Scheduled'} for ${fmtDateTime(scheduledFor)} — the tenant has been notified.`
        : `Status changed to ${STATUS_LABELS[target]}${workOrder.tenancyId ? ' — the tenant has been notified' : ''}.`,
    ),
  );
}

/** Save priority override, category, vendor assignment, and cost in one go. */
export async function updateTicket(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const workOrder = await getWorkOrderOr404(id);

  const priority = parsePriority(String(formData.get('priority') ?? ''));
  const category = parseCategory(String(formData.get('category') ?? ''));
  if (!priority) redirect(failUrl(id, 'Pick a valid priority.'));
  if (!category) redirect(failUrl(id, 'Pick a valid category.'));

  const vendorIdRaw = String(formData.get('vendorId') ?? '');
  const vendorId = vendorIdRaw === '' ? null : vendorIdRaw;
  if (vendorId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) redirect(failUrl(id, 'That vendor no longer exists.'));
  }

  const costRaw = String(formData.get('cost') ?? '').trim();
  const costCents = costRaw === '' ? null : parseDollarsToCents(costRaw);
  if (costRaw !== '' && costCents == null) {
    redirect(failUrl(id, 'Enter the cost as a dollar amount, e.g. 250 or 249.99.'));
  }

  await prisma.workOrder.update({
    where: { id },
    data: { priority, category, vendorId, costCents },
  });

  if (priority !== workOrder.priority) {
    await audit({
      actorId: user.id,
      action: 'work_order.priority_overridden',
      entityType: 'WorkOrder',
      entityId: id,
      meta: { number: workOrder.number, from: workOrder.priority, to: priority },
    });
  }
  if (vendorId !== workOrder.vendorId) {
    await audit({
      actorId: user.id,
      action: 'work_order.vendor_assigned',
      entityType: 'WorkOrder',
      entityId: id,
      meta: { number: workOrder.number, from: workOrder.vendorId, to: vendorId },
    });
  }
  await audit({
    actorId: user.id,
    action: 'work_order.updated',
    entityType: 'WorkOrder',
    entityId: id,
    meta: {
      number: workOrder.number,
      priority,
      category,
      vendorId,
      costCents,
      ...(costCents != null ? { cost: formatCents(costCents) } : {}),
    },
  });

  refresh(id);
  redirect(noticeUrl(id, 'Ticket updated.'));
}

/** Upload landlord/vendor completion photos. */
export async function addCompletionPhotos(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const workOrder = await getWorkOrderOr404(id);

  const files = formData
    .getAll('photos')
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(failUrl(id, 'Choose at least one photo to upload.'));

  let saved = 0;
  let uploadError: string | null = null;
  for (const file of files) {
    try {
      await saveUpload({
        file,
        kind: 'image',
        category: 'COMPLETION_PHOTO',
        keyPrefix: `work-orders/${id}`,
        uploadedById: user.id,
        owner: { workOrderId: id },
      });
      saved += 1;
    } catch (err) {
      if (err instanceof UploadValidationError) {
        uploadError = `${file.name || 'A file'}: ${err.message}`;
      } else {
        throw err;
      }
    }
  }

  await audit({
    actorId: user.id,
    action: 'work_order.completion_photos_added',
    entityType: 'WorkOrder',
    entityId: id,
    meta: { number: workOrder.number, count: saved },
  });

  refresh(id);
  if (uploadError) {
    redirect(
      failUrl(id, `Uploaded ${saved} photo(s), but one was rejected — ${uploadError}`),
    );
  }
  redirect(noticeUrl(id, `Added ${saved} completion photo${saved === 1 ? '' : 's'}.`));
}

/** Add a comment; when visible to the tenant, notify the tenancy. */
export async function addAdminComment(id: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const workOrder = await getWorkOrderOr404(id);

  const body = String(formData.get('body') ?? '').trim();
  if (!body) redirect(failUrl(id, 'Comment cannot be empty.'));
  const visibleToTenant = formData.get('visibleToTenant') === 'on';

  const comment = await prisma.workOrderComment.create({
    data: { workOrderId: id, authorId: user.id, body, visibleToTenant },
  });

  await audit({
    actorId: user.id,
    action: 'work_order.comment_added',
    entityType: 'WorkOrder',
    entityId: id,
    meta: {
      commentId: comment.id,
      number: workOrder.number,
      visibleToTenant,
      authorRole: 'LANDLORD',
    },
  });

  if (visibleToTenant && workOrder.tenancyId) {
    const label = woNumber(workOrder.number);
    await notifyTenancyTenants(workOrder.tenancyId, {
      event: 'WORK_ORDER_STATUS_CHANGED',
      subject: `New comment on work order ${label}`,
      body:
        `Management commented on your maintenance request ${label} (“${workOrder.title}”):\n\n` +
        `${body}\n\n` +
        `Reply here: ${appBaseUrl()}/tenant/work-orders/${id}\n\n— STS Property Management`,
      smsBody: `STS: new comment on your maintenance request ${label}. Check the resident portal.`,
    });
  }

  refresh(id);
  redirect(
    noticeUrl(
      id,
      visibleToTenant ? 'Comment posted — the tenant has been notified.' : 'Internal note posted.',
    ),
  );
}
