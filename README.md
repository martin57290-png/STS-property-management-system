# STS Property Management Systems

Full-lifecycle property management for a single California landlord with a 40-unit portfolio — from rental application and screening consent, through lease generation, move-in inspection, monthly rent collection, and maintenance, to move-out and the 21-day security-deposit disposition. Built with California landlord-tenant compliance guardrails throughout.

The app has two portals plus public applicant pages:

- **Admin portal** (`/admin`) — the landlord's dashboard, properties/units, applications, leases, inspections, rent ledger, work orders, vendors, documents, reports, and settings.
- **Tenant portal** (`/tenant`) — mobile-first resident pages: pay rent, autopay, ledger history, maintenance requests with photos, inspections, documents, and notification preferences.
- **Public pages** — unit listings and the multi-step application at `/apply`, and a no-login application status tracker at `/application-status?token=…`.

---

## Features by module

### 1. Rental applications & screening
- Public listing page and mobile-first, multi-step application form (personal, residence history, employment, vehicles/pets, contacts, review) saved as a draft between steps.
- **FCRA screening consent capture**: typed legal name as signature, timestamp, and IP recorded on the application.
- **CA Civ. Code § 1950.6 application fee**: configurable fee with a statutory-cap note, payment reference, and a generated **itemized receipt PDF** for each applicant charged.
- Applicant status tracking via a private link token — no account required.
- Admin review: side-by-side **compare view** for competing applications on the same unit, internal notes, applicant-uploaded documents (ID, pay stubs), and approve / deny / waitlist decisions with decision notes and automatic applicant notifications.
- Approval hands off directly into a pending tenancy and lease draft.

### 2. Lease generation (California)
- Merge-field lease templates (`{{tenant_names}}`, `{{monthly_rent}}`, …) with a full default **California residential lease** included.
- **AB 12 deposit cap** enforced in the form logic (security deposit ≤ one month's rent) and a late-fee reasonableness warning (liquidated damages, Civ. Code § 1671).
- **CA disclosure checklist** confirmed before generation: lead-based paint (auto-required for pre-1978 properties), bed bugs (§ 1954.603), mold (H&SC § 26147), Megan's Law notice (Penal Code § 290.46), flood hazard (Gov. Code § 8589.45).
- Print-ready PDF generation, executed (wet-signed) PDF upload, renewals with a linked lease chain, and expiring-lease buckets (60 / 90 days) on the dashboard.

### 3. Inspections & deposit disposition
- Move-in / move-out inspections with a room-by-room checklist derived from the unit's bedroom/bathroom count, per-item condition ratings, notes, and photos.
- **Joint in-app acknowledgement**: both tenant and landlord sign with a typed name; the inspection completes when both have acknowledged.
- **Move-in vs. move-out comparison** view highlighting items whose condition worsened — the evidentiary basis for deductions.
- **Deposit disposition** with itemized deductions, supporting photos, a generated statement PDF, and the **21-day § 1950.5(g) clock** tracked from the move-out date.

### 4. Rent collection (Stripe)
- Tenant portal payments by **ACH or card** through a provider abstraction: `PAYMENTS_DRIVER=stripe` for real Stripe, `mock` for a keyless end-to-end simulation.
- Webhook reconciliation (`/api/webhooks/payments`) drives payment state: processing → succeeded / failed / **ACH returned** (with an automatic offsetting charge so the balance is owed again).
- **Partial payments**, autopay enrollments (day-of-month, ACH/card), monthly rent posting, late fees, and rent-due reminders.
- Full tenancy ledger (charges / payments / credits) with running balance, plus **delinquency aging buckets** (0–30 / 31–60 / 61–90 / 90+).
- Admin **payment simulator** for the mock driver (see below).

### 5. Work orders & maintenance
- Tenant-submitted requests with photos/video, category, access permission, and preferred times.
- **Habitability auto-tagging** for CA repair-and-deduct exposure categories (no heat, no water, sewage, no electricity).
- Priorities (Emergency / Urgent / Routine / Low) with **time-based visual escalation** — an open Routine ticket displays as Urgent after 7 days and Emergency after 14 (configurable in Settings); the stored priority never changes.
- Status workflow (submitted → acknowledged → scheduled → in progress → completed → closed / cancelled), vendor directory and assignment, scheduling, costs, completion photos, and comment threads with **internal (landlord-only) notes**.

### 6. Dashboard, reports & shared services
- Dashboard: occupancy, rent collected this month, open work orders by priority, leases expiring soon, upcoming inspections, and delinquency at a glance.
- Reports with **CSV export**: rent roll, income (last 12 months), and maintenance spend.
- Document vault with private storage and signed URLs; per-entity document lists (application, lease, tenancy, unit, work order, inspection item).
- Notifications (email + SMS with mock/Resend/Twilio drivers), per-tenant notification preferences, and a full audit log of consequential actions.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router, React Server Components, Server Actions) |
| Language | TypeScript (strict) |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth (credentials, JWT sessions, landlord/tenant roles) |
| Styling | Tailwind CSS + a small internal UI kit |
| PDFs | PDFKit (leases, receipts, deposit dispositions) |
| Payments | Stripe (or a built-in mock driver) |
| Email / SMS | Resend / Twilio (or built-in mock drivers) |
| File storage | Local disk or any S3-compatible store (AWS S3, R2, MinIO) |
| Time zone | All dates stored UTC, displayed in `America/Los_Angeles` |
| Money | Integer **cents** everywhere |

