import type { ApplicationStatus } from '@prisma/client';
import type { BadgeTone } from '@/components/ui';

/** Admin-facing status labels. */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  DENIED: 'Denied',
  WAITLISTED: 'Waitlisted',
};

export const STATUS_TONES: Record<ApplicationStatus, BadgeTone> = {
  DRAFT: 'gray',
  SUBMITTED: 'blue',
  UNDER_REVIEW: 'yellow',
  APPROVED: 'green',
  DENIED: 'red',
  WAITLISTED: 'purple',
};

/** Applicant-facing plain-language status blurbs (status page). */
export const APPLICANT_STATUS_MESSAGES: Record<ApplicationStatus, string> = {
  DRAFT: 'Your application has not been submitted yet. Use your application link to finish it.',
  SUBMITTED: 'We received your application. We will review it and follow up soon.',
  UNDER_REVIEW: 'Your application is being reviewed. We may contact you or your references.',
  APPROVED: 'Congratulations — your application was approved! We will contact you about next steps.',
  DENIED: 'We were unable to approve your application at this time.',
  WAITLISTED: 'You are on our waitlist. We will contact you if the unit becomes available.',
};

export function applicantName(app: { firstName: string; lastName: string }): string {
  return `${app.firstName} ${app.lastName}`.trim();
}

export function unitLabel(unit: {
  unitNumber: string;
  property: { name: string; street: string; city: string };
}): string {
  return `${unit.property.name} — Unit ${unit.unitNumber} (${unit.property.street}, ${unit.property.city})`;
}

export function shortUnitLabel(unit: { unitNumber: string; property: { name: string } }): string {
  return `${unit.property.name} #${unit.unitNumber}`;
}

/** Public base URL used in emails / SMS links. */
export function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

/** Absolute status-tracking link for an application. */
export function trackingUrl(trackingToken: string): string {
  return `${appBaseUrl()}/application-status?token=${trackingToken}`;
}

/** Applicant + all co-applicants/occupants. */
export function householdSize(app: { coApplicants: unknown[] }): number {
  return 1 + app.coApplicants.length;
}

/** Income-to-rent ratio as e.g. "3.2×" (— when unknown). */
export function incomeToRentRatio(
  monthlyIncomeCents: number | null | undefined,
  rentCents: number,
): string {
  if (!monthlyIncomeCents || rentCents <= 0) return '—';
  return `${(monthlyIncomeCents / rentCents).toFixed(1)}×`;
}

function monthsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.round(ms / (30.44 * 86_400_000));
}

/** Total months of residence history provided (open-ended stays count to today). */
export function residenceHistoryMonths(
  residences: { moveIn: Date | null; moveOut: Date | null }[],
): number {
  const now = new Date();
  return residences.reduce((sum, r) => {
    if (!r.moveIn) return sum;
    return sum + monthsBetween(r.moveIn, r.moveOut ?? now);
  }, 0);
}

/** "2 yr 3 mo" style label. */
export function monthsLabel(months: number): string {
  if (months <= 0) return '—';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;
}
