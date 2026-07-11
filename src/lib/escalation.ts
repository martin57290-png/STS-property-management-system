import type { WorkOrderCategory, WorkOrderPriority, WorkOrderStatus } from '@prisma/client';
import { daysSince } from '@/lib/dates';
import type { AppSettings } from '@/lib/settings';

/** Categories that are habitability emergencies under CA repair-and-deduct exposure. */
export const HABITABILITY_CATEGORIES: WorkOrderCategory[] = [
  'NO_HEAT',
  'NO_WATER',
  'SEWAGE',
  'NO_ELECTRICITY',
];

export function isHabitabilityCategory(category: WorkOrderCategory): boolean {
  return HABITABILITY_CATEGORIES.includes(category);
}

const OPEN_STATUSES: WorkOrderStatus[] = ['SUBMITTED', 'ACKNOWLEDGED', 'SCHEDULED', 'IN_PROGRESS'];

export function isOpenStatus(status: WorkOrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * The priority a ticket should *display* as, after automatic visual
 * escalation based on how long it has been open. Base priority never
 * changes in the database — only the displayed severity escalates.
 */
export function effectivePriority(
  workOrder: { priority: WorkOrderPriority; status: WorkOrderStatus; createdAt: Date },
  settings: Pick<
    AppSettings,
    'escalateRoutineToUrgentDays' | 'escalateRoutineToEmergencyDays' | 'escalateUrgentToEmergencyDays'
  >,
): WorkOrderPriority {
  if (!isOpenStatus(workOrder.status)) return workOrder.priority;
  const age = daysSince(workOrder.createdAt);

  if (workOrder.priority === 'ROUTINE' || workOrder.priority === 'LOW') {
    if (age >= settings.escalateRoutineToEmergencyDays) return 'EMERGENCY';
    if (age >= settings.escalateRoutineToUrgentDays) return 'URGENT';
    return workOrder.priority;
  }
  if (workOrder.priority === 'URGENT') {
    if (age >= settings.escalateUrgentToEmergencyDays) return 'EMERGENCY';
    return 'URGENT';
  }
  return workOrder.priority;
}

export const PRIORITY_STYLES: Record<
  WorkOrderPriority,
  { label: string; badge: string; dot: string }
> = {
  EMERGENCY: { label: 'Emergency', badge: 'bg-red-100 text-red-800 border-red-300', dot: 'bg-red-600' },
  URGENT: { label: 'Urgent', badge: 'bg-orange-100 text-orange-800 border-orange-300', dot: 'bg-orange-500' },
  ROUTINE: { label: 'Routine', badge: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500' },
  LOW: { label: 'Low', badge: 'bg-green-100 text-green-800 border-green-300', dot: 'bg-green-600' },
};

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  SUBMITTED: 'Submitted',
  ACKNOWLEDGED: 'Acknowledged',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};