---

## Quickstart

Prerequisites: Node 18+ and a PostgreSQL database (Docker is easiest).

```bash
# 1. Start Postgres (or point DATABASE_URL at an existing server)
docker run --name sts-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sts_pm \
  -p 5432:5432 -d postgres:16

# 2. Configure the environment
cp .env.example .env        # defaults work out of the box for local dev

# 3. Install and set up the database
npm install
npx prisma migrate dev --name init    # or: npm run db:push

# 4. Seed comprehensive demo data (40 units, tenants, ledgers, applications, …)
npm run db:seed

# 5. Run it
npm run dev                 # http://localhost:3000
```

### Demo logins

| Role | Email | Password |
| --- | --- | --- |
| Landlord | `admin@stspm.com` | `admin1234` |
| Tenant (showcase) | `maria.gonzalez@example.com` | `tenant1234` |
| Tenant (delinquent example) | `sean.murphy@example.com` | `tenant1234` |

Every seeded tenant uses the password `tenant1234`. A demo applicant status page is available at `http://localhost:3000/application-status?token=trk_okafor_demo`.

The seed also stages: two competing applications on the same vacant unit (for the compare view), leases expiring inside the 60- and 90-day dashboard buckets, delinquent tenancies across aging buckets, a returned ACH payment, an in-flight **processing ACH payment you can clear from the payment simulator**, routine work orders backdated 3/9/16 days to show visual escalation, and a move-out inspection in progress with a draft deposit disposition on its 21-day clock.

---

## Environment variables

