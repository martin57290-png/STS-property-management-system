/**
 * Rental application wizard step registry. Each step is its own route:
 * /apply/[token]/[step]. Steps are saved independently, so applicants can
 * navigate back and forth (or resume later from the same URL).
 */

export type StepSlug =
  | 'personal'
  | 'household'
  | 'residence'
  | 'employment'
  | 'identity'
  | 'vehicles-pets'
  | 'contacts'
  | 'review';

export type StepDef = {
  slug: StepSlug;
  title: string;
  shortTitle: string;
  description: string;
};

export const APPLICATION_STEPS: StepDef[] = [
  {
    slug: 'personal',
    title: 'Personal information',
    shortTitle: 'Personal',
    description: 'Tell us about yourself and when you would like to move in.',
  },
  {
    slug: 'household',
    title: 'Co-applicants & occupants',
    shortTitle: 'Household',
    description: 'Add everyone who will live in the unit or co-sign the lease.',
  },
  {
    slug: 'residence',
    title: 'Residence history',
    shortTitle: 'Residences',
    description: 'Your current address is required. Add prior addresses if you can.',
  },
  {
    slug: 'employment',
    title: 'Employment & income',
    shortTitle: 'Income',
    description: 'Add your employment and upload proof of income.',
  },
  {
    slug: 'identity',
    title: 'Government ID',
    shortTitle: 'ID',
    description: 'Upload a photo of a government-issued ID.',
  },
  {
    slug: 'vehicles-pets',
    title: 'Vehicles & pets',
    shortTitle: 'Vehicles/Pets',
    description: 'List any vehicles you will park on site and any pets or service animals.',
  },
  {
    slug: 'contacts',
    title: 'Emergency contact & references',
    shortTitle: 'Contacts',
    description: 'Who should we contact in an emergency, and who can vouch for you?',
  },
  {
    slug: 'review',
    title: 'Review & submit',
    shortTitle: 'Review',
    description: 'Review everything, authorize screening, and submit your application.',
  },
];

const SLUGS = APPLICATION_STEPS.map((s) => s.slug);

export function isStepSlug(value: string): value is StepSlug {
  return (SLUGS as string[]).includes(value);
}

export function stepIndex(slug: StepSlug): number {
  return SLUGS.indexOf(slug);
}

export function stepBySlug(slug: StepSlug): StepDef {
  return APPLICATION_STEPS[stepIndex(slug)];
}

export function nextStepSlug(slug: StepSlug): StepSlug | null {
  const i = stepIndex(slug);
  return i >= 0 && i < APPLICATION_STEPS.length - 1 ? APPLICATION_STEPS[i + 1].slug : null;
}

export function prevStepSlug(slug: StepSlug): StepSlug | null {
  const i = stepIndex(slug);
  return i > 0 ? APPLICATION_STEPS[i - 1].slug : null;
}

export function stepPath(token: string, slug: StepSlug): string {
  return `/apply/${token}/${slug}`;
}

export const FIRST_STEP: StepSlug = APPLICATION_STEPS[0].slug;
