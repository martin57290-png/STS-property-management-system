/**
 * STS Property Management Systems — demo seed.
 *
 * Populates a fresh database with a realistic portfolio for a single
 * California landlord: 5 properties / 40 units, 34 active tenancies with
 * three months of ledger history, applications in every state, work orders
 * across the whole lifecycle, inspections, and a draft deposit disposition.
 *
 * Run with:  npm run db:seed   (executes `tsx prisma/seed.ts`)
 *
 * The script assumes it may be re-run: it starts by deleting all rows in
 * FK-dependency order. All data is deterministic (no randomness) except that
 * dates are anchored to "today" so dashboards, delinquency aging, lease
 * expiration buckets, and work-order escalation always look alive.
 */
import { PrismaClient } from '@prisma/client';
import type {
  ApplicationStatus,
  InspectionStatus,
  ItemCondition,
  PaymentMethod,
  Unit,
} from '@prisma/client';
import { hashSync } from 'bcryptjs';
import { DEFAULT_CA_LEASE_TEMPLATE } from '../src/lib/modules/leases/default-template';
import { buildDefaultChecklist } from '../src/lib/modules/inspections/checklist';
import type { ChecklistEntry } from '../src/lib/modules/inspections/checklist';
import { fmt, laDateToUtc, toDateInputValue } from '../src/lib/dates';

const prisma = new PrismaClient();

// ─── Small date helpers (LA calendar, deterministic) ─────────────────────────

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY_MS);

/** Today's date on the LA calendar as yyyy-MM-dd. */
const TODAY_YMD = toDateInputValue(new Date());
const TODAY_DAY = Number(TODAY_YMD.slice(8, 10));

/** Shift a yyyy-MM-dd string by whole days/months (pure calendar math). */
function ymdShift(ymd: string, delta: { days?: number; months?: number }): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + (delta.months ?? 0), d + (delta.days ?? 0)));
  return dt.toISOString().slice(0, 10);
}

/** yyyy-MM-01 for the current LA month shifted by `offset` months. */
function monthStartYmd(offset: number): string {
  return ymdShift(`${TODAY_YMD.slice(0, 7)}-01`, { months: offset });
}

/** yyyy-MM-dd (midnight LA) → UTC Date for storage. */
const la = laDateToUtc;

// ─── Portfolio spec ──────────────────────────────────────────────────────────

type UnitSpec = {
  no: string;
  bd: number;
  ba: number;
  sqft: number;
  /** Market rent in whole dollars. */
  rent: number;
  /** Deposit in whole dollars; defaults to one month's rent (AB 12 cap). */
  deposit?: number;
  /** Vacant + listed for applications. */
  vacant?: boolean;
  /** Approved applicant moving in soon (PENDING tenancy). */
  pending?: boolean;
  /** Recently ended tenancy (unit is vacant + listed, with move-out in progress). */
  ended?: boolean;
  appliances?: boolean;
};

type PropertySpec = {
  name: string;
  street: string;
  city: string;
  zip: string;
  yearBuilt: number;
  notes?: string;
  units: UnitSpec[];
};

function u(
  no: string,
  bd: number,
  ba: number,
  sqft: number,
  rent: number,
  extra: Partial<UnitSpec> = {},
): UnitSpec {
  return { no, bd, ba, sqft, rent, ...extra };
}

const PROPERTIES: PropertySpec[] = [
  {
    name: 'Sunset Court Apartments',
    street: '1284 W Sunset Blvd',
    city: 'Los Angeles',
    zip: '90026',
    yearBuilt: 1972,
    notes: 'Pre-1978 construction — lead-based paint disclosure required on every lease.',
    units: [
      u('101', 1, 1, 640, 1695),
      u('102', 1, 1, 640, 1725),
      u('103', 2, 1, 860, 2150, { deposit: 2000 }),
      u('104', 1, 1, 655, 1675, { ended: true, deposit: 1600 }),
      u('201', 1, 1, 640, 1710),
      u('202', 2, 1, 860, 2195),
      u('203', 1, 1, 620, 1650, { deposit: 1500 }),
      u('204', 2, 1, 875, 2250, { appliances: true }),
      u('301', 1, 1, 640, 1740),
      u('302', 2, 1, 860, 2225),
      u('303', 1, 1, 620, 1665),
      u('304', 2, 1.5, 900, 2295, { appliances: true }),
    ],
  },
  {
    name: 'Harbor View Flats',
    street: '245 E Ocean Blvd',
    city: 'Long Beach',
    zip: '90802',
    yearBuilt: 1988,
    units: [
      u('101', 0, 1, 480, 1450),
      u('102', 1, 1, 610, 1595),
      u('103', 1, 1, 610, 1620),
      u('104', 2, 2, 940, 2350, { deposit: 2200 }),
      u('105', 1, 1, 625, 1640),
      u('201', 0, 1, 480, 1475, { deposit: 1400 }),
      u('202', 1, 1, 610, 1615),
      u('203', 2, 2, 940, 2395, { vacant: true, appliances: true }),
      u('204', 1, 1, 625, 1655),
      u('205', 2, 2, 980, 2450, { appliances: true }),
    ],
  },
  {
    name: 'Colorado Commons',
    street: '1830 E Colorado Blvd',
    city: 'Pasadena',
    zip: '91107',
    yearBuilt: 2001,
    units: [
      u('1', 2, 2, 1050, 2650, { appliances: true }),
      u('2', 1, 1, 700, 2050, { appliances: true }),
      u('3', 2, 2, 1050, 2600, { vacant: true, appliances: true }),
      u('4', 2, 2.5, 1180, 2850, { appliances: true }),
      u('5', 1, 1, 700, 2095),
      u('6', 2, 2, 1050, 2675, { deposit: 2500 }),
      u('7', 1, 1, 720, 2125, { pending: true, appliances: true }),
      u('8', 3, 2, 1320, 3200, { appliances: true }),
    ],
  },
  {
    name: 'Magnolia Bungalows',
    street: '4522 Magnolia Ave',
    city: 'Long Beach',
    zip: '90806',
    units: [
      u('A', 2, 1, 900, 2450),
      u('B', 2, 1, 900, 2425),
      u('C', 3, 2, 1240, 2895, { deposit: 2750 }),
      u('D', 2, 1, 920, 2475, { vacant: true }),
      u('E', 3, 2, 1240, 2950),
      u('F', 2, 1, 900, 2400),
    ],
    yearBuilt: 1995,
  },
  {
    name: 'Vermont Terrace',
    street: '3671 S Vermont Ave',
    city: 'Los Angeles',
    zip: '90007',
    yearBuilt: 2015,
    units: [
      u('1', 3, 2, 1280, 3500, { appliances: true }),
      u('2', 2, 2, 1080, 2950, { pending: true, appliances: true }),
      u('3', 3, 2, 1280, 3600, { appliances: true }),
      u('4', 3, 2.5, 1400, 3800, { appliances: true }),
    ],
  },
];

function applianceInventory(yearBuilt: number) {
  const condition = yearBuilt >= 2000 ? 'Good' : 'Fair';
  return [
    { name: 'Refrigerator', brand: 'Whirlpool', model: 'WRT518SZFM', condition },
    { name: 'Range/Oven', brand: 'GE', model: 'JB645RKSS', condition },
    { name: 'Dishwasher', brand: 'Bosch', model: 'SHE3AR75UC', condition },
    { name: 'Microwave (over-range)', brand: 'GE', model: 'JVM3160RFSS', condition: 'Good' },
  ];
}

// ─── People ──────────────────────────────────────────────────────────────────

