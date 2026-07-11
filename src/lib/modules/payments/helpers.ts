/**
 * Pure helpers for the rent-collection module. This file must stay importable
 * from client components: no prisma client, storage, or other server-only
 * imports — date/money formatting utilities only.
 */
import { formatInTimeZone } from 'date-fns-tz';
import type { ChargeCategory, PaymentMethod, PaymentStatus } from '@prisma/client';
import type { BadgeTone } from '@/components/ui';
import { APP_TZ, laDateToUtc } from '@/lib/dates';

// ─── Labels & badge tones ────────────────────────────────────────────────────

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
  RETURNED: 'Returned',
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'gray',
  PROCESSING: 'yellow',
  SUCCEEDED: 'green',
  FAILED: 'red',
  RETURNED: 'red',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ACH: 'Bank account (ACH)',
  CARD: 'Card',
};

export const CHARGE_CATEGORY_OPTIONS: { value: ChargeCategory; label: string }[] = [
  { value: 'RENT', label: 'Rent' },
  { value: 'LATE_FEE', label: 'Late fee' },
  { value: 'UTILITY', label: 'Utility' },
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'APPLICATION_FEE', label: 'Application fee' },
  { value: 'OTHER', label: 'Other' },
];

// ─── Due-date math ───────────────────────────────────────────────────────────

/** Days in a (1-based) month of a given year. */
function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * The next rent due date for a tenancy's rentDueDay, computed on the LA
 * calendar: if today's LA day-of-month is on/before the due day, it's this
 * month's due day; otherwise next month's. The day is clamped to the last day
 * of short months. Returns a UTC Date (midnight LA time on the due date).
 */
export function nextRentDueDate(rentDueDay: number, from: Date = new Date()): Date {
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

/** Whole days from now until a date (negative when past). */
export function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

// ─── Delinquency aging buckets ───────────────────────────────────────────────

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

export const AGING_BUCKETS: AgingBucket[] = ['0-30', '31-60', '61-90', '90+'];

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  '0-30': '0–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': '90+ days',
};

/** Badge color escalates with the age of the oldest unpaid charge. */
export const AGING_BUCKET_TONES: Record<AgingBucket, BadgeTone> = {
  '0-30': 'gray',
  '31-60': 'yellow',
  '61-90': 'orange',
  '90+': 'red',
};

export function agingBucketForDays(days: number): AgingBucket {
  if (days > 90) return '90+';
  if (days > 60) return '61-90';
  if (days > 30) return '31-60';
  return '0-30';
}

// ─── Paid-this-month indicator ───────────────────────────────────────────────

export type PaidThisMonth = 'paid' | 'partial' | 'unpaid';

export function paidThisMonthStatus(paidCents: number, rentCents: number): PaidThisMonth {
  if (rentCents > 0 && paidCents >= rentCents) return 'paid';
  if (paidCents > 0) return 'partial';
  return 'unpaid';
}
