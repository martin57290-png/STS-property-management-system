import { Badge, Button, Card, CardSection, Checkbox, FormField, Input, SubmitButton } from '@/components/ui';
import type { ApplicationDetail } from '@/lib/modules/applications/queries';
import { addPet, addVehicle, removePet, removeVehicle } from '../actions';
import { StepNav } from './step-shared';

export function VehiclesPetsStep({ app }: { app: ApplicationDetail }) {
  const token = app.trackingToken;
  return (
    <div className="space-y-4">
      <CardSection title={`Vehicles (${app.vehicles.length})`}>
        {app.vehicles.length === 0 ? (
          <p className="text-sm text-gray-500">No vehicles added. Skip if you don&apos;t have one.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {app.vehicles.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {v.year ? `${v.year} ` : ''}
                    {v.make} {v.model}
                  </p>
                  <p className="text-gray-600">
                    {[v.color, v.licensePlate ? `plate ${v.licensePlate}` : null, v.state]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
                <form action={removeVehicle.bind(null, token)}>
                  <input type="hidden" name="id" value={v.id} />
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
        <h2 className="mb-3 text-base font-semibold text-gray-900">Add a vehicle</h2>
        <form action={addVehicle.bind(null, token)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Make" htmlFor="veh-make" required>
              <Input id="veh-make" name="make" required />
            </FormField>
            <FormField label="Model" htmlFor="veh-model" required>
              <Input id="veh-model" name="model" required />
            </FormField>
            <FormField label="Year" htmlFor="veh-year">
              <Input id="veh-year" name="year" inputMode="numeric" maxLength={4} />
            </FormField>
            <FormField label="Color" htmlFor="veh-color">
              <Input id="veh-color" name="color" />
            </FormField>
            <FormField label="License plate" htmlFor="veh-plate">
              <Input id="veh-plate" name="licensePlate" />
            </FormField>
            <FormField label="Plate state" htmlFor="veh-state">
              <Input id="veh-state" name="state" maxLength={20} defaultValue="CA" />
            </FormField>
          </div>
          <SubmitButton variant="secondary" pendingText="Adding…">
            + Add vehicle
          </SubmitButton>
        </form>
      </Card>

      <CardSection title={`Pets & service animals (${app.pets.length})`}>
        {app.pets.length === 0 ? (
          <p className="text-sm text-gray-500">No pets added.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {app.pets.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {p.name ? `${p.name} — ` : ''}
                    {p.type}
                    {p.breed ? ` (${p.breed})` : ''}{' '}
                    {p.isServiceAnimal && (
                      <Badge tone="blue" className="ml-1">
                        Service/assistance animal
                      </Badge>
                    )}
                  </p>
                  <p className="text-gray-600">
                    {p.weightLbs != null ? `${p.weightLbs} lbs` : 'weight —'} ·{' '}
                    {p.age != null ? `${p.age} yr old` : 'age —'}
                  </p>
                </div>
                <form action={removePet.bind(null, token)}>
                  <input type="hidden" name="id" value={p.id} />
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
        <h2 className="mb-3 text-base font-semibold text-gray-900">Add a pet or service animal</h2>
        <form action={addPet.bind(null, token)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Type" htmlFor="pet-type" required hint="e.g. dog, cat, bird">
              <Input id="pet-type" name="type" required />
            </FormField>
            <FormField label="Breed" htmlFor="pet-breed">
              <Input id="pet-breed" name="breed" />
            </FormField>
            <FormField label="Name" htmlFor="pet-name">
              <Input id="pet-name" name="name" />
            </FormField>
            <FormField label="Weight (lbs)" htmlFor="pet-weight">
              <Input id="pet-weight" name="weightLbs" inputMode="numeric" />
            </FormField>
            <FormField label="Age (years)" htmlFor="pet-age">
              <Input id="pet-age" name="age" inputMode="numeric" />
            </FormField>
          </div>
          <Checkbox
            name="isServiceAnimal"
            label="This is a service or assistance animal (not subject to pet rent or pet restrictions)"
          />
          <SubmitButton variant="secondary" pendingText="Adding…">
            + Add pet
          </SubmitButton>
        </form>
      </Card>

      <StepNav token={token} back="identity" next="contacts" />
    </div>
  );
}
