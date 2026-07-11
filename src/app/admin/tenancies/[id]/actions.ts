'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { laDateToUtc } from '@/lib/dates';

function backToTenancy(tenancyId: string, params: { error?: string; notice?: string }): never {
  const qs = new URLSearchParams();
  if (params.error) qs.set('error', params.error);
  if (params.notice) qs.set('notice', params.notice);
  redirect(`/admin/tenancies/${tenancyId}?${qs.toString()}`);
}

/** Landlord sets or resets a tenant's resident-portal password. */
export async function setTenantPortalPasswordAction(formData: FormData): Promise<void> {
  const landlord = await requireLandlord();
  const tenancyId = String(formData.get('tenancyId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  const password = String(formData.get('password') ?? '');

  if (password.length < 8) {
    backToTenancy(tenancyId, { error: 'Portal passwords must be at least 8 characters.' });
  }

  const membership = await prisma.tenancyTenant.findUnique({
    where: { tenancyId_userId: { tenancyId, userId } },
    include: { user: true },
  });
  if (!membership) {
    backToTenancy(tenancyId, { error: 'That user is not a tenant on this tenancy.' });
  }

  const passwordHash = await hash(password, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, isActive: true } });
  await audit({
    actorId: landlord.id,
    action: 'user.portal_password_set',
    entityType: 'User',
    entityId: userId,
    meta: { tenancyId },
  });

  revalidatePath(`/admin/tenancies/${tenancyId}`);
  backToTenancy(tenancyId, {
    notice: `Portal password set for ${membership.user.name}. They can sign in at /login with ${membership.user.email}.`,
  });
}

/** Mark the tenancy ENDED with an end date. */
export async function endTenancyAction(formData: FormData): Promise<void> {
  const landlord = await requireLandlord();
  const tenancyId = String(formData.get('tenancyId') ?? '');
  const endDateRaw = String(formData.get('endDate') ?? '').trim();

  const tenancy = await prisma.tenancy.findUnique({ where: { id: tenancyId } });
  if (!tenancy) backToTenancy(tenancyId, { error: 'Tenancy not found.' });
  if (tenancy.status === 'ENDED') {
    backToTenancy(tenancyId, { error: 'This tenancy is already ended.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDateRaw)) {
    backToTenancy(tenancyId, { error: 'Choose the move-out (end) date.' });
  }

  const endDate = laDateToUtc(endDateRaw);
  await prisma.tenancy.update({
    where: { id: tenancyId },
    data: { status: 'ENDED', endDate },
  });
  await audit({
    actorId: landlord.id,
    action: 'tenancy.ended',
    entityType: 'Tenancy',
    entityId: tenancyId,
    meta: { endDate: endDateRaw, previousStatus: tenancy.status },
  });

  revalidatePath(`/admin/tenancies/${tenancyId}`);
  revalidatePath('/admin/tenancies');
  backToTenancy(tenancyId, {
    notice:
      'Tenancy ended. Next: complete the move-out inspection, then start the deposit disposition — California requires the itemized statement and any refund within 21 days of move-out.',
  });
}
