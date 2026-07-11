/**
 * Pure helpers for the dashboard / properties / tenancies / documents /
 * reports / settings module. Client-safe: no prisma or server-only imports.
 */
import { formatInTimeZone } from 'date-fns-tz';
import type {
  DocumentCategory,
  LeaseStatus,
  NotificationEvent,
  NotificationStatus,
  TenancyStatus,
  WorkOrderCategory,
  WorkOrderStatus,
} from '@prisma/client';
import type { BadgeTone } from '@/components/ui';
import { APP_TZ, laDateToUtc } from '@/lib/dates';

// ─── Tenancy status ──────────────────────────────────────────────────────────

export const TENANCY_STATUS_LABELS: Record<TenancyStatus, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  ENDED: 'Ended',
};

export const TENANCY_STATUS_TONES: Record<TenancyStatus, BadgeTone> = {
  PENDING: 'yellow',
  ACTIVE: 'green',
  ENDED: 'gray',
};

// ─── Lease status ────────────────────────────────────────────────────────────

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  DRAFT: 'Draft',
  GENERATED: 'Generated',
  EXECUTED: 'Executed',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
};

export const LEASE_STATUS_TONES: Record<LeaseStatus, BadgeTone> = {
  DRAFT: 'gray',
  GENERATED: 'blue',
  EXECUTED: 'purple',
  ACTIVE: 'green',
  EXPIRED: 'gray',
  TERMINATED: 'red',
};

// ─── Documents ───────────────────────────────────────────────────────────────

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  GOVERNMENT_ID: 'Government ID',
  PAY_STUB: 'Pay stub',
  BANK_STATEMENT: 'Bank statement',
  LEASE: 'Lease',
  EXECUTED_LEASE: 'Executed lease',
  DISCLOSURE: 'Disclosure',
  INSPECTION_PHOTO: 'Inspection photo',
  WORK_ORDER_MEDIA: 'Work order media',
  COMPLETION_PHOTO: 'Completion photo',
  RECEIPT: 'Receipt',
  NOTICE: 'Notice',
  CORRESPONDENCE: 'Correspondence',
  DEPOSIT_DISPOSITION: 'Deposit disposition',
  UNIT_PHOTO: 'Unit photo',
  OTHER: 'Other',
};

export const DOCUMENT_CATEGORY_TONES: Record<DocumentCategory, BadgeTone> = {
  GOVERNMENT_ID: 'purple',
  PAY_STUB: 'blue',
  BANK_STATEMENT: 'blue',
  LEASE: 'green',
  EXECUTED_LEASE: 'green',
  DISCLOSURE: 'orange',
  INSPECTION_PHOTO: 'yellow',
  WORK_ORDER_MEDIA: 'yellow',
  COMPLETION_PHOTO: 'yellow',
  RECEIPT: 'blue',
  NOTICE: 'red',
  CORRESPONDENCE: 'gray',
  DEPOSIT_DISPOSITION: 'orange',
  UNIT_PHOTO: 'gray',
  OTHER: 'gray',
};

/** Categories the landlord can pick when adding a document to the vault. */
export const VAULT_UPLOAD_CATEGORIES: DocumentCategory[] = [
  'NOTICE',
  'CORRESPONDENCE',
  'DISCLOSURE',
  'OTHER',
];

/** Categories a tenant may see for their own tenancy (never internal docs). */
export const TENANT_VISIBLE_CATEGORIES: DocumentCategory[] = [
  'LEASE',
  'EXECUTED_LEASE',
  'DISCLOSURE',
  'NOTICE',
  'CORRESPONDENCE',
  'DEPOSIT_DISPOSITION',
  'RECEIPT',
];

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// ─── Work orders ─────────────────────────────────────────────────────────────

export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'SUBMITTED',
  'ACKNOWLEDGED',
  'SCHEDULED',
  'IN_PROGRESS',
];

