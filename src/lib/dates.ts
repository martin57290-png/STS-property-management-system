import { format as formatDate } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

/** The app operates in California time throughout. */
export const APP_TZ = 'America/Los_Angeles';

/** Format a UTC date for display in LA time. */
export function fmt(date: Date | string | null | undefined, pattern = 'MMM d, yyyy'): string {
  if (!date) return '—';
  return formatInTimeZone(new Date(date), APP_TZ, pattern);
}

export function fmtDateTime(date: Date | string | null | undefined): string {
  return fmt(date, "MMM d, yyyy 'at' h:mm a");
}

/** Current date/time expressed in LA local time (as a zoned Date). */
export function nowLA(): Date {
  return toZonedTime(new Date(), APP_TZ);
}

/** Interpret a yyyy-MM-dd form value as midnight LA time → UTC Date for storage. */
export function laDateToUtc(yyyyMmDd: string): Date {
  return fromZonedTime(`${yyyyMmDd}T00:00:00`, APP_TZ);
}

/** Format a stored UTC date back into a yyyy-MM-dd input value (LA time). */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  return formatInTimeZone(new Date(date), APP_TZ, 'yyyy-MM-dd');
}

/** Days elapsed (fractional truncated) since a timestamp. */
export function daysSince(date: Date | string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

/** Hours elapsed since a timestamp. */
export function hoursSince(date: Date | string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000);
}

/** Human "3d 4h" open-age string for work orders. */
export function openAge(date: Date | string): string {
  const hours = hoursSince(date);
  if (hours < 1) return '<1h';
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return days > 0 ? `${days}d ${rem}h` : `${rem}h`;
}

/** First day of the current month in LA time, as UTC Date (for month filters). */
export function startOfCurrentMonthLA(): Date {
  const laNow = toZonedTime(new Date(), APP_TZ);
  const y = laNow.getFullYear();
  const m = laNow.getMonth();
  return fromZonedTime(`${y}-${String(m + 1).padStart(2, '0')}-01T00:00:00`, APP_TZ);
}

export { formatDate };
