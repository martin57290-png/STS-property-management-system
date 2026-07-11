import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { FIRST_STEP, stepPath } from '@/lib/modules/applications/steps';

export const dynamic = 'force-dynamic';

/** Resume link: send drafts into the wizard, submitted apps to the status page. */
export default async function ApplicationResumePage({
  params,
}: {
  params: { token: string };
}) {
  const app = await prisma.application.findUnique({
    where: { trackingToken: params.token },
    select: { status: true },
  });
  if (!app) notFound();
  if (app.status !== 'DRAFT') redirect(`/application-status?token=${params.token}`);
  redirect(stepPath(params.token, FIRST_STEP));
}