/** 0–33: primary tenants of the 34 active tenancies (in unit order). */
const PRIMARY_TENANTS: [string, string][] = [
  ['Maria', 'Gonzalez'],
  ['David', 'Kim'],
  ['Diego', 'Ramos'],
  ['Aisha', 'Thompson'],
  ['Robert', 'Chen'],
  ['Emily', 'Novak'],
  ['Marcus', 'Webb'],
  ['Fatima', 'Hassan'],
  ['Kevin', "O'Brien"],
  ['Hannah', 'Lee'],
  ['Victor', 'Osei'],
  ['Grace', 'Park'],
  ['Tomas', 'Herrera'],
  ['Nina', 'Petrova'],
  ['Jordan', 'Ellis'],
  ['Leila', 'Farouk'],
  ['Sean', 'Murphy'],
  ['Priyanka', 'Shah'],
  ['Caleb', 'Turner'],
  ['Rosa', 'Martinez'],
  ['Andre', 'Boyd'],
  ['Mei', 'Lin'],
  ['Oscar', 'Vidal'],
  ['Tara', 'Singh'],
  ['Felix', 'Wagner'],
  ['Dana', 'Wolfe'],
  ['Hugo', 'Silva'],
  ['Ivy', 'Nakamura'],
  ['Logan', 'Price'],
  ['Zoe', 'Adler'],
  ['Samir', 'Patel'],
  ['Carmen', 'Reyes'],
  ['Ethan', 'Brooks'],
  ['Alicia', 'Fontaine'],
];

/** Co-tenants on two of the larger units (active tenancy index → person). */
const CO_TENANTS: Record<number, [string, string]> = {
  2: ['Lucia', 'Ramos'], // Sunset 103 (2 BR)
  14: ['Casey', 'Ellis'], // Harbor View 104 (2 BR / 2 BA)
};

const PENDING_TENANTS: [string, string][] = [
  ['Nathan', 'Cole'], // Colorado Commons 7 — approved application, move-in next week
  ['Olivia', 'Chen'], // Vermont Terrace 2 — move-in in two weeks
];

const FORMER_TENANT: [string, string] = ['Brandon', 'Yates']; // Sunset 104, moved out

function emailFor([first, last]: [string, string]): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  return `${slug(first)}.${slug(last)}@example.com`;
}

// ─── Ledger / lease scenario assignments (by active-tenancy index) ───────────

/** Long-standing tenants: tenancy started ~18 months ago; first lease renewed. */
const RENEWAL_IDX = new Set([0, 5, 10]);
/** Lease end dates near-term (days from today) for the dashboard buckets. */
const EXPIRING_DAYS: Record<number, number> = { 1: 32, 2: 45, 3: 58, 4: 68, 6: 78, 7: 88 };
/** Autopay enrollments (ACH on the 1st). */
const AUTOPAY_IDX = [0, 3];
/** Delinquency scenarios. */
const RETURNED_IDX = 8; // ACH returned last month, then repaid by card
const PROCESSING_IDX = 12; // this month's ACH payment still clearing
const UNPAID_IDX = new Set([16, 20]); // no payment this month (16 also missed last month + late fee)
const PARTIAL_IDX = new Set([24, 28]); // partial payment this month

