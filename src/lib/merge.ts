/**
 * Merge-field rendering for lease templates.
 * Templates use {{field_name}} placeholders; unknown fields render as a
 * visible ⚠ marker so a missing merge value is never silently blank.
 */

export type MergeData = Record<string, string | number | null | undefined>;

export function renderTemplate(body: string, data: MergeData): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, field: string) => {
    const value = data[field];
    if (value === null || value === undefined || value === '') {
      return `[⚠ MISSING: ${field}]`;
    }
    return String(value);
  });
}

/** Fields a lease template may reference; shown in the template editor. */
export const LEASE_MERGE_FIELDS: { field: string; description: string }[] = [
  { field: 'landlord_name', description: 'Landlord / owner legal name' },
  { field: 'tenant_names', description: 'All tenant full names, comma-separated' },
  { field: 'property_address', description: 'Full street address of the unit' },
  { field: 'unit_number', description: 'Unit number' },
  { field: 'city', description: 'City' },
  { field: 'state', description: 'State' },
  { field: 'zip', description: 'ZIP code' },
  { field: 'lease_start_date', description: 'Lease term start date' },
  { field: 'lease_end_date', description: 'Lease term end date' },
  { field: 'monthly_rent', description: 'Monthly rent (formatted dollars)' },
  { field: 'security_deposit', description: 'Security deposit (formatted dollars)' },
  { field: 'rent_due_day', description: 'Day of month rent is due' },
  { field: 'late_fee', description: 'Late fee (formatted dollars)' },
  { field: 'late_fee_grace_days', description: 'Late fee grace period in days' },
  { field: 'utilities_included', description: 'Utilities included in rent' },
  { field: 'pet_terms', description: 'Pet terms / restrictions' },
  { field: 'pet_rent', description: 'Monthly pet rent (formatted dollars)' },
  { field: 'additional_terms', description: 'Additional custom terms' },
  { field: 'generated_date', description: 'Date the lease was generated' },
];
