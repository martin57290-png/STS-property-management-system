'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireTenant, getTenantTenancy } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notifyLandlord } from '@/lib/notifications';
import { shortUnitLabel, TYPE_LABELS } from '@/lib/modules/inspections/helpers';
import { completeIfFullyAcknowledged } from '@/lib/modules/inspections/service';

/**
 * Tenant acknowledges the inspection report ("I have reviewed this inspection
 * report" + typed full name). Completes the inspection when the landlord has
 * also signed.
 */
export async function acknowledgeInspection(id: string, formData: FormData): Promise<void> {
  const user = await requireTenant();
  const tenancy = await getTenantTenancy(user.id);
  if (!tenancy) redirect('/tenant/inspections');

  // The inspection must belong to this tenant's tenancy.
  const inspection = await prisma.inspection.findFirst({
    where: { id, tenancyId: tenancy.id },
    include: { tenancy: { include: { unit: { include: { property: true } } } } },
  });
  if (!inspection) redirect('/tenant/inspections');

  const failUrl = (message: string) =>
    `/tenant/inspections/${id}?error=${encodeURIComponent(message)}`;

  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect(failUrl('Type your full name to sign the report.'));
  if (inspection.status !== 'PENDING_SIGNATURES') {
    redirect(failUrl('This report is not currently awaiting your signature.'));
  }
  if (inspection.tenantAckAt) {
    redirect(failUrl('You have already acknowledged this report.'));
  }

  await prisma.inspection.update({
    where: { id },
    data: { tenantAckAt: new Date(), tenantAckName: name },
  });
  await audit({
    actorId: user.id,
    action: 'inspection.tenant_acknowledged',
    entityType: 'Inspection',
    entityId: id,
    meta: { name, tenancyId: tenancy.id, type: inspection.type },
  });

  const completed = await completeIfFullyAcknowledged(id, user.id);

  const unitLabel = shortUnitLabel(inspection.tenancy.unit);
  await notifyLandlord({
    event: 'GENERAL',
    subject: `Tenant signed the ${TYPE_LABELS[inspection.type].toLowerCase()} inspection — ${unitLabel}`,
    body:
      `${name} acknowledged the ${TYPE_LABELS[inspection.type].toLowerCase()} inspection report ` +
      `for ${unitLabel}.` +
      (completed
        ? ' Both parties have now signed — the inspection is completed.'
        : ' Your acknowledgement is still needed to complete it.'),
    smsBody: `STS: tenant signed the ${TYPE_LABELS[inspection.type].toLowerCase()} inspection for ${unitLabel}.`,
  });

  revalidatePath('/tenant/inspections');
  revalidatePath(`/tenant/inspections/${id}`);
  revalidatePath('/admin/inspections');
  revalidatePath(`/admin/inspections/${id}`);
  redirect(
    `/tenant/inspections/${id}?notice=${encodeURIComponent(
      'Thank you — your acknowledgement has been recorded.',
    )}`,
  );
}
