import { prisma } from '@/lib/db';
import type { NotificationEvent } from '@prisma/client';
import { getEmailProvider, getSmsProvider } from './providers';

export type EventPrefs = { email: boolean; sms: boolean };
export type PrefsMap = Partial<Record<NotificationEvent, EventPrefs>>;

/** Default: everything on for email, transactional events on for SMS. */
export const DEFAULT_EVENT_PREFS: Record<NotificationEvent, EventPrefs> = {
  APPLICATION_RECEIVED: { email: true, sms: true },
  APPLICATION_STATUS_CHANGED: { email: true, sms: true },
  RENT_DUE_REMINDER: { email: true, sms: true },
  PAYMENT_RECEIVED: { email: true, sms: false },
  PAYMENT_FAILED: { email: true, sms: true },
  WORK_ORDER_STATUS_CHANGED: { email: true, sms: true },
  LEASE_EXPIRATION: { email: true, sms: false },
  INSPECTION_SCHEDULED: { email: true, sms: true },
  GENERAL: { email: true, sms: false },
};

async function getUserPrefs(userId: string): Promise<Record<NotificationEvent, EventPrefs>> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  const stored = (row?.prefs ?? {}) as PrefsMap;
  return { ...DEFAULT_EVENT_PREFS, ...stored };
}

/**
 * Send a notification to a known user over email and/or SMS, respecting the
 * user's notification preferences. Every attempt (including preference-
 * suppressed ones) is recorded in the Notification table. Never throws.
 */
export async function notifyUser(params: {
  userId: string;
  event: NotificationEvent;
  subject: string;
  body: string;
  smsBody?: string; // shorter variant for SMS; falls back to body
}): Promise<void> {
  const { userId, event, subject, body } = params;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const prefs = (await getUserPrefs(userId))[event];

    if (user.email) {
      await deliver({
        userId,
        event,
        channel: 'EMAIL',
        to: user.email,
        subject,
        body,
        enabled: prefs.email,
      });
    }
    if (user.phone) {
      await deliver({
        userId,
        event,
        channel: 'SMS',
        to: user.phone,
        body: params.smsBody ?? body,
        enabled: prefs.sms,
      });
    }
  } catch (err) {
    console.error('[notify] notifyUser failed', event, err);
  }
}

/**
 * Send to a raw email/phone with no user account (e.g. applicants before
 * they register). Never throws.
 */
export async function notifyContact(params: {
  email?: string | null;
  phone?: string | null;
  event: NotificationEvent;
  subject: string;
  body: string;
  smsBody?: string;
}): Promise<void> {
  try {
    if (params.email) {
      await deliver({
        event: params.event,
        channel: 'EMAIL',
        to: params.email,
        subject: params.subject,
        body: params.body,
        enabled: true,
      });
    }
    if (params.phone) {
      await deliver({
        event: params.event,
        channel: 'SMS',
        to: params.phone,
        body: params.smsBody ?? params.body,
        enabled: true,
      });
    }
  } catch (err) {
    console.error('[notify] notifyContact failed', params.event, err);
  }
}

async function deliver(params: {
  userId?: string;
  event: NotificationEvent;
  channel: 'EMAIL' | 'SMS';
  to: string;
  subject?: string;
  body: string;
  enabled: boolean;
}): Promise<void> {
  const record = await prisma.notification.create({
    data: {
      userId: params.userId,
      event: params.event,
      channel: params.channel,
      status: params.enabled ? 'QUEUED' : 'SKIPPED',
      to: params.to,
      subject: params.subject,
      body: params.body,
    },
  });
  if (!params.enabled) return;

  try {
    if (params.channel === 'EMAIL') {
      await getEmailProvider().send(params.to, params.subject ?? 'STS Property Management', params.body);
    } else {
      await getSmsProvider().send(params.to, params.body);
    }
    await prisma.notification.update({
      where: { id: record.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch (err) {
    await prisma.notification.update({
      where: { id: record.id },
      data: { status: 'FAILED', error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/** Notify every tenant on a tenancy. */
export async function notifyTenancyTenants(
  tenancyId: string,
  message: { event: NotificationEvent; subject: string; body: string; smsBody?: string },
): Promise<void> {
  const links = await prisma.tenancyTenant.findMany({ where: { tenancyId } });
  for (const link of links) {
    await notifyUser({ userId: link.userId, ...message });
  }
}

/** Notify the landlord/admin account(s). */
export async function notifyLandlord(message: {
  event: NotificationEvent;
  subject: string;
  body: string;
  smsBody?: string;
}): Promise<void> {
  const landlords = await prisma.user.findMany({ where: { role: 'LANDLORD', isActive: true } });
  for (const landlord of landlords) {
    await notifyUser({ userId: landlord.id, ...message });
  }
}
