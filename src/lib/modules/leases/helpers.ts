/**
 * Pure helpers for the lease module. This file must stay importable from
 * client components: no prisma client, storage, or other server-only imports.
 */
import type { LeaseStatus, Prisma } from '@prisma/client';
import type { BadgeTone } from '@/components/ui';
import type { MergeData } from '@/lib/merge';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { fmt } from '@/lib/dates';

// ─── Form state (useFormState) ───────────────────────────────────────────────

export type LeaseFormState = { error: string } | null;

// ─── Constants ───────────────────────────────────────────────────────────────

export const UTILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'water', label: 'Water' },
  { value: 'trash', label: 'Trash' },
  { value: 'gas', label: 'Gas' },
  { value: 'electric', label: 'Electric' },
  { value: 'internet', label: 'Internet' },
];

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  DRAFT: 'Draft',
  GENERATED: 'Generated — awaiting signature',
  EXECUTED: 'Executed',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
};

export const LEASE_STATUS_TONES: Record<LeaseStatus, BadgeTone> = {
  DRAFT: 'gray',
  GENERATED: 'blue',
  EXECUTED: 'purple',
  ACTIVE: 'green',
  EXPIRED: 'yellow',
  TERMINATED: 'red',
};

export const DEPOSIT_CAP_ERROR =
  'Security deposit exceeds one month’s rent. Under AB 12 (Civ. Code § 1950.5, effective July 1, 2024), a residential security deposit is generally capped at one month’s rent. Reduce the deposit to no more than the monthly rent.';

export const LATE_FEE_WARNING =
  'California courts require late fees to be a reasonable, good-faith estimate of the landlord’s actual costs from late payment (liquidated damages, Civ. Code § 1671; Orozco v. Casimiro). A fee that operates as a penalty is unenforceable — keep it modest and documentable.';

// ─── Calendar math on yyyy-MM-dd strings (timezone-safe) ─────────────────────

/** Shift a yyyy-MM-dd string by whole days/months using pure calendar math. */
export function shiftYmd(ymd: string, delta: { days?: number; months?: number }): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + (delta.months ?? 0), d + (delta.days ?? 0)));
  return dt.toISOString().slice(0, 10);
}

export function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ─── CA disclosure checklist ─────────────────────────────────────────────────

export type DisclosureItem = {
  key: string;
  label: string;
  description: string;
  required: boolean;
};

export type StoredDisclosure = { required: boolean; confirmed: boolean; label: string };
export type StoredDisclosures = Record<string, StoredDisclosure>;

/** Derive the CA disclosure checklist for a property. */
export function deriveDisclosures(property: { yearBuilt: number | null }): DisclosureItem[] {
  const leadRequired = property.yearBuilt !== null && property.yearBuilt < 1978;
  return [
    {
      key: 'leadPaint',
      label: 'Lead-based paint disclosure (pre-1978 housing)',
      description: leadRequired
        ? `Required — property built in ${property.yearBuilt}. Federal law requires the lead disclosure form and the EPA pamphlet “Protect Your Family From Lead in Your Home.”`
        : property.yearBuilt === null
          ? 'Year built is unknown. Verify the construction year — the disclosure is federally required for housing built before 1978.'
          : `Not required — property built in ${property.yearBuilt} (1978 or later).`,
      required: leadRequired,
    },
    {
      key: 'bedBugs',
      label: 'Bed bug information (Civ. Code § 1954.603)',
      description:
        'Required for every California lease: general bed bug information and procedure for reporting suspected infestations.',
      required: true,
    },
    {
      key: 'mold',
      label: 'Mold booklet & disclosure (Health & Safety Code § 26147)',
      description:
        'Required: provide the CDPH booklet “Information on Dampness and Mold for Renters in California” and disclose any known mold conditions.',
      required: true,
    },
    {
      key: 'megansLaw',
      label: 'Megan’s Law database notice (Penal Code § 290.46)',
      description:
        'Required: the statutory notice about the Department of Justice sex-offender website (www.meganslaw.ca.gov) must appear in the lease.',
      required: true,
    },
    {
      key: 'floodZone',
      label: 'Flood hazard area disclosure (Gov. Code § 8589.45)',
      description:
        'Check only if the unit is in a special flood hazard area or an area of potential flooding — the disclosure is then required.',
      required: false,
    },
  ];
}

