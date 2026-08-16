# Development Phases & Roadmap

**Document:** `phases.md`  
**Version:** 1.0  
**Last Updated:** August 2026  
**Prepared for:** Takoriya Technology LLP  
**Source of Truth:** Enterprise HMS — Architecture and Development Roadmap v2.1, plus two corrections identified in subsequent review (permission-cache expiry bound; break-glass notification/review boundary).

---

For full functional scope of each module referenced below, see **Project Requirements Document**. For the technical architecture each milestone builds against, see **Architecture Document**.

---

## Contents

- **How Development Proceeds**
  - [How This Roadmap Works (six-step loop)](#how-this-roadmap-works-six-step-loop)
  - [MVP Target Segment & Scope](#mvp-target-segment--scope)
- **Roadmap**
  - [Phase 0 — Platform Foundation](#phase-0--platform-foundation)
  - [MVP 0 — Clinic Pilot](#mvp-0--clinic-pilot)
  - [MVP 1 — Clinic Expansion](#mvp-1--clinic-expansion)
  - [Phase 2 — Small Hospital / Nursing Home Edition](#phase-2--small-hospital--nursing-home-edition)
  - [Phase 3 — Compliance & Interoperability](#phase-3--compliance--interoperability)
  - [Phase 4 — Hospital-Grade / Enterprise Expansion](#phase-4--hospital-grade--enterprise-expansion)
  - [Postponed / Build-as-Sold](#postponed--build-as-sold)
- **Reference**
  - [Dependency Map](#dependency-map)
  - [Definition of Done](#definition-of-done)

---

## How Development Proceeds

### How This Roadmap Works (six-step loop)

Every milestone below follows the same six-step loop, and is not considered complete until all six are done for that milestone:

1. **Backend** — schema, migrations, business logic, services, API endpoints
2. **Frontend** — UI/UX for every role that touches this milestone
3. **Integration** — frontend wired to real APIs, with loading/error/empty states, validation, and permission-based rendering
4. **Testing** — automated + manual verification before moving on
5. **Documentation** — KNOWLEDGE.md updated and DONE.md appended for every app/package touched
6. **Staging Verification** — deployed to staging and demoable end-to-end before the milestone is considered complete

See **Definition of Done**, below, for the full checklist every milestone must additionally satisfy.

Phases 0–1 below are specified in full detail — this is the next 2–3 months of real work. Phases 2–4 are specified as a directional roadmap (modules, dependencies, rationale) rather than full backend/frontend/testing detail, since that level of planning is more useful done just before each phase starts, once Phase 1 has taught you your actual team velocity and customer priorities. This is intentional — a rolling-wave plan, not a gap.

### MVP Target Segment & Scope

> **Target segment assumption:** This roadmap assumes the MVP targets **single/multi-doctor OPD clinics and small nursing homes without inpatient beds** — the fastest path to a sellable, revenue-generating product, and the customer segment your own competitive review flagged as needing the least of this document's full business-module scope (Part II). Inpatient (IPD), OT, Blood Bank, and the other hospital-grade modules are sequenced into Phase 2 and Phase 4, not excluded — reorder them earlier if you already have a hospital pilot lined up that needs beds from day one.

## Roadmap

### Phase 0 — Platform Foundation

Not a customer-facing module — the one-time investment every later milestone depends on. Build it as its own end-to-end slice: a real login, a real (empty) role-based dashboard, deployed to staging, provably tenant-isolated. Nothing in Phase 1 starts until this is done.

**Backend**

- Tenant model + provisioning; tenant_id and RLS policy template applied to every future table
- Users & auth — password hashing, login endpoint, JWT access + refresh token issuance, logout/session revocation
- RBAC engine — roles, permissions, role_permissions tables, permission-check middleware; seed a reduced MVP role set: Super Admin, Org Admin, Branch Admin, Doctor, Receptionist, Pharmacist, Lab Technician, Cashier
- Audit log service — generic audit_log table + a writeAudit() helper wired into shared middleware
- Notification service skeleton — notification_log table, send() abstraction, template storage; SMS/WhatsApp via MSG91 (DLT entity + template registration completed in Phase 0 — 24–48hr operator approval), transactional email via AWS SES in ap-south-1 (Mumbai) or ap-south-2 (Hyderabad), with SES production access requested early, not at launch
- FileStorageService abstraction — E2E Object Storage (EOS, India-resident) as the primary store for PHI-bearing files; default-private buckets with short-lived signed URLs, server-side file-type/size validation, database stores metadata and references only, never file content
- API conventions — Express scaffold, consistent error-response shape, Zod request validation, pagination helper, /api/v1 versioning, OpenAPI/Swagger auto-doc
- Minimal hospital/clinic + branch setup tables, used by every module downstream
- Patient self-registration by QR (added 2026-08-16, ADR-056) — an opt-in, per-tenant opaque token behind a public form that creates a **registration request**, reviewed and converted by the front desk. Platform Core, not a purchasable module, and not a public signup: nothing on the public path writes to `patients`, so ADR-052 stands. Letterhead (header line, footer, default signatory) is part of the same `organization_profile` record.
- Departments (added 2026-08-16, ADR-050) — a real tenant-scoped entity with branch scoping, head of department and a specialty link, replacing the free-text department on a visit. Platform Core, not a purchasable module. Sub-departments, services, packages and treatment plans are **not** part of this and are tracked in `BACKLOG.md`; ward/room/bed setup stays in Phase 2 with IPD.
- Module entitlement system — module catalog with dependency graph, tenant_entitlements table (tenant, module, optional branch), requireModule() middleware checked before permission checks
- RBAC engine extended with user_permission_overrides (grant/deny) on top of role defaults; dot-hierarchy permission keys shared with the frontend via a packages/permissions package
- Provider/specialty core tables aligned to FHIR Practitioner/PractitionerRole, plus a specialty_form_templates table for specialty-varying structured data

**Frontend (Portal)**

- Auth screens — login, forgot/reset password, MFA prompt scaffold (enforcement can be off for MVP, screen exists)
- App shell — sidebar/topbar navigation, menu items driven by RBAC permissions rather than hardcoded per role
- Empty-state dashboard per role — real widgets arrive as their modules are built
- Shared component library bootstrap in packages/ui — buttons, inputs, tables, modals, toasts — every later module reuses these instead of reinventing UI patterns
- Design tokens (font family/size/weight/line-height, spacing scale, radius, palette, shadows) defined once in packages/ui, with Light and Dark variants — no component hardcodes a raw value; Light is the default theme
- Standard DataTable component — pagination, rows-per-page, single/multi-column sorting, search, filtering, column visibility, row selection, server-side mode for large datasets, and loading/empty/error states; modules supply only data + column config
- Branding token layer — tenant logo, colors, and typography consumed from the centralized branding system, never hardcoded into a component
- Client-side capabilities context (entitled modules + effective permissions) fetched once at login; a reusable Can guard component/hook drives menus, tabs, buttons, and route access; a proper 403/forbidden page for manually entered unauthorized URLs — never a blank screen

**Marketing Site**

- Minimal scaffold with the single Login action wired to the Portal's /login route, as decided in the architecture section

**Frontend topology (added 2026-08-16, ADR-051)**

- Five frontends, one backend, one origin per audience: `marketing`, `hms_frontend` (hospital staff), `admin` (vendor operators), `patient` (verified patients), `aiportal` (authorised staff + operators). The platform-operator surface moved out of the Portal, so operator code no longer ships in a hospital's bundle.
- **`admin` is built.** Platform dashboard, tenant management, module provisioning, support sessions, platform branding and the audit viewer run on `:3002` against the same backend.
- **`patient` is built.** Identity model and read API (ADR-052) plus the portal itself, shipped 16/08/2026: two-step sign-in with a one-time code, a hospital picker, and read-only profile, appointments, bills and resulted lab reports. Access is granted by the hospital — there is no signup. Sessions survive a reload, rotate on every refresh, and are revoked server-side on sign-out (F-8). Portals & Mobile Apps remain Phase 3 scope for anything beyond this read-only portal.
- **`aiportal` is built as a boundary only.** Staff sign-in, an `ai.portal.access` gate held by **every staff role** (ADR-055), a patient principal refused by type, entry audited, and a landing screen that states no capability is enabled — shipped 16/08/2026 (ADR-053). **AI is approved scope but postponed** — the PRD lists AI-assisted EMR aids and an Advanced BI & AI add-on, and this document's own Postponed / Build-as-Sold section is where they sit. Nothing is built or under way: `capabilities` is an empty list with a test asserting it stays empty, and the CDSCO condition stands: any diagnostic-support feature needs a CDSCO classification check before a line is written. `nirogix.ai` is not registered, so this is development-only.

**Integration**

- Portal auth flow — token storage (httpOnly refresh cookie + in-memory access token), 401 → refresh → retry handling, unauthenticated redirect to /login

**Deployment / Ops**

- Hosting on E2E Networks — MeitY-empanelled, India data-sovereignty positioning; managed PostgreSQL (E2E DBaaS) provisioned as a separate service from day one, not co-located with the application server
- Automated daily database backups with point-in-time recovery configured and restore-tested before the first paying customer goes live
- Redis co-located on the application VM for MVP (permission-set cache, BullMQ queue); Cloudflare retained in front of all public traffic for CDN/WAF/DDoS protection only — not as the store of record for any data
- Staging environment stood up — subdomain, Nginx, PM2 under the existing service user, GitHub Actions pipeline auto-deploying a staging branch
- Structured logging (e.g. pino) + error tracking wired in from day one
- Seed script creating 2+ demo tenants with a handful of users per role — used for manual QA and automated tenant-isolation tests
- All seed/demo data reflects a genuinely Indian healthcare context — patient/doctor/staff names, hospital and clinic names, addresses, cities, states, and PIN codes drawn from across India, spanning small clinics, multi-specialty hospitals, diagnostic centers, and standalone pharmacies; no generic placeholder names in any environment a stakeholder or pilot customer might see

**Documentation Scaffolding**

- Root CLAUDE.md created — architecture, monorepo structure, tech stack, coding/UI/theming/branding conventions, auth/RBAC/entitlement architecture, API and database conventions, testing and deployment conventions, cross-referenced to every app and package
- Every app (backend, portal, marketing) and package (ui, types, config, utils, permissions) scaffolded with its own KNOWLEDGE.md (current architecture and state) and DONE.md (append-only implementation log)

**Definition of Done**

- Can log in as each seeded role and see a role-appropriate dashboard
- Unauthenticated requests return 401; authorized-but-forbidden requests return 403
- Automated test proves tenant A's API calls never return tenant B's data
- A login attempt produces an audit_log row
- A test notification sends successfully through the real provider in staging
- CI runs lint + tests + build on every push and auto-deploys staging on merge
- Swagger/OpenAPI docs render and reflect the auth endpoints
- A tenant without a given module’s entitlement receives a proper 403/404 on that module’s routes, and the corresponding UI entry is hidden
- A user-specific permission override (both grant and deny) is provably enforced, and itself produces an audit-log entry
- Root CLAUDE.md and KNOWLEDGE.md/DONE.md stubs exist for every app and package, cross-referenced from the root
- A sample shared component (e.g. a button) renders correctly in both Light and Dark themes and under a second demo tenant’s branding

### MVP 0 — Clinic Pilot

**Goal:** a real clinic can run the basic patient journey — registration → appointment → consultation → payment — entirely on what this sub-phase delivers.

#### 1.1 — Patient Management — `§9 · Size: M`

*Depends on: Phase 0 only*

**Backend**

- Tenant-scoped patients table, UHID generation, demographics, family/dependent linking, photo-capture endpoint, search API (name/phone/UHID)

**Frontend**

- Registration form, patient search/list screen, patient profile view

**Integration**

- Photo upload flow; duplicate-patient warning triggered on search-before-create

**Testing**

- UHID uniqueness within tenant · search performance at realistic seed volume (thousands of records) · Receptionist can create/edit, Doctor can view only

#### 1.2 — Appointment Management — `§10 · Size: M`

*Depends on: 1.1 Patient Management*

**Backend**

- Appointment table, doctor availability/slot model, booking/cancel/reschedule logic, conflict prevention

**Frontend**

- Calendar/slot-picker UI, doctor's day view, receptionist booking screen

**Integration**

- Booking triggers a reminder notification via the Phase 0 notification service

**Testing**

- Double-booking prevention · cancellation frees the slot · reminder actually sends in staging

#### 1.3 — OPD & Check-in + Billing Core — `§11, §24 (core) · Size: L`

*Depends on: 1.2 Appointment Management*

**Backend**

- Visit/encounter table (the record everything in a visit hangs off), token/queue logic, invoice + invoice_line_item + payment tables, payment collection endpoint (cash + UPI for MVP; full gateway integration can follow)

**Frontend**

- Front-desk queue/token board, check-in action, billing/receipt screen for the consultation fee

**Integration**

- Check-in automatically creates a visit and a draft consultation-fee invoice line

**Testing**

- Queue ordering correctness · invoice totals correct · receipt printable/downloadable

#### 1.4 — Clinical Workflow / EMR — `§12 · Size: L`

*Depends on: 1.3 OPD & Check-in (needs an active visit context)*

**Backend**

- Consultation notes, vitals, diagnosis (ICD-10 lookup), prescription table, doctor's orders referencing pharmacy/lab

**Frontend**

- Doctor's consultation screen — vitals entry, notes, diagnosis picker, prescription writer

**Integration**

- Prescriptions and lab orders created here are the input queue for 1.5 and 1.6 — those two can be built in parallel once this milestone lands

**Testing**

- Prescription/order records correctly reference visit + patient · a doctor cannot edit another doctor's notes unless explicitly permitted

### MVP 1 — Clinic Expansion

**Goal:** the same clinic can now dispense medication, order and report lab tests, and see its own basic operational numbers — without leaving the platform for any of it.

#### 1.5 — Pharmacy Management (MVP subset) — `§22 · Size: M`

*Depends on: 1.4 EMR (prescriptions), 1.3 Billing Core*

**Backend**

- Drug master, batch/stock table, dispense-against-prescription logic with stock deduction, low-stock flag; simple manual stock-adjustment screen stands in for full procurement (deferred to Phase 2)

**Frontend**

- Pharmacist dispensing screen pulling pending prescriptions, stock list, manual stock adjustment

**Integration**

- Dispensing adds a Pharmacy line item to the visit's invoice, extending Billing Core

**Testing**

- Stock correctly decremented · cannot dispense beyond available stock · dispensed items appear correctly on the patient's bill

#### 1.6 — Laboratory Management (MVP subset) — `§14 · Size: M`

*Depends on: 1.4 EMR (orders), 1.3 Billing Core*

**Backend**

- Test master, order table, sample status tracking (ordered → collected → resulted), result entry, PDF report generation

**Frontend**

- Lab technician worklist, result entry screen, report view/download for doctor and patient

**Integration**

- Report-ready triggers a notification; lab charges added as invoice line items

**Testing**

- Results correctly attached to the right order/patient · report PDF generates correctly · abnormal-value flag visible to the ordering doctor

#### 1.7 — Basic Reports — `§53 (MVP subset) · Size: S`

*Depends on: 1.1 – 1.6 (aggregates their data)*

**Backend**

- Query-based reports — OPD register, daily collection/revenue, patient list, pending-lab-results list

**Frontend**

- Report screens with date-range filters and CSV/PDF export

**Testing**

- Report totals reconcile against underlying transaction data

### Phase 2 — Small Hospital / Nursing Home Edition

| Module | Depends on | Rationale |
|---|---|---|
| Admission (IPD) Management — §16 | Patient, Billing Core | Adds bed/ward as a new invoice line-item type, same pattern as Pharmacy/Lab |
| Nursing Module — §13 | IPD | Bedside charting needs an admission to chart against |
| Inventory, Stores & Procurement — §23 | Pharmacy (MVP) | Deepens the MVP's manual stock-adjustment into a full indent→PO→GRN cycle |
| Radiology, Imaging & PACS/RIS — §15 | EMR, Billing Core | Same data-model pattern as Laboratory — reuses most of its UI |
| Insurance, TPA & Govt. Schemes — §25 | Billing Core | Needed once mid-size hospital customers with cashless patients arrive |
| Financial Management — §26 | Billing Core, Inventory | P&L reporting needs both revenue and cost data flowing |
| Emergency Department — §17 | Patient, Billing Core | Optional — only if target customers run a casualty department |

### Phase 3 — Compliance & Interoperability

| Module | Depends on | Rationale |
|---|---|---|
| ABDM Integration (M1 first, M2/M3 after) — §36 | Patient Management | M1 (ABHA) is a light lift; M2/M3 (HIP/HIU) needs legal/compliance review before build starts |
| Formal DPDP/Security hardening, VAPT — §55 | All prior phases | Formalized ahead of any customer-driven compliance audit, not built from scratch here — the architecture already assumes this from Phase 0 |
| Full Reports & BI suite — §53 | All transactional modules | The 300+ report catalog only makes sense once the underlying modules exist |
| CRM & Patient Engagement — §33 | Patient, Notification service | Recall/preventive-care campaigns reuse the Phase 0 notification engine |
| Notification Engine — depth — §49 | Phase 0 skeleton | WhatsApp Business API and broadcast campaigns added on top of the existing Email/SMS skeleton |
| Portals & Mobile Apps — depth — §6 | Portal (web) | Dedicated native apps only if the web Portal proves insufficient for a given role |

### Phase 4 — Hospital-Grade / Enterprise Expansion

Build opportunistically — ideally pre-sold to a specific customer before committing engineering time, since sequencing here is driven by demand more than technical dependency.

| Module | Depends on | Note |
|---|---|---|
| Operation Theatre — §18 | IPD | — |
| CSSD — §19 | OT | — |
| Blood Bank — §20 | Patient, Billing Core | Largely independent of the clinical modules above it |
| Specialty Clinical Modules — §21 | EMR | Build only the specific specialty a paying customer needs, not all ten at once |
| Ambulance & Fleet — §29 | Patient | Sequence by customer demand |
| Biomedical Equipment & Asset Mgmt — §30 | — | Sequence by customer demand |
| Biomedical Waste Management — §31 | — | Sequence by customer demand |
| Housekeeping & Laundry — §28 | IPD (ward context) | Sequence by customer demand |
| Dietary & Kitchen — §27 | IPD | Sequence by customer demand |
| HR, Payroll & Doctor Scheduling — §32 | — | Significant statutory-compliance lift (PF/ESIC/TDS) — confirm hospital customers actually want this from you, not their existing HR software, before committing time |

### Postponed / Build-as-Sold

Not assigned to a fixed phase — build only when a specific customer or requirement makes it necessary.

- GeM registration readiness — relevant only once pursuing government hospital contracts
- Multi-region / horizontal auto-scaling infrastructure (§57) — until a single VPS actually can't keep up
- AI-assisted predictive analytics or clinical decision support — requires a CDSCO classification check before any diagnostic-support feature is built
- Deep HL7 equipment interfacing — build per specific lab/imaging device a customer actually owns, not speculatively

## Reference

### Dependency Map

The critical path through the MVP, and how later phases attach to it.

| Chain | Notes |
|---|---|
| Foundation → Patient → Appointment → OPD+Billing Core → EMR → {Pharmacy ∥ Lab} → Reports | The Phase 1 critical path — Pharmacy and Lab can be built in parallel once EMR exists |
| Patient + Billing Core → IPD → Nursing | Phase 2 branch |
| IPD → OT → CSSD | Phase 4 branch, gated behind IPD |
| Patient → Blood Bank | Mostly independent — can be pulled forward if a customer needs it early |
| Notification Service (Phase 0) → Appointment reminders, Lab report alerts, CRM campaigns | One shared service, reused by every later module — never rebuilt |
| Billing Core (1.3) → Pharmacy, Lab, IPD, Insurance/TPA, Financial Management | Every future revenue-generating module extends this same engine with a new line-item type |

### Definition of Done

A milestone's **Definition of Done** also always includes, on top of its own testing bullets:

- Deployed to staging and demoable end-to-end by a non-developer
- Migrations are additive and reversible; no destructive schema changes
- Full automated regression suite passes — not just this milestone's new tests
- Tenant isolation — Tenant A must never access Tenant B's records
- Module entitlement, both directions — an entitled tenant's access works; a non-entitled tenant's access is denied with a proper 403/404, not partial access
- RBAC, both directions — an authorized role's access works; an unauthorized role's access is denied
- User override, both directions — an explicit GRANT works; an explicit DENY is denied, even against an otherwise-permitting role
- Temporary permission, across the full validity window — denied before valid_from; allowed during the window; denied again after valid_until
- Direct URL access is independently denied by the backend — if frontend navigation to, e.g., `/hms/ot/surgery` is hidden for an unauthorized role, manually entering that URL must still be rejected server-side, not merely hidden client-side
- Mutating actions, permission grants/denies, and entitlement changes all produce an audit-log entry
- Verified in both Light and Dark themes, and under a non-default tenant’s branding
- KNOWLEDGE.md updated and DONE.md appended for every app/package touched
- Every new or modified backend endpoint has synchronized OpenAPI/Swagger documentation, and `npm run openapi:validate` passes (no undocumented `/api/v1` routes; valid spec)
- No open P0/P1 defects

---
*Development Phases & Roadmap — v1.0 — Takoriya Technology LLP — August 2026*