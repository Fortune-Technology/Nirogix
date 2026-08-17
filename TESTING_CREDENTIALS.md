# Nirogix — Testing Credentials

> ⚠ **NON-PRODUCTION / DEV ONLY.** These are the known default demo accounts created by
> `npm run db:seed -w hms_backend`. The password is a hard-coded dev default — never use
> these in staging or production, and never seed this data into a production database.

## How to log in

- **Portal:** http://localhost:3001/login (run `npm run dev -w hms_frontend`)
- **API:** http://localhost:4000/api/v1 (run `npm run dev -w hms_backend`)
- **All apps at once:** `npm run dev` (repo root)
- **(Re)create the accounts:** `npm run db:seed -w hms_backend` (idempotent)

Login needs three fields: **Organization code**, **Email**, **Password**.

- **Password (every account):** `ChangeMe#123`
- **Organization codes:** `PLATFORM` (the vendor) · `CITYCARE` · `SUNRISE` (hospitals)

Two tiers (ADR-022): **Tier 0 = the platform owner** (the `PLATFORM` org — the vendor who provisions
Nirogix to hospitals). **Tier 1+ = each hospital** (`org_admin` down to the operational roles). A
hospital never contains a System Super Admin.

---

## ⭐ Tier 0 — Platform Super-Admin (the owner) — start here

The vendor account (Takoriya Technology LLP) that onboards new hospitals and operates **across all
tenants**. It lives in its **own `PLATFORM` org** — *not* inside any hospital — and holds no clinical
data.

| Field | Value |
|---|---|
| Organization code | `PLATFORM` |
| Email | `owner@takoriya.example` |
| Password | `ChangeMe#123` |

Signed in you get the **Tenants** menu (nobody else does). From there you can:

- **Onboard a hospital** — Tenants → "Onboard tenant": org code → pick modules → first org-admin →
  optional branch. A **one-time temporary password** for the new org-admin is shown on success.
- **Manage a tenant** — open any tenant to change its status and grant/revoke module entitlements.

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"orgCode":"PLATFORM","email":"owner@takoriya.example","password":"ChangeMe#123"}'
```

---

## Tier 1+ — Hospitals

Each hospital's top role is **Org Admin** (there is no super-admin inside a hospital).

## Tenant 1 — `CITYCARE` (CityCare Multispeciality Hospital, Pune)

Branches: Kothrud (Main), Baner.

| Role | Email | Name | Portal menu visible |
|---|---|---|---|
| org_admin | `admin@citycare.example` | Dr. Ananya Sharma | Dashboard · Providers · Users · Branches · Audit · Settings (**+ edit Branding**) |
| branch_admin | `branchadmin@citycare.example` | Suresh Iyer | Dashboard · Users · Branches · Settings |
| doctor | `doctor@citycare.example` | Dr. Rajesh Gupta | Dashboard · Providers · Settings |
| receptionist | `reception@citycare.example` | Rahul Verma | Dashboard · Settings |
| pharmacist | `pharmacist@citycare.example` | Meena Nair | Dashboard · Settings |
| lab_technician | `lab@citycare.example` | Karthik Menon | Dashboard · Settings |
| cashier | `cashier@citycare.example` | Pooja Deshmukh | Dashboard · Settings |

## Tenant 2 — `SUNRISE` (Sunrise Diagnostics & Polyclinic, Ahmedabad)

Branches: Satellite (Main), Maninagar.

| Role | Email | Name | Portal menu visible |
|---|---|---|---|
| org_admin | `admin@sunrise.example` | Dr. Priya Patel | Dashboard · Providers · Users · Branches · Audit · Settings (**+ edit Branding**) |
| branch_admin | `branchadmin@sunrise.example` | Amit Shah | Dashboard · Users · Branches · Settings |
| doctor | `doctor@sunrise.example` | Dr. Sanjay Desai | Dashboard · Providers · Settings |
| receptionist | `reception@sunrise.example` | Neha Joshi | Dashboard · Settings |
| pharmacist | `pharmacist@sunrise.example` | Kiran Modi | Dashboard · Settings |
| lab_technician | `lab@sunrise.example` | Harish Trivedi | Dashboard · Settings |
| cashier | `cashier@sunrise.example` | Divya Mehta | Dashboard · Settings |

---

## Quick tests

- **Onboarding (platform owner):** `PLATFORM` / `owner@takoriya.example` → Tenants → Onboard tenant →
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

## API login (curl)

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"orgCode":"PLATFORM","email":"owner@takoriya.example","password":"ChangeMe#123"}'
```

Returns `{ accessToken, user }` and sets the `hms_refresh` httpOnly cookie. Send the token as
`Authorization: Bearer <accessToken>` on subsequent calls.