/**
 * Read the disclosure checkboxes (named `disclosure_<key>`) from a form and
 * build the JSON stored on Lease.disclosures. Returns the labels of any
 * required-but-unconfirmed disclosures.
 */
export function disclosuresFromForm(
  formData: FormData,
  items: DisclosureItem[],
): { record: StoredDisclosures; missingLabels: string[] } {
  const record: StoredDisclosures = {};
  const missingLabels: string[] = [];
  for (const item of items) {
    const confirmed = formData.get(`disclosure_${item.key}`) === 'on';
    record[item.key] = { required: item.required, confirmed, label: item.label };
    if (item.required && !confirmed) missingLabels.push(item.label);
  }
  return { record, missingLabels };
}

/** Parse the disclosures JSON stored on a Lease row. */
export function parseStoredDisclosures(json: Prisma.JsonValue | null): StoredDisclosures {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  const out: StoredDisclosures = {};
  for (const [key, value] of Object.entries(json)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const v = value as Record<string, unknown>;
      out[key] = {
        required: Boolean(v.required),
        confirmed: Boolean(v.confirmed),
        label: typeof v.label === 'string' ? v.label : key,
      };
    }
  }
  return out;
}

// ─── Lease term parsing (server actions) ─────────────────────────────────────

export type ParsedLeaseTerms = {
  startYmd: string;
  endYmd: string;
  rentCents: number;
  depositCents: number;
  lateFeeCents: number | null;
  lateFeeGraceDays: number | null;
  utilities: string[];
  petTerms: string | null;
  petRentCents: number | null;
  additionalTerms: string | null;
  templateId: string;
};

/** Parse + validate the shared lease-terms fields. Enforces the AB 12 deposit cap. */
export function parseLeaseTerms(
  formData: FormData,
): { error: string } | { terms: ParsedLeaseTerms } {
  const startYmd = String(formData.get('startDate') ?? '').trim();
  const endYmd = String(formData.get('endDate') ?? '').trim();
  if (!isValidYmd(startYmd) || !isValidYmd(endYmd)) {
    return { error: 'Enter valid lease start and end dates.' };
  }
  if (endYmd <= startYmd) {
    return { error: 'The lease end date must be after the start date.' };
  }

  const rentCents = parseDollarsToCents(String(formData.get('rent') ?? ''));
  if (rentCents === null || rentCents <= 0) {
    return { error: 'Enter a valid monthly rent amount.' };
  }
  const depositCents = parseDollarsToCents(String(formData.get('deposit') ?? ''));
  if (depositCents === null || depositCents < 0) {
    return { error: 'Enter a valid security deposit amount.' };
  }
  if (depositCents > rentCents) {
    return { error: DEPOSIT_CAP_ERROR };
  }

  const lateFeeRaw = String(formData.get('lateFee') ?? '').trim();
  let lateFeeCents: number | null = null;
  if (lateFeeRaw !== '') {
    lateFeeCents = parseDollarsToCents(lateFeeRaw);
    if (lateFeeCents === null) return { error: 'Enter a valid late fee amount (or leave it blank).' };
    if (lateFeeCents === 0) lateFeeCents = null;
  }
  const graceRaw = String(formData.get('lateFeeGraceDays') ?? '').trim();
  let lateFeeGraceDays: number | null = null;
  if (graceRaw !== '') {
    const parsed = Number(graceRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 30) {
      return { error: 'Late fee grace days must be a whole number between 0 and 30.' };
    }
    lateFeeGraceDays = parsed;
  }
  if (lateFeeCents !== null && lateFeeGraceDays === null) lateFeeGraceDays = 0;

  const allowed = new Set(UTILITY_OPTIONS.map((u) => u.value));
  const utilities = formData
    .getAll('utilities')
    .map(String)
    .filter((u) => allowed.has(u));

  const petTermsRaw = String(formData.get('petTerms') ?? '').trim();
  const petTerms = petTermsRaw === '' ? null : petTermsRaw;
  const petRentRaw = String(formData.get('petRent') ?? '').trim();
  let petRentCents: number | null = null;
  if (petRentRaw !== '') {
    petRentCents = parseDollarsToCents(petRentRaw);
    if (petRentCents === null) return { error: 'Enter a valid pet rent amount (or leave it blank).' };
    if (petRentCents === 0) petRentCents = null;
  }

  const additionalRaw = String(formData.get('additionalTerms') ?? '').trim();
  const additionalTerms = additionalRaw === '' ? null : additionalRaw;

  const templateId = String(formData.get('templateId') ?? '').trim();
  if (!templateId) return { error: 'Select a lease template.' };

  return {
    terms: {
      startYmd,
      endYmd,
      rentCents,
      depositCents,
      lateFeeCents,
      lateFeeGraceDays,
      utilities,
      petTerms,
      petRentCents,
      additionalTerms,
      templateId,
    },
  };
}

