import type { Property } from '@prisma/client';
import { FormField, Input, SubmitButton, Textarea } from '@/components/ui';

/** Shared create/edit form for a property. */
export function PropertyForm({
  action,
  property,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  property?: Property;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4">
      {property && <input type="hidden" name="propertyId" value={property.id} />}

      <FormField label="Property name" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          required
          defaultValue={property?.name ?? ''}
          placeholder="e.g. Maple Court Apartments"
        />
      </FormField>

      <FormField label="Street address" htmlFor="street" required>
        <Input id="street" name="street" required defaultValue={property?.street ?? ''} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="City" htmlFor="city" required>
          <Input id="city" name="city" required defaultValue={property?.city ?? ''} />
        </FormField>
        <FormField label="State" htmlFor="state" required>
          <Input id="state" name="state" required defaultValue={property?.state ?? 'CA'} />
        </FormField>
        <FormField label="ZIP" htmlFor="zip" required>
          <Input
            id="zip"
            name="zip"
            required
            inputMode="numeric"
            defaultValue={property?.zip ?? ''}
          />
        </FormField>
      </div>

      <FormField
        label="Year built"
        htmlFor="yearBuilt"
        hint="Pre-1978 construction triggers the federal lead-based paint disclosure on every lease."
      >
        <Input
          id="yearBuilt"
          name="yearBuilt"
          type="number"
          min={1800}
          max={2100}
          defaultValue={property?.yearBuilt ?? ''}
          placeholder="e.g. 1965"
        />
      </FormField>

      <FormField label="Notes" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          defaultValue={property?.notes ?? ''}
          placeholder="Parking, HOA contacts, utility account numbers…"
        />
      </FormField>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
