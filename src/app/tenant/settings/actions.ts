'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireTenant } from '@/lib/auth';
import { audit } from '@/lib/audit';
import type { PrefsMap } from '@/lib/notifications';
import { TENANT_NOTIFICATION_EVENTS } from '@/lib/modules/dashboard/helpers';

function backToSettings(params: { error?: string; notice?: string }): never {
  const qs = new URLSearchParams();
  if (params.error) qs.set('error', params.error);
  if (params.notice) qs.set('notice', params.notice);
  redirect(`/tenant/settings?${qs.toString()}`);
}

export async function updateNotificationPrefsAction(formData: FormData): Promise<void> {
  const user = await requireTenant();

  // Phone number (SMS depends on it).
  const phone = String(formData.get('phone') ?? '').trim();
  if (phone && !/^[+()\-.\s\d]{7,20}$/.test(phone)) {
    backToSettings({ error: 'Enter a valid phone number (or leave it blank to disable SMS).' });
  }
  await prisma.user.update({ where: { id: user.id }, data: { phone: phone || null } });

  // Full prefs map for every tenant-relevant event.
  const prefs: PrefsMap = {};
  for (const { event } of TENANT_NOTIFICATION_EVENTS) {
    prefs[event] = {
      email: formData.get(`pref_${event}_email`) === 'on',
      sms: formData.get(`pref_${event}_sms`) === 'on',
    };
  }

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, prefs: prefs as Prisma.InputJsonValue },
    update: { prefs: prefs as Prisma.InputJsonValue },
  });

  await audit({
    actorId: user.id,
    action: 'notification_prefs.updated',
    entityType: 'NotificationPreference',
    entityId: user.id,
    meta: { prefs: prefs as Prisma.InputJsonValue, phoneSet: Boolean(phone) },
  });

  revalidatePath('/tenant/settings');
  backToSettings({ notice: 'Notification preferences saved.' });
}
