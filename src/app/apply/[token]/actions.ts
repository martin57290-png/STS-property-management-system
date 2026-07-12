'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Application } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { laDateToUtc } from '@/lib/dates';
import { formatCents, parseDollarsToCents } from '@/lib/money';
import { getSettings } from '@/lib/settings';
import { notifyContact, notifyLandlord } from '@/lib/notifications';
import { saveUpload, UploadValidationError } from '@/lib/uploads';
import { getStorage } from '@/lib/storage';
import { stepPath, type StepSlug } from '@/lib/modules/applications/steps';
import { appBaseUrl, shortUnitLabel, trackingUrl } from '@/lib/modules/applications/helpers';

// ─── Shared plumbing ─────────────────────────────────────────────────────────

/** Load the DRAFT application for a token, or bounce to the right place. */
async function requireDraft(token: string): Promise<Application> {
  const app = await prisma.application.findUnique({ where: { trackingToken: token } });
  if (!app) {
    redirect(`/apply?error=${encodeURIComponent('We could not find that application. Please start a new one.')}`);
  }
  if (app.status !== 'DRAFT') {
    // Already submitted — send the applicant to their status page.
    redirect(`/application-status?token=${token}`);
  }
  return app;
}

function str(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function strOrNull(formData: FormData, name: string): string | null {
  const value = str(formData, name);
  return value === '' ? null : value;
}

function dateOrNull(formData: FormData, name: string): Date | null {
  const value = str(formData, name);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? laDateToUtc(value) : null;
}

function centsOrNull(formData: FormData, name: string): number | null {
  const value = str(formData, name);
  return value === '' ? null : parseDollarsToCents(value);
}

function intOrNull(formData: FormData, name: string): number | null {
  const value = str(formData, name);
  if (value === '') return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function backTo(token: string, step: StepSlug, error?: string): never {
  const base = stepPath(token, step);
  revalidatePath(base);
  redirect(error ? `${base}?error=${encodeURIComponent(error)}` : base);
}

// ─── Step 1: personal info ───────────────────────────────────────────────────

export async function savePersonal(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const firstName = str(formData, 'firstName');
  const lastName = str(formData, 'lastName');
  const email = str(formData, 'email').toLowerCase();
  const phone = str(formData, 'phone');
  if (!firstName || !lastName) backTo(token, 'personal', 'First and last name are required.');
  if (!email.includes('@')) backTo(token, 'personal', 'Please enter a valid email address.');
  if (!phone) backTo(token, 'personal', 'Please enter a phone number.');

  await prisma.application.update({
    where: { id: app.id },
    data: {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth: dateOrNull(formData, 'dateOfBirth'),
      moveInDate: dateOrNull(formData, 'moveInDate'),
      monthlyIncomeCents: centsOrNull(formData, 'monthlyIncome'),
    },
  });
  backTo(token, 'household');
}

// ─── Step 2: co-applicants & occupants ───────────────────────────────────────

export async function addCoApplicant(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const firstName = str(formData, 'firstName');
  const lastName = str(formData, 'lastName');
  if (!firstName || !lastName) {
    backTo(token, 'household', 'Enter a first and last name for the co-applicant or occupant.');
  }
  await prisma.applicationCoApplicant.create({
    data: {
      applicationId: app.id,
      firstName,
      lastName,
      email: strOrNull(formData, 'email'),
      phone: strOrNull(formData, 'phone'),
      relationship: strOrNull(formData, 'relationship'),
      isOccupantOnly: formData.get('isOccupantOnly') === 'on',
    },
  });
  backTo(token, 'household');
}

export async function removeCoApplicant(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  await prisma.applicationCoApplicant.deleteMany({
    where: { id: str(formData, 'id'), applicationId: app.id },
  });
  backTo(token, 'household');
}

// ─── Step 3: residence history ───────────────────────────────────────────────

/** Persist the "Add an address" form fields as a residence row. */
async function createResidenceFromForm(
  app: { id: string },
  token: string,
  formData: FormData,
): Promise<void> {
  const street = str(formData, 'street');
  const city = str(formData, 'city');
  const state = str(formData, 'state');
  const zip = str(formData, 'zip');
  if (!street || !city || !state || !zip) {
    backTo(token, 'residence', 'Street, city, state, and ZIP are required for each address.');
  }
  const isCurrent = formData.get('isCurrent') === 'on';
  if (isCurrent) {
    // Only one current residence at a time.
    await prisma.applicationResidence.updateMany({
      where: { applicationId: app.id, isCurrent: true },
      data: { isCurrent: false },
    });
  }
  await prisma.applicationResidence.create({
    data: {
      applicationId: app.id,
      isCurrent,
      street,
      city,
      state,
      zip,
      monthlyRentCents: centsOrNull(formData, 'monthlyRent'),
      moveIn: dateOrNull(formData, 'moveIn'),
      moveOut: dateOrNull(formData, 'moveOut'),
      landlordName: strOrNull(formData, 'landlordName'),
      landlordPhone: strOrNull(formData, 'landlordPhone'),
      landlordEmail: strOrNull(formData, 'landlordEmail'),
      reasonForLeaving: strOrNull(formData, 'reasonForLeaving'),
    },
  });
}

export async function addResidence(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  await createResidenceFromForm(app, token, formData);
  backTo(token, 'residence');
}

export async function removeResidence(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  await prisma.applicationResidence.deleteMany({
    where: { id: str(formData, 'id'), applicationId: app.id },
  });
  backTo(token, 'residence');
}

/** Residence step requires at least the current address before continuing. */
export async function continueFromResidence(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);

  // If the applicant filled in the "Add an address" form and hit Continue
  // without tapping "+ Add address" first, save it for them rather than
  // bouncing them back with an error.
  const hasTypedAddress = Boolean(
    str(formData, 'street') || str(formData, 'city') || str(formData, 'zip'),
  );
  if (hasTypedAddress) {
    await createResidenceFromForm(app, token, formData);
  }

  const current = await prisma.applicationResidence.findFirst({
    where: { applicationId: app.id, isCurrent: true },
  });
  if (!current) {
    backTo(token, 'residence', 'Please add your current address (check “This is my current address”) before continuing.');
  }
  backTo(token, 'employment');
}

// ─── Step 4: employment & income ─────────────────────────────────────────────

export async function addEmployment(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const employer = str(formData, 'employer');
  if (!employer) backTo(token, 'employment', 'Employer name is required.');
  await prisma.applicationEmployment.create({
    data: {
      applicationId: app.id,
      isCurrent: formData.get('isCurrent') === 'on',
      employer,
      position: strOrNull(formData, 'position'),
      monthlyIncomeCents: centsOrNull(formData, 'monthlyIncome'),
      startDate: dateOrNull(formData, 'startDate'),
      endDate: dateOrNull(formData, 'endDate'),
      supervisorName: strOrNull(formData, 'supervisorName'),
      supervisorPhone: strOrNull(formData, 'supervisorPhone'),
    },
  });
  backTo(token, 'employment');
}

export async function removeEmployment(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  await prisma.applicationEmployment.deleteMany({
    where: { id: str(formData, 'id'), applicationId: app.id },
  });
  backTo(token, 'employment');
}

/** Upload pay stubs and/or bank statements (step 4). */
export async function uploadIncomeDocs(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const groups: { field: string; category: 'PAY_STUB' | 'BANK_STATEMENT' }[] = [
    { field: 'payStubs', category: 'PAY_STUB' },
    { field: 'bankStatements', category: 'BANK_STATEMENT' },
  ];
  let uploaded = 0;
  let error: string | null = null;
  for (const group of groups) {
    for (const entry of formData.getAll(group.field)) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      try {
        await saveUpload({
          file: entry,
          kind: 'document',
          category: group.category,
          keyPrefix: `applications/${app.id}`,
          owner: { applicationId: app.id },
        });
        uploaded += 1;
      } catch (err) {
        error =
          err instanceof UploadValidationError
            ? `${entry.name}: ${err.message}`
            : 'Upload failed. Please try again.';
      }
    }
  }
  if (uploaded > 0) {
    await audit({
      action: 'application.documents_uploaded',
      entityType: 'Application',
      entityId: app.id,
      meta: { count: uploaded, kinds: 'income proof' },
    });
  }
  if (error) backTo(token, 'employment', error);
  if (uploaded === 0) backTo(token, 'employment', 'Choose at least one file to upload.');
  backTo(token, 'employment');
}

