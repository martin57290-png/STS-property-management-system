'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { Card, Checkbox, FormField, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import {
  DEPOSIT_CAP_ERROR,
  LATE_FEE_WARNING,
  UTILITY_OPTIONS,
  type DisclosureItem,
  type LeaseFormState,
} from '@/lib/modules/leases/helpers';

export type LeaseFormDefaults = {
  startDate: string;
  endDate: string;
  rent: string;
  deposit: string;
  lateFee: string;
  lateFeeGraceDays: string;
  utilities: string[];
  petTerms: string;
  petRent: string;
  additionalTerms: string;
  templateId: string;
};

/**
 * Shared lease terms form used by the new-lease wizard and the renewal page.
 * Client component: live AB 12 deposit-cap validation and renewal % change.
 */
export function LeaseForm({
  action,
  hidden,
  defaults,
  templates,
  disclosures,
  previousRentCents,
  submitLabel,
}: {
  action: (prevState: LeaseFormState, formData: FormData) => Promise<LeaseFormState>;
  hidden: Record<string, string>;
  defaults: LeaseFormDefaults;
  templates: { id: string; name: string; isDefault: boolean }[];
  disclosures: DisclosureItem[];
  previousRentCents?: number;
  submitLabel: string;
}) {
  const [state, formAction] = useFormState(action, null);
  const [rent, setRent] = useState(defaults.rent);
  const [deposit, setDeposit] = useState(defaults.deposit);

  const rentCents = parseDollarsToCents(rent);
  const depositCents = parseDollarsToCents(deposit);
  const depositTooHigh = rentCents !== null && depositCents !== null && depositCents > rentCents;

  const rentChangePct =
    previousRentCents && previousRentCents > 0 && rentCents !== null
      ? ((rentCents - previousRentCents) / previousRentCents) * 100
      : null;

  return (
    <form action={formAction} className="space-y-6">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {state.error}
        </div>
      )}

      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Term</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Lease start date" htmlFor="startDate" required>
            <Input id="startDate" name="startDate" type="date" defaultValue={defaults.startDate} required />
          </FormField>
          <FormField label="Lease end date" htmlFor="endDate" required>
            <Input id="endDate" name="endDate" type="date" defaultValue={defaults.endDate} required />
          </FormField>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Rent & deposit</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Monthly rent ($)"
            htmlFor="rent"
            required
            hint={
              rentChangePct !== null ? (
                <span
                  className={
                    rentChangePct > 0 ? 'font-medium text-orange-600' : 'font-medium text-green-700'
                  }
                >
                  {rentChangePct >= 0 ? '+' : ''}
                  {rentChangePct.toFixed(1)}% vs. current rent {formatCents(previousRentCents)}
                </span>
              ) : undefined
            }
          >
            <Input
              id="rent"
              name="rent"
              inputMode="decimal"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              required
              placeholder="2500.00"
            />
          </FormField>
          <FormField
            label="Security deposit ($)"
            htmlFor="deposit"
            required
            hint="AB 12 (Civ. Code § 1950.5): capped at one month’s rent as of July 1, 2024."
            error={depositTooHigh ? DEPOSIT_CAP_ERROR : undefined}
          >
            <Input
              id="deposit"
              name="deposit"
              inputMode="decimal"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              required
              placeholder="2500.00"
            />
          </FormField>
          <FormField label="Late fee ($)" htmlFor="lateFee" hint="Leave blank for no late fee.">
            <Input id="lateFee" name="lateFee" inputMode="decimal" defaultValue={defaults.lateFee} placeholder="75.00" />
          </FormField>
          <FormField label="Late fee grace period (days)" htmlFor="lateFeeGraceDays">
            <Input
              id="lateFeeGraceDays"
              name="lateFeeGraceDays"
              type="number"
              min={0}
              max={30}
              defaultValue={defaults.lateFeeGraceDays}
            />
          </FormField>
        </div>
        <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-900">
          <span className="font-semibold">Late fee — California:</span> {LATE_FEE_WARNING}
        </div>
      </Card>

      <Card>
        <fieldset>
          <legend className="mb-3 text-base font-semibold text-gray-900">
            Utilities included in rent
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {UTILITY_OPTIONS.map((utility) => (
              <Checkbox
                key={utility.value}
                name="utilities"
                value={utility.value}
                defaultChecked={defaults.utilities.includes(utility.value)}
                label={utility.label}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">The tenant pays all utilities not checked here.</p>
        </fieldset>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Pets</h2>
        <div className="space-y-4">
          <FormField
            label="Pet terms"
            htmlFor="petTerms"
            hint="Leave blank to use the standard “no pets without written consent” clause."
          >
            <Textarea id="petTerms" name="petTerms" rows={3} defaultValue={defaults.petTerms} />
          </FormField>
          <FormField
            label="Monthly pet rent ($)"
            htmlFor="petRent"
            hint="Leave blank for no pet rent. Never charge pet rent for service/assistance animals."
            className="sm:max-w-xs"
          >
            <Input id="petRent" name="petRent" inputMode="decimal" defaultValue={defaults.petRent} placeholder="50.00" />
          </FormField>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">Additional terms & template</h2>
        <div className="space-y-4">
          <FormField
            label="Additional terms"
            htmlFor="additionalTerms"
            hint="Custom clauses appended to the “Additional Terms” section of the lease."
          >
            <Textarea id="additionalTerms" name="additionalTerms" rows={4} defaultValue={defaults.additionalTerms} />
          </FormField>
          <FormField label="Lease template" htmlFor="templateId" required>
            <Select id="templateId" name="templateId" defaultValue={defaults.templateId} required>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Card>

      <Card>
        <fieldset>
          <legend className="text-base font-semibold text-gray-900">
            California disclosure checklist
          </legend>
          <p className="mb-4 mt-1 text-sm text-gray-600">
            Confirm each required disclosure will be attached to or included in the lease packet.
            The lease cannot be created until every required box is checked.
          </p>
          <ul className="space-y-3">
            {disclosures.map((item) => (
              <li key={item.key} className="rounded-md border border-gray-200 p-3">
                <Checkbox
                  name={`disclosure_${item.key}`}
                  required={item.required}
                  label={
                    <span>
                      <span className="font-medium">
                        {item.label}
                        {item.required && <span className="text-red-600"> (required)</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">{item.description}</span>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </fieldset>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Creating…">{submitLabel}</SubmitButton>
        {depositTooHigh && (
          <p className="text-sm font-medium text-red-600">Fix the security deposit before submitting.</p>
        )}
      </div>
    </form>
  );
}