All variables are documented in `.env.example`. Mock drivers make the app fully functional with **zero external accounts**: mock payments simulate the ACH/card lifecycle, and mock email/SMS log to the console and record rows in the Notification table.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | local Postgres | Prisma connection string. |
| `APP_URL` | `http://localhost:3000` | Public base URL (used in emails, receipts, links). |
| `NEXTAUTH_SECRET` | change me | NextAuth JWT/session encryption. Generate: `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | `http://localhost:3000` | NextAuth callback base URL. |
| `FILE_SIGNING_SECRET` | change me | HMAC secret for signed local file URLs. Generate: `openssl rand -base64 32`. |
| `STORAGE_DRIVER` | `local` | `local` writes to `./.storage` and serves via signed app URLs; `s3` uses any S3-compatible provider. |
| `S3_BUCKET` / `S3_REGION` / `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | — | S3 credentials. Leave `S3_ENDPOINT` blank for AWS; set it for R2/MinIO. |
| `PAYMENTS_DRIVER` | `mock` | `mock` simulates ACH/card end-to-end with no keys; `stripe` uses the real Stripe API. |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | — | Stripe API keys (required when `PAYMENTS_DRIVER=stripe`). |
| `STRIPE_WEBHOOK_SECRET` | — | Webhook signature verification secret (from `stripe listen` or the dashboard). |
| `EMAIL_DRIVER` | `mock` | `mock` logs to console + Notification table; `resend` sends via the Resend API. |
| `RESEND_API_KEY` / `EMAIL_FROM` | — | Resend credentials and the From header. |
| `SMS_DRIVER` | `mock` | `mock` logs to console + Notification table; `twilio` sends via the Twilio REST API. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | — | Twilio credentials. |
| `CRON_SECRET` | unset | Optional. When set, the cron endpoints require an `x-cron-secret` header with this value; when unset they are open (dev only). |

### Stripe webhook setup (real driver)

With `PAYMENTS_DRIVER=stripe`, point Stripe webhooks at the app's reconciliation endpoint. For local development:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/payments
# copy the printed whsec_... value into STRIPE_WEBHOOK_SECRET
```

In production, add a webhook endpoint in the Stripe dashboard for `https://<your-domain>/api/webhooks/payments` (payment_intent events) and set `STRIPE_WEBHOOK_SECRET` accordingly.

---

## Payment simulator (mock driver)

With the default `PAYMENTS_DRIVER=mock`, card payments succeed synchronously and **ACH payments sit in Processing** — exactly like real ACH. The admin **payment simulator** at `/admin/payments/simulator` lets you replay provider webhooks against any in-flight mock payment:

- **Clear (succeed)** — posts the PAYMENT ledger entry and notifies the tenants.
- **Fail** — marks the payment failed with a reason.
- **ACH return** — for an already-settled payment, marks it Returned and posts an **offsetting charge** so the balance is owed again (like a real bank return).

The buttons apply a normalized event through `applyPaymentEvent()` — the same reconciliation function the `/api/webhooks/payments` route uses for real Stripe events — so the mock exercises the identical code path. The seed leaves one ACH payment in Processing so you can try this immediately.

---

## Cron endpoints

Two POST endpoints are designed to be called by an external scheduler. When `CRON_SECRET` is set they require the matching `x-cron-secret` header; unset, they are open for local development.

| Endpoint | Schedule | What it does |
| --- | --- | --- |
| `POST /api/cron/post-rent` | Monthly, on the 1st | Posts the month's rent charge for every ACTIVE tenancy. Idempotent — tenancies that already have this month's rent charge are skipped. |
| `POST /api/cron/run-autopay` | Daily | Initiates autopay for enrollments due today (LA time) on tenancies with a balance, and sends rent-due reminders within the configured window (skipping tenants already reminded). |

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<your-domain>/api/cron/post-rent
curl -X POST -H "x-cron-secret: $CRON_SECRET" https://<your-domain>/api/cron/run-autopay
```

Note: these endpoints accept POST only, so schedulers that issue GET requests (e.g. Vercel Cron's default) need a proxy/wrapper or an external scheduler such as GitHub Actions, cron-job.org, or a plain crontab with `curl -X POST`.

---

## Deployment

Works on Vercel or any Node host, plus a managed PostgreSQL database (Neon, Supabase, RDS, …).

1. **Database** — set `DATABASE_URL` and run migrations during deploy: `npx prisma migrate deploy` (never `migrate dev` in production).
2. **Secrets** — generate real values for `NEXTAUTH_SECRET` and `FILE_SIGNING_SECRET` (`openssl rand -base64 32` each); set `APP_URL`/`NEXTAUTH_URL` to your public domain.
3. **File storage** — set `STORAGE_DRIVER=s3` in production. The `local` driver writes to `./.storage`, which is ephemeral on serverless platforms; any S3-compatible store (AWS S3, Cloudflare R2, MinIO) works via the `S3_*` variables.
4. **Payments** — set `PAYMENTS_DRIVER=stripe`, the Stripe keys, and the production webhook endpoint + `STRIPE_WEBHOOK_SECRET`.
5. **Email / SMS** — set `EMAIL_DRIVER=resend` / `SMS_DRIVER=twilio` with their credentials (or leave `mock` if notifications should only be recorded in-app).
6. **Cron** — set `CRON_SECRET` and schedule the two endpoints above.
7. **Seeding** — optional in production; `npm run db:seed` wipes and repopulates the database, so use it only for demo environments.

---

## Project structure

```
prisma/
  schema.prisma           # complete data model (money = integer cents, UTC timestamps)
  seed.ts                 # demo data: 5 properties / 40 units / full lifecycle