// ─── Step 5: government ID ───────────────────────────────────────────────────

export async function uploadGovernmentId(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  let uploaded = 0;
  let error: string | null = null;
  for (const entry of formData.getAll('governmentId')) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    try {
      await saveUpload({
        file: entry,
        kind: 'document',
        category: 'GOVERNMENT_ID',
        keyPrefix: `applications/${app.id}`,
        owner: { applicationId: app.id },
      });
      uploaded += 1;
    } catch (err) {
      error =
        err instanceof UploadValidationError
          ? `${entry.name}: ${err.message}`
          : 'Upload failed. Please try again.';
    }
  }
  if (uploaded > 0) {
    await audit({
      action: 'application.documents_uploaded',
      entityType: 'Application',
      entityId: app.id,
      meta: { count: uploaded, kinds: 'government id' },
    });
  }
  if (error) backTo(token, 'identity', error);
  if (uploaded === 0) backTo(token, 'identity', 'Choose a file to upload.');
  backTo(token, 'identity');
}

/** Applicants may remove a document they uploaded while the draft is open. */
export async function removeApplicantDocument(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const step = str(formData, 'step') === 'identity' ? 'identity' : 'employment';
  const doc = await prisma.document.findFirst({
    where: {
      id: str(formData, 'id'),
      applicationId: app.id,
      category: { in: ['PAY_STUB', 'BANK_STATEMENT', 'GOVERNMENT_ID'] },
    },
  });
  if (doc) {
    await prisma.document.delete({ where: { id: doc.id } });
    try {
      await getStorage().delete(doc.storageKey);
    } catch {
      // The Document row is gone; a stray blob is harmless.
    }
  }
  backTo(token, step);
}

