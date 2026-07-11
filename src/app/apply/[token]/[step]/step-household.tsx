import { Badge, Button, Card, CardSection, Checkbox, FormField, Input, SubmitButton } from '@/components/ui';
import type { ApplicationDetail } from '@/lib/modules/applications/queries';
import { addCoApplicant, removeCoApplicant } from '../actions';
import { StepNav } from './step-shared';

export function HouseholdStep({ app }: { app: ApplicationDetail }) {
  const token = app.trackingToken;
  return (
    <div className="space-y-4">
      <CardSection title={`People added (${app.coApplicants.length})`}>
        {app.coApplicants.length === 0 ? (
          <p className="text-sm text-gray-500">
            No one added yet. If you will live alone, just continue to the next step.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {app.coApplicants.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {c.firstName} {c.lastName}{' '}
                    <Badge tone={c.isOccupantOnly ? 'gray' : 'blue'} className="ml-1">
                      {c.isOccupantOnly ? 'Occupant only' : 'Co-applicant'}
                    </Badge>
                  </p>
                  <p className="text-gray-600">
                    {[c.relationship, c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <form action={removeCoApplicant.bind(null, token)}>
                  <input type="hidden" name="id" value={c.id} />
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
        <h2 className="mb-3 text-base font-semibold text-gray-900">Add a person</h2>
        <form action={addCoApplicant.bind(null, token)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="First name" htmlFor="co-firstName" required>
              <Input id="co-firstName" name="firstName" required />
            </FormField>
            <FormField label="Last name" htmlFor="co-lastName" required>
              <Input id="co-lastName" name="lastName" required />
            </FormField>
            <FormField label="Email" htmlFor="co-email">
              <Input id="co-email" name="email" type="email" />
            </FormField>
            <FormField label="Phone" htmlFor="co-phone">
              <Input id="co-phone" name="phone" type="tel" />
            </FormField>
            <FormField label="Relationship to you" htmlFor="co-relationship" hint="e.g. spouse, roommate, child">
              <Input id="co-relationship" name="relationship" />
            </FormField>
          </div>
          <Checkbox
            name="isOccupantOnly"
            label="Occupant only — will live in the unit but not sign the lease (e.g. a minor child)"
          />
          <SubmitButton variant="secondary" pendingText="Adding…">
            + Add person
          </SubmitButton>
        </form>
      </Card>

      <StepNav token={token} back="personal" next="residence" />
    </div>
  );
}
