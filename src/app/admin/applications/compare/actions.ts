'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireLandlord } from '@/lib/auth';
import { applyDecision } from '@/lib/modules/applications/decisions';

/** Quick approve/deny from the side-by-side comparison view. */
export async function quickDecide(unitId: string, formData: FormData): Promise<void> {
  const user = await requireLandlord();
  const applicationId = String(formData.get('applicationId') ?? '');
  const raw = String(formData.get('decision') ?? '');
  if (!applicationId || (raw !== 'APPROVED' && raw !== 'DENIED')) {
    redirect(`/admin/applications/compare?unit=${unitId}`);
  }
  const decision: 'APPROVED' | 'DENIED' = raw === 'APPROVED' ? 'APPROVED' : 'DENIED';
  await applyDecision({ applicationId, status: decision, actorId: user.id });
  revalidatePath('/admin/applications');
  revalidatePath('/admin/applications/compare');
  redirect(`/admin/applications/compare?unit=${unitId}`);
}