export const WORK_ORDER_CATEGORY_LABELS: Record<WorkOrderCategory, string> = {
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  HVAC: 'HVAC',
  APPLIANCE: 'Appliance',
  PEST: 'Pest control',
  NO_HEAT: 'No heat',
  NO_WATER: 'No water',
  SEWAGE: 'Sewage',
  NO_ELECTRICITY: 'No electricity',
  OTHER: 'Other',
};

// ─── Notifications ───────────────────────────────────────────────────────────

export const NOTIFICATION_STATUS_TONES: Record<NotificationStatus, BadgeTone> = {
  QUEUED: 'yellow',
  SENT: 'green',
  FAILED: 'red',
  SKIPPED: 'gray',
};

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  APPLICATION_RECEIVED: 'Application received',
  APPLICATION_STATUS_CHANGED: 'Application status changed',
  RENT_DUE_REMINDER: 'Rent due reminder',
  PAYMENT_RECEIVED: 'Payment received',
  PAYMENT_FAILED: 'Payment failed',
  WORK_ORDER_STATUS_CHANGED: 'Maintenance update',
  LEASE_EXPIRATION: 'Lease expiration',
  INSPECTION_SCHEDULED: 'Inspection scheduled',
  GENERAL: 'General',
};

/** The events a tenant can toggle on their preferences page. */
export const TENANT_NOTIFICATION_EVENTS: {
  event: NotificationEvent;
  label: string;
  description: string;
}[] = [
  {
    event: 'RENT_DUE_REMINDER',
    label: 'Rent due reminder',
    description: 'A heads-up a few days before rent is due.',
  },
  {
    event: 'PAYMENT_RECEIVED',
    label: 'Payment received',
    description: 'Confirmation when a rent payment settles.',
  },
  {
    event: 'PAYMENT_FAILED',
    label: 'Payment failed',
    description: 'Alerts when a payment fails or is returned by your bank.',
  },
  {
    event: 'WORK_ORDER_STATUS_CHANGED',
    label: 'Maintenance updates',
    description: 'Status changes on your maintenance requests.',
  },
  {
    event: 'LEASE_EXPIRATION',
    label: 'Lease expiration',
    description: 'Reminders as your lease end date approaches.',
  },
  {
    event: 'INSPECTION_SCHEDULED',
    label: 'Inspections',
    description: 'When a move-in or move-out inspection is scheduled.',
  },
  {
    event: 'GENERAL',
    label: 'General announcements',
    description: 'Everything else from your landlord.',
  },
];

// ─── Appliance inventory ─────────────────────────────────────────────────────

export const APPLIANCE_CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'] as const;

export type ApplianceRow = { name: string; brand: string; model: string; condition: string };

/** Defensive parse of the Unit.applianceInventory Json column. */
export function parseApplianceInventory(json: unknown): ApplianceRow[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      name: typeof row.name === 'string' ? row.name : '',
      brand: typeof row.brand === 'string' ? row.brand : '',
      model: typeof row.model === 'string' ? row.model : '',
      condition: typeof row.condition === 'string' ? row.condition : '',
    }))
    .filter((row) => row.name !== '');
}

// ─── Dates & occupancy ───────────────────────────────────────────────────────

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * Next rent due date on the LA calendar for a tenancy's rentDueDay
 * (clamped to short months). Returns a UTC Date (midnight LA time).
 */
export function nextRentDueDateLA(rentDueDay: number, from: Date = new Date()): Date {
  const [y, m, d] = formatInTimeZone(from, APP_TZ, 'yyyy-MM-dd').split('-').map(Number);
  let year = y;
  let month = m; // 1-based
  if (d > Math.min(rentDueDay, daysInMonth(year, month))) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  const day = Math.min(rentDueDay, daysInMonth(year, month));
  return laDateToUtc(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

/** Whole-number occupancy percentage; 0 when there are no units. */
export function occupancyPct(occupied: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((occupied / total) * 100);
}
