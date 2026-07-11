'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { setSetting } from '@/lib/settings';
import { parseDollarsToCents } from '@/lib/money';

function backToSettings(params: { error?: string; notice?: string }): never {
  const qs = new URLSearchParams();
  if (params.error) qs.set('error', params.error);
  if (params.notice) qs.set('notice', params.notice);
  redirect(`/admin/settings?${qs.toString()}`);
}

function intField(formData: FormData, name: string, min: number): number | null {
  const raw = String(formData.get(name) ?? '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) return null;
  return n;
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const user = await requireLandlord();

  const businessName = String(formData.get('businessName') ?? '').trim();
  if (!businessName) backToSettings({ error: 'Business name is required.' });

  const applicationFeeCents = parseDollarsToCents(String(formData.get('applicationFee') ?? ''));
  if (applicationFeeCents == null) {
    backToSettings({ error: 'Enter a valid application fee in dollars (0 is allowed).' });
  }

  const defaultLateFeeCents = parseDollarsToCents(String(formData.get('defaultLateFee') ?? ''));
  if (defaultLateFeeCents == null) {
    backToSettings({ error: 'Enter a valid default late fee in dollars (0 is allowed).' });
  }

  const defaultLateFeeGraceDays = intField(formData, 'defaultLateFeeGraceDays', 0);
  if (defaultLateFeeGraceDays == null) {
    backToSettings({ error: 'Late fee grace days must be a whole number (0 or more).' });
  }

  const escalateRoutineToUrgentDays = intField(formData, 'escalateRoutineToUrgentDays', 1);
  const escalateRoutineToEmergencyDays = intField(formData, 'escalateRoutineToEmergencyDays', 1);
  const escalateUrgentToEmergencyDays = intField(formData, 'escalateUrgentToEmergencyDays', 1);
  if (
    escalateRoutineToUrgentDays == null ||
    escalateRoutineToEmergencyDays == null ||
    escalateUrgentToEmergencyDays == null
  ) {
    backToSettings({ error: 'Escalation thresholds must be whole numbers of days (1 or more).' });
  }

  const rentReminderDaysBefore = intField(formData, 'rentReminderDaysBefore', 0);
  if (rentReminderDaysBefore == null) {
    backToSettings({ error: 'Rent reminder days must be a whole number (0 or more).' });
  }

  await setSetting('businessName', businessName);
  await setSetting('applicationFeeCents', applicationFeeCents);
  await setSetting('defaultLateFeeCents', defaultLateFeeCents);
  await setSetting('defaultLateFeeGraceDays', defaultLateFeeGraceDays);
  await setSetting('escalateRoutineToUrgentDays', escalateRoutineToUrgentDays);
  await setSetting('escalateRoutineToEmergencyDays', escalateRoutineToEmergencyDays);
  await setSetting('escalateUrgentToEmergencyDays', escalateUrgentToEmergencyDays);
  await setSetting('rentReminderDaysBefore', rentReminderDaysBefore);

  await audit({
    actorId: user.id,
    action: 'settings.updated',
    entityType: 'AppSetting',
    entityId: 'app',
    meta: {
      businessName,
      applicationFeeCents,
      defaultLateFeeCents,
      defaultLateFeeGraceDays,
      escalateRoutineToUrgentDays,
      escalateRoutineToEmergencyDays,
      escalateUrgentToEmergencyDays,
      rentReminderDaysBefore,
    },
  });

  revalidatePath('/admin/settings');
  revalidatePath('/admin');
  backToSettings({ notice: 'Settings saved.' });
}