src/
  app/
    admin/                # landlord portal (dashboard, applications, leases,
                          #   inspections, payments + simulator, properties,
                          #   tenancies, work-orders, vendors, documents,
                          #   reports, settings)
    tenant/               # resident portal (pay rent, autopay, work orders,
                          #   inspections, documents, settings)
    apply/                # public multi-step rental application
    application-status/   # public status tracker (?token=…)
    api/
      auth/[...nextauth]/ # credentials auth
      cron/               # post-rent, run-autopay (x-cron-secret)
      webhooks/payments/  # Stripe/mock webhook reconciliation
      files/[...key]/     # signed local-storage file serving
      leases/…/pdf        # lease PDF download
      inspections/…/pdf   # deposit disposition PDF
      reports/            # rent-roll / income / maintenance CSV
  components/             # UI kit + document rendering helpers
  lib/
    auth.ts, db.ts, money.ts, dates.ts, audit.ts, settings.ts
    ledger.ts             # balances, rent posting, webhook reconciliation
    payments/             # provider abstraction: stripe.ts / mock.ts
    notifications/        # email/SMS providers + preference-aware delivery
    storage/              # local / s3 drivers, signed URLs
    uploads.ts, pdf.ts, merge.ts, escalation.ts
    modules/              # per-module domain logic (applications, leases,
                          #   inspections, payments, work-orders, dashboard)
```

Conventions: server components by default with mutations in per-route `actions.ts` server actions; every consequential action writes an `AuditLog` row; all user-facing dates render in `America/Los_Angeles`; all money is integer cents.

---

## California compliance notes

The app encodes guardrails for common California landlord-tenant requirements:

- **Security deposits — Civ. Code § 1950.5 and AB 12**: deposits are capped at one month's rent in the lease form logic (AB 12, effective July 1, 2024), and the move-out flow tracks the **21-day deadline** (§ 1950.5(g)) to deliver an itemized disposition statement with supporting documentation. Move-in/move-out inspection comparison provides the evidentiary basis for "beyond normal wear and tear" deductions.
- **Application screening fees — Civ. Code § 1950.6**: the screening fee is configurable with the statutory cap noted (adjusted annually for CPI — verify the current maximum), and an **itemized receipt** is generated for each applicant charged.
- **FCRA screening consent**: written authorization is captured before screening — typed legal name, timestamp, and IP address are stored on the application.
- **Disclosures**: the lease-generation checklist covers lead-based paint (pre-1978 housing, federal), bed bugs (§ 1954.603), mold (H&SC § 26147), the Megan's Law notice (Penal Code § 290.46), and flood-hazard disclosure (Gov. Code § 8589.45).
- **Habitability**: work-order categories that implicate the habitability standards of Civ. Code § 1941.1 (no heat, no water, sewage, no electricity) are auto-flagged for repair-and-deduct exposure and surfaced prominently.
- **Late fees**: the lease form warns that late fees must be a reasonable, good-faith estimate of actual costs (liquidated damages, Civ. Code § 1671).

> **Disclaimer**: This software is provided for demonstration and operational convenience only and is **not legal advice**. Statutes, caps, and deadlines change (several figures adjust annually), and local ordinances — including rent stabilization and just-cause rules in Los Angeles, Long Beach, and Pasadena — may impose stricter requirements. Consult a California landlord-tenant attorney before relying on any generated document or workflow.
