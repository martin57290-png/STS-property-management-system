import { Button, Card, FormField, SubmitButton } from '@/components/ui';
import { DocumentLink } from '@/components/documents';
import type { ApplicationDetail } from '@/lib/modules/applications/queries';
import { removeApplicantDocument, uploadGovernmentId } from '../actions';
import { StepNav } from './step-shared';

export function IdentityStep({ app }: { app: ApplicationDetail }) {
  const token = app.trackingToken;
  const idDocs = app.documents.filter((d) => d.category === 'GOVERNMENT_ID');
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Government-issued ID</h2>
        <p className="mb-3 text-sm text-gray-600">
          Upload a clear photo or scan of a government-issued photo ID (driver&apos;s license,
          state ID, or passport). This is used only to verify your identity.
        </p>
        <form action={uploadGovernmentId.bind(null, token)} className="space-y-4">
          <FormField label="ID document" htmlFor="governmentId">
            <input
              id="governmentId"
              name="governmentId"
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          </FormField>
          <SubmitButton variant="secondary" pendingText="Uploading…">
            Upload ID
          </SubmitButton>
        </form>

        {idDocs.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100 pt-2">
            {idDocs.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <DocumentLink doc={doc} />
                  <p className="text-xs text-gray-500">
                    Government ID · {Math.ceil(doc.sizeBytes / 1024)} KB
                  </p>
                </div>
                <form action={removeApplicantDocument.bind(null, token)}>
                  <input type="hidden" name="id" value={doc.id} />
                  <input type="hidden" name="step" value="identity" />
                  <Button variant="ghost" size="sm" type="submit">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <StepNav token={token} back="employment" next="vehicles-pets" />
    </div>
  );
}
