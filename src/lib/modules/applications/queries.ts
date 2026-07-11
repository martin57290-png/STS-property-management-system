import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/** Shared include so applicant + admin views see the same shape. */
const detailInclude = {
  unit: { include: { property: true } },
  coApplicants: { orderBy: { id: 'asc' } },
  residences: { orderBy: [{ isCurrent: 'desc' }, { moveIn: 'desc' }] },
  employments: { orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] },
  vehicles: { orderBy: { id: 'asc' } },
  pets: { orderBy: { id: 'asc' } },
  references: { orderBy: { id: 'asc' } },
  emergencyContacts: { orderBy: { id: 'asc' } },
  documents: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ApplicationInclude;

export type ApplicationDetail = Prisma.ApplicationGetPayload<{
  include: typeof detailInclude;
}>;

/** Look up an application by its public tracking token (applicant portal). */
export function getApplicationByToken(trackingToken: string): Promise<ApplicationDetail | null> {
  return prisma.application.findUnique({
    where: { trackingToken },
    include: detailInclude,
  });
}

/** Look up an application by id (admin). */
export function getApplicationById(id: string): Promise<ApplicationDetail | null> {
  return prisma.application.findUnique({
    where: { id },
    include: detailInclude,
  });
}

/** Active (submitted / under-review) applications for a unit, for comparison. */
export function getActiveApplicationsForUnit(unitId: string): Promise<ApplicationDetail[]> {
  return prisma.application.findMany({
    where: { unitId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    include: detailInclude,
    orderBy: [{ submittedAt: 'asc' }],
  });
}
