import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';

/**
 * When both the tenant and the landlord have acknowledged an inspection,
 * mark it COMPLETED. Called after either party signs. Returns true if the
 * inspection transitioned to COMPLETED.
 */
export async function completeIfFullyAcknowledged(
  inspectionId: string,
  actorId?: string | null,
): Promise<boolean> {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection || inspection.status === 'COMPLETED') return false;
  if (!inspection.tenantAckAt || !inspection.landlordAckAt) return false;

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  await audit({
    actorId: actorId ?? null,
    action: 'inspection.completed',
    entityType: 'Inspection',
    entityId: inspectionId,
    meta: {
      tenancyId: inspection.tenancyId,
      type: inspection.type,
      tenantAckName: inspection.tenantAckName ?? undefined,
      landlordAckName: inspection.landlordAckName ?? undefined,
    },
  });
  return true;
}