// ─── Step 6: vehicles & pets ─────────────────────────────────────────────────

export async function addVehicle(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const make = str(formData, 'make');
  const model = str(formData, 'model');
  if (!make || !model) backTo(token, 'vehicles-pets', 'Vehicle make and model are required.');
  await prisma.applicationVehicle.create({
    data: {
      applicationId: app.id,
      make,
      model,
      year: intOrNull(formData, 'year'),
      color: strOrNull(formData, 'color'),
      licensePlate: strOrNull(formData, 'licensePlate'),
      state: strOrNull(formData, 'state'),
    },
  });
  backTo(token, 'vehicles-pets');
}

export async function removeVehicle(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  await prisma.applicationVehicle.deleteMany({
    where: { id: str(formData, 'id'), applicationId: app.id },
  });
  backTo(token, 'vehicles-pets');
}

export async function addPet(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const type = str(formData, 'type');
  if (!type) backTo(token, 'vehicles-pets', 'Pet type is required (e.g. dog, cat).');
  await prisma.applicationPet.create({
    data: {
      applicationId: app.id,
      type,
      breed: strOrNull(formData, 'breed'),
      name: strOrNull(formData, 'name'),
      weightLbs: intOrNull(formData, 'weightLbs'),
      age: intOrNull(formData, 'age'),
      isServiceAnimal: formData.get('isServiceAnimal') === 'on',
    },
  });
  backTo(token, 'vehicles-pets');
}

export async function removePet(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  await prisma.applicationPet.deleteMany({
    where: { id: str(formData, 'id'), applicationId: app.id },
  });
  backTo(token, 'vehicles-pets');
}

// ─── Step 7: emergency contact & references ──────────────────────────────────

export async function addEmergencyContact(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const name = str(formData, 'name');
  const phone = str(formData, 'phone');
  if (!name || !phone) backTo(token, 'contacts', 'Emergency contact name and phone are required.');
  await prisma.applicationEmergencyContact.create({
    data: {
      applicationId: app.id,
      name,
      phone,
      relationship: strOrNull(formData, 'relationship'),
      email: strOrNull(formData, 'email'),
    },
  });
  backTo(token, 'contacts');
}

