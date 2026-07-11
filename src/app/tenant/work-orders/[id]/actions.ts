'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireTenant } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notifyLandlord } from '@/lib/notifications';
import { appBaseUrl, shortUnitLabel, woNumber } from '@/lib/modules/work-orders/helpers';

export async function addTenantComment(workOrderId: string, formData: FormData): Promise<void> {
  const user = await requireTenant();

  // Ownership check: the ticket must belong to a tenancy this user is on.
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenancy: { tenants: { some: { userId: user.id } } } },
    include: { unit: { include: { property: true } } },
  });
  if (!workOrder) {
    redirect(`/tenant/work-orders?error=${encodeURIComponent('Maintenance request not found.')}`);
  }

  const body = String(formData.get('body') ?? '').trim();
  if (!body) {
    redirect(
      `/tenant/work-orders/${workOrderId}?error=${encodeURIComponent('Comment cannot be empty.')}`,
    );
  }

  const comment = await prisma.workOrderComment.create({
    data: {
      workOrderId,
      authorId: user.id,
      body,
      visibleToTenant: true,
    },
  });

  await audit({
    actorId: user.id,
    action: 'work_order.comment_added',
    entityType: 'WorkOrder',
    entityId: workOrderId,
    meta: { commentId: comment.id, number: workOrder.number, authorRole: 'TENANT' },
  });

  const label = woNumber(workOrder.number);
  await notifyLandlord({
    event: 'WORK_ORDER_STATUS_CHANGED',
    subject: `New tenant comment on work order ${label} — ${shortUnitLabel(workOrder.unit)}`,
    body:
      `${user.name} commented on ${label} (“${workOrder.title}”):\n\n` +
      `${body}\n\n` +
      `View the ticket: ${appBaseUrl()}/admin/work-orders/${workOrderId}`,
    smsBody: `STS: new tenant comment on work order ${label} — ${workOrder.title}`,
  });

  revalidatePath(`/tenant/work-orders/${workOrderId}`);
  revalidatePath(`/admin/work-orders/${workOrderId}`);
  redirect(`/tenant/work-orders/${workOrderId}?notice=${encodeURIComponent('Comment posted.')}`);
}
