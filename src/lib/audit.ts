import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/**
 * Record a key action in the audit log. Never throws — auditing must not
 * break the underlying operation.
 *
 * Action naming convention: "<entity>.<verb>", e.g. "application.approved",
 * "ledger.charge_added", "lease.generated", "work_order.status_changed".
 */
export async function audit(params: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        meta: params.meta,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write audit log', params.action, err);
  }
}
