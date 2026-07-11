import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getApplicationByToken } from '@/lib/modules/applications/queries';
import { isStepSlug, stepBySlug } from '@/lib/modules/applications/steps';
import { shortUnitLabel } from '@/lib/modules/applications/helpers';
import {
  ErrorBanner,
  PublicShell,
  WizardProgress,
} from '@/lib/modules/applications/components';
import { PersonalStep } from './step-personal';
import { HouseholdStep } from './step-household';
import { ResidenceStep } from './step-residence';
import { EmploymentStep } from './step-employment';
import { IdentityStep } from './step-identity';
import { VehiclesPetsStep } from './step-vehicles-pets';
import { ContactsStep } from './step-contacts';
import { ReviewStep } from './step-review';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Application' };

export default async function ApplicationStepPage({
  params,
  searchParams,
}: {
  params: { token: string; step: string };
  searchParams: { error?: string };
}) {
  if (!isStepSlug(params.step)) notFound();
  const app = await getApplicationByToken(params.token);
  if (!app) notFound();
  if (app.status !== 'DRAFT') redirect(`/application-status?token=${params.token}`);

  const step = stepBySlug(params.step);

  return (
    <PublicShell>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Application for {shortUnitLabel(app.unit)}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{step.title}</h1>
      <p className="mb-4 mt-1 text-sm text-gray-600">{step.description}</p>

      <WizardProgress token={params.token} current={step.slug} />
      <ErrorBanner message={searchParams.error} />

      {step.slug === 'personal' && <PersonalStep app={app} />}
      {step.slug === 'household' && <HouseholdStep app={app} />}
      {step.slug === 'residence' && <ResidenceStep app={app} />}
      {step.slug === 'employment' && <EmploymentStep app={app} />}
      {step.slug === 'identity' && <IdentityStep app={app} />}
      {step.slug === 'vehicles-pets' && <VehiclesPetsStep app={app} />}
      {step.slug === 'contacts' && <ContactsStep app={app} />}
      {step.slug === 'review' && <ReviewStep app={app} />}

      <p className="mt-8 text-xs text-gray-500">
        Your progress is saved automatically at each step. Bookmark this page to resume later —
        anyone with this link can view your draft, so don&apos;t share it.
      </p>
    </PublicShell>
  );
}
