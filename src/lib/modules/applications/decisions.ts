import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notifyContact } from '@/lib/notifications';
import { fmt } from '@/lib/dates';
import { applicantName, shortUnitLabel, trackingUrl } from './helpers';

export type DecisionStatus = 'UNDER_REVIEW' | 'APPROVED' | 'DENIED' | 'WAITLISTED';

const AUDIT_ACTIONS: Record<DecisionStatus, string> = {
  UNDER_REVIEW: 'application.under_review',
  APPROVED: 'application.approved',
  DENIED: 'application.denied',
  WAITLISTED: 'application.waitlisted',
};

/**
 * Change an application's status, record the decision, audit it, and notify
 * the applicant by email + SMS with a tracking link. Shared by the admin
 * detail page and the compare page quick actions.
 */
export async function applyDecision(params: {
  applicationId: string;
  status: DecisionStatus;
  note?: string | null;
  actorId: string;
}): Promise<void> {
  const { applicationId, status, actorId } = params;
  const note = params.note?.trim() || null;

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { unit: { include: { property: true } } },
  });
  if (!app) throw new Error('Application not found.');

  const isDecision = status !== 'UNDER_REVIEW';
  await prisma.application.update({
    where: { id: app.id },
    data: {
      status,
      decisionAt: isDecision ? new Date() : null,
      decisionNote: isDecision ? note : (note ?? app.decisionNote),
    },
  });

  await audit({
    actorId,
    action: AUDIT_ACTIONS[status],
    entityType: 'Application',
    entityId: app.id,
    meta: { previousStatus: app.status, note: note ?? undefined },
  });

  const unit = shortUnitLabel(app.unit);
  const name = applicantName(app);
  const link = trackingUrl(app.trackingToken);
  const submitted = app.submittedAt ? ` submitted ${fmt(app.submittedAt)}` : '';

  const wording: Record<DecisionStatus, { subject: string; body: string; sms: string }> = {
    UNDER_REVIEW: {
      subject: `Your application for ${unit} is under review`,
      body:
        `Hi ${name},\n\nYour rental application for ${unit}${submitted} is now under review. ` +
        `We may reach out to you, your employer, or your references while we verify your information.\n\n` +
        `Track your application any time: ${link}\n\n— STS Property Management`,
      sms: `STS: your application for ${unit} is now under review. Track it: ${link}`,
    },
    APPROVED: {
      subject: `Congratulations — your application for ${unit} is approved!`,
      body:
        `Hi ${name},\n\nGreat news: your rental application for ${unit} has been approved!` +
        (note ? `\n\nNote from the landlord: ${note}` : '') +
        `\n\nWe will contact you shortly with your lease and move-in details.\n\n` +
        `Track your application: ${link}\n\n— STS Property Management`,
      sms: `STS: your application for ${unit} was APPROVED! We'll follow up with lease details. ${link}`,
    },
    DENIED: {
      subject: `Update on your application for ${unit}`,
      body:
        `Hi ${name},\n\nThank you for applying for ${unit}. After careful review, we are unable to ` +
        `approve your application at this time.` +
        (note ? `\n\nNote: ${note}` : '') +
        `\n\nIf your decision was based in whole or in part on information in a consumer report, you ` +
        `have the right to obtain a free copy of that report and to dispute its accuracy.\n\n` +
        `Details: ${link}\n\n— STS Property Management`,
      sms: `STS: an update is available on your application for ${unit}: ${link}`,
    },
    WAITLISTED: {
      subject: `You are on the waitlist for ${unit}`,
      body:
        `Hi ${name},\n\nThank you for applying for ${unit}. The unit is not available to offer you right ` +
        `now, so we have placed your application on the waitlist. We will contact you if it opens up.` +
        (note ? `\n\nNote: ${note}` : '') +
        `\n\nTrack your application: ${link}\n\n— STS Property Management`,
      sms: `STS: your application for ${unit} is on the waitlist. Track it: ${link}`,
    },
  };

  const message = wording[status];
  await notifyContact({
    email: app.email,
    phone: app.phone,
    event: 'APPLICATION_STATUS_CHANGED',
    subject: message.subject,
    body: message.body,
    smsBody: message.sms,
  });
}
