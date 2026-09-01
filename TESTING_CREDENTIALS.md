# Nirogix — Testing Credentials

> ⚠ **NON-PRODUCTION / DEV ONLY.** These are the known default demo accounts created by
> `npm run db:seed -w hms_backend`. The password is a hard-coded dev default — never use
> these in staging or production, and never seed this data into a production database.

## How to log in

- **Portal:** http://localhost:3001/login (run `npm run dev -w hms_frontend`)
- **API:** http://localhost:4000/api/v1 (run `npm run dev -w hms_backend`)
- **All apps at once:** `npm run dev` (repo root)
- **(Re)create the accounts:** `npm run db:seed -w hms_backend` (idempotent — creates what is missing)
- **Start over from empty:** `npm run db:seed -w hms_backend -- --reset`

The seeder also fills the database with a working hospital — about six weeks of completed traffic, a
live OPD queue with a patient in every stage, appointments ahead, invoices in every status, lab
orders at every step and stock that needs attention — so every screen and filter can be tested
without creating records first. What is covered, and what still has to be made by hand, is in
[`docs/seed-data.md`](docs/seed-data.md).

Login needs three fields: **Organization code**, **Email**, **Password**.

- **Password (every account):** `ChangeMe#123`
- **Organization codes:** `NIROGIX` (the vendor) · `CITYCARE` · `SUNRISE` · `LOTUS` · `GREENLEAF` (hospitals)

Two tiers (ADR-022): **Tier 0 = the platform owner** (the `NIROGIX` org — the vendor who provisions
Nirogix to hospitals). **Tier 1+ = each hospital** (`org_admin` down to the operational roles). A
hospital never contains a System Super Admin.

---

## ⭐ Tier 0 — Platform Super-Admins — start here

The Nirogix operator accounts that onboard new hospitals and operate **across all tenants**. They
live in their **own `NIROGIX` org** — *not* inside any hospital — and hold no clinical data. There
are **two** (so the platform is never down to a single operator account):

| Field | Value |
|---|---|
| Organization code | `NIROGIX` |
| Emails | `jaivik@thefortunetech.com` · `nishant@thefortunetech.com` |
| Password | `ChangeMe#123` (dev/staging default) |

Signed in you get the **Tenants** menu (nobody else does). From there you can:

- **Onboard a hospital** — Tenants → "Onboard tenant": org code → pick modules → first org-admin →
  optional branch. A **one-time temporary password** for the new org-admin is shown on success.
