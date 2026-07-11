import { Button, Card, CardSection, FormField, Input, SubmitButton } from '@/components/ui';
import type { ApplicationDetail } from '@/lib/modules/applications/queries';
import { addEmergencyContact, addReference, removeEmergencyContact, removeReference } from '../actions';
import { StepNav } from './step-shared';

export function ContactsStep({ app }: { app: ApplicationDetail }) {
  const token = app.trackingToken;
  return (
    <div className="space-y-4">
      <CardSection title={`Emergency contacts (${app.emergencyContacts.length})`}>
        {app.emergencyContacts.length === 0 ? (
          <p className="text-sm text-gray-500">
            Please add at least one person we can contact in an emergency.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {app.emergencyContacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-gray-600">
                    {[c.relationship, c.phone, c.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <form action={removeEmergencyContact.bind(null, token)}>
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
        <h2 className="mb-3 text-base font-semibold text-gray-900">Add emergency contact</h2>
        <form action={addEmergencyContact.bind(null, token)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Name" htmlFor="ec-name" required>
              <Input id="ec-name" name="name" required />
            </FormField>
            <FormField label="Relationship" htmlFor="ec-relationship">
              <Input id="ec-relationship" name="relationship" />
            </FormField>
            <FormField label="Phone" htmlFor="ec-phone" required>
              <Input id="ec-phone" name="phone" type="tel" required />
            </FormField>
            <FormField label="Email" htmlFor="ec-email">
              <Input id="ec-email" name="email" type="email" />
            </FormField>
          </div>
          <SubmitButton variant="secondary" pendingText="Adding…">
            + Add emergency contact
          </SubmitButton>
        </form>
      </Card>

      <CardSection title={`References (${app.references.length})`}>
        {app.references.length === 0 ? (
          <p className="text-sm text-gray-500">
            Optional but recommended — personal or professional references who can vouch for you.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {app.references.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{r.name}</p>
                  <p className="text-gray-600">
                    {[r.relationship, r.phone, r.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <form action={removeReference.bind(null, token)}>
                  <input type="hidden" name="id" value={r.id} />
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
        <h2 className="mb-3 text-base font-semibold text-gray-900">Add a reference</h2>
        <form action={addReference.bind(null, token)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Name" htmlFor="ref-name" required>
              <Input id="ref-name" name="name" required />
            </FormField>
            <FormField label="Relationship" htmlFor="ref-relationship">
              <Input id="ref-relationship" name="relationship" />
            </FormField>
            <FormField label="Phone" htmlFor="ref-phone">
              <Input id="ref-phone" name="phone" type="tel" />
            </FormField>
            <FormField label="Email" htmlFor="ref-email">
              <Input id="ref-email" name="email" type="email" />
            </FormField>
          </div>
          <SubmitButton variant="secondary" pendingText="Adding…">
            + Add reference
          </SubmitButton>
        </form>
      </Card>

      <StepNav token={token} back="vehicles-pets" next="review" />
    </div>
  );
}
