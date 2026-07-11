import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { InspectionStatus, InspectionType, ItemCondition } from '@prisma/client';
import type { BadgeTone } from '@/components/ui';
import { APP_TZ } from '@/lib/dates';

// ── Labels & badge tones ─────────────────────────────────────────────────────

export const TYPE_LABELS: Record<InspectionType, string> = {
  MOVE_IN: 'Move-in',
  MOVE_OUT: 'Move-out',
};

export const TYPE_TONES: Record<InspectionType, BadgeTone> = {
  MOVE_IN: 'blue',
  MOVE_OUT: 'purple',
};

export const STATUS_LABELS: Record<InspectionStatus, string> = {
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  PENDING_SIGNATURES: 'Pending signatures',
  COMPLETED: 'Completed',
};

export const STATUS_TONES: Record<InspectionStatus, BadgeTone> = {
  SCHEDULED: 'gray',
  IN_PROGRESS: 'yellow',
  PENDING_SIGNATURES: 'orange',
  COMPLETED: 'green',
};

export const CONDITIONS: ItemCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'New',
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
  DAMAGED: 'Damaged',
};

export const CONDITION_TONES: Record<ItemCondition, BadgeTone> = {
  NEW: 'green',
  GOOD: 'blue',
  FAIR: 'yellow',
  POOR: 'orange',
  DAMAGED: 'red',
};

/** Higher = better. Used to detect deterioration between move-in and move-out. */
export const CONDITION_RANK: Record<ItemCondition, number> = {
  NEW: 4,
  GOOD: 3,
  FAIR: 2,
  POOR: 1,
  DAMAGED: 0,
};

/** True when the move-out condition is strictly worse than move-in. */
export function conditionWorsened(
  moveIn: ItemCondition | null | undefined,
  moveOut: ItemCondition | null | undefined,
): boolean {
  if (!moveIn || !moveOut) return false;
  return CONDITION_RANK[moveOut] < CONDITION_RANK[moveIn];
}

// ── Deposit disposition ──────────────────────────────────────────────────────

export const DEDUCTION_CATEGORIES = [
  'Unpaid rent',
  'Cleaning',
  'Repairs beyond normal wear',
  'Other',
] as const;

/** Parse a DepositDeduction.photoKeys Json value into a string[] safely. */
export function photoKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

// ── Display helpers ──────────────────────────────────────────────────────────

export function shortUnitLabel(unit: { unitNumber: string; property: { name: string } }): string {
  return `${unit.property.name} #${unit.unitNumber}`;
}

export function fullUnitAddress(unit: {
  unitNumber: string;
  property: { name: string; street: string; city: string; state: string; zip: string };
}): string {
  return `${unit.property.name}, Unit ${unit.unitNumber} — ${unit.property.street}, ${unit.property.city}, ${unit.property.state} ${unit.property.zip}`;
}

export function tenantNames(tenants: { user: { name: string } }[]): string {
  return tenants.map((t) => t.user.name).join(', ');
}

/** Group checklist items by room, preserving sortOrder within and across rooms. */
export function groupItemsByRoom<T extends { room: string; item: string; sortOrder: number }>(
  items: T[],
): { room: string; items: T[] }[] {
  const sorted = [...items].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.item.localeCompare(b.item),
  );
  const byRoom = new Map<string, T[]>();
  for (const it of sorted) {
    const list = byRoom.get(it.room) ?? [];
    list.push(it);
    byRoom.set(it.room, list);
  }
  return Array.from(byRoom.entries()).map(([room, roomItems]) => ({ room, items: roomItems }));
}

/** Case-insensitive room+item key used to match move-in and move-out lines. */
export function itemMatchKey(room: string, item: string): string {
  return `${room.trim().toLowerCase()}|${item.trim().toLowerCase()}`;
}

// ── Date/time helpers ────────────────────────────────────────────────────────

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

/** Public base URL used in email / SMS links. */
export function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}
