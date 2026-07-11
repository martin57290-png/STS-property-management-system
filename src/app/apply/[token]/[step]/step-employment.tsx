import { Badge, Button, Card, CardSection, Checkbox, FormField, Input, SubmitButton } from '@/components/ui';
import { DocumentLink } from '@/components/documents';
import { fmt } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import type { ApplicationDetail } from '@/lib/modules/applications/queries';
import { addEmployment, removeApplicantDocument, removeEmployment, uploadIncomeDocs } from '../actions';
import { StepNav } from './step-shared';

export function EmploymentStep({ app }: { app: ApplicationDetail }) {
  const token = app.trackingToken;
  const incomeDocs = app.documents.filter(
    (d) => d.category === 'PAY_STUB' || d.category === 'BANK_STATEMENT',
  );
  return (
    <div className="space-y-4">
      <CardSection title={`Employment added (${app.employments.length})`}>
        {app.employments.length === 0 ? (
          <p className="text-sm text-gray-500">
            No employment yet. Add your current job — or skip ahead if you have other income and
            upload proof below.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {app.employments.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {e.employer}
                    {e.position && <span className="text-gray-600"> — {e.position}</span>}{' '}
                    {e.isCurrent && (
                      <Badge tone="green" className="ml-1">
                        Current
                      </Badge>
                    )}
                  </p>
                  <p className="text-gray-600">
                    {e.monthlyIncomeCents != null && <>{formatCents(e.monthlyIncomeCents)}/mo · </>}
                    {e.startDate ? fmt(e.startDate) : '—'} → {e.endDate ? fmt(e.endDate) : 'present'}
                  </p>
                </div>
                <form action={removeEmployment.bind(null, token)}>
                  <input type="hidden" name="id" value={e.id} />
                  <Button variant="ghost" size="sm" type="submit">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </CardSection>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Add employment</h2>
        <form action={addEmployment.bind(null, token)} className="space-y-4">
          <Checkbox name="isCurrent" defaultChecked label="This is my current job" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Employer" htmlFor="emp-employer" required>
              <Input id="emp-employer" name="employer" required />
            </FormField>
            <FormField label="Position / title" htmlFor="emp-position">
              <Input id="emp-position" name="position" />
            </FormField>
            <FormField label="Monthly income from this job" htmlFor="emp-income">
              <Input id="emp-income" name="monthlyIncome" inputMode="decimal" placeholder="$" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start date" htmlFor="emp-start">
                <Input id="emp-start" name="startDate" type="date" />
              </FormField>
              <FormField label="End date" htmlFor="emp-end" hint="Blank if current.">
                <Input id="emp-end" name="endDate" type="date" />
              </FormField>
            </div>
            <FormField label="Supervisor name" htmlFor="emp-supName">
              <Input id="emp-supName" name="supervisorName" />
            </FormField>
            <FormField label="Supervisor phone" htmlFor="emp-supPhone">
              <Input id="emp-supPhone" name="supervisorPhone" type="tel" />
            </FormField>
          </div>
          <SubmitButton variant="secondary" pendingText="Adding…">
            + Add employment
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Proof of income</h2>
        <p className="mb-3 text-sm text-gray-600">
          Upload your two most recent pay stubs and/or recent bank statements (PDF or photo, up to
          20 MB each).
        </p>
        <form action={uploadIncomeDocs.bind(null, token)} className="space-y-4">
          <FormField label="Pay stubs" htmlFor="payStubs">
            <input
              id="payStubs"
              name="payStubs"
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          </FormField>
          <FormField label="Bank statements" htmlFor="bankStatements">
            <input
              id="bankStatements"
              name="bankStatements"
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          </FormField>
          <SubmitButton variant="secondary" pendingText="Uploading…">
            Upload files
          </SubmitButton>
        </form>

        {incomeDocs.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100 pt-2">
            {incomeDocs.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <DocumentLink doc={doc} />
                  <p className="text-xs text-gray-500">
                    {doc.category === 'PAY_STUB' ? 'Pay stub' : 'Bank statement'} ·{' '}
                    {Math.ceil(doc.sizeBytes / 1024)} KB
                  </p>
                </div>
                <form action={removeApplicantDocument.bind(null, token)}>
                  <input type="hidden" name="id" value={doc.id} />
                  <input type="hidden" name="step" value="employment" />
                  <Button variant="ghost" size="sm" type="submit">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <StepNav token={token} back="residence" next="identity" />
    </div>
  );
}
