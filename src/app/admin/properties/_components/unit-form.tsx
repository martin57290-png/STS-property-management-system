import type { Unit } from '@prisma/client';
import { centsToDollarString } from '@/lib/money';
import { Checkbox, FormField, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import {
  APPLIANCE_CONDITIONS,
  parseApplianceInventory,
  type ApplianceRow,
} from '@/lib/modules/dashboard/helpers';

const EMPTY_ROW: ApplianceRow = { name: '', brand: '', model: '', condition: '' };

/** Shared create/edit form for a unit, including the appliance inventory editor. */
export function UnitForm({
  action,
  propertyId,
  unit,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  propertyId: string;
  unit?: Unit;
  submitLabel: string;
}) {
  const appliances = unit ? parseApplianceInventory(unit.applianceInventory) : [];
  // Existing rows plus three blank rows for additions (no client JS needed).
  const rows: ApplianceRow[] = [...appliances, EMPTY_ROW, EMPTY_ROW, EMPTY_ROW];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="propertyId" value={propertyId} />
      {unit && <input type="hidden" name="unitId" value={unit.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Unit number" htmlFor="unitNumber" required>
          <Input
            id="unitNumber"
            name="unitNumber"
            required
            defaultValue={unit?.unitNumber ?? ''}
            placeholder="e.g. 3B"
          />
        </FormField>
        <FormField label="Square feet" htmlFor="sqft">
          <Input
            id="sqft"
            name="sqft"
            type="number"
            min={0}
            defaultValue={unit?.sqft ?? ''}
            placeholder="e.g. 850"
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Bedrooms" htmlFor="bedrooms" required>
          <Input
            id="bedrooms"
            name="bedrooms"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={unit?.bedrooms ?? ''}
          />
        </FormField>
        <FormField label="Bathrooms" htmlFor="bathrooms" required hint="Half baths allowed, e.g. 1.5">
          <Input
            id="bathrooms"
            name="bathrooms"
            type="number"
            min={0}
            step={0.5}
            required
            defaultValue={unit?.bathrooms ?? ''}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Market rent ($/month)" htmlFor="marketRent" required>
          <Input
            id="marketRent"
            name="marketRent"
            required
            inputMode="decimal"
            defaultValue={unit ? centsToDollarString(unit.marketRentCents) : ''}
            placeholder="e.g. 1950.00"
          />
        </FormField>
        <FormField
          label="Security deposit ($)"
          htmlFor="deposit"
          required
          hint="CA caps security deposits at one month's rent (AB 12)."
        >
          <Input
            id="deposit"
            name="deposit"
            required
            inputMode="decimal"
            defaultValue={unit ? centsToDollarString(unit.depositCents) : ''}
            placeholder="e.g. 1950.00"
          />
        </FormField>
      </div>

      <Checkbox
        name="isListed"
        defaultChecked={unit?.isListed ?? false}
        label={
          <>
            <span className="font-medium">Listed</span> — accepting applications; shows on the
            public site.
          </>
        }
      />

      <fieldset className="rounded-md border border-gray-200 p-3 sm:p-4">
        <legend className="px-1 text-sm font-semibold text-gray-900">Appliance inventory</legend>
        <p className="mb-3 text-xs text-gray-500">
          Track what the unit comes with. Leave the name blank to remove a row; extra blank rows
          are ignored.
        </p>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-4">
              <FormField label={`Appliance ${i + 1}`} htmlFor={`appliance_name_${i}`}>
                <Input
                  id={`appliance_name_${i}`}
                  name={`appliance_name_${i}`}
                  defaultValue={row.name}
                  placeholder="e.g. Refrigerator"
                />
              </FormField>
              <FormField label="Brand" htmlFor={`appliance_brand_${i}`}>
                <Input
                  id={`appliance_brand_${i}`}
                  name={`appliance_brand_${i}`}
                  defaultValue={row.brand}
                />
              </FormField>
              <FormField label="Model" htmlFor={`appliance_model_${i}`}>
                <Input
                  id={`appliance_model_${i}`}
                  name={`appliance_model_${i}`}
                  defaultValue={row.model}
                />
              </FormField>
              <FormField label="Condition" htmlFor={`appliance_condition_${i}`}>
                <Select
                  id={`appliance_condition_${i}`}
                  name={`appliance_condition_${i}`}
                  defaultValue={row.condition}
                >
                  <option value="">—</option>
                  {APPLIANCE_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          ))}
        </div>
      </fieldset>

      <FormField label="Notes" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          defaultValue={unit?.notes ?? ''}
          placeholder="Anything unusual about this unit…"
        />
      </FormField>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
