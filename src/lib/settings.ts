import { prisma } from '@/lib/db';

/**
 * Landlord-configurable settings stored in AppSetting (key/value JSON).
 * Every key has a default so the app works before anything is configured.
 */
export type AppSettings = {
  /** CA Civ. Code § 1950.6 screening/application fee, in cents. */
  applicationFeeCents: number;
  /** Statutory cap note shown alongside the fee config (display only; adjusted annually). */
  applicationFeeCapNote: string;
  /** Default late fee applied to leases, in cents. */
  defaultLateFeeCents: number;
  /** Grace days before a late fee may be assessed. */
  defaultLateFeeGraceDays: number;
  /** Work-order visual escalation: ROUTINE turns orange after N days. */
  escalateRoutineToUrgentDays: number;
  /** Work-order visual escalation: ROUTINE turns red after N days. */
  escalateRoutineToEmergencyDays: number;
  /** URGENT turns red after N days. */
  escalateUrgentToEmergencyDays: number;
  /** Day of month rent-due reminders go out (days before due date). */
  rentReminderDaysBefore: number;
  /** Business/display name. */
  businessName: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  applicationFeeCents: 5000,
  applicationFeeCapNote:
    'California Civ. Code § 1950.6 caps application screening fees (adjusted annually for CPI — verify the current maximum) and requires an itemized receipt for each applicant charged.',
  defaultLateFeeCents: 7500,
  defaultLateFeeGraceDays: 3,
  escalateRoutineToUrgentDays: 7,
  escalateRoutineToEmergencyDays: 14,
  escalateUrgentToEmergencyDays: 7,
  rentReminderDaysBefore: 3,
  businessName: 'STS Property Management Systems',
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany();
  const overrides: Record<string, unknown> = {};
  for (const row of rows) overrides[row.key] = row.value;
  return { ...DEFAULT_SETTINGS, ...overrides } as AppSettings;
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (row) return row.value as AppSettings[K];
  return DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });
}
