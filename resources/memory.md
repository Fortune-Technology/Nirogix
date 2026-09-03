# Project Memory / Knowledge Base

**Document:** `memory.md`  
**Version:** 1.0  
**Last Updated:** August 2026  
**Prepared for:** Takoriya Technology LLP  
**Source of Truth:** Enterprise HMS — Architecture and Development Roadmap v2.1, plus two corrections identified in subsequent review (permission-cache expiry bound; break-glass notification/review boundary).

---

This document is a distilled index, not a replacement for the other four. Always confirm against **Architecture Document** or **Project Requirements Document** before making a change that contradicts an entry here.

---

## Contents

- **How to Use This Document**
  - [Purpose](#purpose)
- **Terminology**
  - [Glossary](#glossary)
- **Architectural Invariants**
  - [Never Violate These](#never-violate-these)
- **Key Decisions**
  - [Architecture Decision Records (from DECISIONS.md)](#architecture-decision-records-from-decisionsmd)
  - [v2.2 Review Corrections](#v22-review-corrections)
- **Module Relationships**
  - [Module Capability Matrix (condensed reference)](#module-capability-matrix-condensed-reference)
- **Resolved Issues & Lessons Learned**
  - [What Went Wrong Before, and the Fix](#what-went-wrong-before-and-the-fix)
- **Pending Decisions & Open Items**
  - [Not Yet Settled](#not-yet-settled)
- **Implementation Context**
  - [Where Things Stand](#where-things-stand)

---

## How to Use This Document

### Purpose

Persistent knowledge for AI-assisted development on this project. Read this before making a change that touches authorization, entitlements, billing, or module boundaries — it exists specifically to stop a future agent (human or AI) from re-deriving, or worse, re-litigating, decisions already made.

## Terminology

### Glossary

| Term                                 | Meaning                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Platform Core                        | Foundational capabilities every tenant gets by default; never sold as a line item                      |
| Business Module                      | Independently sellable clinical/operational capability (see Module Capability Matrix)                  |
| Add-On                               | Extends a module or connects an external system; little standalone value alone                         |
| Feature Configuration                | Same module, different behavior per tenant, no code branch                                             |
| Entitlement                          | Whether an _organization_ has purchased/activated a module                                             |
| Permission                           | Whether a specific _user_ can perform a specific action                                                |
| Hard Dependency                      | A module cannot technically activate without another entitled module                                   |
| Optional Integration                 | A module works alone, and gains capability if another module is present                                |
| Commercial independence              | A module can be purchased separately as its own line item                                              |
| Technical independence               | A module can operate without another module being entitled (stricter than commercial independence)     |
| MVP 0 — Clinic Pilot                 | Patient → Appointment → OPD+Billing Core → EMR                                                         |
| MVP 1 — Clinic Expansion             | Pharmacy → Laboratory → Basic Reports                                                                  |
| Break-Glass                          | Reserved emergency-access architecture; not built for MVP, insertion point only                        |
| Financial Transaction Infrastructure | Platform Core primitives (invoice/payment/tax/receipt/ledger) underneath the Billing & Payments module |

## Architectural Invariants

### Never Violate These

- Tenant isolation is enforced by PostgreSQL Row-Level Security. Tenant A must never access Tenant B's data — this is tested, not assumed, on every milestone.
- Frontend visibility is never security. Every backend endpoint independently re-checks entitlement and permission regardless of what the UI already hid.
- **A raw Aadhaar number is never persisted, logged or echoed (ADR-084).** It exists in memory only for the length of one encrypt-and-send call; what survives is a masked hint (`XXXXXXXX1234`), enforced by the application, by a database CHECK constraint, and by an Aadhaar-shaped scrub at the log/error-tracker boundary. **Every ABDM token is encrypted at rest or discarded** — never written in the clear.
- **ABDM verifies an identity; it never creates a clinical record (ADR-084).** Every verification ends at a prefill a human reviews, or at a link onto a chart that already exists. Only a completed ABDM flow may set `abha_verified_at`; a hand-typed ABHA number stays unverified for ever. An exact ABHA-number match is a returning patient; a demographic match is a candidate for a human to confirm, never an automatic merge.
- **Specialty is a personalization key, never a security boundary (ADR-083).** The effective feature set for a user = **tenant enabled modules ∩ provider specialty module set ∩ user permissions** — an intersection: specialty narrows the view, it can never widen access. The enforced chain stays `authenticated → requireModule → requirePermission → business logic`; specialty is not an enforcement point. Specialty maps (as seeded data) to a required/recommended/optional module preset chosen at onboarding, which the organization may then override — a starting default, not a lock.
- **A module has a capability tier, and both are runtime-checked entitlements, never a security bypass (ADR-085, extends ADR-083).** Effective features = tenant enabled modules ∩ tenant enabled capabilities ∩ provider specialty set ∩ user permissions; the enforced chain is `authenticated → requireModule → requireCapability → requirePermission → business logic`. A capability is _what the system supports_; a permission is _who may use it_ — a hospital disabling a capability overrides every role that holds its permission. One canonical `Domain → Module → Capability` registry is shared backend + every frontend; **only a `BUILT` registry entry is ever entitled to a real screen/API or marked available in marketing (ADR-038)** — listing a module in the registry is not a claim it exists. The engine is the standard every new module is built to; existing modules are retrofitted onto it without rewrite; disabling a module or capability hides and protects it but never deletes historical records (invariant #6); and cross-module workflow runs through the shared single-owner entities + events/contracts, never a duplicated implementation (one Payment, invariant #8).
- Modular monolith for MVP. No microservices split happens without a recorded decision in DECISIONS.md.
- Core clinical entities — Patient, Provider, Encounter, Diagnosis, Prescription, Invoice — stay strongly typed. Never modeled as EAV, even for specialty variation.
- Entitlement and permission-override records are never physically deleted.
- Explicit DENY always overrides GRANT, at every level of the authorization model.
- A cached permission set is never allowed to outlive the earliest `valid_until` among the temporary overrides it contains.
- The Portal (`hms_frontend`) is never indexable, and no patient/tenant/staff/operational data ever reaches a crawler-visible surface (metadata, URL, OG image, sitemap) or an analytics/telemetry platform. All product SEO lives on the marketing site (ADR-027). The same applies to `admin`, `patient` and `aiportal` — only `marketing` is indexable.
- **Five frontends, one backend (ADR-051).** `marketing`, `hms_frontend`, `admin`, `patient`, `aiportal` — one audience each, one origin each, no shared session between them. Authentication, authorization, tenant resolution, permissions, business logic and audit live **only** in the backend; a frontend guard is UX and never a boundary. No authorization logic is duplicated into any frontend.
- **A patient is not a `user` (ADR-052).** Patient identity is a separate principal, platform-level and keyed to a verified contact, linked to a hospital's patient record by the hospital. It can never hold a staff permission, cannot be granted one by override, and is refused on staff routes by principal type rather than by an empty permission set. There is no public patient signup.
- **The AI Portal is an authorization boundary before it is a product (ADR-053).** Built 16/08/2026: `ai.portal.access` is held by **every staff role** (ADR-055, widening ADR-053) with DENY still available per individual; a patient principal is refused **by type** before any permission is read — that is the boundary, not the permission; entry is audited; and `capabilities` is an empty list with a test asserting it stays empty. AI is **approved scope that is deliberately uncommitted** — PRD-documented, assigned to no phase, `FUTURE / CONSIDERATION` — so it is never advertised as a product capability, not even as "in development", because nothing is under way. Anything touching diagnosis or treatment needs the CDSCO classification check recorded first.
- **A patient self-registration QR carries an opaque token and nothing else, and a submission is a request, not a patient (ADR-056).** The hospital is resolved from that token by the backend on every public call — never from the body, a header or a query parameter — so a QR for one hospital cannot register a patient at another. Unknown, retired and switched-off all return 404 identically. Seeing the queue is `patient.record.view`; converting a request into a chart is `patient.record.create` and audited. Nothing on the public path writes to `patients`, so ADR-052's "no public signup" stands.
- User-facing API feedback is centralized: one shared `@hms/ui` toast raised from the shared API client, showing the backend's own message where provided. No silent failure, no per-page toast code, and never a stack trace, backend internal, or PHI in the UI (ADR-026).
- Every backend `/api/v1` route ships with synchronized, valid OpenAPI/Swagger documentation — the spec is generated from route definitions (Zod + zod-to-openapi), and CI (`npm run openapi:validate`) rejects undocumented or invalid APIs. No undocumented production endpoints.

## Key Decisions

### Architecture Decision Records (from DECISIONS.md)

A fourth documentation file, alongside CLAUDE.md, KNOWLEDGE.md, and DONE.md — recording _why_, not _what_ or _when_.

- **CLAUDE.md** — what the AI/developer must follow (conventions, standards)
- **KNOWLEDGE.md** — how the system currently works
- **DONE.md** — what was completed and when (append-only log)
- **DECISIONS.md** — why an important architectural decision was made, as a numbered Architecture Decision Record (ADR) per entry

Seed entries for this platform's own foundational decisions:

- ADR-001 — Modular monolith over microservices for MVP
- ADR-002 — PostgreSQL with Row-Level Security for multi-tenancy, over database-per-tenant
- ADR-003 — RBAC with user-level overrides, over pure role-based or full ABAC
- ADR-004 — Module entitlements as a runtime check, not a deployment decision
- ADR-005 — E2E Networks as primary hosting provider
- ADR-006 — India-resident object storage as the default for PHI (pending formal legal verification, see File Storage Architecture, Part VI)
- ADR-007 — Provider abstraction (SmsService/EmailService/FileStorageService) over direct SDK dependencies
- ADR-008 — FHIR-aligned Provider/PractitionerRole model for specialty-agnostic core
- ADR-009 — Vertical-slice, module-by-module MVP delivery order over horizontal layer-by-layer delivery

New architectural decisions of similar weight are appended here as they are made, with the same rigor as DONE.md is append-only for implementation history.

### v2.2 Review Corrections

- ADR-010 — Permission cache TTL is bounded by the earliest temporary override's `valid_until`; `revoked_at` triggers immediate targeted cache invalidation
- ADR-011 — Break-glass notification is tenant-configurable; post-event review is a review-only workflow and never modifies RBAC

> The list above is the seed set only. **`DECISIONS.md` in the repository root is the live, authoritative ADR log** (ADR-012 … onward: ORM, monorepo, providers, storage, Portal session model, ops baseline, platform admin/branding, money convention, API feedback, SEO boundary, master data & catalogues, and — ADR-083 — the specialty-aware experience layer that makes the platform configurable-per-specialty on top of the existing entitlement boundary). Read it, not this list, before making an architectural change.

## Module Relationships

### Module Capability Matrix (condensed reference)

Standalone = can be sold and run with no other business module entitled. Hard Dependencies = module will not activate without these already entitled. Optional Integrations = functions without these, gains capability with them.

| Module                            | Standalone  | Hard Dependencies            | Optional Integrations                |
| --------------------------------- | ----------- | ---------------------------- | ------------------------------------ |
| Patient Management                | Yes         | None                         | Appointment, EMR, Billing            |
| Appointment Management            | Yes         | Patient Management           | EMR, Notifications                   |
| OPD & Check-in                    | Partial     | Patient, Appointment         | EMR, Billing                         |
| Clinical Workflow (EMR)           | Partial/No  | Patient, Encounter (OPD/IPD) | Lab, Pharmacy, Radiology             |
| Nursing                           | No          | IPD                          | EMR                                  |
| Laboratory                        | Yes         | None                         | Patient, EMR, Billing                |
| Radiology & Imaging               | Yes         | None                         | Patient, EMR, Billing, PACS (add-on) |
| Admission (IPD)                   | Partial     | Patient                      | Billing, Nursing, Insurance          |
| Emergency (ER)                    | Yes         | Patient                      | EMR, Billing, IPD                    |
| Operation Theatre (OT)            | No          | IPD                          | EMR, Billing, Inventory              |
| CSSD                              | No          | OT                           | Inventory                            |
| Blood Bank                        | Yes/Partial | None                         | Patient, Billing                     |
| Specialty Clinical Modules        | No          | EMR                          | Billing                              |
| Pharmacy                          | Yes         | None                         | Patient, EMR, Billing, Inventory     |
| Inventory, Stores & Procurement   | Yes         | None                         | Pharmacy, OT, Billing                |
| Billing & Payments                | Yes         | None                         | Patient, Pharmacy, Lab, IPD          |
| Insurance, TPA & Govt. Schemes    | No          | Billing                      | Patient, IPD                         |
| Financial Management              | Partial     | Billing                      | Inventory, HR                        |
| Dietary & Kitchen                 | Yes         | None                         | IPD (diet-chart linkage)             |
| Housekeeping & Laundry            | Yes         | None                         | IPD (ward/bed linkage)               |
| Ambulance & Fleet                 | Yes         | None                         | Patient, ER, Billing                 |
| Biomedical Equipment & Asset Mgmt | Yes         | None                         | OT, Laboratory, Radiology            |
| Biomedical Waste Management       | Yes         | None                         | None required                        |
| HR, Payroll & Doctor Scheduling   | Yes         | None                         | Appointment, Financial Management    |
| CRM & Patient Engagement          | Yes         | None                         | Patient, Appointment, Notifications  |

All 25 modules list **Platform Core** as an implicit prerequisite (omitted from the table for readability, per the Platform Core section) — every row above assumes it.

"Standalone" in this matrix means _technically_ standalone (operates with no other business module entitled), which is the stricter of the two independence concepts defined above — commercial sale is available for every module regardless of this column, subject only to its listed Hard Dependencies.

## Resolved Issues & Lessons Learned

### What Went Wrong Before, and the Fix

- **ABDM / India-storage claim overstated (resolved in v2.0 → v2.1).** An earlier draft stated as settled fact that "ABDM-integrated health data must be stored in India," sourced from a single secondary blog rather than a primary ABDM/MeitY document. Corrected to: India-resident storage is a conservative design decision; the legal justification is Pending Verification. **Lesson:** a secondary source is never sufficient to convert a design decision into a stated legal requirement in this document.
- **Temporary-permission cache/evaluation inconsistency (resolved in this revision).** Earlier text said permission validity is "evaluated on every check" while also stating permission sets are cached (not recomputed per request) — these were in tension for temporary grants. Resolved: cache TTL is bounded by the earliest relevant `valid_until`, and `revoked_at` triggers immediate targeted invalidation.
- **Break-glass notification was under-specified (resolved in this revision).** Clarified that admin/compliance notification is tenant-configurable, and that post-event review must never modify RBAC as a side effect.

## Pending Decisions & Open Items

### Not Yet Settled

- Regulatory Verification & Compliance Source Register — every row currently Pending Verification; no compliance owner yet assigned.
- ORM choice (Prisma vs. Drizzle) — not yet locked in; relevant to how PostgreSQL RLS policies are authored and maintained.
- Self-serve plan management / payment-integrated billing — explicitly deferred; MVP uses manual, operator-driven entitlement provisioning.
- Branch-scoped entitlement management UI — the schema supports it (nullable `branch_id`) from day one; the admin UI to manage it does not exist yet.
- Break-glass full implementation — architecture and insertion point defined; UI and enforcement not built for MVP.
- Module & Capability Engine (ADR-085, extends ADR-083) — decided, not yet built: capability tier + `requireCapability`, canonical `Domain→Module→Capability` registry, event-driven interconnection hardening, and reusable domain widgets. Built-only retrofit now, forward standard for future modules (`resources/development-plan.md` §20D, `BACKLOG.md` §3).

## Implementation Context

### Where Things Stand

- As of this document: architecture and roadmap are finalized through v2.1 (plus the two corrections in this documentation set); no application code has been written yet.
- Target segment for MVP: single/multi-doctor OPD clinics and small nursing homes without inpatient beds — not full hospitals with OT/ICU/Blood Bank from day one.
- Existing operational pattern to reuse for deployment: Ubuntu VPS + Nginx + PM2 (under a dedicated service user) + GitHub Actions self-hosted runner — already proven in production on other Takoriya/Fortune Technology projects (StoreVeu, Rapid Runner).

---

_Project Memory / Knowledge Base — v1.0 — Takoriya Technology LLP — August 2026_
