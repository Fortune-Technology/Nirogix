# Project Requirements Document

**Document:** `projectrequirementdoc.md`  
**Version:** 1.0  
**Last Updated:** August 2026  
**Prepared for:** Takoriya Technology LLP  
**Source of Truth:** Enterprise HMS — Architecture and Development Roadmap v2.1, plus two corrections identified in subsequent review (permission-cache expiry bound; break-glass notification/review boundary).

---

For technical implementation detail, see **Architecture Document**. For build sequencing, see **Development Phases & Roadmap**.

---

## Contents

- **Purpose & Scope**
  - [Product Vision](#product-vision)
  - [Architecture Principle (summary)](#architecture-principle-summary)
- **Platform Capabilities (Requirements View)**
  - [Platform Architecture](#platform-architecture)
  - [Platform Core — Required Foundational Capabilities](#platform-core--required-foundational-capabilities)
  - [Portals & Access Channels](#portals--access-channels)
- **Business Modules — Functional Scope**
  - [Overview & Dependency Model](#overview--dependency-model)
  - [Module Capability Matrix](#module-capability-matrix)
  - [Patient Management](#patient-management)
  - [Appointment Management](#appointment-management)
  - [OPD & Check-in](#opd--check-in)
  - [Clinical Workflow (EMR)](#clinical-workflow-emr)
  - [Nursing Module](#nursing-module)
  - [Laboratory Management](#laboratory-management)
  - [Radiology, Medical Imaging & PACS/RIS](#radiology-medical-imaging--pacsris)
  - [Admission (IPD) Management](#admission-ipd-management)
  - [Emergency Department (ER)](#emergency-department-er)
  - [Operation Theatre (OT) Management](#operation-theatre-ot-management)
  - [CSSD Management](#cssd-management)
  - [Blood Bank Management](#blood-bank-management)
  - [Specialty Clinical Modules](#specialty-clinical-modules)
  - [Pharmacy Management](#pharmacy-management)
  - [Inventory, General Stores & Procurement](#inventory-general-stores--procurement)
  - [Billing & Payments](#billing--payments)
  - [Insurance, TPA & Government Schemes](#insurance-tpa--government-schemes)
  - [Financial Management](#financial-management)
  - [Dietary & Kitchen Management](#dietary--kitchen-management)
  - [Housekeeping & Laundry Management](#housekeeping--laundry-management)
  - [Ambulance & Fleet Management](#ambulance--fleet-management)
  - [Biomedical Equipment & Asset Management](#biomedical-equipment--asset-management)
  - [Biomedical Waste Management](#biomedical-waste-management)
  - [HR, Payroll & Doctor Scheduling](#hr-payroll--doctor-scheduling)
  - [CRM & Patient Engagement](#crm--patient-engagement)
- **Add-Ons & Optional Capabilities**
  - [Overview](#overview)
  - [Telemedicine & Video Consultation](#telemedicine--video-consultation)
  - [ABDM Integration & Cross-Hospital Health Records](#abdm-integration--cross-hospital-health-records)
- **Users & Access (Requirements View)**
  - [RBAC & User-Level Overrides](#rbac--user-level-overrides)
  - [Feature Configuration](#feature-configuration)
- **Non-Functional Requirements**
  - [Multi-Tenancy Requirements](#multi-tenancy-requirements)
  - [Multi-Branch Requirements](#multi-branch-requirements)
  - [Data Lifecycle & Retention Requirements](#data-lifecycle--retention-requirements)
  - [Security & Compliance Requirements](#security--compliance-requirements)
  - [Performance & Scalability Requirements](#performance--scalability-requirements)
  - [Indian Healthcare Seed Data Requirements](#indian-healthcare-seed-data-requirements)
- **Compliance Considerations**
  - [Regulatory Verification & Compliance Source Register](#regulatory-verification--compliance-source-register)
- **Acceptance Criteria**
  - [Module & Milestone Acceptance Criteria](#module--milestone-acceptance-criteria)

---

## Purpose & Scope

### Product Vision

One unified healthcare platform that manages the complete patient journey while remaining compliant with Indian healthcare standards and capable of future global expansion. Organizations purchase and provision only the capabilities they need — from a single business module to the full platform — per the Module Capability Matrix in Part II.

### Architecture Principle (summary)

The single sentence every other decision in this document should trace back to:

> **Architecture Principle:** Build the platform core once. Build business modules independently. Sell and provision modules independently. Connect modules through optional integrations, not hard-coded assumptions. Control user access through centralized authorization. Configure tenant-specific behavior without forking code.

Five layers implement this, each covered in its own part of this document:

- **Platform Core** — foundational technical capabilities every tenant gets, never sold as a line item (Part I)
- **Business Modules** — independently sellable clinical/operational capabilities (Part II)
- **Add-Ons & Optional Integrations** — capabilities that extend a module or connect an external system, opted into separately (Part III)
- **Feature Configuration** — same module, different behavior per tenant, without a code branch (Part IV)
- **User Authorization** — who, within an entitled organization, can actually do what (Part IV)

## Platform Capabilities (Requirements View)

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

### Platform Core — Required Foundational Capabilities

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

### Portals & Access Channels

### Patient portal / app

- View, book, and cancel appointments; join teleconsultations
- Download prescriptions and reports; view medical history
- View billing, make payments, track admissions
- Notifications, secure chat, family member profiles, ABHA linking and consent management
- Feedback and ratings

### Doctor portal / app

- Schedule and appointment management; patient history and reports
- Write prescriptions; review lab results; admit patients
- Digital document signing; conduct teleconsultations

### Staff portals

- Department-specific dashboards — reception, pharmacy, laboratory, nursing, housekeeping, billing, HR, administration
- Nursing tablet app — vitals, MAR, rounds, task lists
- Administrator app — dashboards, approvals, alerts
- Field staff app — home healthcare visits and ambulance crews

## Business Modules — Functional Scope

### Overview & Dependency Model

Every business module is independently commercially sellable unless one of its explicitly defined hard dependencies prevents technical activation. Hard dependencies are documented in the Module Capability Matrix and enforced by the entitlement engine.

### Four Distinct Concepts

- **Commercial independence** — a customer can purchase a module separately, as its own line item
- **Technical independence** — the module can operate without another business module being entitled
- **Hard dependency** — the module cannot technically operate without another entitled module
- **Optional integration** — the module works independently but becomes more capable when another module is enabled

Commercial independence is the default for every module in this Part. Technical independence is *not* universal — some modules are commercially sellable on their own but only technically activate once a hard dependency is already entitled. Example: **OT** can be purchased on its own, but will not activate for a tenant that has not also entitled **IPD**; **CSSD** likewise requires **OT**. By contrast, **Pharmacy** is both commercially and technically standalone, and simply gains deeper prescription integration if **EMR** is also entitled.

### Hard Dependency

- The module cannot technically function without the dependency present and entitled
- Example: **OT → IPD**. A surgery cannot be scheduled without a bed/admission context to schedule it against
- Hard dependencies are enforced at entitlement-grant time (§ Module Entitlements) — the system will not activate a module whose hard dependency is not already active
- Kept deliberately sparse. A dependency is only encoded as "hard" when the module is genuinely inoperable without it — not merely more useful with it

### Optional Integration

- The module functions independently, and becomes more capable when another module is also enabled
- Example: **Pharmacy ↕ EMR.** If EMR is entitled, a doctor's prescription flows directly into Pharmacy dispensing. If EMR is not entitled, Pharmacy operates as manual sale / walk-in customer order — fully functional, just without the prescription feed
- The same pattern applies to Laboratory and Radiology (function as walk-in order desks without EMR, or as EMR-fed order queues with it), and to Billing (functions as a standalone invoicing tool, or aggregates charges automatically from Pharmacy/Lab/IPD when those are present)
- No module is designed so that its absence breaks another module's core function — only its depth

The Module Capability Matrix below applies this classification to every module in the platform, and is the reference other parts of this document (pricing, entitlements, onboarding, feature visibility) point back to.

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

### Patient Management

### Registration

- Walk-in, online, mobile, and QR-code registration
- Aadhaar-based registration (only where legally permitted, with explicit consent)
- ABHA (Ayushman Bharat Health Account) creation and linking at registration
- Existing patient search with duplicate detection
- Family linking; corporate and insurance patient categories
- Unique Patient ID (UHID) with barcode/QR for wristbands and case files

### Patient profile

- Demographics, contact details, and emergency contacts
- Allergies, chronic diseases, past surgeries, family history, lifestyle information
- Vaccination history, documents, and images

### Records & lifecycle

- Patient timeline, previous visits, and complete medical history
- Cross-branch access (permission-based)
- Attachments — PDFs, images, scanned documents, consent forms
- Digital signatures on consent and clinical documents
- Allergy and alert flags visible across all workflows
- Birth and death record management with certificate generation
- Medico-Legal Case (MLC) flagging and register

### Appointment Management

- Booking channels — walk-in, online (web), mobile app, WhatsApp, call center
- Doctor availability, slot management, and dynamic scheduling
- Appointment reminders, rescheduling, and cancellation
- Waiting list management and queue estimation
- No-show tracking and follow-up appointments

### OPD & Check-in

- Self-service kiosk, mobile check-in, and reception-assisted check-in
- Token generation and queue management with live waiting time
- Department queues and doctor-wise queues with queue transfer
- Priority handling — emergency, priority, and VIP patients
- Display boards / digital signage and voice announcements in waiting areas
- Notifications — SMS (TRAI DLT-compliant), Email, Push, WhatsApp

### Clinical Workflow (EMR)

- SOAP-format consultation notes with specialty-specific templates
- Symptoms, complaints, diagnosis, and procedure recording
- ICD-10 / ICD-11 coding; SNOMED CT support (where licensed and applicable)
- Vital signs entry with trend charts
- Allergies, medical history, and family history in consultation view
- Attach reports and prior records; ABDM-fetched records with patient consent
- Voice dictation for clinical notes
- Digital prescription / e-Prescription with drug database and dosage templates
- Drug–drug interaction and allergy alerts
- AI-assisted features — diagnosis suggestions, medical documentation, voice transcription, ICD coding assistance (reference-only aids)
- Follow-up planning and recall reminders
- Immunization/vaccination schedules; pediatric growth charts; ANC/PNC workflows
- Electronic Health Records (EHR) as the longitudinal clinical backbone across all modules

### Nursing Module

- Nursing dashboard with assigned-patient view
- Vital charting and clinical monitoring
- Medication administration (MAR) against doctor's orders
- Nursing notes and care plans
- Intake/output charting
- Shift handover workflow
- Escalation alerts for critical values and overdue tasks

### Laboratory Management

- Test catalog and packages with LOINC mapping and rate lists
- Sample collection workflow with barcode generation and sample tracking
- Test processing, result entry with reference ranges, and abnormal-value flagging
- Result verification and pathologist sign-off
- Digital reports shared with patients via portal, WhatsApp, and email, with notifications
- Integrations — LIS, external laboratories, analyzer machines (bidirectional API interfaces)

### Radiology, Medical Imaging & PACS/RIS

- Order management — X-ray, CT, MRI, Ultrasound, Mammography, ECG, and other imaging
- Report templating and radiologist sign-off workflow
- PACS/RIS integration with DICOM viewer — image storage, retrieval, and access
- Modality worklist integration with imaging equipment
- Image sharing with referring doctors and patients (consent-based)
- PC-PNDT compliance support for ultrasound workflows (Form F records and registers)

### Admission (IPD) Management

- Complete admission workflow with advance deposit collection
- Bed allocation, bed/room transfer, ward, ICU, and isolation room management with visual bed-board
- Doctor and nursing assignment; treatment plans and procedures
- Daily notes, medication charts, and clinical monitoring
- Doctor's orders (CPOE) — medications, diet, investigations
- Allied services — housekeeping, dietician, physiotherapy
- Transfer between wards and branches
- Discharge — clearance workflow, final bill, discharge summary, prescriptions, follow-up
- Discharge types — normal, DAMA (against medical advice), referral, death
- Daycare procedure management; complete admission history

### Emergency Department (ER)

- Rapid emergency registration with unknown-patient support
- Triage with priority codes
- Emergency admissions with ER-to-IPD/OT conversion workflow
- Critical alerts to on-call teams
- Ambulance integration for inbound patients
- MLC handling and police intimation records; emergency billing and deposits

### Operation Theatre (OT) Management

- Surgery scheduling with OT availability view
- Surgeon, anesthetist, staff, and equipment assignment
- Pre-operative checklists and digital consent forms
- Surgery notes and anesthesia records
- Implant and OT consumables tracking with billing linkage
- Post-operative handover to IPD/ICU; OT utilization reporting

### CSSD Management

- Instrument and tray master with barcode/RFID tagging for full lifecycle traceability
- Receipt, cleaning, packing, and sterilization cycle tracking — steam, ETO, plasma
- Sterilization load register — cycle parameters, biological and chemical indicator results
- Set assembly checklist with missing-instrument and expiry alerts
- Cycle-to-case traceability — sterilized sets linked to the surgery register (OT module)
- Rejection and recall workflow for failed loads or recalled instrument sets
- NABH-aligned CSSD documentation, audit trail, and turnaround-time reporting

### Blood Bank Management

- Donor registration, screening, and donation records
- Blood unit inventory by group and component (whole blood, PRBC, FFP, platelets)
- Cross-match and issue workflow with full traceability
- Expiry tracking and discard records
- Statutory registers per Drugs & Cosmetics Rules blood bank requirements
- Organ donation registry linkage (consent-based, per applicable law)

### Specialty Clinical Modules

Configurable specialty modules built on the shared EMR backbone — enabled per tenant as needed.

- Dialysis management (schedules, machine allocation, session records)
- Oncology management (chemotherapy cycles, protocols)
- Maternity & neonatal care (labour room, delivery records, NICU)
- Dental management (tooth charting, procedures)
- Ophthalmology (vision records, optical workflows)
- Dermatology (photo documentation, procedures)
- Physiotherapy (session plans, progress tracking)
- Mental health (counselling records with enhanced confidentiality controls)
- Home healthcare (field visits, home care plans)
- Remote patient monitoring & wearable device integration
- Additional specialties added via the configurable specialty form-template mechanism (§46 Specialty-Agnostic Architecture), without core platform changes

### Pharmacy Management

- In-house pharmacy with prescription dispensing
- Multi-store inventory with batch, expiry, and rack management
- Purchase orders, vendors, GRN, and supplier management
- Expiry alerts and low-stock alerts; stock transfers between stores/branches
- Controlled medicines — Narcotic / Schedule H, H1, X registers per Drugs & Cosmetics Rules
- Generic alternative suggestions at dispensing
- GST-compliant pharmacy billing; sales and purchase returns with audit trail

### Inventory, General Stores & Procurement

- Medical and non-medical inventory; central and department sub-stores
- Item masters for consumables, surgical items, linen, and general supplies
- Indent → approval → purchase order → GRN → issue workflow
- Vendor management and rate contracts
- Consumption tracking, stock valuation, reorder levels, and expiry tracking
- Inter-store and inter-branch stock transfers
- Asset tagging integration with the biomedical/asset module

### Billing & Payments

Built on the Financial Transaction Infrastructure in Platform Core (invoice/payment/tax/receipt/ledger primitives) — this module provides the business-facing billing workflows themselves.

- Unified billing — OPD, IPD, laboratory, radiology, pharmacy, procedures, OT, packages, and corporate billing
- GST-compliant invoicing with e-invoice readiness; HSN/SAC mapping
- Payment methods — cash, card, UPI, net banking, bank transfer, cheque, wallets
- Payment gateway integration with shareable payment links (PCI DSS-aligned)
- Advance payments, deposit management, interim bills, and final settlement
- Discounts with approval workflow, refunds, credit notes, and outstanding tracking
- Rate lists per payer type — cash, insurance, corporate, government scheme

### Insurance, TPA & Government Schemes

- Policy management and eligibility capture
- Pre-authorization and cashless admission workflow
- Claim submission, tracking, settlement, and rejection/shortfall management
- TPA master and corporate tie-up management
- Government schemes — PM-JAY (Ayushman Bharat), state schemes (e.g., MA Yojana): package mapping, beneficiary verification, claim workflows
- Payer-wise documentation checklists

### Financial Management

- Revenue reports and expense management
- Profit & Loss dashboards
- Department-wise and branch-wise profitability
- Tax reports (GST, TDS summaries)
- Audit reports and day-end closing
- Accounting/ERP export (Tally and others) — voucher and ledger level

### Dietary & Kitchen Management

- Diet plans mapped to doctor's orders (normal, diabetic, renal, liquid, etc.)
- Ward-wise meal scheduling and delivery tracking
- Kitchen indent and raw material consumption
- Dietician consultation notes

### Housekeeping & Laundry Management

- Housekeeping task scheduling — ward, room, OT, and common-area cleaning rotas with checklist sign-off
- Terminal cleaning workflow triggered on discharge/transfer, gating bed re-allocation until cleared
- Infection-control cleaning protocols for isolation rooms and OT with compliance logging
- Linen and laundry cycle tracking — issue, wash, return, damage and loss recording
- Housekeeping consumables (detergents, disinfectants) inventory linkage with stores
- Complaint and service-request management integrated with the helpdesk
- Support for outsourced/vendor-managed housekeeping and laundry contracts

### Ambulance & Fleet Management

- Fleet and driver/paramedic management
- Dispatch with emergency routing and GPS tracking integration
- Trip history and trip billing (distance/fixed) linked to the patient bill
- Vehicle maintenance, insurance, and document expiry tracking
- ER integration for inbound emergency patients

### Biomedical Equipment & Asset Management

- Equipment/asset register with department mapping
- AMC/CMC contract tracking and renewal alerts
- Calibration and preventive maintenance schedules
- Breakdown logging and service history
- Warranty and vendor records; depreciation data for accounts
- IoT-enabled medical device integration readiness

### Biomedical Waste Management

- Colour-coded segregation at source per Bio-Medical Waste Management Rules, 2016 (yellow, red, white, blue)
- Barcode-tagged waste bags/containers for chain-of-custody tracking from ward to disposal
- Category-wise weighing and generation log by department and shift
- Common Biomedical Waste Treatment Facility (CBWTF) handover manifest and pickup tracking
- Occupational safety records — sharps injury log, staff PPE and immunization compliance
- State Pollution Control Board (SPCB) authorization renewal tracking and statutory report generation
- Deviation and incident logging for segregation lapses or spillage

### HR, Payroll & Doctor Scheduling

- Employee master — doctors, nurses, technicians, admin, support and field staff
- Shift rosters and duty scheduling (doctor and nursing rosters)
- Attendance and leave management (biometric integration)
- Payroll with statutory compliance — PF, ESIC, Professional Tax, TDS
- Doctor payout computation (salary / fee-for-service / revenue share as contracted)
- Credential tracking — medical council registration and expiry alerts

### CRM & Patient Engagement

- Lead and enquiry management (calls, walk-ins, website, campaigns)
- Health checkup package promotion and camp management (opt-in based)
- Patient feedback, ratings, and complaint/grievance tracking
- Recall and preventive-care reminder campaigns (vaccination, follow-ups, screenings)
- Loyalty/corporate wellness program support
- Patient communication history in one view

## Add-Ons & Optional Capabilities

### Overview

Add-ons extend a business module or connect an external system. Unlike business modules, most add-ons have no standalone value — they only matter once the module or workflow they attach to exists.

- **Telemedicine & Video Consultation** — extends Appointment/EMR with remote visits
- **ABDM Integration** — extends Patient Management and EMR with national health-record interoperability
- **WhatsApp Business Messaging** — an additional channel on top of the Platform Core notification infrastructure, beyond basic transactional SMS/email
- **Advanced BI & AI-Assisted Features** — extends the Reporting Architecture; any AI feature touching diagnosis/decision-support requires a CDSCO classification check before build (see Postponed / Build-as-Sold, Part IX)
- **Payment Gateway Integration** — extends Billing beyond cash/UPI collection
- **PACS Integration** — extends Radiology with film-less imaging archives
- **External LIS Integration** — extends Laboratory for hospitals with an existing third-party lab system
- **Custom Workflow Builder** — low-code configuration layer for tenant-specific process variations

Two of these — Telemedicine and ABDM — are detailed in this Part because they are committed, specified capabilities. The remainder are built opportunistically, per the Postponed / Build-as-Sold guidance in Part IX.

### Telemedicine & Video Consultation

- Video consultation with in-call prescription and notes
- Tele-appointment booking, virtual queue, and pre-consult online payment
- Screen/report sharing during consultation; secure patient chat
- e-Prescription delivery to portal, WhatsApp, and email after consult
- Consultation recording consent and audit trail
- Compliance with the Telemedicine Practice Guidelines, 2020 (identity verification, consent, drug-schedule prescription restrictions)

### ABDM Integration & Cross-Hospital Health Records

- ABHA ID creation, verification, and linking — **Milestone M1**
- Health record linking and sharing as HIP (Health Information Provider) — **Milestone M2**
- Fetching patient records as HIU (Health Information User) with patient consent via the ABDM Consent Manager — **Milestone M3**
- Scan-and-share OPD registration via ABHA QR
- UHI (Unified Health Interface) integration readiness
- FHIR-compliant record bundles — OPConsultRecord, DischargeSummary, Prescription, DiagnosticReport
- Cross-provider access strictly where legally permitted, consent-driven, and fully audit-logged

## Users & Access (Requirements View)

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

### Feature Configuration

Distinct from entitlement. Entitlement decides *whether* a tenant has a module; Feature Configuration decides *how* that module behaves for them — without a code branch per tenant.

> **Example:** Pharmacy = ENABLED (entitlement) → Batch Tracking = ON, Barcode = ON, Multi-Store = ON, Generic Substitution = OFF, Purchase Workflow = OFF (feature configuration)

- Feature flags stored per (tenant, module, feature_key), read by the same module code regardless of which flags are set
- Lets a single-doctor clinic's Pharmacy stay simple (no multi-store, no purchase-approval workflow) while a hospital chain's Pharmacy runs the full configuration, from the same deployed code
- Feature configuration changes do not require an entitlement change, a deployment, or a support ticket to engineering

## Non-Functional Requirements

### Multi-Tenancy Requirements

### Multi-Tenancy Strategy

- Default isolation model — shared database, shared schema, a tenant_id column on every table, enforced by PostgreSQL Row-Level Security (RLS) policies at the database layer
- Request-scoped database client sets the tenant context for RLS on every query; tenant identity is never trusted from client-supplied input
- Dedicated schema-per-tenant or database-per-tenant offered as a premium isolation tier for large hospital chains with contractual data-isolation requirements
- Tenant resolution at launch — organization code / email-domain match at login; subdomain-per-tenant routing (with wildcard DNS/SSL and Next.js middleware) planned as a later-stage enhancement once the tenant base grows

### Multi-Branch Requirements

### Multi-branch

- Unlimited branches per tenant
- Branch-independent doctors, staff, inventory, pharmacy, laboratory, billing, rooms, wards, and operation theatres
- Branch-level reports with centralized visibility for corporate administrators

### Data Lifecycle & Retention Requirements

### Record Lifecycle States

- Healthcare records move through defined states rather than existing or being deleted: **Active → Archived → Deactivated → Retention-Locked → Anonymized → Deleted**
- Unrestricted hard deletion of healthcare records is not permitted at any point in this lifecycle — deletion is only reachable after retention obligations are satisfied, and is itself an audited action
- Retention-Locked records cannot be edited or deleted regardless of role, including by administrators, until the lock condition (statutory period, active MLC, litigation hold) clears
- Anonymization is available as a lifecycle step for records that have satisfied identifiable-data retention requirements but retain research/analytics value
- Retention durations follow applicable medical-record norms (3+ years OPD; longer for IPD/MLC, per Security & Compliance, Part VII) — the state machine is the mechanism that enforces those durations technically, not just documents them

### Security & Compliance Requirements

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

### Performance & Scalability Requirements

- Millions of patient records; thousands of concurrent users
- Horizontal scaling, auto-scaling, and high availability (99.5%+ uptime SLA target)
- Page/API response under 2 seconds for standard operations
- Multi-region deployment capability and CDN support
- Background job processing and event-driven architecture for asynchronous workflows
- Offline-first capability for selected workflows in low-connectivity settings
- Disaster recovery with defined RPO/RTO objectives

### Indian Healthcare Seed Data Requirements

### Indian Healthcare Seed & Demonstration Data

- All seed, demo, and test data reflects a genuinely Indian healthcare context — patient, doctor, and staff names, hospital/clinic names, addresses, cities, states, and PIN codes drawn from across India rather than a single region
- Demo data spans the platform's actual target segments — small clinics, multi-specialty hospitals, diagnostic centers, and standalone pharmacies — rather than one hospital archetype repeated with different names
- Generic placeholder data is not used in any environment a stakeholder, investor, or pilot customer might see

## Compliance Considerations

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

## Acceptance Criteria

### Module & Milestone Acceptance Criteria

A module or milestone is accepted as functionally complete only when all of the following hold. Full engineering-process detail lives in the Development Phases & Roadmap document; this is the product-facing reading of the same bar.

- The feature works end-to-end for every role that should have access, and is provably denied for every role and tenant that should not.
- A tenant that has not purchased/activated the relevant module cannot use it, and sees an appropriate "not available" state rather than a broken page.
- A user granted a time-bound (temporary) permission has access only within its validity window, automatically, with no administrator action required to turn it off.
- No tenant can, under any circumstance, see or affect another tenant's data.
- The feature behaves correctly and legibly in both Light and Dark theme, and under a customer's own branding.
- Every meaningful action a user takes against the feature (create, change, deny, grant) is recorded and retrievable in an audit trail.
- The feature is demonstrable, by a non-developer, on the staging environment — not only provable by an engineer reading code.

---
*Project Requirements Document — v1.0 — Takoriya Technology LLP — August 2026*