export async function removeEmergencyContact(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  await prisma.applicationEmergencyContact.deleteMany({
    where: { id: str(formData, 'id'), applicationId: app.id },
  });
  backTo(token, 'contacts');
}

export async function addReference(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  const name = str(formData, 'name');
  if (!name) backTo(token, 'contacts', 'Reference name is required.');
  await prisma.applicationReference.create({
    data: {
      applicationId: app.id,
      name,
      relationship: strOrNull(formData, 'relationship'),
      phone: strOrNull(formData, 'phone'),
      email: strOrNull(formData, 'email'),
    },
  });
  backTo(token, 'contacts');
}

export async function removeReference(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);
  await prisma.applicationReference.deleteMany({
    where: { id: str(formData, 'id'), applicationId: app.id },
  });
  backTo(token, 'contacts');
}

// ─── Step 8: review, screening consent, submit ───────────────────────────────

export async function submitApplication(token: string, formData: FormData): Promise<void> {
  const app = await requireDraft(token);

  const consented = formData.get('consent') === 'on';
  const signatureName = str(formData, 'signatureName');
  if (!consented) {
    backTo(token, 'review', 'Please check the screening authorization box to continue.');
  }
  if (signatureName.length < 3) {
    backTo(token, 'review', 'Please type your full legal name as your signature.');
  }

  const currentResidence = await prisma.applicationResidence.findFirst({
    where: { applicationId: app.id, isCurrent: true },
  });
  if (!currentResidence) {
    backTo(token, 'review', 'Your current address is missing — please complete the Residence history step.');
  }

  const forwardedFor = headers().get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  const now = new Date();

  const updated = await prisma.application.update({
    where: { id: app.id },
    data: {
      status: 'SUBMITTED',
      submittedAt: now,
      screeningConsentAt: now,
      screeningConsentName: signatureName,
      screeningConsentIp: ip,
    },
    include: { unit: { include: { property: true } } },
  });

  await audit({
    action: 'application.submitted',
    entityType: 'Application',
    entityId: app.id,
    meta: { unitId: updated.unitId, email: updated.email, consentIp: ip, consentName: signatureName },
  });

  const settings = await getSettings();
  const unit = shortUnitLabel(updated.unit);
  const link = trackingUrl(token);

  await notifyContact({
    email: updated.email,
    phone: updated.phone,
    event: 'APPLICATION_RECEIVED',
    subject: `We received your application for ${unit}`,
    body:
      `Hi ${updated.firstName},\n\nThank you — your rental application for ${unit} has been received ` +
      `and will be reviewed shortly.\n\nAn application screening fee of ` +
      `${formatCents(settings.applicationFeeCents)} is due and payable upon screening; you will ` +
      `receive an itemized receipt as required by California Civil Code § 1950.6.\n\n` +
      `Track your application status any time:\n${link}\n\nKeep this link — it is your private ` +
      `tracking code.\n\n— STS Property Management`,
    smsBody: `STS: we received your application for ${unit}. Track it here: ${link}`,
  });

  await notifyLandlord({
    event: 'APPLICATION_RECEIVED',
    subject: `New application: ${updated.firstName} ${updated.lastName} — ${unit}`,
    body:
      `A new rental application was submitted.\n\nApplicant: ${updated.firstName} ${updated.lastName}\n` +
      `Unit: ${unit}\nEmail: ${updated.email}\nPhone: ${updated.phone}\nStated monthly income: ` +
      `${updated.monthlyIncomeCents != null ? formatCents(updated.monthlyIncomeCents) : 'not provided'}\n\n` +
      `Review it: ${appBaseUrl()}/admin/applications/${updated.id}`,
    smsBody: `STS: new application from ${updated.firstName} ${updated.lastName} for ${unit}.`,
  });

  redirect(`/application-status?token=${token}&submitted=1`);
}
