# Demo and test data — Development and Staging

How the Development and Staging databases get their data, what that data covers, and why
Production cannot receive any of it.

> **Rule (ADR-058, ADR-114).** There are exactly **three seeders, one per environment**, and each
> refuses to run anywhere else. They are the only files anyone runs or edits.
>
> | Environment | File | Command |
> |---|---|---|
> | Development | `hms_backend/src/scripts/seed.development.ts` | `npm run db:seed -w hms_backend` |
> | Staging | `hms_backend/src/scripts/seed.staging.ts` | `npm run db:seed:staging -w hms_backend` |
> | Production | `hms_backend/src/scripts/seed.production.ts` | `CONFIRM_PRODUCTION_SEED=yes npm run db:seed:production -w hms_backend` |
>
> `hms_backend/src/scripts/seedKit.ts` is the machinery those three share — the upserts, the
> catalogue loaders, the clinical-story generator and the reset. It is not a seeder and cannot be
> run. `seedGuard.ts` is the environment check every seeder calls before its first write.

---

## 1. Which modules have seed data

| Module | Development | Staging | What is seeded |
|---|---|---|---|
| Tenancy / organisations | ✅ | ✅ | 1 platform org + 4 hospitals (dev) · 1 platform org + 1 hospital (staging), including a **suspended** tenant and one with modules switched off |
| Branches | ✅ | ✅ | 2–3 per hospital, one **inactive** |
| Departments | ✅ | ✅ | 2–7 per hospital, one **inactive** |
| Users & roles | ✅ | ✅ | Every system role, plus a second doctor/receptionist and one **disabled** account |
| Permission overrides | ✅ | ✅ | One time-bound **GRANT**, one **DENY** (invariant #3, ADR-010) |
| Providers | ✅ | ✅ | 2–6 per hospital: rostered, roster-free, and one **inactive** |
| Provider schedules | ✅ | ✅ | Full-week morning + evening OPD roster |
| Patients | ✅ | ✅ | 12–26 per hospital, varied gender / city / blood group / age / registration date, one **inactive**, two with **no history at all** |
| Immunisations | ✅ | ✅ | Childhood schedules on the paediatric charts |
| Appointments | ✅ | ✅ | Past, today and future — `booked` / `completed` / `cancelled` / `no_show` |
| OPD visits & queue | ✅ | ✅ | Six weeks of completed traffic plus a live queue with a patient in every stage |
| EMR encounters | ✅ | ✅ | `draft` (vitals only), `draft` (in progress) and `signed`, with SOAP notes, vitals, ICD-10 diagnoses |
| Prescriptions | ✅ | ✅ | `ordered` (pharmacy worklist) and `dispensed` |
| Laboratory | ✅ | ✅ | Test master + orders at every status, results flagged normal / low / high / **critical** |
| Pharmacy | ✅ | ✅ | Drug master, suppliers, batches (incl. **near expiry**), **below-reorder** stock, stock adjustments |
| Billing | ✅ | ✅ | Invoices `draft` / `partially_paid` / `paid` / `void`, all four payment methods, one **refunded** payment |
| Services catalogue | ✅ | ✅ | 5–9 priced services, one **retired** |
| Referrals | ✅ | ✅ | `pending` / `completed` / `cancelled`, each from a real visit |
| Patient self-registration | ✅ | ✅ | Requests `pending` / `approved` / `rejected` (and one tenant with the feature **off**, for the empty state) |
| Online booking | ✅ | ✅ | Requests `pending` / `approved` / `rejected` |
| Organisation profile | ✅ | ✅ | Full legal/contact/letterhead details (one tenant left blank on purpose) |
| Branding | ✅ | ✅ | A distinct brand colour per hospital, so nothing is hard-coded to the default |
| Notifications log | ✅ | ✅ | `sent` / `queued` / `failed` across email and SMS |
| Audit log | ✅ | ✅ | Every seeded action writes a real entry, plus 30 backdated days across all four severities |
| Module entitlements | ✅ | ✅ | All BUILT modules on for most tenants; pharmacy + laboratory **off** for one |

Typical Development volume after a reset (CityCare, the reference hospital): 11 users · 6 providers ·
26 patients · 122 appointments · 137 visits · 132 encounters · 142 invoices · 188 payments ·
170 prescriptions · 65 dispenses · 11 lab tests · 12 drugs · 5 suppliers · 9 services · 4 referrals ·
7 registration requests · 7 booking requests. Sunrise, Lotus and QA General Hospital are smaller but
built the same way.

---

## 2. Which workflow states are covered

**Appointments** — future `booked`, today `booked`, past `completed`, `cancelled`, `no_show`.

**OPD / check-in** (today's live queue, one patient per row):

| Queue state | How it appears |
|---|---|
| Waiting for payment | `checked_in`, consultation-fee invoice `draft` |
| Waiting for vitals | `checked_in`, fee paid, no encounter opened |
| Vitals recorded, waiting for the doctor | `checked_in`, `draft` encounter carrying vitals only |
| Consultation in progress | `in_consultation`, `draft` encounter, note half written |
| Consultation completed | `completed`, `signed` encounter |
| Sample collected, result pending | `completed` + lab order `collected` |
| Result in, awaiting verification | `completed` + lab order `resulted`, **critical** flag |
| Finished and settled | `completed`, verified result, dispensed prescription, invoice `paid` |
| Walk-in, part payment | `checked_in`, no appointment, invoice `partially_paid` |
| Cancelled at the desk | `cancelled` |
| Referred and re-opened | a second same-day visit created **from** a referral |

**Billing** — `draft`, `partially_paid`, `paid`, `void`; payments in `cash` / `upi` / `card` /
`netbanking`, one `refunded`. Most completed visits settle before the patient leaves; some walk out
owing the balance the lab and pharmacy charges added, which is what puts rows on both sides of the
status filter.

**Cases (visits)** — new (`checked_in`), ongoing (`in_consultation`), follow-up (a returning patient
with several past visits), closed (`completed`), `cancelled`.

**Laboratory** — `ordered`, `collected`, `resulted`, `verified`, `cancelled`; result flags `normal`,
`low`, `high`, `critical`.

**Pharmacy** — prescriptions `ordered` and `dispensed`; batches near expiry and far; two drugs below
their reorder level; five stock adjustments with reasons, in both directions.

**Referrals** — `pending`, `completed` (consumed by a check-in), `cancelled`.

**Patients** — brand new with nothing on the chart · previous visits · several cases · billing
history · appointments · vitals history · immunisation history · deactivated.

**Public submissions** — registration and booking requests `pending`, `approved`, `rejected`.

---

## 3. Which filters have matching records

| Screen | Filter | Seeded values |
|---|---|---|
| Patients | Search (UHID / name / phone) | 55+ charts with distinct names, UHIDs and numbers |
| Patients | Gender | `male`, `female`, `other` |
| Patients | Status | `active`, `inactive` |
| Patients | City | 3–4 cities per hospital, each with several patients |
| Patients | Registered between | Spread from ~two months back to this week |
| Appointments | Status | `booked`, `cancelled`, `completed`, `no_show` |
| Appointments | Date range | Six weeks back to two weeks ahead |
| Appointments | Doctor | Every active provider has appointments |
| Appointments | Patient | Repeat patients carry several |
| OPD queue | Date | Today plus every history day |
| OPD queue | Status | `checked_in`, `in_consultation`, `completed`, `cancelled` |
| OPD queue | Branch / doctor | Visits alternate across branches and rotate across doctors |
| Billing | Status | `draft`, `partially_paid`, `paid`, `void` |
| Billing | Amount range | ₹50 to ₹2,500+ per invoice |
| Billing | Patient | Repeat patients have billing history |
| Laboratory | Status | `ordered`, `collected`, `resulted`, `verified`, `cancelled` |
| Laboratory | Patient / test | 8–11 tests, ordered across many patients |
| Pharmacy | Search / low stock | 8–12 drugs, two below reorder level |
| Referrals | Status | `pending`, `completed`, `cancelled` |
| Users | Role | Every system role |
| Users | Status | `active`, `inactive` |
| Providers | Specialty / active | Several specialties, one inactive doctor |
| Services | Active | Active and retired |
| Registrations / Booking requests | Status | `pending`, `approved`, `rejected` |
| Audit | Severity | `info`, `notice`, `warning`, `critical` |
| Audit | Date range | 30 backdated days plus today |
| Audit | Search (action / resource) | Login, patient, invoice, RBAC and entitlement actions |
| Admin → Tenants | Status | `active` and a `suspended` tenant |
| Admin → Tenants | Modules | One tenant with pharmacy + laboratory switched off |

**Empty states** are seeded on purpose too: two patients per hospital with no history, a clinic with
no pharmacy or laboratory, a tenant with no clinical data at all, and a tenant with
self-registration turned off.

**Pagination** — patients, appointments, visits, invoices and the audit log all exceed one page at
the default page size in Development.

---

## 4. How Development and Staging data is generated and reset

```bash
npm run db:migrate -w hms_backend        # schema + RLS + audit-immutability trigger
npm run db:seed -w hms_backend           # development: create what is missing
```

```bash
npm run db:seed -w hms_backend -- --reset
```

```bash
npm run db:seed:staging -w hms_backend
```

```bash
CONFIRM_SEED_RESET=yes npm run db:seed:staging -w hms_backend -- --reset
```

- **Today's board is rebuilt on every run (ADR-133).** The OPD queue, the vitals queue, the
  arrivals board and "seen today" are relative to the day the seeder runs, and the clinical history
  is not — so they are seeded differently. The history runs once per tenant; **today's queue and
  arrivals are re-created whenever the day has none**, which means an environment seeded last week
  still has a live board this morning, and a deploy gives staging one without a reset. A day that
  already has a queue is left exactly alone.
- **Staging is shaped like development, at QA scale (ADR-132).** Three hospitals plus the vendor
  org: **QAHOSP** (every module, six weeks of traffic at three visits a day, 28 charts),
  **QACLINIC** (pharmacy and laboratory **off**, three weeks of traffic — the tenant that proves
  module entitlement hides a whole area of the product, and the second tenant isolation is tested
  against), and **QACLOSED** (**suspended**, configuration only). It had one hospital before, which
  meant the two properties a multi-tenant platform lives or dies by — isolation, and a module a
  hospital has not bought — could not be exercised on staging at all.
- **Staging seeds itself on every deployment (ADR-122).** The staging deploy workflow runs
  `db:seed:staging` immediately after `db:migrate`, so a new table, a new reference record or a new
  demo record reaches staging on the deploy that ships it. Nobody has to remember. The command above
  is for first bring-up and for running it by hand.
- **Re-running without `--reset` is safe, and "safe" means specific things.** The seeder converges
  on *present*, never on the dataset's values:

  | It does | It never does |
  |---|---|
  | Create a record that is missing | Update a record that exists |
  | Seed a table added since the last run | Delete or truncate anything |
  | Add a record added to the dataset since the last run | Reset a field a person edited |
  | Fill a **newly added column where it is NULL** | Overwrite a value somebody typed |

  So a patient renamed on the staging site keeps the new name, a service repriced by QA keeps the
  new price, a public form somebody turned off to test the disabled state stays off, and a
  deliberately-disabled account that QA re-enabled stays enabled.
- **Records are matched on a stable key, never a display name.** A tenant by code, a user by email,
  a branch and a department by code, a provider by registration number, a lab test and a service by
  code, a supplier and a drug by name, a **patient by phone number**, a public request by the phone
  that submitted it, a notification by its idempotency key, a permission override by (user,
  permission). Two people share a name; two services can both be called "Dressing".
- **Actions with no record of their own are marked done.** Applying the organisation profile, the
  brand colour, the three public-form toggles, the clinical history and every column backfill each
  write a row in `seed_markers` and are then never repeated. The marker is written *after* the work
  succeeds, so a deploy that fails half-way finishes the job next time. The **clinical story runs
  once** for the same reason it always did: replaying it would double every day's traffic and
  collide with its own live queue. Regenerating it is what `--reset` is for, and `--reset` clears
  the markers along with everything else.
- **Adding seed data for a new table** is one addition to the dataset in `seed.staging.ts` (and
  `seed.development.ts`) plus, if the records have no natural key already, one `ensure()` call in
  `seedKit.ts` naming the column that identifies them. **Adding a column to an existing table** that
  needs a value on old rows is one entry in `applyBackfills()` — it must fill only where the column
  is NULL. Both then run automatically on the next staging deploy.
- **`--reset` empties every tenant-scoped table**, plus the tenant list and the patient identities
  that sit outside tenancy, then reseeds. The table list is *discovered* (every table with a
  `tenant_id` column — the same rule that decides where RLS is applied), so a table added next month
  is reset without anyone remembering to add it here. The global catalogues (permissions,
  specialties, reference data) are left alone.
- **Staging additionally requires `CONFIRM_SEED_RESET=yes`**, because staging is shared and a reset
  destroys whatever QA is part-way through. Development needs only the flag — that database is
  yours.
- **The data is deterministic.** Every choice runs through a PRNG seeded from the tenant code, so
  the same seeder against an empty database always produces the same organisation, the same accounts,
  the same UHIDs in the same order and the same queue. Staging's dataset is a contract the E2E suite
  asserts against.
- **Records are created through the real services**, not by writing rows: numbering, invoicing, stock
  deduction, referral consumption, the visit state machine and the audit trail behave exactly as they
  do in the product. Timestamps are then moved back to the day the story says the visit happened,
  because a database with one day of history cannot exercise a date range, a revenue trend, a
  collections report or an EOD summary.

---

## 5. Production cannot receive demo data

Five independent reasons, any one of which is sufficient:

1. **The production seeder does not import the demo-data engine.** `seed.production.ts` has no
   reference to `seedKit.ts` — there is no flag, environment variable or code path in it that
   reaches a hospital, patient, appointment or invoice. It seeds the permission catalogue, the
   specialty catalogue, the reference data, the system roles, and optionally the vendor's own
   platform org with one operator account.
2. **Every seeder declares its environment and refuses to run anywhere else.**
   `requireEnvironment()` compares `NODE_ENV` with the environment the file is written for and
   throws otherwise. Running the development seeder with `NODE_ENV=production` (or `staging`) is
   refused before the first write, and exits with code 2.
3. **`DATABASE_URL` is inspected as well**, because the connection string is what actually decides
   which database gets written. A non-development-looking URL is refused even when `NODE_ENV` says
   `development` — the realistic accident is a copied `.env`, not malice.
4. **The production seeder requires an explicit confirmation variable**
   (`CONFIRM_PRODUCTION_SEED=yes`) before it writes anything at all.
5. **The only automated seeding is in the staging workflow, and it checks first** (ADR-122).
   `.github/workflows/deploy-staging.yml` triggers only on the `staging` branch against the staging
   VM, and before invoking the seeder it asserts `NODE_ENV=staging` in that VM's
   `hms_backend/.env`, aborting the deploy with a stated reason otherwise. No production workflow
   runs a seeder, and no workflow anywhere passes `--reset`.

**There is no reset path in production.** `resetSeedData()` lives in `seedKit.ts`, which the
production seeder does not import. Nothing in this repository can truncate a production table.

Verified by running each refusal:

```
seed refused: This is the development seeder, but NODE_ENV is "staging". Seeders never adapt to
              their surroundings — run the staging seeder instead.
seed refused: This is the production seeder, but NODE_ENV is "development".
seed refused: Refusing to run the development seeder: DATABASE_URL does not look like a development
              or staging database.
seed refused: Resetting staging empties every tenant table … Re-run with CONFIRM_SEED_RESET=yes.
```

No environment ever receives real patient information. Every name, number, address and clinical note
in the dataset is invented.

---

## 6. What still needs manual creation, and why

| Area | Why it is not seeded |
|---|---|
| **Uploaded files** — patient documents, lab report PDFs, tenant logo and favicon, letterhead image | Seeding these means writing binaries into object storage (R2) or the local store, which is environment configuration rather than database content. The metadata tables exist; upload one file through the UI to exercise the flow. |
| **ABDM / ABHA records** — consents, care contexts, linkages | Every one of them is produced by a live exchange with the ABDM gateway, and inventing rows would make the screens claim a linkage that no gateway would recognise. The module is entitled and the offline mock provider works; run the flow. |
| **Clinic-flow workflow configuration and the vitals queue** (ADR-113) | Being built in parallel; only `BUILT` features are ever seeded (ADR-038). The hospital-level workflow config falls back to the platform default, and vitals are recorded at consultation. Seed data lands in the change that ships the feature. |
| **Support sessions** (operator entering a tenant) | Deliberately short-lived and audited; a seeded one would be a stale, permanently open door into a tenant. Start one from the Admin console. |
| **Password-reset and OTP tokens, sessions** | Single-use and time-bound by design. A seeded token is either already expired or a committed credential. |
| **Real notification deliveries** | The log is seeded; nothing is *sent*. A seeder that called MSG91 would put real messages on real phones. |
| **Insurance, IPD, radiology, and every other `AVAILABLE`-but-unbuilt module** | Not built. Seeding data for them would be the database asserting a capability the product does not have (ADR-038). |

Three lifecycle states are written directly rather than through a service, because the product has
no action that produces them yet. Each is listed at its call site in `seedKit.ts` and tracked in
`BACKLOG.md`:

- appointment **`no_show`** — a filter value with no button behind it;
- invoice **`void`** and payment **`refunded`** — no void/refund action exists;
- lab order **`cancelled`** and result flag **`critical`** — no cancel action, and `critical` cannot
  be derived from a reference range.

---

## Accounts

Development accounts and the dev password are in [`TESTING_CREDENTIALS.md`](../TESTING_CREDENTIALS.md).
Staging accounts are the `qa.*@qahospital.example` set in `seed.staging.ts`. Operator passwords for
staging and production are never written into this repository.
