import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { WorkOrderCategory, WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import type { BadgeTone } from '@/components/ui';
import { APP_TZ } from '@/lib/dates';

// ── Categories ───────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<WorkOrderCategory, string> = {
  NO_HEAT: 'No heat',
  NO_WATER: 'No running water',
  SEWAGE: 'Sewage backup',
  NO_ELECTRICITY: 'No electricity',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  HVAC: 'Heating / air conditioning (HVAC)',
  APPLIANCE: 'Appliance',
  PEST: 'Pest control',
  OTHER: 'Other',
};

/** Habitability emergencies, grouped separately in the tenant category select. */
export const EMERGENCY_CATEGORY_OPTIONS: WorkOrderCategory[] = [
  'NO_HEAT',
  'NO_WATER',
  'SEWAGE',
  'NO_ELECTRICITY',
];

export const STANDARD_CATEGORY_OPTIONS: WorkOrderCategory[] = [
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'APPLIANCE',
  'PEST',
  'OTHER',
];

export const ALL_CATEGORIES: WorkOrderCategory[] = [
  ...EMERGENCY_CATEGORY_OPTIONS,
  ...STANDARD_CATEGORY_OPTIONS,
];

export function parseCategory(value: string): WorkOrderCategory | null {
  return ALL_CATEGORIES.find((c) => c === value) ?? null;
}

// ── Priorities ───────────────────────────────────────────────────────────────

export const ALL_PRIORITIES: WorkOrderPriority[] = ['EMERGENCY', 'URGENT', 'ROUTINE', 'LOW'];

export function parsePriority(value: string): WorkOrderPriority | null {
  return ALL_PRIORITIES.find((p) => p === value) ?? null;
}

/** Lower = more severe. Used to sort the admin board. */
export const PRIORITY_RANK: Record<WorkOrderPriority, number> = {
  EMERGENCY: 0,
  URGENT: 1,
  ROUTINE: 2,
  LOW: 3,
};

/** Left-border color classes keyed by (effective) priority, for board cards. */
export const PRIORITY_BORDER: Record<WorkOrderPriority, string> = {
  EMERGENCY: 'border-l-red-600',
  URGENT: 'border-l-orange-500',
  ROUTINE: 'border-l-yellow-500',
  LOW: 'border-l-green-600',
};

// ── Statuses ─────────────────────────────────────────────────────────────────

export const ALL_STATUSES: WorkOrderStatus[] = [
  'SUBMITTED',
  'ACKNOWLEDGED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
];

export const STATUS_TONES: Record<WorkOrderStatus, BadgeTone> = {
  SUBMITTED: 'blue',
  ACKNOWLEDGED: 'purple',
  SCHEDULED: 'yellow',
  IN_PROGRESS: 'orange',
  COMPLETED: 'green',
  CLOSED: 'gray',
  CANCELLED: 'gray',
};

export function parseStatus(value: string): WorkOrderStatus | null {
  return ALL_STATUSES.find((s) => s === value) ?? null;
}

/**
 * Legal status transitions. The main workflow is a straight chain
 * SUBMITTED → ACKNOWLEDGED → SCHEDULED → IN_PROGRESS → COMPLETED → CLOSED;
 * CANCELLED is reachable from any open state, and a SCHEDULED ticket may be
 * re-scheduled (SCHEDULED → SCHEDULED with a new date).
 */
export const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  SUBMITTED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'SCHEDULED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

/** Which timestamp column each transition stamps. */
export const TRANSITION_TIMESTAMP: Partial<
  Record<WorkOrderStatus, 'acknowledgedAt' | 'scheduledAt' | 'startedAt' | 'completedAt' | 'closedAt'>
> = {
  ACKNOWLEDGED: 'acknowledgedAt',
  SCHEDULED: 'scheduledAt',
  IN_PROGRESS: 'startedAt',
  COMPLETED: 'completedAt',
  CLOSED: 'closedAt',
  CANCELLED: 'closedAt',
};

// ── Display helpers ──────────────────────────────────────────────────────────

/** "#WO-42" — human-friendly ticket number. */
export function woNumber(number: number): string {
  return `#WO-${number}`;
}

export function shortUnitLabel(unit: { unitNumber: string; property: { name: string } }): string {
  return `${unit.property.name} #${unit.unitNumber}`;
}

export function tenantNames(tenants: { user: { name: string } }[]): string {
  return tenants.map((t) => t.user.name).join(', ');
}

/** Public base URL used in email / SMS links. */
export function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

// ── Date/time helpers for the schedule form ──────────────────────────────────

/** Interpret a datetime-local form value ("yyyy-MM-ddTHH:mm") as LA time → UTC. */
export function laDateTimeLocalToUtc(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = fromZonedTime(`${value}:00`, APP_TZ);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format a stored UTC date as a datetime-local input value (LA time). */
export function toDateTimeLocalValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  return formatInTimeZone(new Date(date), APP_TZ, "yyyy-MM-dd'T'HH:mm");
}