function disclosuresJson(leadPaintRequired: boolean) {
  return {
    leadPaint: {
      required: leadPaintRequired,
      confirmed: leadPaintRequired,
      label: 'Lead-based paint disclosure (pre-1978 housing)',
    },
    bedBugs: { required: true, confirmed: true, label: 'Bed bug information (Civ. Code § 1954.603)' },
    mold: {
      required: true,
      confirmed: true,
      label: 'Mold booklet & disclosure (Health & Safety Code § 26147)',
    },
    megansLaw: {
      required: true,
      confirmed: true,
      label: 'Megan’s Law database notice (Penal Code § 290.46)',
    },
    floodZone: {
      required: false,
      confirmed: false,
      label: 'Flood hazard area disclosure (Gov. Code § 8589.45)',
    },
  };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  // Children first; models with onDelete: Cascade are removed via their parent.
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.document.deleteMany();
  await prisma.workOrder.deleteMany(); // cascades comments + WO documents
  await prisma.vendor.deleteMany();
  await prisma.depositDisposition.deleteMany(); // cascades deductions
  await prisma.inspection.deleteMany(); // cascades items
  await prisma.ledgerEntry.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.autopayEnrollment.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.leaseTemplate.deleteMany();
  await prisma.application.deleteMany(); // cascades all application sub-tables
  await prisma.tenancy.deleteMany(); // cascades TenancyTenant
  await prisma.unit.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSetting.deleteMany();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Seeding STS Property Management Systems demo data…');
  await cleanup();

  // ── Users ──────────────────────────────────────────────────────────────────
  const landlord = await prisma.user.create({
    data: {
      email: 'admin@stspm.com',
      passwordHash: hashSync('admin1234', 10),
      name: 'Sam T. Sterling',
      phone: '(213) 555-0199',
      role: 'LANDLORD',
    },
  });

  const tenantHash = hashSync('tenant1234', 10);
  const allTenantPeople: [string, string][] = [
    ...PRIMARY_TENANTS,
    ...Object.values(CO_TENANTS),
    ...PENDING_TENANTS,
    FORMER_TENANT,
  ];
  const tenantUsers = new Map<string, { id: string; name: string; email: string }>();
  let phoneSeq = 100;
  for (const person of allTenantPeople) {
    const email = emailFor(person);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: tenantHash,
        name: `${person[0]} ${person[1]}`,
        phone: `(213) 555-0${phoneSeq++}`,
        role: 'TENANT',
      },
    });
    tenantUsers.set(email, { id: user.id, name: user.name, email: user.email });
  }
  const tenant = (person: [string, string]) => {
    const found = tenantUsers.get(emailFor(person));
    if (!found) throw new Error(`Seed bug: tenant user not found for ${person.join(' ')}`);
    return found;
  };

  // ── Properties & units ─────────────────────────────────────────────────────
  const unitsByProp: (Unit & { spec: UnitSpec })[][] = [];
  for (const spec of PROPERTIES) {
    const property = await prisma.property.create({
      data: {
        name: spec.name,
        street: spec.street,
        city: spec.city,
        state: 'CA',
        zip: spec.zip,
        yearBuilt: spec.yearBuilt,
        notes: spec.notes,
        units: {
          create: spec.units.map((unitSpec) => ({
            unitNumber: unitSpec.no,
            bedrooms: unitSpec.bd,
            bathrooms: unitSpec.ba,
            sqft: unitSpec.sqft,
            marketRentCents: unitSpec.rent * 100,
            depositCents: (unitSpec.deposit ?? unitSpec.rent) * 100,
            isListed: Boolean(unitSpec.vacant || unitSpec.ended),
            applianceInventory: unitSpec.appliances
              ? applianceInventory(spec.yearBuilt)
              : undefined,
            notes:
              unitSpec.vacant || unitSpec.ended
                ? 'Vacant — listed and accepting applications.'
                : undefined,
          })),
        },
      },
      include: { units: true },
    });
    unitsByProp.push(
      spec.units.map((unitSpec) => {
        const row = property.units.find((unitRow) => unitRow.unitNumber === unitSpec.no);
        if (!row) throw new Error(`Seed bug: unit ${spec.name} ${unitSpec.no} missing`);
        return Object.assign(row, { spec: unitSpec });
      }),
    );
  }
  const unitAt = (propIdx: number, no: string) => {
    const row = unitsByProp[propIdx].find((candidate) => candidate.unitNumber === no);
    if (!row) throw new Error(`Seed bug: no unit ${no} in property ${propIdx}`);
    return row;
  };

  // ── Default lease template ─────────────────────────────────────────────────
  const template = await prisma.leaseTemplate.create({
    data: {
      name: DEFAULT_CA_LEASE_TEMPLATE.name,
      body: DEFAULT_CA_LEASE_TEMPLATE.body,
      isDefault: true,
    },
  });

  // ── Active tenancies, leases, ledger history ───────────────────────────────
  type ActiveRef = {
    idx: number;
    tenancyId: string;
    unit: Unit & { spec: UnitSpec };
    rentCents: number;
    user: { id: string; name: string; email: string };
    label: string;
  };
  const active: ActiveRef[] = [];
  let paymentSeq = 0;

  /** Create a SUCCEEDED payment + its linked PAYMENT ledger entry. */
  async function succeededPayment(params: {
    tenancyId: string;
    amountCents: number;
    method: PaymentMethod;
    date: Date;
    isAutopay?: boolean;
  }): Promise<void> {
    const payment = await prisma.payment.create({
      data: {
        tenancyId: params.tenancyId,
        amountCents: params.amountCents,
        method: params.method,
        status: 'SUCCEEDED',
        providerId: `seed_pi_${++paymentSeq}`,
        isAutopay: params.isAutopay ?? false,
        createdAt: params.date,
      },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenancyId: params.tenancyId,
        type: 'PAYMENT',
        category: 'RENT',
        amountCents: params.amountCents,
        description: `${params.method === 'ACH' ? 'ACH' : 'Card'} payment received${
          params.isAutopay ? ' (autopay)' : ''
        }`,
        effectiveDate: params.date,
        paymentId: payment.id,
        createdAt: params.date,
      },
    });
  }

  let activeIdx = 0;
  for (let propIdx = 0; propIdx < PROPERTIES.length; propIdx++) {
    for (const unitRow of unitsByProp[propIdx]) {
      const { spec } = unitRow;
      if (spec.vacant || spec.pending || spec.ended) continue;
      const i = activeIdx++;
      const primary = tenant(PRIMARY_TENANTS[i]);
      const rentCents = unitRow.marketRentCents;
      const depositCents = Math.min(unitRow.depositCents, rentCents); // AB 12 cap

      // Lease term. Renewals: tenancy started ~18 months ago, current lease is
      // a 12-month renewal. Expiring: end date lands in the 60/90-day buckets.
      let leaseStartYmd: string;
      let leaseEndYmd: string;
      if (RENEWAL_IDX.has(i)) {
        leaseStartYmd = monthStartYmd(-6 - (i % 3));
        leaseEndYmd = ymdShift(leaseStartYmd, { months: 12 });
      } else if (EXPIRING_DAYS[i] !== undefined) {
        leaseEndYmd = ymdShift(TODAY_YMD, { days: EXPIRING_DAYS[i] });
        leaseStartYmd = ymdShift(leaseEndYmd, { months: -12 });
      } else {
        leaseStartYmd = monthStartYmd(-(4 + (i % 8)));
        leaseEndYmd = ymdShift(leaseStartYmd, { months: 12 });
      }
      const tenancyStartYmd = RENEWAL_IDX.has(i)
        ? ymdShift(leaseStartYmd, { months: -12 })
        : leaseStartYmd;

      const coPerson = CO_TENANTS[i];
      const tenancy = await prisma.tenancy.create({
        data: {
          unitId: unitRow.id,
          status: 'ACTIVE',
          startDate: la(tenancyStartYmd),
          rentCents,
          depositCents,
          rentDueDay: 1,
          createdAt: la(tenancyStartYmd),
          tenants: {
            create: [
              { userId: primary.id, isPrimary: true },
              ...(coPerson ? [{ userId: tenant(coPerson).id, isPrimary: false }] : []),
            ],
          },
        },
      });

      const leadPaint = PROPERTIES[propIdx].yearBuilt < 1978;
      const hasLateFee = i % 5 !== 4;
      const utilities = i % 3 === 0 ? ['water', 'trash'] : i % 3 === 1 ? ['trash'] : [];
      const hasPet = i === 14 || i === 21 || i === 26;

      let renewedFromId: string | null = null;
      if (RENEWAL_IDX.has(i)) {
        const priorLease = await prisma.lease.create({
          data: {
            tenancyId: tenancy.id,
            templateId: template.id,
            status: 'EXPIRED',
            startDate: la(tenancyStartYmd),
            endDate: la(leaseStartYmd),
            rentCents: rentCents - 10_000,
            depositCents: Math.min(depositCents, rentCents - 10_000),
            lateFeeCents: hasLateFee ? 7_500 : null,
            lateFeeGraceDays: hasLateFee ? 3 : null,
            utilitiesIncluded: utilities,
            disclosures: disclosuresJson(leadPaint),
            createdAt: la(ymdShift(tenancyStartYmd, { days: -14 })),
          },
        });
        renewedFromId = priorLease.id;
      }

      await prisma.lease.create({
        data: {
          tenancyId: tenancy.id,
          templateId: template.id,
          status: 'ACTIVE',
          startDate: la(leaseStartYmd),
          endDate: la(leaseEndYmd),
          rentCents,
          depositCents,
          lateFeeCents: hasLateFee ? 7_500 : null,
          lateFeeGraceDays: hasLateFee ? 3 : null,
          utilitiesIncluded: utilities,
          petTerms: hasPet
            ? 'Landlord authorizes one cat (indoor, spayed/neutered) disclosed on the rental application, and no others.'
            : null,
          petRentCents: hasPet ? 5_000 : null,
          disclosures: disclosuresJson(leadPaint),
          isRenewal: renewedFromId !== null,
          renewedFromId,
          createdAt: la(ymdShift(leaseStartYmd, { days: -14 })),
        },
      });

      // Three months of rent charges (current month + two prior).
      for (const m of [-2, -1, 0]) {
        const chargeDate = la(monthStartYmd(m));
        await prisma.ledgerEntry.create({
          data: {
            tenancyId: tenancy.id,
            type: 'CHARGE',
            category: 'RENT',
            amountCents: rentCents,
            description: `Rent — ${fmt(chargeDate, 'MMMM yyyy')}`,
            effectiveDate: chargeDate,
            createdAt: chargeDate,
          },
        });
      }

      // Payments with realistic variety.
      const isAutopay = AUTOPAY_IDX.includes(i);
      const method: PaymentMethod = isAutopay ? 'ACH' : i % 3 === 0 ? 'CARD' : 'ACH';
      const baseDay = isAutopay ? 1 : 1 + (i % 5);
      /** Payment date within month `m` (clamped so nothing lands in the future). */
      const payDate = (m: number, day: number) =>
        la(ymdShift(monthStartYmd(m), { days: (m === 0 ? Math.min(day, TODAY_DAY) : day) - 1 }));

      for (const m of [-2, -1, 0]) {
        if (i === RETURNED_IDX && m === -1) {
          // ACH payment settled, then returned by the bank; repaid by card.
          const returned = await prisma.payment.create({
            data: {
              tenancyId: tenancy.id,
              amountCents: rentCents,
              method: 'ACH',
              status: 'RETURNED',
              providerId: `seed_pi_${++paymentSeq}`,
              failureReason: 'R01 — insufficient funds (ACH return)',
              createdAt: payDate(m, 1),
            },
          });
          await prisma.ledgerEntry.create({
            data: {
              tenancyId: tenancy.id,
              type: 'PAYMENT',
              category: 'RENT',
              amountCents: rentCents,
              description: 'ACH payment received',
              effectiveDate: payDate(m, 1),
              paymentId: returned.id,
              createdAt: payDate(m, 1),
            },
          });
          await prisma.ledgerEntry.create({
            data: {
              tenancyId: tenancy.id,
              type: 'CHARGE',
              category: 'OTHER',
              amountCents: rentCents,
              description: 'ACH payment returned (R01 — insufficient funds)',
              effectiveDate: payDate(m, 5),
              paymentId: returned.id,
              createdAt: payDate(m, 5),
            },
          });
          await succeededPayment({
            tenancyId: tenancy.id,
            amountCents: rentCents,
            method: 'CARD',
            date: payDate(m, 8),
          });
          continue;
        }
        if (i === PROCESSING_IDX && m === 0) {
          // This month's ACH payment is still clearing. providerId uses the
          // mock_ prefix so the /admin/payments/simulator can clear/fail it.
          await prisma.payment.create({
            data: {
              tenancyId: tenancy.id,
              amountCents: rentCents,
              method: 'ACH',
              status: 'PROCESSING',
              providerId: `mock_seed_pi_${++paymentSeq}`,
              createdAt: payDate(0, 2),
            },
          });
          continue;
        }
        if (i === 16 && (m === 0 || m === -1)) continue; // two months behind
        if (UNPAID_IDX.has(i) && m === 0) continue; // current month unpaid
        if (PARTIAL_IDX.has(i) && m === 0) {
          await succeededPayment({
            tenancyId: tenancy.id,
            amountCents: Math.round(rentCents * 0.6),
            method,
            date: payDate(0, baseDay),
          });
          continue;
        }
        await succeededPayment({
          tenancyId: tenancy.id,
          amountCents: rentCents,
          method,
          date: payDate(m, baseDay),
          isAutopay,
        });
      }

      // Late fee for the tenancy that also missed last month.
      if (i === 16) {
        await prisma.ledgerEntry.create({
          data: {
            tenancyId: tenancy.id,
            type: 'CHARGE',
            category: 'LATE_FEE',
            amountCents: 7_500,
            description: `Late fee — ${fmt(la(monthStartYmd(-1)), 'MMMM yyyy')} rent`,
            effectiveDate: la(ymdShift(monthStartYmd(-1), { days: 4 })),
            createdAt: la(ymdShift(monthStartYmd(-1), { days: 4 })),
          },
        });
      }

      active.push({
        idx: i,
        tenancyId: tenancy.id,
        unit: unitRow,
        rentCents,
        user: primary,
        label: `${PROPERTIES[propIdx].name} #${unitRow.unitNumber}`,
      });
    }
  }
  const activeAt = (i: number) => {
    const found = active.find((ref) => ref.idx === i);
    if (!found) throw new Error(`Seed bug: no active tenancy at index ${i}`);
    return found;
  };

  // ── Autopay enrollments ────────────────────────────────────────────────────
  for (const i of AUTOPAY_IDX) {
    const ref = activeAt(i);
    await prisma.autopayEnrollment.create({
      data: {
        tenancyId: ref.tenancyId,
        userId: ref.user.id,
        dayOfMonth: 1,
        method: 'ACH',
        active: true,
      },
    });
  }

  // ── Ended tenancy (Sunset 104 — Brandon Yates moved out 10 days ago) ───────
  const endedUnit = unitAt(0, '104');
  const former = tenant(FORMER_TENANT);
  const endedStartYmd = monthStartYmd(-14);
  const endedTenancy = await prisma.tenancy.create({
    data: {
      unitId: endedUnit.id,
      status: 'ENDED',
      startDate: la(endedStartYmd),
      endDate: daysAgo(10),
      rentCents: endedUnit.marketRentCents,
      depositCents: Math.min(endedUnit.depositCents, endedUnit.marketRentCents),
      rentDueDay: 1,
      createdAt: la(endedStartYmd),
      tenants: { create: [{ userId: former.id, isPrimary: true }] },
    },
  });
  await prisma.lease.create({
    data: {
      tenancyId: endedTenancy.id,
      templateId: template.id,
      status: 'EXPIRED',
      startDate: la(endedStartYmd),
      endDate: la(ymdShift(endedStartYmd, { months: 12 })),
      rentCents: endedUnit.marketRentCents,
      depositCents: Math.min(endedUnit.depositCents, endedUnit.marketRentCents),
      lateFeeCents: 7_500,
      lateFeeGraceDays: 3,
      utilitiesIncluded: ['trash'],
      disclosures: disclosuresJson(true),
      createdAt: la(ymdShift(endedStartYmd, { days: -10 })),
    },
  });

  // ── Pending move-ins ───────────────────────────────────────────────────────
  const pendingSpecs = [
    { unit: unitAt(2, '7'), person: PENDING_TENANTS[0], moveInDays: 7 },
    { unit: unitAt(4, '2'), person: PENDING_TENANTS[1], moveInDays: 14 },
  ];
  const pendingTenancies: { tenancyId: string; unit: Unit; userId: string; moveIn: Date }[] = [];
  for (const p of pendingSpecs) {
    const user = tenant(p.person);
    const moveInYmd = ymdShift(TODAY_YMD, { days: p.moveInDays });
    const tenancy = await prisma.tenancy.create({
      data: {
        unitId: p.unit.id,
        status: 'PENDING',
        startDate: la(moveInYmd),
        rentCents: p.unit.marketRentCents,
        depositCents: Math.min(p.unit.depositCents, p.unit.marketRentCents),
        rentDueDay: 1,
        tenants: { create: [{ userId: user.id, isPrimary: true }] },
      },
    });
    pendingTenancies.push({
      tenancyId: tenancy.id,
      unit: p.unit,
      userId: user.id,
      moveIn: la(moveInYmd),
    });
  }

  // ── Applications ───────────────────────────────────────────────────────────
  const harbor203 = unitAt(1, '203'); // two SUBMITTED apps → compare view
  const colorado3 = unitAt(2, '3');

  const consent = (name: string, days: number) => ({
    screeningConsentAt: daysAgo(days),
    screeningConsentIp: '203.0.113.24',
    screeningConsentName: name,
  });
  const fee = (n: number, days: number) => ({
    feeCents: 5_000,
    feePaidAt: daysAgo(days),
    feePaymentRef: `seed_fee_${n}`,
  });

  await prisma.application.create({
    data: {
      unitId: harbor203.id,
      status: 'SUBMITTED' satisfies ApplicationStatus,
      trackingToken: 'trk_whitfield_demo',
      firstName: 'James',
      lastName: 'Whitfield',
      email: 'james.whitfield@example.com',
      phone: '(562) 555-0141',
      dateOfBirth: la('1991-06-04'),
      monthlyIncomeCents: 720_000,
      moveInDate: daysFromNow(21),
      ...consent('James Whitfield', 2),
      ...fee(1, 2),
      submittedAt: daysAgo(2),
      createdAt: daysAgo(3),
      residences: {
        create: [
          {
            isCurrent: true,
            street: '812 Cherry Ave, Apt 4',
            city: 'Long Beach',
            state: 'CA',
            zip: '90813',
            monthlyRentCents: 185_000,
            moveIn: la('2022-05-01'),
            landlordName: 'Karen Doyle',
            landlordPhone: '(562) 555-0177',
            reasonForLeaving: 'Looking for a larger unit closer to work.',
          },
        ],
      },
      employments: {
        create: [
          {
            isCurrent: true,
            employer: 'Delta Dental of California',
            position: 'Senior claims analyst',
            monthlyIncomeCents: 720_000,
            startDate: la('2019-02-11'),
            supervisorName: 'Renee Alvarado',
            supervisorPhone: '(562) 555-0163',
          },
        ],
      },
      vehicles: { create: [{ make: 'Toyota', model: 'Camry', year: 2019, color: 'Silver', licensePlate: '8KXR441', state: 'CA' }] },
      references: { create: [{ name: 'Curtis Mayfield', relationship: 'Former supervisor', phone: '(562) 555-0102' }] },
      emergencyContacts: { create: [{ name: 'Donna Whitfield', relationship: 'Mother', phone: '(626) 555-0170' }] },
    },
  });

  await prisma.application.create({
    data: {
      unitId: harbor203.id,
      status: 'SUBMITTED',
      trackingToken: 'trk_raman_demo',
      firstName: 'Priya',
      lastName: 'Raman',
      email: 'priya.raman@example.com',
      phone: '(562) 555-0148',
      dateOfBirth: la('1994-03-12'),
      monthlyIncomeCents: 610_000,
      moveInDate: daysFromNow(30),
      ...consent('Priya Raman', 1),
      ...fee(2, 1),
      submittedAt: daysAgo(1),
      createdAt: daysAgo(2),
      residences: {
        create: [
          {
            isCurrent: true,
            street: '3300 E Broadway, Unit 12',
            city: 'Long Beach',
            state: 'CA',
            zip: '90803',
            monthlyRentCents: 172_500,
            moveIn: la('2021-08-15'),
            landlordName: 'Pacific Shore Property Mgmt',
            landlordPhone: '(562) 555-0155',
            reasonForLeaving: 'Current building is being sold.',
          },
        ],
      },
      employments: {
        create: [
          {
            isCurrent: true,
            employer: 'Long Beach Unified School District',
            position: 'Teacher',
            monthlyIncomeCents: 610_000,
            startDate: la('2018-08-20'),
          },
        ],
      },
      pets: { create: [{ type: 'Cat', breed: 'Domestic shorthair', name: 'Mochi', weightLbs: 9, age: 4 }] },
      references: { create: [{ name: 'Alan Reyes', relationship: 'Colleague', phone: '(562) 555-0119' }] },
    },
  });

  const underReview = await prisma.application.create({
    data: {
      unitId: colorado3.id,
      status: 'UNDER_REVIEW',
      trackingToken: 'trk_okafor_demo',
      firstName: 'Daniel',
      lastName: 'Okafor',
      email: 'daniel.okafor@example.com',
      phone: '(626) 555-0132',
      dateOfBirth: la('1989-11-23'),
      monthlyIncomeCents: 830_000,
      moveInDate: daysFromNow(25),
      ...consent('Daniel Okafor', 6),
      ...fee(3, 6),
      submittedAt: daysAgo(6),
      createdAt: daysAgo(8),
      coApplicants: {
        create: [
          {
            firstName: 'Erin',
            lastName: 'Okafor',
            email: 'erin.okafor@example.com',
            phone: '(626) 555-0133',
            relationship: 'Spouse',
            isOccupantOnly: false,
          },
        ],
      },
      residences: {
        create: [
          {
            isCurrent: true,
            street: '77 N Hill Ave, Apt 210',
            city: 'Pasadena',
            state: 'CA',
            zip: '91106',
            monthlyRentCents: 232_500,
            moveIn: la('2022-03-01'),
            landlordName: 'Hillcrest Residential LLC',
            landlordPhone: '(626) 555-0164',
            landlordEmail: 'mgr@hillcrestres.example.com',
            reasonForLeaving: 'Want in-unit laundry and a second bathroom.',
          },
          {
            isCurrent: false,
            street: '1401 Rio Grande St',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            monthlyRentCents: 165_000,
            moveIn: la('2018-06-01'),
            moveOut: la('2022-02-15'),
            landlordName: 'Rio Grande Lofts',
            landlordPhone: '(512) 555-0187',
            reasonForLeaving: 'Relocated to California for work.',
          },
        ],
      },
      employments: {
        create: [
          {
            isCurrent: true,
            employer: 'Caltech',
            position: 'Lab operations manager',
            monthlyIncomeCents: 830_000,
            startDate: la('2022-03-14'),
            supervisorName: 'Dr. Susan Marsh',
            supervisorPhone: '(626) 555-0126',
          },
          {
            isCurrent: false,
            employer: 'University of Texas at Austin',
            position: 'Research coordinator',
            monthlyIncomeCents: 560_000,
            startDate: la('2017-09-01'),
            endDate: la('2022-02-28'),
          },
        ],
      },
      vehicles: { create: [{ make: 'Honda', model: 'Civic', year: 2021, color: 'Blue', licensePlate: '9DTB218', state: 'CA' }] },
      pets: { create: [{ type: 'Dog', breed: 'Beagle mix', name: 'Biscuit', weightLbs: 28, age: 5 }] },
      references: {
        create: [
          { name: 'Grace Adeyemi', relationship: 'Friend (10+ years)', phone: '(626) 555-0158' },
          { name: 'Dr. Susan Marsh', relationship: 'Supervisor', phone: '(626) 555-0126', email: 'smarsh@caltech.example.edu' },
        ],
      },
      emergencyContacts: {
        create: [{ name: 'Chidi Okafor', relationship: 'Brother', phone: '(310) 555-0114', email: 'chidi.okafor@example.com' }],
      },
    },
  });
  await prisma.applicationNote.create({
    data: {
      applicationId: underReview.id,
      authorId: landlord.id,
      body: 'Verified employment with Caltech HR — salary confirmed. Prior landlord in Pasadena says they would rent to them again. Waiting on the co-applicant pay stubs.',
      createdAt: daysAgo(4),
    },
  });

  const approvedApp = await prisma.application.create({
    data: {
      unitId: pendingTenancies[0].unit.id,
      status: 'APPROVED',
      trackingToken: 'trk_cole_demo',
      firstName: 'Nathan',
      lastName: 'Cole',
      email: emailFor(PENDING_TENANTS[0]),
      phone: '(626) 555-0136',
      monthlyIncomeCents: 725_000,
      moveInDate: pendingTenancies[0].moveIn,
      userId: pendingTenancies[0].userId,
      ...consent('Nathan Cole', 9),
      ...fee(4, 9),
      submittedAt: daysAgo(9),
      createdAt: daysAgo(10),
      decisionAt: daysAgo(5),
      decisionNote: 'Approved — income is 3.4x rent, excellent references, clean rental history.',
      employments: {
        create: [
          {
            isCurrent: true,
            employer: 'Kaiser Permanente',
            position: 'Registered nurse',
            monthlyIncomeCents: 725_000,
            startDate: la('2020-01-06'),
          },
        ],
      },
      residences: {
        create: [
          {
            isCurrent: true,
            street: '245 S Marengo Ave, Apt 8',
            city: 'Pasadena',
            state: 'CA',
            zip: '91101',
            monthlyRentCents: 198_000,
            moveIn: la('2020-04-01'),
            landlordName: 'Marengo Court LLC',
            landlordPhone: '(626) 555-0121',
          },
        ],
      },
    },
  });

  await prisma.application.create({
    data: {
      unitId: colorado3.id,
      status: 'DENIED',
      trackingToken: 'trk_brooks_demo',
      firstName: 'Tyler',
      lastName: 'Banks',
      email: 'tyler.banks@example.com',
      phone: '(818) 555-0129',
      monthlyIncomeCents: 320_000,
      moveInDate: daysFromNow(15),
      ...consent('Tyler Banks', 8),
      ...fee(5, 8),
      submittedAt: daysAgo(8),
      createdAt: daysAgo(9),
      decisionAt: daysAgo(3),
      decisionNote:
        'Denied — gross income below the 2.5x monthly rent criterion applied uniformly to all applicants for this unit.',
      employments: {
        create: [{ isCurrent: true, employer: 'Fresh & Co Market', position: 'Shift lead', monthlyIncomeCents: 320_000 }],
      },
    },
  });

  await prisma.application.create({
    data: {
      unitId: harbor203.id,
      status: 'WAITLISTED',
      trackingToken: 'trk_delgado_demo',
      firstName: 'Sofia',
      lastName: 'Delgado',
      email: 'sofia.delgado@example.com',
      phone: '(562) 555-0151',
      monthlyIncomeCents: 655_000,
      moveInDate: daysFromNow(45),
      ...consent('Sofia Delgado', 4),
      ...fee(6, 4),
      submittedAt: daysAgo(4),
      createdAt: daysAgo(5),
      decisionAt: daysAgo(1),
      decisionNote: 'Qualified — waitlisted behind two earlier complete applications for this unit.',
      employments: {
        create: [{ isCurrent: true, employer: 'Port of Long Beach', position: 'Logistics coordinator', monthlyIncomeCents: 655_000 }],
      },
    },
  });

  // Draft leases for the two pending move-ins (one linked to the approved app).
  for (const [idx, p] of pendingTenancies.entries()) {
    const startYmd = toDateInputValue(p.moveIn);
    await prisma.lease.create({
      data: {
        tenancyId: p.tenancyId,
        templateId: template.id,
        applicationId: idx === 0 ? approvedApp.id : null,
        status: 'DRAFT',
        startDate: p.moveIn,
        endDate: la(ymdShift(startYmd, { months: 12 })),
        rentCents: p.unit.marketRentCents,
        depositCents: Math.min(p.unit.depositCents, p.unit.marketRentCents),
        lateFeeCents: 7_500,
        lateFeeGraceDays: 3,
        utilitiesIncluded: ['trash'],
        disclosures: disclosuresJson(false),
      },
    });
  }

  // ── Vendors & work orders ──────────────────────────────────────────────────
  const plumber = await prisma.vendor.create({
    data: {
      name: 'Ray Alvarez',
      company: 'Alvarez Plumbing Co.',
      phone: '(323) 555-0186',
      email: 'dispatch@alvarezplumbing.example.com',
      specialty: 'Plumbing',
      notes: 'Licensed C-36. Fast on emergency calls; net-30 invoicing.',
    },
  });
  const electrician = await prisma.vendor.create({
    data: {
      name: 'Lena Park',
      company: 'Park Electric',
      phone: '(213) 555-0173',
      email: 'lena@parkelectric.example.com',
      specialty: 'Electrical',
    },
  });
  const handyman = await prisma.vendor.create({
    data: {
      name: 'Miguel Santos',
      company: 'Santos Handyman Services',
      phone: '(562) 555-0168',
      email: 'miguel@santoshandyman.example.com',
      specialty: 'General repairs / appliances / HVAC',
    },
  });

  // 1) EMERGENCY habitability — no heat, submitted yesterday.
  const woNoHeat = await prisma.workOrder.create({
    data: {
      unitId: activeAt(7).unit.id,
      tenancyId: activeAt(7).tenancyId,
      createdById: activeAt(7).user.id,
      category: 'NO_HEAT',
      priority: 'EMERGENCY',
      status: 'SUBMITTED',
      isHabitability: true,
      title: 'Heater not working — no heat in unit',
      description:
        'The wall heater stopped working last night. Pilot light will not stay lit and the unit is very cold in the mornings. We have a young child at home.',
      permissionToEnter: true,
      preferredAccessTimes: 'Any time — someone is home all day.',
      createdAt: daysAgo(1),
    },
  });
  await prisma.workOrderComment.create({
    data: {
      workOrderId: woNoHeat.id,
      authorId: activeAt(7).user.id,
      body: 'Still no heat this morning — please treat as urgent.',
      createdAt: daysAgo(0),
    },
  });

  // 2) URGENT plumbing — in progress with vendor and estimated cost.
  const woLeak = await prisma.workOrder.create({
    data: {
      unitId: activeAt(11).unit.id,
      tenancyId: activeAt(11).tenancyId,
      createdById: activeAt(11).user.id,
      category: 'PLUMBING',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      title: 'Active leak under kitchen sink',
      description:
        'Water is pooling in the cabinet under the kitchen sink. I put a bucket under it but it fills up every few hours.',
      permissionToEnter: true,
      preferredAccessTimes: 'Weekdays after 4pm, or anytime with 24h notice.',
      vendorId: plumber.id,
      costCents: 28_500,
      scheduledFor: daysAgo(1),
      acknowledgedAt: daysAgo(3),
      scheduledAt: daysAgo(3),
      startedAt: daysAgo(1),
      createdAt: daysAgo(4),
    },
  });
  await prisma.workOrderComment.create({
    data: {
      workOrderId: woLeak.id,
      authorId: activeAt(11).user.id,
      body: 'The leak is getting worse — the bucket now fills in about an hour.',
      createdAt: daysAgo(3),
    },
  });
  await prisma.workOrderComment.create({
    data: {
      workOrderId: woLeak.id,
      authorId: landlord.id,
      body: 'Ray from Alvarez Plumbing started work yesterday — the supply line fitting is being replaced. He will return tomorrow to finish and pressure-test.',
      createdAt: daysAgo(1),
    },
  });
  await prisma.workOrderComment.create({
    data: {
      workOrderId: woLeak.id,
      authorId: landlord.id,
      visibleToTenant: false,
      body: 'Internal: second leak in this plumbing stack this year — get Ray to quote a repipe of the 1st-floor branch while he is on site.',
      createdAt: daysAgo(1),
    },
  });

  // 3–5) ROUTINE tickets backdated 3 / 9 / 16 days to demo visual escalation.
  await prisma.workOrder.create({
    data: {
      unitId: activeAt(20).unit.id,
      tenancyId: activeAt(20).tenancyId,
      createdById: activeAt(20).user.id,
      category: 'APPLIANCE',
      priority: 'ROUTINE',
      status: 'SUBMITTED',
      title: 'Dishwasher not draining',
      description: 'Dishwasher finishes the cycle but leaves an inch of standing water in the bottom.',
      permissionToEnter: true,
      createdAt: daysAgo(3),
    },
  });
  await prisma.workOrder.create({
    data: {
      unitId: activeAt(27).unit.id,
      tenancyId: activeAt(27).tenancyId,
      createdById: activeAt(27).user.id,
      category: 'OTHER',
      priority: 'ROUTINE',
      status: 'ACKNOWLEDGED',
      title: 'Bedroom window screen torn',
      description: 'The screen on the bedroom window has a large tear and is coming out of its frame.',
      acknowledgedAt: daysAgo(8),
      createdAt: daysAgo(9),
    },
  });
  await prisma.workOrder.create({
    data: {
      unitId: activeAt(17).unit.id,
      tenancyId: activeAt(17).tenancyId,
      createdById: activeAt(17).user.id,
      category: 'PLUMBING',
      priority: 'ROUTINE',
      status: 'SUBMITTED',
      title: 'Kitchen faucet drips constantly',
      description: 'The kitchen faucet drips about once a second even when fully closed.',
      permissionToEnter: true,
      preferredAccessTimes: 'Weekday mornings.',
      createdAt: daysAgo(16),
    },
  });

  // 6) COMPLETED with vendor + cost.
  const woFan = await prisma.workOrder.create({
    data: {
      unitId: activeAt(5).unit.id,
      tenancyId: activeAt(5).tenancyId,
      createdById: activeAt(5).user.id,
      category: 'ELECTRICAL',
      priority: 'ROUTINE',
      status: 'COMPLETED',
      title: 'Bathroom exhaust fan dead',
      description: 'The bathroom exhaust fan hums but does not spin; mirror fogs badly after showers.',
      permissionToEnter: true,
      vendorId: electrician.id,
      costCents: 19_000,
      acknowledgedAt: daysAgo(20),
      scheduledAt: daysAgo(20),
      scheduledFor: daysAgo(18),
      startedAt: daysAgo(18),
      completedAt: daysAgo(17),
      createdAt: daysAgo(21),
    },
  });
  await prisma.workOrderComment.create({
    data: {
      workOrderId: woFan.id,
      authorId: landlord.id,
      body: 'Park Electric replaced the fan motor and cleaned the duct. Please let us know if the noise comes back.',
      createdAt: daysAgo(17),
    },
  });

  // 7) CLOSED with cost.
  await prisma.workOrder.create({
    data: {
      unitId: activeAt(31).unit.id,
      tenancyId: activeAt(31).tenancyId,
      createdById: activeAt(31).user.id,
      category: 'HVAC',
      priority: 'ROUTINE',
      status: 'CLOSED',
      title: 'AC blowing warm air',
      description: 'Air conditioner runs but only blows warm air, even set to 68.',
      permissionToEnter: true,
      vendorId: handyman.id,
      costCents: 12_500,
      acknowledgedAt: daysAgo(39),
      scheduledAt: daysAgo(38),
      scheduledFor: daysAgo(36),
      startedAt: daysAgo(36),
      completedAt: daysAgo(35),
      closedAt: daysAgo(33),
      createdAt: daysAgo(40),
    },
  });

  // 8) LOW — landlord-created turnover task on the vacant (ended) unit.
  await prisma.workOrder.create({
    data: {
      unitId: endedUnit.id,
      createdById: landlord.id,
      category: 'OTHER',
      priority: 'LOW',
      status: 'SUBMITTED',
      title: 'Turnover: patch and paint living room walls',
      description:
        'Unit 104 move-out left nail holes and scuffed paint in the living room. Patch, prime, and repaint before re-listing photos.',
      permissionToEnter: true,
      createdAt: daysAgo(2),
    },
  });

  // 9) SCHEDULED with vendor.
  const woFridge = await prisma.workOrder.create({
    data: {
      unitId: activeAt(23).unit.id,
      tenancyId: activeAt(23).tenancyId,
      createdById: activeAt(23).user.id,
      category: 'APPLIANCE',
      priority: 'ROUTINE',
      status: 'SCHEDULED',
      title: 'Refrigerator making loud buzzing noise',
      description: 'The fridge buzzes loudly every 20 minutes or so. Food is staying cold for now.',
      permissionToEnter: true,
      preferredAccessTimes: 'Tue–Thu 9am–1pm.',
      vendorId: handyman.id,
      scheduledFor: daysFromNow(2),
      acknowledgedAt: daysAgo(4),
      scheduledAt: daysAgo(3),
      createdAt: daysAgo(5),
    },
  });
  await prisma.workOrderComment.create({
    data: {
      workOrderId: woFridge.id,
      authorId: landlord.id,
      body: 'Miguel from Santos Handyman is scheduled for this Thursday morning — he will call 30 minutes before arriving.',
      createdAt: daysAgo(3),
    },
  });

  // 10) CANCELLED.
  const woAnts = await prisma.workOrder.create({
    data: {
      unitId: activeAt(29).unit.id,
      tenancyId: activeAt(29).tenancyId,
      createdById: activeAt(29).user.id,
      category: 'PEST',
      priority: 'ROUTINE',
      status: 'CANCELLED',
      title: 'Ants in the kitchen',
      description: 'A trail of ants along the kitchen baseboard, seems to come from under the window.',
      createdAt: daysAgo(12),
    },
  });
  await prisma.workOrderComment.create({
    data: {
      workOrderId: woAnts.id,
      authorId: activeAt(29).user.id,
      body: 'They disappeared after I sealed the window gap and cleaned up — you can cancel this one.',
      createdAt: daysAgo(10),
    },
  });

  // ── Inspections ────────────────────────────────────────────────────────────
  async function createInspectionWithItems(params: {
    tenancyId: string;
    type: 'MOVE_IN' | 'MOVE_OUT';
    status: InspectionStatus;
    bedrooms: number;
    bathrooms: number;
    scheduledAt?: Date;
    completedAt?: Date;
    tenantAck?: { at: Date; name: string };
    landlordAck?: { at: Date; name: string };
    notes?: string;
    createdAt?: Date;
    conditionFor?: (entry: ChecklistEntry) => { condition: ItemCondition; notes?: string } | null;
  }) {
    const entries = buildDefaultChecklist(params.bedrooms, params.bathrooms);
    return prisma.inspection.create({
      data: {
        tenancyId: params.tenancyId,
        type: params.type,
        status: params.status,
        scheduledAt: params.scheduledAt,
        completedAt: params.completedAt,
        tenantAckAt: params.tenantAck?.at,
        tenantAckName: params.tenantAck?.name,
        landlordAckAt: params.landlordAck?.at,
        landlordAckName: params.landlordAck?.name,
        notes: params.notes,
        createdAt: params.createdAt ?? new Date(),
        items: {
          create: entries.map((entry) => {
            const rated = params.conditionFor?.(entry) ?? null;
            return {
              room: entry.room,
              item: entry.item,
              sortOrder: entry.sortOrder,
              condition: rated?.condition ?? null,
              notes: rated?.notes,
            };
          }),
        },
      },
    });
  }

  // Move-in inspection for the showcase tenant (Maria Gonzalez, Sunset 101),
  // completed at the start of her tenancy with both acknowledgements.
  const maria = activeAt(0);
  const mariaMoveIn = la(monthStartYmd(-18));
  await createInspectionWithItems({
    tenancyId: maria.tenancyId,
    type: 'MOVE_IN',
    status: 'COMPLETED',
    bedrooms: maria.unit.bedrooms,
    bathrooms: maria.unit.bathrooms,
    scheduledAt: mariaMoveIn,
    completedAt: mariaMoveIn,
    tenantAck: { at: mariaMoveIn, name: 'Maria Gonzalez' },
    landlordAck: { at: mariaMoveIn, name: 'Sam T. Sterling' },
    notes: 'Unit in good overall condition at move-in. Fresh paint throughout.',
    createdAt: mariaMoveIn,
    conditionFor: (entry) =>
      entry.sortOrder % 9 === 4
        ? { condition: 'FAIR', notes: 'Minor wear noted at move-in.' }
        : entry.sortOrder % 4 === 0
          ? { condition: 'NEW' }
          : { condition: 'GOOD' },
  });

  // Scheduled move-in inspection for next week's move-in (Nathan Cole).
  await createInspectionWithItems({
    tenancyId: pendingTenancies[0].tenancyId,
    type: 'MOVE_IN',
    status: 'SCHEDULED',
    bedrooms: pendingTenancies[0].unit.bedrooms,
    bathrooms: pendingTenancies[0].unit.bathrooms,
    scheduledAt: daysFromNow(7),
  });

  // Ended tenancy: completed move-in (14 months ago) + move-out in progress
  // with worsened conditions that support deposit deductions.
  const endedMoveIn = la(endedStartYmd);
  await createInspectionWithItems({
    tenancyId: endedTenancy.id,
    type: 'MOVE_IN',
    status: 'COMPLETED',
    bedrooms: endedUnit.bedrooms,
    bathrooms: endedUnit.bathrooms,
    scheduledAt: endedMoveIn,
    completedAt: endedMoveIn,
    tenantAck: { at: endedMoveIn, name: 'Brandon Yates' },
    landlordAck: { at: endedMoveIn, name: 'Sam T. Sterling' },
    createdAt: endedMoveIn,
    conditionFor: () => ({ condition: 'GOOD' }),
  });

  const MOVE_OUT_DAMAGE: Record<string, { condition: ItemCondition; notes: string }> = {
    'Entry / Living Room|Walls': {
      condition: 'POOR',
      notes: 'Multiple large nail holes and scuffed paint beyond normal wear.',
    },
    'Kitchen|Cabinets & Counters': {
      condition: 'DAMAGED',
      notes: 'Burn mark and a deep gouge in the countertop next to the stove.',
    },
    'Bedroom 1|Flooring': { condition: 'FAIR', notes: 'Carpet stained in two places.' },
    'Bathroom 1|Sink & Vanity': { condition: 'POOR', notes: 'Vanity door hinge broken.' },
  };
  await createInspectionWithItems({
    tenancyId: endedTenancy.id,
    type: 'MOVE_OUT',
    status: 'IN_PROGRESS',
    bedrooms: endedUnit.bedrooms,
    bathrooms: endedUnit.bathrooms,
    scheduledAt: daysAgo(10),
    notes: 'Walk-through started the day after keys were returned.',
    createdAt: daysAgo(10),
    conditionFor: (entry) =>
      MOVE_OUT_DAMAGE[`${entry.room}|${entry.item}`] ?? { condition: 'GOOD' },
  });

  // Draft deposit disposition for the ended tenancy — 21-day § 1950.5(g) clock.
  const moveOutDate = daysAgo(10);
  await prisma.depositDisposition.create({
    data: {
      tenancyId: endedTenancy.id,
      depositCents: endedTenancy.depositCents,
      moveOutDate,
      statementDueDate: new Date(moveOutDate.getTime() + 21 * DAY_MS),
      deductions: {
        create: [
          {
            category: 'Cleaning',
            description: 'Deep-clean kitchen and bathroom (grease buildup, tub ring).',
            amountCents: 22_500,
          },
          {
            category: 'Repairs beyond normal wear',
            description:
              'Patch and repaint living room walls; repair burned/gouged kitchen countertop section; replace vanity door hinge.',
            amountCents: 41_250,
          },
        ],
      },
    },
  });

  // ── Notifications & preferences ────────────────────────────────────────────
  const grace = activeAt(11); // Grace Park — plumbing WO above
  const fatima = activeAt(7); // Fatima Hassan — no-heat WO above
  await prisma.notification.createMany({
    data: [
      {
        userId: maria.user.id,
        event: 'RENT_DUE_REMINDER',
        channel: 'EMAIL',
        status: 'SENT',
        to: maria.user.email,
        subject: 'Rent due on the 1st',
        body: `Hi Maria — a reminder that your rent of $${(maria.rentCents / 100).toFixed(2)} is due on the 1st. You can pay any time from the resident portal.`,
        sentAt: daysAgo(13),
        createdAt: daysAgo(13),
      },
      {
        userId: maria.user.id,
        event: 'RENT_DUE_REMINDER',
        channel: 'SMS',
        status: 'SENT',
        to: '(213) 555-0100',
        body: 'STS: rent is due on the 1st. Pay any time from the resident portal.',
        sentAt: daysAgo(13),
        createdAt: daysAgo(13),
      },
      {
        userId: maria.user.id,
        event: 'PAYMENT_RECEIVED',
        channel: 'EMAIL',
        status: 'SENT',
        to: maria.user.email,
        subject: 'Payment received',
        body: `We received your payment of $${(maria.rentCents / 100).toFixed(2)}. Thank you!`,
        sentAt: daysAgo(10),
        createdAt: daysAgo(10),
      },
      {
        userId: fatima.user.id,
        event: 'WORK_ORDER_STATUS_CHANGED',
        channel: 'EMAIL',
        status: 'SENT',
        to: fatima.user.email,
        subject: 'We received your maintenance request',
        body: 'Your request "Heater not working — no heat in unit" was received and flagged as an emergency habitability issue. We are dispatching help as fast as possible.',
        sentAt: daysAgo(1),
        createdAt: daysAgo(1),
      },
      {
        userId: grace.user.id,
        event: 'WORK_ORDER_STATUS_CHANGED',
        channel: 'EMAIL',
        status: 'SENT',
        to: grace.user.email,
        subject: 'Maintenance update: plumber assigned',
        body: 'Alvarez Plumbing has been assigned to your work order "Active leak under kitchen sink" and work is in progress.',
        sentAt: daysAgo(3),
        createdAt: daysAgo(3),
      },
      {
        userId: grace.user.id,
        event: 'GENERAL',
        channel: 'SMS',
        status: 'SKIPPED',
        to: '(213) 555-0111',
        body: 'STS: building water will be shut off Tuesday 10am–noon for plumbing work.',
        createdAt: daysAgo(5),
      },
    ],
  });

  await prisma.notificationPreference.create({
    data: {
      userId: maria.user.id,
      prefs: {
        RENT_DUE_REMINDER: { email: true, sms: true },
        PAYMENT_RECEIVED: { email: true, sms: false },
        GENERAL: { email: true, sms: false },
      },
    },
  });
  await prisma.notificationPreference.create({
    data: {
      userId: grace.user.id,
      prefs: {
        RENT_DUE_REMINDER: { email: true, sms: false },
        WORK_ORDER_STATUS_CHANGED: { email: true, sms: true },
        GENERAL: { email: false, sms: false },
      },
    },
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  const [
    propertyCount,
    unitCount,
    userCount,
    tenancyCount,
    leaseCount,
    ledgerCount,
    paymentCount,
    applicationCount,
    workOrderCount,
    inspectionCount,
    vendorCount,
    notificationCount,
  ] = await Promise.all([
    prisma.property.count(),
    prisma.unit.count(),
    prisma.user.count(),
    prisma.tenancy.count(),
    prisma.lease.count(),
    prisma.ledgerEntry.count(),
    prisma.payment.count(),
    prisma.application.count(),
    prisma.workOrder.count(),
    prisma.inspection.count(),
    prisma.vendor.count(),
    prisma.notification.count(),
  ]);

  console.log('');
  console.log('Seed complete.');
  console.log('──────────────────────────────────────────────────────');
  console.log(`  Properties:      ${propertyCount}`);
  console.log(`  Units:           ${unitCount} (34 occupied, 2 pending move-in, 4 vacant/listed)`);
  console.log(`  Users:           ${userCount} (1 landlord, ${userCount - 1} tenants)`);
  console.log(`  Tenancies:       ${tenancyCount} (34 active, 2 pending, 1 ended)`);
  console.log(`  Leases:          ${leaseCount} (incl. renewals, drafts, and 6 expiring within 90 days)`);
  console.log(`  Ledger entries:  ${ledgerCount}`);
  console.log(`  Payments:        ${paymentCount} (incl. 1 processing ACH, 1 returned ACH)`);
  console.log(`  Applications:    ${applicationCount} (2 submitted on the same unit for compare view)`);
  console.log(`  Work orders:     ${workOrderCount} (routine tickets backdated 3/9/16 days for escalation)`);
  console.log(`  Inspections:     ${inspectionCount} (move-out in progress w/ draft deposit disposition)`);
  console.log(`  Vendors:         ${vendorCount}`);
  console.log(`  Notifications:   ${notificationCount}`);
  console.log('──────────────────────────────────────────────────────');
  console.log('Demo logins:');
  console.log('  Landlord:  admin@stspm.com / admin1234');
  console.log(`  Tenant:    ${maria.user.email} / tenant1234  (all seeded tenants use tenant1234)`);
  console.log(`  Delinquent tenant example: ${activeAt(16).user.email} / tenant1234`);
  console.log('  Applicant status page:  /application-status?token=trk_okafor_demo');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