- **Manage a tenant** — open any tenant to change its status and grant/revoke module entitlements.

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"orgCode":"NIROGIX","email":"jaivik@thefortunetech.com","password":"ChangeMe#123"}'
```

---

## Tier 1+ — Hospitals

Each hospital's top role is **Org Admin** (there is no super-admin inside a hospital).

## Tenant 1 — `CITYCARE` (CityCare Multispeciality Hospital, Pune)

**The reference hospital: every module on, six weeks of traffic, a full OPD queue today.** Branches:
Kothrud (Main), Baner, Hadapsar (**inactive**). Departments: General Medicine, Cardiology,
Orthopaedics, Paediatrics, Dermatology, ENT, Psychiatry (**inactive**).

| Role | Email | Name | Portal menu visible |
|---|---|---|---|
| org_admin | `admin@citycare.example` | Dr. Ananya Sharma | Dashboard · Providers · Users · Branches · Audit · Settings (**+ edit Branding**) |
| branch_admin | `branchadmin@citycare.example` | Suresh Iyer | Dashboard · Users · Branches · Settings |
| doctor | `doctor@citycare.example` | Dr. Rajesh Gupta | Dashboard · Providers · Settings |
| doctor | `doctor2@citycare.example` | Dr. Neelam Kulkarni | (paediatrics — a second doctor to filter by) |
| doctor | `doctor3@citycare.example` | Dr. Faisal Ahmed | (orthopaedics) |
| receptionist | `reception@citycare.example` | Rahul Verma | Dashboard · Settings |
| receptionist | `reception2@citycare.example` | Snehal Jadhav | (a second desk account) |
| pharmacist | `pharmacist@citycare.example` | Meena Nair | Dashboard · Settings |
| lab_technician | `lab@citycare.example` | Karthik Menon | Dashboard · Settings |
| cashier | `cashier@citycare.example` | Pooja Deshmukh | Dashboard · Settings |
| receptionist (**disabled**) | `former.staff@citycare.example` | Vikas Bhosale | Cannot sign in — the inactive side of the Users filter |

Also seeded here: a doctor with **no roster** (Dr. Shalini Rao — free-form booking) and an
**inactive** doctor (Dr. Mohan Kelkar), a time-bound **GRANT** override on the receptionist and a
**DENY** override on the cashier.

## Tenant 2 — `SUNRISE` (Sunrise Diagnostics & Polyclinic, Ahmedabad)

**The second tenant — use it for isolation checks and to prove nothing is hard-coded to CityCare.**
Branches: Satellite (Main), Maninagar. Online booking is **off** here, self-registration **on**.

| Role | Email | Name | Portal menu visible |
|---|---|---|---|
| org_admin | `admin@sunrise.example` | Dr. Priya Patel | Dashboard · Providers · Users · Branches · Audit · Settings (**+ edit Branding**) |
| branch_admin | `branchadmin@sunrise.example` | Amit Shah | Dashboard · Users · Branches · Settings |
| doctor | `doctor@sunrise.example` | Dr. Sanjay Desai | Dashboard · Providers · Settings |
| doctor | `doctor2@sunrise.example` | Dr. Hetal Bhatt | (gynaecology) |
| receptionist | `reception@sunrise.example` | Neha Joshi | Dashboard · Settings |
| pharmacist | `pharmacist@sunrise.example` | Kiran Modi | Dashboard · Settings |
| lab_technician | `lab@sunrise.example` | Harish Trivedi | Dashboard · Settings |
| cashier | `cashier@sunrise.example` | Divya Mehta | Dashboard · Settings |

## Tenant 3 — `LOTUS` (Lotus Family Clinic, Bengaluru)

**Pharmacy and Laboratory are switched off.** Use it to check that a disabled module disappears from
the navigation *and* is refused by the API — and to see the empty states (self-registration is off,
so the Patient registrations screen has nothing in it).

| Role | Email | Name |
|---|---|---|
| org_admin | `admin@lotus.example` | Dr. Latha Srinivas |
| doctor | `doctor@lotus.example` | Dr. Girish Rao |
| receptionist | `reception@lotus.example` | Deepa Krishnan |
| cashier | `cashier@lotus.example` | Manoj Hegde |

## Tenant 4 — `GREENLEAF` (Greenleaf Wellness Centre, Indore) — **suspended**

Configured and then switched off. It exists so the Admin console's tenant status filter has a row on
the other side, and so a suspended hospital can be checked to render everywhere it appears. No
clinical history.

| Role | Email | Name |
|---|---|---|
| org_admin | `admin@greenleaf.example` | Dr. Sameera Qureshi |
| receptionist | `reception@greenleaf.example` | Ajay Malviya |

---

## Quick tests

- **Onboarding (platform admin):** `NIROGIX` / `jaivik@thefortunetech.com` → Tenants → Onboard tenant →
  the new org-admin's one-time temp password is shown; log out and sign in as that new admin.
- **Org admin (org_admin):** `admin@citycare.example` → **Users** (create a user with a role, add a
  GRANT/DENY override), **Branches** (add a branch), **Settings → Branding** (pick a brand colour,
  upload a logo — the sidebar logo + accent update live and persist across reloads).
- **RBAC (menu):** `admin@citycare.example` (full menu) vs `reception@citycare.example` (only
  Dashboard + Settings). A receptionist hitting `/providers`, `/users`, or `/admin/tenants` directly
  gets the 403 page; only super-admin sees **Tenants**.
- **Tenant isolation:** `admin@citycare.example` sees CityCare's data; `admin@sunrise.example` sees
  only Sunrise's — the two never overlap.
- **Password reveal:** the eye toggle on any password field shows/hides the value.
- **Theme:** Settings → Light/Dark toggle (persists).
- **Module entitlement:** `admin@lotus.example` has no Pharmacy or Laboratory in the sidebar, and
  hitting those routes directly is refused — while `admin@citycare.example` has both.
- **A day in the OPD:** `reception@citycare.example` → **OPD** shows this morning's queue with a
  patient in every stage (awaiting payment, awaiting vitals, vitals done, in consultation, completed,
  cancelled, and a walk-in). Nothing needs creating first.
- **Start over:** `npm run db:seed -w hms_backend -- --reset` rebuilds the whole dataset from empty.

## API login (curl)

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"orgCode":"NIROGIX","email":"jaivik@thefortunetech.com","password":"ChangeMe#123"}'
```

Returns `{ accessToken, user }` and sets the `hms_refresh` httpOnly cookie. Send the token as
`Authorization: Bearer <accessToken>` on subsequent calls.
