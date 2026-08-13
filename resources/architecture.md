# Architecture Document

**Document:** `architecture.md`  
**Version:** 1.0  
**Last Updated:** August 2026  
**Prepared for:** Takoriya Technology LLP  
**Source of Truth:** Enterprise HMS — Architecture and Development Roadmap v2.1, plus two corrections identified in subsequent review (permission-cache expiry bound; break-glass notification/review boundary).

---

For functional/product scope, see **Project Requirements Document**. For build sequencing, see **Development Phases & Roadmap**. For engineering rules derived from this architecture, see **Rules & Engineering Standards**.

---

## Contents

- **Architecture Foundations**
  - [Architecture Principle](#architecture-principle)
  - [Platform Architecture](#platform-architecture)
  - [Platform Core](#platform-core)
- **Tenancy & Specialty Architecture**
  - [Multi-Tenancy Architecture](#multi-tenancy-architecture)
  - [Multi-Branch Architecture](#multi-branch-architecture)
  - [Specialty-Agnostic Architecture](#specialty-agnostic-architecture)
  - [Data Lifecycle & Retention](#data-lifecycle--retention)
- **Entitlements, Pricing & Authorization**
  - [Module Entitlements (incl. Entitlement Lifecycle)](#module-entitlements-incl-entitlement-lifecycle)
  - [Pricing & Packaging Architecture](#pricing--packaging-architecture)
  - [RBAC & User-Level Overrides](#rbac--user-level-overrides)
  - [Advanced Authorization — Policy-Based, Temporary & Break-Glass (corrected)](#advanced-authorization--policy-based-temporary--break-glass-corrected)
  - [Frontend + Backend Authorization Flow](#frontend--backend-authorization-flow)
  - [Feature Configuration](#feature-configuration)
- **Billing Architecture**
  - [Billing Core Boundary (Financial Transaction Infrastructure vs. Billing & Payments)](#billing-core-boundary-financial-transaction-infrastructure-vs-billing--payments)
- **Platform Core Technical Capabilities**
  - [Authentication](#authentication)
  - [Notification Architecture](#notification-architecture)
  - [File Storage Architecture](#file-storage-architecture)
  - [Domain Events & Background Jobs](#domain-events--background-jobs)
  - [Global Search & Activity Timeline](#global-search--activity-timeline)
  - [Reporting Architecture](#reporting-architecture)
  - [API Architecture & Reliability](#api-architecture--reliability)
- **Security, Compliance & Infrastructure**
  - [Security & Compliance](#security--compliance)
  - [Regulatory Verification & Compliance Source Register](#regulatory-verification--compliance-source-register)
  - [Performance & Scalability](#performance--scalability)
  - [Infrastructure & Hosting](#infrastructure--hosting)
  - [External Provider Abstractions](#external-provider-abstractions)
- **Technology Stack**
  - [Technology Stack & Monorepo Structure](#technology-stack--monorepo-structure)
  - [Technical Expectations](#technical-expectations)
- **Reference**
  - [Module Capability Matrix](#module-capability-matrix)
  - [Dependency Map](#dependency-map)

---

## Architecture Foundations

### Architecture Principle

The single sentence every other decision in this document should trace back to:

> **Architecture Principle:** Build the platform core once. Build business modules independently. Sell and provision modules independently. Connect modules through optional integrations, not hard-coded assumptions. Control user access through centralized authorization. Configure tenant-specific behavior without forking code.

Five layers implement this, each covered in its own part of this document:

- **Platform Core** — foundational technical capabilities every tenant gets, never sold as a line item (Part I)
- **Business Modules** — independently sellable clinical/operational capabilities (Part II)
- **Add-Ons & Optional Integrations** — capabilities that extend a module or connect an external system, opted into separately (Part III)
- **Feature Configuration** — same module, different behavior per tenant, without a code branch (Part IV)
- **User Authorization** — who, within an entitled organization, can actually do what (Part IV)

### Platform Architecture

### Multi-tenant

- Complete tenant-level data isolation between hospitals/organizations
- Tenant-level branding (logo, letterheads, themes)
- Tenant-specific settings, independent billing plans and subscription management
- Independent storage and independent integrations per tenant

### Multi-branch

- Unlimited branches per tenant
- Branch-independent doctors, staff, inventory, pharmacy, laboratory, billing, rooms, wards, and operation theatres
- Branch-level reports with centralized visibility for corporate administrators

### Modular & configurable

- Every module independently installable and configurable per tenant (feature flags)
- Organizations pay for and enable only the modules they need
- Individual modules purchasable standalone or as part of a bundle/package — not limited to a single all-in-one plan (see §39 Pricing & Packaging Architecture)
- Clear architectural separation between module availability (entitlements) and user-level permissions (RBAC) — a tenant can be entitled to a module with only some users granted access to it (see §38 Module Entitlements and §40 RBAC & User-Level Overrides)
- Super Admin (SaaS) panel — tenant onboarding, plans, module provisioning, usage metering, tenant billing
- Configuration engine — custom fields, custom forms, letterheads, tax settings, numbering series per tenant/branch
- Custom workflow designer and low-code form builder for tenant-specific processes

### Interoperability & reach

- HL7 FHIR R4 APIs, ICD-10/ICD-11 coding, SNOMED CT (where licensed and applicable), LOINC lab codes, DICOM for imaging
- Offline-tolerant design for low-connectivity clinics with sync-on-reconnect for selected workflows
- Multi-language UI and localization — English, Hindi, Gujarati; extensible to other Indian and global languages

### Platform Core

Foundational technical capabilities that ship with every tenant by default. These are never sold as a separate line item, never individually entitled, and never absent — a hospital buying only Pharmacy still gets all of Platform Core underneath it.

- **Authentication** — login, session, MFA, SSO (Part VI)
- **Tenant Management** — tenant provisioning, plan/subscription state (Part V, Part IV)
- **Organization / Branch Management** — multi-branch structure, branch-scoped configuration (Part V)
- **User Management** — accounts, profiles, staff records (Part IV)
- **RBAC / Authorization Engine** — roles, permissions, user-level overrides, policy readiness (Part IV)
- **Permission Management** — the administrative surface for granting/revoking access (Part IV)
- **Module Entitlement Engine** — which modules a tenant has purchased (Part IV)
- **Feature Configuration** — how an entitled module behaves for a given tenant (Part IV)
- **Audit Logging** — immutable, tamper-evident security/compliance trail (Part VII)
- **Notification Infrastructure** — the send() abstraction behind SMS, WhatsApp, and email (Part VI)
- **File Storage Abstraction** — the FileStorageService behind every document upload (Part VI)
- **Branding** — tenant logo, colors, typography (Part VIII)
- **Settings** — tenant and branch-level configuration surface
- **Financial Transaction Infrastructure** — invoice, payment, tax, receipt, and ledger/transaction primitives shared by every billing-capable module (Part II)
- **API Infrastructure** — versioning, validation, error shape, reliability guarantees (Part VI)
- **Background Jobs** — the queue infrastructure every async workflow runs on (Part VI)
- **Event Infrastructure** — internal domain events connecting modules without direct coupling (Part VI)
- **Observability** — structured logging, error tracking, monitoring (Part VII)
- **Security Infrastructure** — encryption, RLS-based tenant isolation, VAPT posture (Part V, Part VII)

Everything in this list is built once, in Phase 0, and every business module in Part II is written against it — no module re-implements authentication, its own table pagination, or its own notification sending.

> **Billing Core boundary:** Financial Transaction Infrastructure (Platform Core) is not the same thing as the Billing & Payments business module (Part II). The former is foundational — invoice, payment, tax, receipt, and ledger primitives with no clinical or workflow logic attached. The latter is business-facing — OPD billing, IPD billing, Pharmacy billing, Laboratory billing, Radiology billing, OT billing, and package/corporate billing, all built on top of the shared primitives. This boundary is what lets future modules add new billing line-item types without rebuilding the underlying financial transaction engine — matching this document's own Billing Core → Pharmacy → Lab → IPD → Insurance → Financial Management roadmap sequencing.

## Tenancy & Specialty Architecture

### Multi-Tenancy Architecture

### Multi-Tenancy Strategy

- Default isolation model — shared database, shared schema, a tenant_id column on every table, enforced by PostgreSQL Row-Level Security (RLS) policies at the database layer
- Request-scoped database client sets the tenant context for RLS on every query; tenant identity is never trusted from client-supplied input
- Dedicated schema-per-tenant or database-per-tenant offered as a premium isolation tier for large hospital chains with contractual data-isolation requirements
- Tenant resolution at launch — organization code / email-domain match at login; subdomain-per-tenant routing (with wildcard DNS/SSL and Next.js middleware) planned as a later-stage enhancement once the tenant base grows

### Multi-Branch Architecture

### Multi-branch

- Unlimited branches per tenant
- Branch-independent doctors, staff, inventory, pharmacy, laboratory, billing, rooms, wards, and operation theatres
- Branch-level reports with centralized visibility for corporate administrators

### Specialty-Agnostic Architecture

### Specialty-Agnostic Core Design

- Core clinical entities — Patient, Provider, Encounter, Appointment, Prescription, Diagnosis, Billing — are fixed, strongly-typed schema shared across every specialty and facility type; not dynamic, for reporting performance and data integrity
- Provider and specialty modeled in alignment with HL7 FHIR's Practitioner and PractitionerRole resources — a provider record and their specialty/role/location assignments are separate and independently extensible, so adding a new specialty is a data change, not a schema migration
- Specialty catalog maintained as data, linked to providers via a join table
- Structured data that genuinely varies by specialty (dental charting, dialysis session parameters, maternity records, dermatology documentation, etc.) captured via admin-configurable form templates rather than bespoke schema per specialty — new specialty-specific fields are configuration, not code
- Specialty-specific fields map to SNOMED CT/LOINC coding where applicable, preserving the FHIR interoperability path already committed to for ABDM without requiring full FHIR resource modeling for every field on day one
- A facility with no clinical modules entitled at all (a standalone pharmacy, for example) requires no special-casing in the core — the entitlement model above already produces that outcome naturally

### Data Lifecycle & Retention

### Record Lifecycle States

- Healthcare records move through defined states rather than existing or being deleted: **Active → Archived → Deactivated → Retention-Locked → Anonymized → Deleted**
- Unrestricted hard deletion of healthcare records is not permitted at any point in this lifecycle — deletion is only reachable after retention obligations are satisfied, and is itself an audited action
- Retention-Locked records cannot be edited or deleted regardless of role, including by administrators, until the lock condition (statutory period, active MLC, litigation hold) clears
- Anonymization is available as a lifecycle step for records that have satisfied identifiable-data retention requirements but retain research/analytics value
- Retention durations follow applicable medical-record norms (3+ years OPD; longer for IPD/MLC, per Security & Compliance, Part VII) — the state machine is the mechanism that enforces those durations technically, not just documents them

## Entitlements, Pricing & Authorization

### Module Entitlements (incl. Entitlement Lifecycle)

### Module Entitlements Architecture

- Modular monolith retained — modules are sold and provisioned independently, but all module code deploys as a single application; entitlement is a runtime database check, not a deployment or infrastructure decision
- Module catalog with an explicit dependency graph (e.g., CSSD requires OT), resolved at entitlement-grant time and kept deliberately sparse — only genuine hard dependencies are encoded
- A fixed set of core modules (organization/user setup, Patient Management, Appointment, Billing Core, Notifications, Audit, Basic Reports) ship with every tenant and are never sold as a separate line item; every other module is individually entitled
- Tenant entitlements materialized per (tenant, module, branch) rather than computed by joining through a plan at request time — a later plan or bundle change never silently alters an already-provisioned customer's access
- Optional branch-level entitlement scope from day one (null = organization-wide, set = branch-specific) so multi-branch chains with per-branch module needs — e.g. only one branch has an OT — are supported without a later schema change
- Every module's routes are gated by a single requireModule() check, evaluated before any permission check
- Module deactivation is always soft — access is suspended, underlying data is retained per the statutory retention requirements in §55, enabling painless reactivation
- Self-serve plan management and payment-integrated billing are explicitly out of MVP scope — entitlement provisioning is a manual, operator-driven action initially; the enforcement mechanism itself is fully automatic from day one

### Entitlement Lifecycle

Every entitlement record moves through a defined state machine rather than a simple on/off flag.

| State | Meaning |
|---|---|
| TRIAL | Module temporarily available during a trial period |
| ACTIVE | Module is available |
| SUSPENDED | Temporarily unavailable but not commercially cancelled |
| EXPIRED | Entitlement reached its validity end |
| CANCELLED | Commercial entitlement has been cancelled |
| DEACTIVATED | Access intentionally disabled while preserving data |

**Metadata**

- `effective_from`, `effective_until` — the entitlement's validity window
- `suspended_at`, `cancelled_at`, `deactivated_at` — timestamps for the corresponding state transitions
- `reason` — why the state changed
- `created_by`, `updated_by` — accountability for who changed the entitlement

**Evaluation**

Before allowing access, the entitlement engine always evaluates **Tenant + Module + optional Branch + Status + Effective Date + Expiration Date** together — never status in isolation.

Entitlement records are never physically deleted. Historical entitlement changes remain fully auditable, consistent with Security & Compliance.

### Pricing & Packaging Architecture

Three distinct layers, deliberately kept separate so that changing one never silently changes another.

> **Layering:** Commercial Subscription / Purchase → Module Entitlement → User Authorization. A customer purchasing Pharmacy does not mean every user at that hospital can use Pharmacy — it means the *organization* is entitled to it; which *individual users* can act within it is a separate RBAC decision (Part IV).

- Individual modules purchasable standalone, per the Module Capability Matrix
- Bundles/packages composed of individual modules at a package price, without requiring separate code paths per bundle
- Module activation/deactivation per organization, and optionally per branch, without redeployment
- Branch-level entitlements supported from the schema level on day one (nullable — null means organization-wide, set means branch-specific), even though branch-scoped entitlement *management UI* is a later-phase build, not an MVP one
- Future usage-based pricing (e.g. per-transaction billing add-ons) is not precluded — entitlement records carry status and validity independent of how the commercial terms behind them are structured
- Self-serve plan management and payment-integrated billing remain explicitly out of MVP scope; entitlement provisioning is operator-driven at launch, while the enforcement mechanism is fully automatic from day one

### RBAC & User-Level Overrides

Unlimited users with enterprise-grade permission management.

### Standard roles

- Super Admin
- Organization Admin
- Branch Admin
- Receptionist
- Doctor
- Nurse
- Pharmacist
- Laboratory Technician
- Radiologist
- Cashier
- Billing Executive
- Insurance Executive
- HR
- Store Manager
- Housekeeping
- Security
- Ambulance Staff
- OT Staff
- Patients
- External / Visiting Doctors

### Permission granularity

- Module level · Screen level · Action level · Field level · Record level · Branch level · Department level
- Custom roles and permission templates
- Per-user permission overrides — grant or deny a specific capability to an individual user beyond their role’s defaults, without creating a new role
- Approval workflows for sensitive actions (discounts, refunds, record corrections)
- Full audit history of permission changes

### Role-Based Access Control with User-Level Overrides

- Three independent concepts, each enforced separately — module entitlement (does the organization have this module), role permissions (what a role can do by default), and user-specific overrides (grants or denies for one individual beyond their role)
- Permission keys use a dot-hierarchy (module.submodule.page.action) — one mechanism gates modules, sub-modules, pages, tabs, and individual CRUD or sensitive actions without a different schema per granularity level
- Effective permission for a user = the union of all assigned roles' permissions, plus explicit grants, minus explicit denies; an explicit deny always overrides a grant
- Tenant-level custom roles supported by cloning a system default role and editing its permission set, keeping the total role count bounded rather than growing per customer
- Resolved permission sets are cached, not recomputed per request, and invalidated on any role, override, or entitlement change
- Every permission grant or revoke is itself an audited action, restricted to users holding an explicit rbac-management permission

### Advanced Authorization — Policy-Based, Temporary & Break-Glass (corrected)

The RBAC and user-override model already defined is deliberately not the ceiling — the data model below allows these three capabilities to be added without a security-system redesign, without requiring all three to be built for MVP.

### Policy / Attribute-Based Readiness

- Authorization ultimately answers five questions: **WHO** (user/role), **WHAT** (permission), **WHERE** (branch/department/ward/store), **WHICH DATA** (record ownership/assignment), **WHEN** (shift/validity window)
- WHO and WHAT are fully implemented for MVP (role + permission resolution, Part IV). WHERE is partially implemented via branch-scoped entitlements and roles. WHICH DATA and WHEN are architecturally reserved, not built, for MVP
- No MVP-stage decision blocks adding record-scoped or time-scoped rules later — the permission-check interface accepts a context object today even though most fields go unused until a later phase requires them
- A full attribute-based access control (ABAC) engine is explicitly not built for MVP — this is a forward-compatibility guarantee, not a roadmap commitment

### Temporary & Time-Bound Permissions

Extends the existing user_permission_overrides mechanism (Part IV) with an explicit validity window — not a separate temporary-access engine.

**user_permission_overrides — fields**

| Field | Purpose |
|---|---|
| id | Unique override record identifier |
| user_id | The user this override applies to |
| permission | The permission key being granted or denied |
| effect | GRANT or DENY |
| valid_from | When the override becomes effective |
| valid_until | When the override stops being effective |
| reason | Why the override was granted |
| created_by | Administrator who created the override |
| created_at | Creation timestamp |
| updated_at | Last modification timestamp |
| revoked_at | When the override was manually revoked, if applicable |

**Behavior**

- Permanent permissions have `valid_until = NULL`; temporary permissions have both `valid_from` and `valid_until` set
- An expired permission automatically becomes ineffective — the permission-check engine evaluates validity dates on every check; no scheduled cleanup job is required for correctness
- Expired permission records are never deleted — they remain available for audit and historical accountability
- A manually revoked permission is marked via `revoked_at` rather than deleted, and also remains in the audit history
- Explicit DENY overrides GRANT, whether either is permanent or temporary
- Temporary permissions work with the existing RBAC and user-level override model already defined — they are evaluated by the same resolution logic, not a parallel one
- No separate permission engine is created for temporary access

> **Example:** Nurse → normal role permissions → temporary additional permission: `OT.view` → Valid: 12 Aug 2026 08:00, Until: 12 Aug 2026 20:00 → automatically expires at end of shift, no administrator action required.

Supports: covering nurse, visiting doctor, temporary pharmacist, cross-department staff, emergency staffing, shift-based access.

**Correction — Cache Expiry Bound (v2.2 review)**

- Because resolved permission sets are cached rather than recomputed on every request (RBAC & User-Level Overrides), a cached permission set containing one or more temporary overrides must carry a cache expiry no later than the **earliest `valid_until`** among those overrides — the cache is never allowed to outlive the shortest-lived temporary grant it contains
- A cache with no temporary overrides in it follows the standard cache policy (TTL plus invalidation-on-change) with no additional bound
- Setting `revoked_at` on an override must **immediately** invalidate the affected user's permission cache — a targeted invalidation, not a wait for the cache's natural expiry or next scheduled refresh
- Net effect: a temporary or revoked permission must never remain effective in a stale cache entry, under any circumstances

### Break-Glass Emergency Access

Not required for MVP — the authorization architecture reserves a clean insertion point for it, so adding it later is an extension, not a redesign.

**Intended flow**

Normal Authorization → Access Denied → Is Break-Glass Applicable? → User Confirmation → Mandatory Emergency Reason → Temporary Emergency Access → Enhanced Audit Event → Automatic Expiration → Post-Event Review

**Must**

- Require explicit user confirmation before access is granted
- Require a mandatory reason captured at the point of access
- Require an authenticated user — never available to an unauthenticated request
- Be gated by a defined emergency-access permission, not implicitly available to every role
- Grant time-limited access only
- Produce enhanced audit logging capturing: timestamp, user identity, patient/record accessed, reason, permissions temporarily bypassed/granted, and expiration time

**Must Not**

- Silently bypass authorization
- Create permanent permissions
- Modify the user's normal role
- Delete audit records
- Remain active indefinitely

The authorization request flow (Part IV) already has a defined insertion point for a break-glass check between Permission and Business Logic, consistent with the flow above — implementing this later touches only that insertion point, not the flow's structure.

**Correction — Notification & Review Boundary (v2.2 review)**

- Administrator/compliance notification on break-glass use must be **configurable per tenant** — who is notified, and whether notification is synchronous or digested — rather than hardcoded to a single fixed recipient or channel
- Post-event review (confirming, escalating, or closing a break-glass access event) is a review/audit workflow only. It must never, as a side effect, alter the user's permanent role or permission assignments
- Any permanent access change identified as necessary during post-event review must go through the standard RBAC/override administration path (RBAC & User-Level Overrides), never through the break-glass mechanism itself
- This extends, and does not relax, the existing Must-Not requirement that break-glass never modifies the user's normal role

### Frontend + Backend Authorization Flow

### Authorization Request Flow

- Every protected request is evaluated in a fixed order — authenticated, then tenant entitled to the module, then user permitted the specific action, then business logic executes
- Frontend enforcement (hidden menus/tabs/buttons, route guards returning a proper forbidden state for a manually entered URL) is a usability layer only
- Backend enforcement is independent and non-negotiable — every protected endpoint re-validates both entitlement and permission regardless of what the frontend already hid; frontend visibility is never treated as security
- Multi-tenant row-level isolation (§44 Multi-Tenancy Architecture) operates as a separate, lower layer beneath both checks — it controls which rows within an already-authorized module and action are visible, not whether the module or action itself is available

### Feature Configuration

Distinct from entitlement. Entitlement decides *whether* a tenant has a module; Feature Configuration decides *how* that module behaves for them — without a code branch per tenant.

> **Example:** Pharmacy = ENABLED (entitlement) → Batch Tracking = ON, Barcode = ON, Multi-Store = ON, Generic Substitution = OFF, Purchase Workflow = OFF (feature configuration)

- Feature flags stored per (tenant, module, feature_key), read by the same module code regardless of which flags are set
- Lets a single-doctor clinic's Pharmacy stay simple (no multi-store, no purchase-approval workflow) while a hospital chain's Pharmacy runs the full configuration, from the same deployed code
- Feature configuration changes do not require an entitlement change, a deployment, or a support ticket to engineering

## Billing Architecture

### Billing Core Boundary (Financial Transaction Infrastructure vs. Billing & Payments)

Built on the Financial Transaction Infrastructure in Platform Core (invoice/payment/tax/receipt/ledger primitives) — this module provides the business-facing billing workflows themselves.

- Unified billing — OPD, IPD, laboratory, radiology, pharmacy, procedures, OT, packages, and corporate billing
- GST-compliant invoicing with e-invoice readiness; HSN/SAC mapping
- Payment methods — cash, card, UPI, net banking, bank transfer, cheque, wallets
- Payment gateway integration with shareable payment links (PCI DSS-aligned)
- Advance payments, deposit management, interim bills, and final settlement
- Discounts with approval workflow, refunds, credit notes, and outstanding tracking
- Rate lists per payer type — cash, insurance, corporate, government scheme

## Platform Core Technical Capabilities

### Authentication

### Marketing Site → Portal Authentication Flow

- Marketing site carries no authentication logic — a single Login action links directly to the Portal's login route, with an optional redirect parameter for deep-linking
- All authentication, session issuance, MFA, SSO, and role-based dashboard routing is handled entirely within the Portal application
- Session model — short-lived JWT access token plus an httpOnly, secure refresh-token cookie scoped to the Portal's own domain; no shared session state with the Marketing Site
- Post-login routing determined by the authenticated user's role, served from the single Portal application rather than separate apps per role

### Notification Architecture

- Channels — SMS (DLT-registered templates), Email, Push, WhatsApp Business API, In-App, Voice Calls (optional)
- Triggers — appointment reminders, queue updates, report availability, payment reminders, admission updates, prescription/medication reminders, discharge and follow-up
- Per-patient communication logs; per-tenant template management
- Broadcast messaging for camps and announcements (opt-in based)

### SMS & WhatsApp Notification Service

- MSG91 as the SMS/WhatsApp provider — a Meta-approved WhatsApp Business Solution Provider with built-in DLT template registration support, required for any commercial SMS to Indian numbers under TRAI regulation
- Delivered entirely through the centralized NotificationService (§71 Phase 0 — Platform Foundation) — no module calls MSG91 directly, so the provider can be replaced without touching Pharmacy, Appointment, Laboratory, or any other module
- DLT entity, sender ID, and template registration treated as a build prerequisite, not a mid-build discovery — operator approval takes 24–48 hours and gates any SMS-dependent feature (appointment reminders, OTP) in staging

### Transactional Email Service

- AWS SES, using the ap-south-1 (Mumbai) or ap-south-2 (Hyderabad) region specifically — not a default or unspecified region — for the same data-residency reasoning applied to storage and hosting
- Selected primarily for cost at scale and for an India-resident region with an official, well-documented Node.js SDK
- Requires AWS production-access approval before go-live (SES starts in a sandbox restricted to verified addresses) — requested early, not the week before launch
- Delivered through the same centralized NotificationService/EmailService abstraction as SMS — templates, sending, and provider selection live in one place

### File Storage Architecture

### File, Image, PDF & Invoice Storage

- Primary object store for PHI-bearing documents — medical reports, prescriptions, lab/radiology images, invoices — is India-resident storage (E2E Object Storage, S3-compatible), consistent with the Health Data Management Policy's India-storage requirement for ABDM-integrated health data
- If Cloudflare R2 is used for any bucket, it must use R2's jurisdictional restriction pinned to India rather than default auto-placement, with the associated metadata/log pipeline separately configured to stay in-region — jurisdiction-pinning the bucket alone does not guarantee the rest of the data lifecycle stays resident
- Files sit behind a FileStorageService abstraction; the database stores only file metadata and references (path, size, MIME type, checksum, uploader, access-control tags) — never file content
- Default-private buckets with short-lived signed URLs generated per request; nothing served as a permanently public object URL
- File-type and size validation enforced server-side before any upload is accepted, never left to frontend validation alone
- Every file access enforced by the same entitlement and RBAC checks defined in §38 and §40 — file storage does not carry its own separate authorization model
- Access to and deletion of sensitive healthcare documents is audit-logged, consistent with §55; versioning retained for clinical documents subject to correction (e.g. amended reports)

> **Regulatory language — verify before external use:** India-resident storage is adopted here as a deliberate, conservative *design decision*, not a claim of settled law. The DPDP Act does not currently impose blanket localization for general health data, and no country is currently restricted for cross-border transfer. Secondary sources describe an India-storage expectation for ABDM-integrated health data under the Health Data Management Policy; this has not been independently verified against a primary ABDM/MeitY source. Given healthcare is a plausible candidate for tighter future rules, and given the low cost of applying one storage policy platform-wide, India-resident storage remains the recommended default — pending formal legal/compliance verification before this is repeated in a customer-facing or regulatory context.

### Domain Events & Background Jobs

### Domain Events

- An internal event bus inside the modular monolith — not Kafka, not a message broker, not external infrastructure — connecting modules without direct coupling
- Representative events: `PatientRegistered`, `AppointmentBooked`, `AppointmentCancelled`, `EncounterCreated`, `PrescriptionCreated`, `LabResultReady`, `InvoiceCreated`, `PaymentReceived`, `AdmissionCreated`, `DischargeCompleted`
- Events feed Notifications, Audit, the Activity Timeline, Reporting, and Analytics — a module publishes an event once, and any number of downstream concerns subscribe, instead of the module calling each of them directly
- This is also what keeps future module/service extraction realistic — a module already communicating by event rather than direct function call is most of the way to being extractable into its own service without a rewrite

### Background Job Categories

- Every async workflow is categorized, not ad hoc: **Synchronous** (blocks the request — used sparingly), **Async** (fire-and-forget via the queue), **Scheduled** (cron-like, time-triggered), **Long-running** (progress-tracked), **Retryable** (idempotent, safe to re-run on failure)
- Examples: SMS/Email → Async; PDF generation → Async; large MIS reports → Async/Long-running; ABDM synchronization → Async/Retryable; appointment reminders → Scheduled; bulk file processing → Worker/Long-running
- All of the above run on the same Redis + BullMQ infrastructure (Part VI) — no module creates its own cron process or ad hoc scheduler

### Global Search & Activity Timeline

### Global Search

- A platform-level search capability, not a separate implementation per module — searching a patient name returns matches across Patient, Appointment, Prescription, Invoice, Lab Report, and Admission in one query
- Results are filtered through the same entitlement and permission checks as any other data access — global search never surfaces a record the searching user could not otherwise see

### Activity Timeline

Distinct from the Audit Log (Security & Compliance, Part VII), which exists for security and compliance:

- **Audit Log** — "User X viewed Patient Y", "User X changed a permission", "User X downloaded a report" — a compliance and security record
- **Activity Timeline** — "Appointment booked", "Patient checked in", "Consultation completed", "Prescription created", "Lab ordered", "Payment received" — a clinical/business narrative of what happened to a patient or a case
- Built from the same Domain Events stream above — modules contribute timeline entries by publishing the event they already publish for other purposes, not by writing to a timeline table directly

### Reporting Architecture

- Operational dashboards — revenue, OPD/IPD statistics, bed occupancy, doctor productivity, pharmacy sales, lab revenue
- Patient analytics — demographics, no-show analysis, wait times
- Clinical and operational KPIs; disease trends, lab TAT, mortality/morbidity
- NABH-aligned quality indicator reports
- Custom dashboard builder with drill-down
- Predictive analytics — occupancy forecasting, revenue trends, inventory demand
- Scheduled report exports (Excel/PDF, email delivery); role-based report access

### API Architecture & Reliability

### Backend Architecture

- Modular monolith to start — each business module (patient, appointment, billing, pharmacy, lab, etc.) owns its own routes, controller, service, and repository layers
- Module boundaries designed for clean extraction into independent services later — Laboratory and the Notification Engine are the most likely first candidates given their distinct scaling and latency profiles
- Asynchronous workflows (notifications, ABDM sync, report generation, insurance claim batches) processed via a Redis-backed job queue rather than inline in request handlers

### Idempotency

- Required for payments, invoices, appointment bookings, notifications, and external integration calls — any operation a network retry could duplicate
- Enforced via an idempotency key on the request, checked before the operation executes, so a retried request returns the original result rather than creating a duplicate

### Concurrency Control

- Optimistic locking/versioning on records multiple users may edit simultaneously — clinical notes, prescriptions, patient information, inventory counts, billing line items, admission records
- A stale write is rejected with a clear conflict response rather than silently overwriting another user's concurrent edit

## Security, Compliance & Infrastructure

### Security & Compliance

Security by Design and Privacy by Design. The platform stores sensitive patient health information and processes financial transactions; these are core architectural requirements.

- Encryption at rest (AES-256) and in transit (TLS 1.2+)
- Fine-grained RBAC and Multi-Factor Authentication (MFA)
- SSO — SAML / OAuth 2.0 / OIDC
- Comprehensive, immutable, tamper-evident audit trails
- Secure API architecture with rate limiting and input validation
- Secure file storage with access controls
- Digital signatures on clinical and consent documents
- Consent management for all health-information sharing
- Session management, password policies, device/session controls, account lockout
- Automated backups and disaster recovery with defined RPO/RTO
- Data retention and archival per medical record norms (3+ years OPD; longer for IPD/MLC)
- DPDP Act 2023 — consent artefacts, purpose limitation, data principal rights, breach notification
- CERT-In directions — 180-day log retention, 6-hour incident reporting readiness
- Data residency within India
- ABDM certification requirements — WASA audit by CERT-In empanelled auditor
- PCI DSS-aligned payment practices — no card data stored on platform
- OWASP Top 10 protections; periodic VAPT
- Privacy-first, least-privilege architecture; PII masking in logs and non-production environments

### Regulatory Claim Discipline

Every regulatory statement in this document falls into exactly one of three categories:

- **Confirmed requirement** — supported by an authoritative primary source (the Act, Rule, or official policy document itself)
- **Design decision** — a conservative architectural choice made by the HMS team, not a claim of legal obligation
- **Pending verification** — a regulatory assumption that must be verified against an authoritative primary source before being treated as a formal compliance requirement

> **General rule:** Regulatory claims must be backed by an authoritative source before being marked as mandatory compliance requirements. Where this document states a conservative default (e.g. India-resident storage — File Storage Architecture, Part VI) that default is preserved as architecture, but its legal justification remains Pending Verification until checked against a primary source, and must not be presented to a customer, auditor, or regulator as a confirmed mandate until then. See the Regulatory Verification / Compliance Source Register immediately following this section.

### Regulatory Verification & Compliance Source Register

Every regulatory area this platform touches, with its verification status tracked explicitly rather than assumed. Fields not yet confirmed are marked Pending verification rather than guessed.

| Requirement | Area | Source | Verification Status | Owner | Last Verified | Notes |
|---|---|---|---|---|---|---|
| Data localization for general personal data | DPDP Act | Digital Personal Data Protection Act, 2023 | Pending verification | Pending verification | Pending verification | Architecture assumes no blanket localization mandate currently in force; not checked against primary Gazette text |
| Breach/incident reporting obligations | CERT-In directions | CERT-In cybersecurity directions | Pending verification | Pending verification | Pending verification | Referenced in Security & Compliance; specific timelines not independently verified |
| Health record storage/localization for ABDM-integrated data | ABDM | Health Data Management Policy (ABDM) | Pending verification | Pending verification | Pending verification | Secondary sources describe an India-storage expectation; not checked against a primary ABDM/MeitY document (see File Storage Architecture, Part VI) |
| Remote consultation requirements | Telemedicine Practice Guidelines | Telemedicine Practice Guidelines, 2020 | Pending verification | Pending verification | Pending verification | Applies to Telemedicine & Video Consultation, Part III |
| Diagnostic technique restrictions (sex-determination) | PC-PNDT | Pre-Conception and Pre-Natal Diagnostic Techniques Act | Pending verification | Pending verification | Pending verification | Applies wherever ultrasound/prenatal imaging is offered, Part II Radiology |
| Segregation, handling, and disposal of clinical waste | Biomedical Waste | Bio-Medical Waste Management Rules, 2016 | Pending verification | Pending verification | Pending verification | Applies to Biomedical Waste Management, Part II |
| Pharmacy licensing, storage, and dispensing rules | Drugs & Cosmetics Rules | Drugs and Cosmetics Act & Rules | Pending verification | Pending verification | Pending verification | Applies to Pharmacy Management, Part II |
| Blood bank licensing and operational requirements | Blood Bank requirements | Drugs and Cosmetics Rules (Blood Bank provisions) | Pending verification | Pending verification | Pending verification | Applies to Blood Bank Management, Part II |
| Tax invoicing, HSN/SAC, and filing requirements | GST | Goods and Services Tax Act | Pending verification | Pending verification | Pending verification | Applies to Billing & Payments and Financial Management, Part II |
| Payment card data handling | PCI DSS | PCI Security Standards Council | Pending verification | Pending verification | Pending verification | Applies to the Payment Gateway add-on and Billing & Payments, Part II/III |
| Medical device / software classification for AI-assisted features | CDSCO / SaMD | Central Drugs Standard Control Organisation | Pending verification | Pending verification | Pending verification | Required before any diagnostic-support AI feature is built — see Postponed / Build-as-Sold, Part IX |

### Performance & Scalability

- Millions of patient records; thousands of concurrent users
- Horizontal scaling, auto-scaling, and high availability (99.5%+ uptime SLA target)
- Page/API response under 2 seconds for standard operations
- Multi-region deployment capability and CDN support
- Background job processing and event-driven architecture for asynchronous workflows
- Offline-first capability for selected workflows in low-connectivity settings
- Disaster recovery with defined RPO/RTO objectives

### Infrastructure & Hosting

### Hosting Infrastructure

- Primary hosting on E2E Networks — an India-headquartered, MeitY-empanelled cloud provider with an explicit data-sovereignty proposition, selected over global hyperscalers specifically for the residency posture required by ABDM-integrated health data
- Managed PostgreSQL (E2E DBaaS) provisioned as a dedicated service from day one, not co-located with the application server — automated backups and point-in-time recovery are a day-one requirement for medical-record data, not a later hardening step
- Application compute (backend, portal, marketing) on a single right-sized VM under the existing Nginx + PM2 pattern; a load balancer and horizontally-scaled compute are added once traffic actually requires it, below
- Redis co-located on the application VM for MVP (permission-set cache, background job queue); migrated to a managed instance once cache size or queue volume justifies it
- Cloudflare retained in front of all public-facing traffic — CDN, WAF, DDoS protection, DNS — kept for what it is strongest at, independent of where data is stored at rest
- Automated daily database backups with point-in-time recovery, with restore drilled — not just configured — before the first paying customer goes live
- Application code is not tightly coupled to PM2 or a single VM — process management and deployment target are an operational choice, not an architectural assumption, so migrating to Docker containers, a load balancer, and horizontally-scaled compute later is an infrastructure change, not an application rewrite

### Deployment Topology

- Reuses the existing Ubuntu VPS + Nginx + PM2 (under a dedicated service user) + GitHub Actions self-hosted runner pattern already in production for the StoreVeu platform
- Subdomain-per-application convention — Marketing Site on the root domain, HMS Portal on a portal subdomain, backend API on an api subdomain
- CI/CD builds and deploys only the application(s) affected by a given push, using Turborepo's affected-package detection
- This topology is right-sized for pilot customers and early revenue; meeting the horizontal auto-scaling, multi-region, and 99.5%+ uptime targets in §57 will require a later migration to managed PostgreSQL (with read replicas) and containerized horizontal scaling — a deliberate future-stage step, not a day-one requirement

### External Provider Abstractions

### Provider Abstraction Principle

- Every external provider — MSG91, AWS SES, E2E Object Storage/Cloudflare R2, E2E DBaaS — sits behind an internal service (NotificationService wrapping SmsService and EmailService; FileStorageService) that individual modules call; no module holds a direct SDK dependency on an external vendor
- The same principle already applied to multi-tenancy, entitlements, and RBAC in §38, §40, and §44: infrastructure decisions are swappable configuration behind a stable internal interface, not load-bearing assumptions baked into business logic

### Governance & Audit

- All entitlement changes (activation, deactivation, plan changes) and all permission changes (role edits, user overrides) are written to the immutable audit trail required in §55
- Entitlement and permission resolution logic is versioned application code; only the data they operate on (module catalog, role definitions, override records) is runtime-configurable — hospital administrators configure who has which of the permissions the platform defines, not new enforcement points themselves

## Technology Stack

### Technology Stack & Monorepo Structure

### Technology Stack

- Frontend — Next.js (App Router), TypeScript; used for both the HMS Portal and the Marketing Site
- Backend — Node.js + Express.js, TypeScript; versioned REST API (/api/v1) with OpenAPI/Swagger documentation
- Database — PostgreSQL as the system of record; Redis for caching, session support, and background job queues (BullMQ)
- Package manager / build system — pnpm workspaces with Turborepo for monorepo build orchestration and incremental, cached builds

### Monorepo Structure

- apps/backend — Node.js/Express API, authentication, business logic, database integration
- apps/portal — Next.js HMS Portal serving Admin, Staff, Doctor, Patient, and other role dashboards behind role-based route guards
- apps/marketing — Next.js public marketing/SEO site — product information, landing pages, documentation content
- packages/types — shared TypeScript types and API contracts consumed by both backend and portal
- packages/ui — shared design-system components used by portal and marketing
- packages/config, packages/utils — shared lint/build configuration and common utilities
- Room reserved for a future apps/mobile package (React Native/Expo) for the nursing, administrator, and field-staff native apps described in §6

### Technical Expectations

- Cloud-native microservices or well-modularized architecture (depending on deployment scale)
- API-first design — versioned REST APIs with backward compatibility; optional GraphQL
- Event-driven messaging for asynchronous workflows
- Comprehensive API documentation (OpenAPI/Swagger)
- Automated testing — unit, integration, end-to-end
- CI/CD pipelines and Infrastructure as Code (IaC)
- Centralized logging, monitoring, and full observability (logs, metrics, traces)
- Feature flags and tenant-specific configuration
- Deployment targets — public cloud, private cloud, and on-premises
- Browser support — latest Chrome, Edge, Firefox; responsive tablet UI
- Accessibility basics (WCAG 2.1 AA where feasible)
- Complete technical and user documentation with in-app help

## Reference

### Module Capability Matrix

Standalone = can be sold and run with no other business module entitled. Hard Dependencies = module will not activate without these already entitled. Optional Integrations = functions without these, gains capability with them.

| Module | Standalone | Hard Dependencies | Optional Integrations |
|---|---|---|---|
| Patient Management | Yes | None | Appointment, EMR, Billing |
| Appointment Management | Yes | Patient Management | EMR, Notifications |
| OPD & Check-in | Partial | Patient, Appointment | EMR, Billing |
| Clinical Workflow (EMR) | Partial/No | Patient, Encounter (OPD/IPD) | Lab, Pharmacy, Radiology |
| Nursing | No | IPD | EMR |
| Laboratory | Yes | None | Patient, EMR, Billing |
| Radiology & Imaging | Yes | None | Patient, EMR, Billing, PACS (add-on) |
| Admission (IPD) | Partial | Patient | Billing, Nursing, Insurance |
| Emergency (ER) | Yes | Patient | EMR, Billing, IPD |
| Operation Theatre (OT) | No | IPD | EMR, Billing, Inventory |
| CSSD | No | OT | Inventory |
| Blood Bank | Yes/Partial | None | Patient, Billing |
| Specialty Clinical Modules | No | EMR | Billing |
| Pharmacy | Yes | None | Patient, EMR, Billing, Inventory |
| Inventory, Stores & Procurement | Yes | None | Pharmacy, OT, Billing |
| Billing & Payments | Yes | None | Patient, Pharmacy, Lab, IPD |
| Insurance, TPA & Govt. Schemes | No | Billing | Patient, IPD |
| Financial Management | Partial | Billing | Inventory, HR |
| Dietary & Kitchen | Yes | None | IPD (diet-chart linkage) |
| Housekeeping & Laundry | Yes | None | IPD (ward/bed linkage) |
| Ambulance & Fleet | Yes | None | Patient, ER, Billing |
| Biomedical Equipment & Asset Mgmt | Yes | None | OT, Laboratory, Radiology |
| Biomedical Waste Management | Yes | None | None required |
| HR, Payroll & Doctor Scheduling | Yes | None | Appointment, Financial Management |
| CRM & Patient Engagement | Yes | None | Patient, Appointment, Notifications |

All 25 modules list **Platform Core** as an implicit prerequisite (omitted from the table for readability, per the Platform Core section) — every row above assumes it.

"Standalone" in this matrix means *technically* standalone (operates with no other business module entitled), which is the stricter of the two independence concepts defined above — commercial sale is available for every module regardless of this column, subject only to its listed Hard Dependencies.

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

---
*Architecture Document — v1.0 — Takoriya Technology LLP — August 2026*