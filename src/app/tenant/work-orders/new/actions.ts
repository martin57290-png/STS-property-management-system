'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notifyLandlord, notifyUser } from '@/lib/notifications';
import { saveUpload, UploadValidationError } from '@/lib/uploads';
import { isHabitabilityCategory, PRIORITY_STYLES } from '@/lib/escalation';
import {
  appBaseUrl,
  CATEGORY_LABELS,
  parseCategory,
  shortUnitLabel,
  woNumber,
} from '@/lib/modules/work-orders/helpers';

function failUrl(message: string): string {
  return `/tenant/work-orders/new?error=${encodeURIComponent(message)}`;
}

export async function submitWorkOrder(formData: FormData): Promise<void> {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);
  if (!tenancy) {
    redirect(failUrl('No tenancy is set up for your account yet — please contact the office.'));
  }

  const category = parseCategory(String(formData.get('category') ?? ''));
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const permissionToEnter = formData.get('permissionToEnter') === 'on';
  const preferredAccessTimes =
    String(formData.get('preferredAccessTimes') ?? '').trim() || null;

  if (!category) redirect(failUrl('Please choose a category for the problem.'));
  if (!title) redirect(failUrl('Please give the request a short title.'));
  if (!description) redirect(failUrl('Please describe the problem.'));

  const habitability = isHabitabilityCategory(category);
  const priority = habitability ? 'EMERGENCY' : 'ROUTINE';

  const workOrder = await prisma.workOrder.create({
    data: {
      unitId: tenancy.unitId,
      tenancyId: tenancy.id,
      createdById: user.id,
      category,
      priority,
      isHabitability: habitability,
      title: title.slice(0, 120),
      description,
      permissionToEnter,
      preferredAccessTimes,
    },
  });

  // Attach any photos/videos. The WorkOrder had to exist first so uploads can
  // be keyed under work-orders/<id>.
  const files = formData
    .getAll('media')
    .filter((f): f is File => f instanceof File && f.size > 0);
  let mediaSaved = 0;
  let uploadError: string | null = null;
  for (const file of files) {
    try {
      await saveUpload({
        file,
        kind: 'media',
        category: 'WORK_ORDER_MEDIA',
        keyPrefix: `work-orders/${workOrder.id}`,
        uploadedById: user.id,
        owner: { workOrderId: workOrder.id },
      });
      mediaSaved += 1;
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
    action: 'work_order.submitted',
    entityType: 'WorkOrder',
    entityId: workOrder.id,
    meta: {
      number: workOrder.number,
      category,
      priority,
      isHabitability: habitability,
      permissionToEnter,
      mediaCount: mediaSaved,
    },
  });

  const unitLabel = shortUnitLabel(tenancy.unit);
  const label = woNumber(workOrder.number);
  const priorityLabel = PRIORITY_STYLES[priority].label;

  await notifyLandlord({
    event: 'WORK_ORDER_STATUS_CHANGED',
    subject: `New ${priorityLabel.toLowerCase()} work order ${label} — ${unitLabel}${
      habitability ? ' (HABITABILITY)' : ''
    }`,
    body:
      `A new maintenance request was submitted.\n\n` +
      `Ticket: ${label} — ${title}\n` +
      `Unit: ${unitLabel}\n` +
      `Priority: ${priorityLabel}${habitability ? ' (habitability — CA repair-and-deduct exposure)' : ''}\n` +
      `Category: ${CATEGORY_LABELS[category]}\n` +
      `Submitted by: ${user.name}\n` +
      `Permission to enter: ${permissionToEnter ? 'Yes' : 'NO — coordinate access with the tenant'}\n` +
      (preferredAccessTimes ? `Preferred access times: ${preferredAccessTimes}\n` : '') +
      (mediaSaved > 0 ? `Attachments: ${mediaSaved}\n` : '') +
      `\n${description}\n\n` +
      `Review it here: ${appBaseUrl()}/admin/work-orders/${workOrder.id}`,
    smsBody: `STS: new ${priorityLabel} work order ${label} at ${unitLabel} — ${title}${
      habitability ? ' (HABITABILITY)' : ''
    }`,
  });

  await notifyUser({
    userId: user.id,
    event: 'WORK_ORDER_STATUS_CHANGED',
    subject: `We received your maintenance request ${label}`,
    body:
      `Hi ${user.name},\n\n` +
      `Your maintenance request ${label} — “${title}” — has been received` +
      `${habitability ? ' and flagged as an emergency' : ''}. ` +
      `We'll follow up as soon as it has been reviewed.\n\n` +
      `Track its status any time: ${appBaseUrl()}/tenant/work-orders/${workOrder.id}\n\n` +
      `— STS Property Management`,
    smsBody: `STS: got your maintenance request ${label} (“${title}”). We'll follow up soon.`,
  });

  revalidatePath('/tenant/work-orders');
  revalidatePath(`/tenant/work-orders/${workOrder.id}`);
  revalidatePath('/admin/work-orders');

  const notice = uploadError
    ? `Request ${label} submitted, but one attachment was rejected — ${uploadError}`
    : `Request ${label} submitted. We'll be in touch soon.`;
  redirect(`/tenant/work-orders/${workOrder.id}?notice=${encodeURIComponent(notice)}`);
}