// ─── Pet-term suggestion from application pets ───────────────────────────────

export function suggestPetTerms(
  pets: {
    type: string;
    breed: string | null;
    name: string | null;
    weightLbs: number | null;
    isServiceAnimal: boolean;
  }[],
): string {
  if (pets.length === 0) return '';
  const described = pets.map((pet) => {
    const details = [pet.breed, pet.name ? `“${pet.name}”` : null, pet.weightLbs ? `${pet.weightLbs} lbs` : null]
      .filter(Boolean)
      .join(', ');
    const base = details ? `${pet.type} (${details})` : pet.type;
    return pet.isServiceAnimal ? `${base} — service/assistance animal` : base;
  });
  const hasServiceAnimal = pets.some((p) => p.isServiceAnimal);
  let text = `Landlord authorizes the following pet(s) disclosed on the rental application, and no others: ${described.join('; ')}.`;
  if (hasServiceAnimal) {
    text +=
      ' Service/assistance animals are not pets: no pet rent, pet deposit, or other pet charge applies to them.';
  }
  return text;
}

// ─── Merge data ──────────────────────────────────────────────────────────────

export function buildLeaseMergeData(params: {
  lease: {
    startDate: Date;
    endDate: Date;
    rentCents: number;
    depositCents: number;
    lateFeeCents: number | null;
    lateFeeGraceDays: number | null;
    utilitiesIncluded: Prisma.JsonValue | null;
    petTerms: string | null;
    petRentCents: number | null;
    additionalTerms: string | null;
  };
  rentDueDay: number;
  landlordName: string;
  tenantNames: string[];
  unit: { unitNumber: string };
  property: { street: string; city: string; state: string; zip: string };
}): MergeData {
  const { lease, rentDueDay, landlordName, tenantNames, unit, property } = params;
  const utilities = Array.isArray(lease.utilitiesIncluded)
    ? (lease.utilitiesIncluded as unknown[]).map(String)
    : [];
  return {
    landlord_name: landlordName,
    tenant_names: tenantNames.join(', '),
    property_address: property.street,
    unit_number: unit.unitNumber,
    city: property.city,
    state: property.state,
    zip: property.zip,
    lease_start_date: fmt(lease.startDate, 'MMMM d, yyyy'),
    lease_end_date: fmt(lease.endDate, 'MMMM d, yyyy'),
    monthly_rent: formatCents(lease.rentCents),
    security_deposit: formatCents(lease.depositCents),
    rent_due_day: rentDueDay,
    late_fee: lease.lateFeeCents !== null ? formatCents(lease.lateFeeCents) : '$0.00 (no late fee)',
    late_fee_grace_days: lease.lateFeeGraceDays ?? 0,
    utilities_included:
      utilities.length > 0
        ? utilities.map(utilityLabel).join(', ')
        : 'None — Tenant pays all utilities',
    pet_terms:
      lease.petTerms ??
      'No pets of any kind are permitted on the Premises without the prior written consent of Landlord.',
    pet_rent: formatCents(lease.petRentCents ?? 0),
    additional_terms: lease.additionalTerms ?? 'None.',
    generated_date: fmt(new Date(), 'MMMM d, yyyy'),
  };
}

export function utilityLabel(value: string): string {
  return UTILITY_OPTIONS.find((u) => u.value === value)?.label ?? value;
}

// ─── Expiring-soon buckets ───────────────────────────────────────────────────

/** Days from now until a date (ceil). Negative when past. */
export function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/** '60' when ending within 60 days, '90' within 90, null otherwise/past. */
export function expiringBucket(endDate: Date): '60' | '90' | null {
  const days = daysUntil(endDate);
  if (days < 0) return null;
  if (days <= 60) return '60';
  if (days <= 90) return '90';
  return null;
}
