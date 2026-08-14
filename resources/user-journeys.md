# HMS — User Journeys & End-to-End Flow

**The spine of the product.** Before any module is built, this document defines *who does what first,
what happens next, and what each actor sees and does at every step* — from Platform Owner → Organization/Hospital
→ Admin → Doctors/Staff → Patients. Modules are built to serve these journeys, never in isolation.

> Read alongside `architecture.md` (the *how*), `projectrequirementdoc.md` (the *what*), and
> `development-plan.md` (the *when*). On any conflict the upstream docs win; this doc is the journey
> map that ties them together.

**Status legend:** ✅ Built · 🟡 Partial · ⏳ Planned (with the stage it lands in).

---

## 0. The hierarchy (two tiers, four actor layers)

```
TIER 0 — PLATFORM (the vendor: Takoriya Technology LLP)          ── org code PLATFORM
   └─ System Super Admin ── owns the HMS, provisions it to hospitals, sees EVERYTHING
        │  creates each hospital + its first Org Admin, assigns modules
        ▼
TIER 1 — ORGANIZATION / HOSPITAL (each customer tenant)          ── org code per hospital
   └─ Org Admin ── runs one hospital: departments, users, roles, branches, branding, settings
        │  creates staff, assigns roles, configures operations
        ▼
TIER 2 — DOCTORS & STAFF (operational roles inside a hospital)
   └─ Doctor · Receptionist · Pharmacist · Lab Technician · Cashier · (Nurse, Radiologist … later)
        │  day-to-day clinical / front-desk / billing work, scoped to their role + tenant
        ▼
TIER 3 — PATIENTS (end users of a hospital's services)
   └─ Register / login · book appointments · view records · pay · patient-facing features
```

