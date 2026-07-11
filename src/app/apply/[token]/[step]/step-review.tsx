import { ButtonLink, Card, CardSection, Checkbox, FormField, Input, SubmitButton } from '@/components/ui';
import { DocumentList } from '@/components/documents';
import { formatCents } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import type { ApplicationDetail } from '@/lib/modules/applications/queries';
import { ApplicationSummarySections } from '@/lib/modules/applications/components';
import { unitLabel } from '@/lib/modules/applications/helpers';
import { stepPath } from '@/lib/modules/applications/steps';
import { submitApplication } from '../actions';

export async function ReviewStep({ app }: { app: ApplicationDetail }) {
  const token = app.trackingToken;
  const settings = await getSettings();

  return (
    <div className="space-y-4">
      <CardSection title="Applying for">
        <p className="text-sm font-medium text-gray-900">{unitLabel(app.unit)}</p>
        <p className="text-sm text-gray-600">
          Asking rent {formatCents(app.unit.marketRentCents)}/mo · deposit{' '}
          {formatCents(app.unit.depositCents)}
        </p>
      </CardSection>

      <ApplicationSummarySections app={app} />

      <CardSection title={`Uploaded documents (${app.documents.length})`}>
        <DocumentList docs={app.documents} />
        <p className="mt-2 text-xs text-gray-500">
          Missing something? Go back to the{' '}
          <a href={stepPath(token, 'employment')} className="font-medium text-brand-700 underline">
            income
          </a>{' '}
          or{' '}
          <a href={stepPath(token, 'identity')} className="font-medium text-brand-700 underline">
            ID
          </a>{' '}
          step to upload more files.
        </p>
      </CardSection>

      <CardSection title="Application screening fee">
        <p className="text-sm text-gray-800">
          Fee due: <strong>{formatCents(settings.applicationFeeCents)}</strong>, payable upon
          screening. You do not pay anything to submit this application — the landlord will collect
          the fee when your screening begins, and you will receive an itemized receipt.
        </p>
        <p className="mt-2 text-xs text-gray-500">{settings.applicationFeeCapNote}</p>
      </CardSection>

      <Card>
        <h2 className="mb-2 text-base font-semibold text-gray-900">
          Screening authorization (required)
        </h2>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-800">
          <p>
            I hereby authorize STS Property Management Systems and its designated screening
            providers to obtain consumer reports about me — including credit reports, criminal
            background records, and eviction / unlawful-detainer history — and to verify my rental
            history, employment, and income with the landlords, employers, and references listed in
            this application, for the purpose of evaluating my rental application (tenant
            screening). This written authorization is provided under the Fair Credit Reporting Act
            (15 U.S.C. § 1681 et seq.) and California law. I understand that upon request I am
            entitled to a copy of any consumer report obtained, and that I may request disclosure
            of the nature and scope of any investigation. I certify that the information I have
            provided in this application is true and complete to the best of my knowledge.
          </p>
        </div>
        <form action={submitApplication.bind(null, token)} className="mt-4 space-y-4">
          <Checkbox
            name="consent"
            required
            label="I have read and agree to the screening authorization above, and I authorize the credit, background, and rental-history checks it describes."
          />
          <FormField
            label="Type your full legal name as your signature"
            htmlFor="signatureName"
            required
            hint="Your typed name, with the date and IP address of this submission, is recorded as your written authorization."
          >
            <Input
              id="signatureName"
              name="signatureName"
              required
              autoComplete="name"
              placeholder={`${app.firstName} ${app.lastName}`}
            />
          </FormField>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <ButtonLink href={stepPath(token, 'contacts')} variant="secondary">
              ← Back
            </ButtonLink>
            <SubmitButton pendingText="Submitting…">Submit application</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
