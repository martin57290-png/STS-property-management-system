import { Badge, Button, Card, CardSection, Checkbox, FormField, Input, SubmitButton, Textarea } from '@/components/ui';
import { fmt } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import type { ApplicationDetail } from '@/lib/modules/applications/queries';
import { addResidence, continueFromResidence, removeResidence } from '../actions';
import { StepNav } from './step-shared';

export function ResidenceStep({ app }: { app: ApplicationDetail }) {
  const token = app.trackingToken;
  const hasCurrent = app.residences.some((r) => r.isCurrent);
  return (
    <div className="space-y-4">
      <CardSection title={`Addresses added (${app.residences.length})`}>
        {app.residences.length === 0 ? (
          <p className="text-sm text-gray-500">
            No addresses yet. Your <strong>current address is required</strong>; prior addresses
            help us verify your rental history faster.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {app.residences.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {r.street}, {r.city}, {r.state} {r.zip}{' '}
                    {r.isCurrent && (
                      <Badge tone="green" className="ml-1">
                        Current
                      </Badge>
                    )}
                  </p>
                  <p className="text-gray-600">
                    {r.moveIn ? fmt(r.moveIn) : '—'} → {r.moveOut ? fmt(r.moveOut) : 'present'}
                    {r.monthlyRentCents != null && <> · {formatCents(r.monthlyRentCents)}/mo</>}
                    {r.landlordName && <> · landlord: {r.landlordName}</>}
                  </p>
                </div>
                <form action={removeResidence.bind(null, token)}>
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
        <h2 className="mb-3 text-base font-semibold text-gray-900">Add an address</h2>
        <form action={addResidence.bind(null, token)} className="space-y-4">
          <Checkbox
            name="isCurrent"
            defaultChecked={!hasCurrent}
            label="This is my current address"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Street address" htmlFor="res-street" required className="sm:col-span-2">
              <Input id="res-street" name="street" autoComplete="street-address" required />
            </FormField>
            <FormField label="City" htmlFor="res-city" required>
              <Input id="res-city" name="city" required />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="State" htmlFor="res-state" required>
                <Input id="res-state" name="state" maxLength={20} required defaultValue="CA" />
              </FormField>
              <FormField label="ZIP" htmlFor="res-zip" required>
                <Input id="res-zip" name="zip" inputMode="numeric" required />
              </FormField>
            </div>
            <FormField label="Monthly rent" htmlFor="res-rent" hint="Leave blank if owned / not rented.">
              <Input id="res-rent" name="monthlyRent" inputMode="decimal" placeholder="$" />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Move-in date" htmlFor="res-moveIn">
                <Input id="res-moveIn" name="moveIn" type="date" />
              </FormField>
              <FormField label="Move-out date" htmlFor="res-moveOut" hint="Blank if you still live there.">
                <Input id="res-moveOut" name="moveOut" type="date" />
              </FormField>
            </div>
            <FormField label="Landlord / property manager name" htmlFor="res-landlordName">
              <Input id="res-landlordName" name="landlordName" />
            </FormField>
            <FormField label="Landlord phone" htmlFor="res-landlordPhone">
              <Input id="res-landlordPhone" name="landlordPhone" type="tel" />
            </FormField>
            <FormField label="Landlord email" htmlFor="res-landlordEmail">
              <Input id="res-landlordEmail" name="landlordEmail" type="email" />
            </FormField>
            <FormField label="Reason for leaving" htmlFor="res-reason" className="sm:col-span-2">
              <Textarea id="res-reason" name="reasonForLeaving" rows={2} />
            </FormField>
          </div>
          <SubmitButton variant="secondary" pendingText="Adding…">
            + Add address
          </SubmitButton>

          {/* Inside the same form so a filled-in address is saved
              automatically on Continue; formNoValidate lets Continue work
              with empty fields once an address has already been added. */}
          <StepNav
            token={token}
            back="household"
            next={
              <SubmitButton
                formAction={continueFromResidence.bind(null, token)}
                formNoValidate
                pendingText="Saving…"
              >
                Continue →
              </SubmitButton>
            }
          />
        </form>
      </Card>
    </div>
  );
}