**The golden visibility rule (invariants #1, #2):**
- **System Super Admin** sees **aggregated data across every tenant** (platform-wide stats) — but only *aggregates*, never another tenant's row-level PHI (see §5, ADR-023).
- **Everyone in Tier 1–3** sees **only their own organization/tenant's data**, enforced by PostgreSQL RLS. An Org Admin of Hospital A can never see Hospital B.

---

## 1. Tier 0 — Platform Owner / System Super Admin

**Login:** `PLATFORM` / `owner@takoriya.example` (Tier 0 lives in its own vendor org — ADR-022).

### 1.1 Onboard a hospital — *"what do I do first?"* ✅ Built (§20A / A1, A3)
1. **Register the organization/hospital** — Tenants → *Onboard tenant*: org code + name. ✅
2. **Assign modules** — pick the entitlements the hospital purchased (Patient, Appointments, OPD/EMR, Pharmacy, Lab, Billing, …); hard dependencies are auto-included. ✅
3. **Create the first Org Admin** — email + name; a **one-time temporary password** is issued for handoff. ✅ (email-invite flow ⏳ later, ADR-020)
4. **Create initial branch(es)** — optional at onboarding; more added later by the Org Admin. ✅
5. **Configure subscription / plan** — plan tier, billing terms, usage limits. ⏳ **Enterprise/Scale track** (self-serve billing deferred — development-plan §25, R5). At MVP the "plan" = the set of granted modules.

→ **Handoff:** the Org Admin now signs in with the temp password and takes over Tier 1 setup (§2).

### 1.2 Manage tenants (lifecycle) ✅ Built (§20A / A1, A3)
- Change a tenant's **status** (active / suspended / cancelled / deactivated). ✅
- **Grant / revoke module entitlements** over the tenant's lifetime (never physically deleted — invariant #6). ✅

### 1.3 Platform Dashboard — cross-tenant statistics ✅ Built (§20B)
A platform-wide overview the System Admin lands on. Aggregates **across all tenants** (super-admin only):

| Metric | Source |
|---|---|
| Total Organizations / Tenants (active vs inactive) | `tenants` (status) |
| Total Hospitals + branches (active vs inactive) | `tenants` + `branches` |
| Total Doctors (across all hospitals) | `providers` / `practitioner_roles` |
| Total Patients | `patients` (Stage 1) |
| Total Staff / Users | `users` |
| Total Appointments | `appointments` (Stage 1) |
| Entitlements per module (how many tenants use each) | `tenant_entitlements` |
| Recent onboarding activity, error rate, jobs backlog | `audit_log`, observability |

Read model: **aggregate-only, super-admin-gated** (ADR-023) — counts/metrics, never another tenant's
row-level PHI. Org Admins get an equivalent dashboard **scoped to their own tenant** (§2.5).

---

## 2. Tier 1 — Organization / Hospital Admin

**Login:** the hospital's org code + the Org Admin account (e.g. `CITYCARE` / `admin@citycare.example`).
First login uses the temp password from onboarding → should change it (forced-change ⏳ later).

### 2.1 Complete hospital setup 🟡 Partial
- Confirm org profile, branches. ✅ (branches — A2/A4) · org-profile edit ⏳
- **Branding** — brand colour + logo/favicon, persisted per tenant. ✅ (B1/B2)
- Operational settings — numbering series, letterheads, tax settings, working hours. ⏳ **Configuration Engine** (later; PRD Part VIII, development-plan §12).

### 2.2 Configure departments & services ⏳ Planned (Stage 1)
- Departments/units, service catalogue, consultation types, price lists. ⏳ (rides in with the clinical modules).

### 2.3 Add doctors, staff & users ✅ Built (§20A / A2, A4)
- Create users, assign roles, set status; per-user permission **overrides** (GRANT/DENY, time-bound). ✅
- Register **providers** (doctors) + their **specialties** (FHIR Practitioner/PractitionerRole). ✅ (create-provider UI form ⏳; read views built)
- Email invites ⏳ later (temp-password handoff now).

### 2.4 Configure operational settings 🟡 Partial
- Roles & permissions view + overrides. ✅ · custom-role editor ⏳
- Module behaviour (feature flags per tenant). ⏳ **Feature Configuration** (development-plan §12).

### 2.5 Org Admin dashboard ✅ Built (§20B)
Same shape as the platform dashboard but **scoped to this hospital only** (its users, doctors,
branches, modules today; patients/appointments/revenue as those modules land). Enforced by RLS —
never leaks another tenant.

→ **Handoff:** staff accounts exist; doctors/receptionists/etc. sign in and do day-to-day work (§3).

---

## 3. Tier 2 — Doctors & Staff (day-to-day operations)

**Access rule:** each role sees **only the modules + data relevant to its role**, within its tenant.
Menu visibility comes from the user's effective permissions; the backend re-checks every call
(auth → module entitled → permission → business logic). Foundation ✅ built; the **clinical modules
themselves are Stage 1 (MVP 0)** — development-plan §21.

| Role | Day-to-day journey (Stage 1) |
|---|---|
| **Receptionist** | Register/search patients → book/cancel appointments → check-in → collect front-desk docs |
| **Doctor** | See today's appointments → open encounter (EMR) → diagnosis/prescription → order labs |
| **Pharmacist** | Receive prescription → dispense → update stock |
| **Lab Technician** | See lab orders → collect sample → enter results → publish |
| **Cashier** | Generate invoice (consultation/pharmacy/lab) → collect payment (cash/UPI) → receipt |
| **Branch Admin** | Oversee one branch's users + operations (read-oriented) |

Today the Portal renders the **role-scoped shell + nav + 403 guards** for these roles ✅; the actual
patient/appointment/EMR/pharmacy/lab/billing screens land module-by-module in Stage 1.

---

## 4. Tier 3 — Patients

⏳ **Planned — Stage 1+ (patient-facing track).** MVP 0 is staff-facing (a clinic runs the journey
*for* the patient at the desk). The patient's own journey:
1. **Register / login** — self-registration or reception-assisted; ABHA/Aadhaar linking where legally permitted (PRD §Registration).
2. **Access available services** — the hospital's enabled, patient-facing modules only.
3. **Book appointments** — pick department/doctor/slot; reminders via the Notification service.
4. **Use patient features** — view records/prescriptions/reports, pay online, teleconsult (later).

Patients are strictly scoped to their own records within one hospital.

---

## 5. Cross-cutting: modules, permissions, and data visibility

**Two independent levers (never conflated):**
- **Module entitlement** = *whether* a tenant has a capability (bought/provisioned by the System Admin). Gate: `requireModule`.
- **RBAC permission** = *whether a given user* may do an action within an entitled module. Gate: `requirePermission`. Overridable per user (GRANT/DENY, time-bound). DENY always wins.

So a hospital can be entitled to Pharmacy while only the pharmacist users can act in it — set once by the System Admin (module), refined by the Org Admin (roles/overrides).

**Data visibility matrix:**

| Actor | Can see |
|---|---|
| System Super Admin (Tier 0) | **Aggregates across all tenants** (counts/metrics) + tenant lifecycle/entitlements. **Never** another tenant's row-level PHI. (ADR-023) |
| Org Admin (Tier 1) | Everything **within its own tenant** (all branches, users, clinical/financial data) |
| Doctor/Staff (Tier 2) | Only their tenant's data, **scoped further by role** (a cashier sees billing, not EMR) |
| Patient (Tier 3) | Only **their own** records within one hospital |

Enforced at the DB by **PostgreSQL RLS** (every tenant-scoped table) + app-layer permission checks.

---

## 6. Build order implied by the journey

1. **Platform Core + Platform Admin** (Tier 0 onboarding + Tier 1 admin) — ✅ done (Phase 0 + §20A).
2. **Platform & Org dashboards** — ✅ done (§20B; this doc's §1.3 / §2.5).
3. **Clinical modules, in journey order** (Patient → Appointment → OPD/EMR → Pharmacy → Lab → Billing) — ⏳ Stage 1 (development-plan §21), each shipped as a vertical slice (backend + Portal screen + tests + staging demo).
4. **Patient-facing track** — ⏳ Stage 1+.
5. **Config engine, feature flags, self-serve billing, advanced analytics** — ⏳ later stages / Enterprise track.

Each future module states, up front, **which journey step it serves and for which actor** — that is the acceptance context, not an afterthought.
