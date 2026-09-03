// Single source of truth for marketing content: navigation, module catalogue,
// roles, facility segments, trust facts, and company details. Everything here is
// grounded in resources/projectrequirementdoc.md + user-journeys.md so pages stay
// consistent and honest. Content guardrails (from the PRD's Regulatory Register):
//   - No prices / named tiers exist yet — present the packaging model, never numbers.
//   - No certified-compliance claims — the platform is "designed for / aligned with"
//     DPDP / ABDM / GST and "hosted in India"; never assert certification.
//   - Onboarding is operator-driven (demo / sales led), not public self-serve signup.
//   - Nothing is described as available unless it is built. Every module and
//     integration carries an availability status (./availability), and planned
//     scope is written as planned (rules.md → Marketing Content & Claim Accuracy).

import type { LucideIcon } from 'lucide-react';
import type { Availability } from './availability';
import {
  Users,
  CalendarDays,
  ClipboardList,
  Stethoscope,
  Pill,
  FlaskConical,
  ReceiptIndianRupee,
  Building2,
  ShieldCheck,
  DatabaseZap,
  ScrollText,
  KeyRound,
  Boxes,
  Video,
  Network,
  HeartPulse,
  Scan,
  BedDouble,
  Ambulance,
  Syringe,
  Microscope,
  UserCog,
  Landmark,
  Bell,
  Layers,
} from 'lucide-react';

export const SITE = {
  name: 'Nirogix',
  legalName: 'Takoriya Technology LLP',
  wordmark: 'Nirogix',
  tagline: 'The hospital management system built for multi-tenant scale.',
  description:
    'A multi-tenant, India-resident hospital management system. Run patients, appointments, OPD/EMR, pharmacy, lab, and billing on one platform, and turn on only the modules each hospital needs.',
  primaryCta: { label: 'Book a demo', href: '/contact' },
  // The Portal login target is env-driven (see lib/portal.ts).
} as const;

export type NavLink = { label: string; href: string };

export const NAV_LINKS: NavLink[] = [
  { label: 'Platform', href: '/platform' },
  { label: 'Modules', href: '/modules' },
  { label: 'Specialties', href: '/specialties' },
  { label: 'Solutions', href: '/solutions' },
  { label: 'Security', href: '/security' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export type ModuleEntry = {
  slug: string;
  name: string;
  icon: LucideIcon;
  /** Describes only what the module's `status` allows — see lib/availability.ts. */
  tagline: string;
  /** What the module does in the product today. Empty for a module not built yet. */
  live: string[];
  /** PRD scope for this module that is scheduled but not built. Never written as available. */
  planned: string[];
  status: Availability;
  /** True for the seven MVP clinic-core modules that get dedicated pages. */
  flagship?: boolean;
  /** Sold as a standalone module (no hard dependency on another). */
  standalone?: boolean;
};

// The seven MVP clinic-core modules (dedicated pages). `live` is what the Portal
// does today (Phase 0 + MVP 0/1, resources/phases.md); `planned` is the rest of the
// PRD scope for that module. The split is the claim-accuracy rule made concrete —
// a bullet moves from `planned` to `live` only when the feature ships.
export const CLINIC_MODULES: ModuleEntry[] = [
  {
    slug: 'patients',
    name: 'Patient Management',
    icon: Users,
    flagship: true,
    standalone: true,
    status: 'built',
    tagline: 'One record per patient, from first visit onward.',
    live: [
      'Reception registration with demographics, ABHA number, and contact details',
      'Tenant-unique UHID generated on registration',
      'Search by name, phone, or UHID, with a patient profile you can edit',
      'Duplicate detection at registration that surfaces matching charts before a second record is created',
      // ADR-056. Worded carefully: patients send details, the hospital registers them.
      // "Patients register themselves" would be the overclaim (ADR-038).
      'Your own QR code so patients can send their details ahead, reviewed and completed by your front desk',
    ],
    planned: ['UHID barcode and QR printing', 'Family and dependant linking'],
  },
  {
    slug: 'appointments',
    name: 'Appointment Management',
    icon: CalendarDays,
    flagship: true,
    status: 'built',
    tagline: "Booking against a doctor's slots, without double-booking.",
    live: [
      'Weekly provider schedules that define the bookable slots',
      'Booking against those slots, with conflict prevention and slot release on cancellation',
      'Online self-booking through your branded QR link, into a front-desk approval queue',
      'Status-filtered appointment list, and check-in straight from a booking',
    ],
    planned: [
      'Mobile app, WhatsApp, and call-centre booking channels',
      'Automated reminders, rescheduling, and waitlist estimates',
      'No-show tracking',
    ],
  },
  {
    slug: 'opd',
    name: 'OPD & Check-in',
    icon: ClipboardList,
    flagship: true,
    status: 'built',
    tagline: 'Front desk to consult, with a live token queue.',
    live: [
      'Reception check-in that opens the visit and its token',
      'Live queue in token order, with the consultation status on every row',
      'A draft consultation-fee invoice opened automatically at check-in',
      'Payment before consultation, enforced on the server so the journey cannot be skipped',
    ],
    planned: [
      'Self-service kiosk and mobile check-in',
      'Department-wise queues and priority handling',
      'Waiting-area display boards and voice announcements',
    ],
  },
  {
    slug: 'emr',
    name: 'Clinical Workflow (EMR)',
    icon: Stethoscope,
    flagship: true,
    status: 'built',
    tagline: 'Consultation notes, ICD-10 coding, and prescriptions.',
    live: [
      'Consultation screen with vitals, notes, and ICD-10 diagnosis lookup',
      'Prescriptions and lab orders raised from the consultation itself',
      'Department referrals raised from the consultation and checked in against the same chart',
      'Sign-off that closes the encounter for editing',
    ],
    planned: [
      'Specialty note templates and ICD-11 coding',
      'Vitals trends across a longitudinal record',
      'Drug interaction and allergy alerts on prescribing',
    ],
  },
  {
    slug: 'pharmacy',
    name: 'Pharmacy Management',
    icon: Pill,
    flagship: true,
    standalone: true,
    status: 'built',
    tagline: 'Dispensing against prescriptions, on batch-aware stock.',
    live: [
      'Drug master with unit price and reorder level, and a low-stock flag',
      'Stock received by batch and expiry, issued first-expiry-first-out',
      "Dispensing against a prescription, billed onto the patient's invoice",
      'Supplier directory, with stock corrections recorded to an auditable ledger',
    ],
    planned: [
      'Purchase orders and goods-receipt notes',
      'Rack-level inventory',
      'Schedule H / H1 / X registers and full GST pharmacy billing',
    ],
  },
  {
    slug: 'laboratory',
    name: 'Laboratory Management',
    icon: FlaskConical,
    flagship: true,
    standalone: true,
    status: 'built',
    tagline: 'Order to result, tracked through the worklist.',
    live: [
      'Test master with price and reference ranges',
      'Worklist from ordered to sample collected to resulted',
      'Result entry with abnormal-value flags, and a printable report view',
      'Result verification before release, with the report file attached and downloadable',
    ],
    planned: [
      'LOINC coding on the test catalogue',
      'Barcoded sample tracking',
      'Instrument integration and cumulative reporting',
    ],
  },
  {
    slug: 'billing',
    name: 'Billing & Payments',
    icon: ReceiptIndianRupee,
    flagship: true,
    standalone: true,
    status: 'built',
    tagline: 'One invoice across consultation, pharmacy, and lab.',
    live: [
      'One invoice per visit, with line-level tax and a running balance',
      'Part payments recorded against the invoice, with a collections trail',
      'Consultation, pharmacy, and lab charges landing on the same bill',
      'A services and procedures catalogue, and manual invoices built line by line',
    ],
    planned: [
      'GST e-invoice with HSN / SAC mapping',
      'Card, net-banking, and shareable payment links through a gateway',
      'Payer-wise rate lists and prepaid package billing',
    ],
  },
];

// A representative slice of the wider catalogue for the Modules index. The PRD
// defines 25 modules plus add-ons; the full set is enumerated on /modules. All of
// these are planned scope from resources/phases.md (Phase 2-4) — none are built.
export const MORE_MODULES: ModuleEntry[] = [
  {
    slug: 'nursing',
    name: 'Nursing',
    icon: HeartPulse,
    status: 'planned',
    tagline: 'Assigned-patient dashboards, vitals, and shift handover.',
    live: [],
    planned: [],
  },
  {
    slug: 'radiology',
    name: 'Radiology & PACS',
    icon: Scan,
    status: 'planned',
    tagline: 'Imaging orders, radiologist sign-off, DICOM viewer.',
    live: [],
    planned: [],
  },
  {
    slug: 'ipd',
    name: 'Admission (IPD)',
    icon: BedDouble,
    status: 'planned',
    tagline: 'Bed board, ward management, and discharge.',
    live: [],
    planned: [],
  },
  {
    slug: 'emergency',
    name: 'Emergency (ER)',
    icon: Ambulance,
    status: 'planned',
    tagline: 'Rapid registration, triage, and ER-to-IPD conversion.',
    live: [],
    planned: [],
  },
  {
    slug: 'ot',
    name: 'Operation Theatre',
    icon: Syringe,
    status: 'planned',
    tagline: 'Surgery scheduling, checklists, and consumable billing.',
    live: [],
    planned: [],
  },
  {
    slug: 'inventory',
    name: 'Inventory & Procurement',
    icon: Boxes,
    status: 'planned',
    tagline: 'Indent to PO to GRN, with inter-branch transfers.',
    live: [],
    planned: [],
  },
  {
    slug: 'insurance',
    name: 'Insurance & Schemes',
    icon: Landmark,
    status: 'planned',
    tagline: 'Pre-auth, cashless claims, PM-JAY and state schemes.',
    live: [],
    planned: [],
  },
  {
    slug: 'hr-payroll',
    name: 'HR & Payroll',
    icon: UserCog,
    status: 'planned',
    tagline: 'Rosters, attendance, payroll, and doctor payouts.',
    live: [],
    planned: [],
  },
];

export const ADDONS: ModuleEntry[] = [
  {
    slug: 'telemedicine',
    name: 'Telemedicine',
    icon: Video,
    status: 'planned',
    tagline: 'Video consults with in-call e-prescription and virtual queue.',
    live: [],
    planned: [],
  },
  {
    // Stays `planned` until NHA certifies production access — see catalogue.ts and ADR-084.
    slug: 'abdm',
    name: 'ABDM & Health Records',
    icon: Network,
    status: 'planned',
    tagline: 'ABHA linking and consent-based record exchange over FHIR R4.',
    live: [],
    planned: [],
  },
];

/**
 * The Nirogix ecosystem — the surfaces a customer actually meets (ADR-051).
 *
 * Each carries an availability status like everything else on this site. Two rules
 * decided what is here:
 *
 * 1. **Platform administration is not listed.** It is the console *we* use to onboard
 *    and support a hospital — an internal operator tool, not something a customer buys
 *    or logs into. Presenting it as a product pillar would be padding the list.
 * 2. **The AI Portal is not listed.** AI is real scope in the PRD (EMR aids; the
 *    Advanced BI & AI add-on) but sits in Postponed / Build-as-Sold with a CDSCO gate,
 *    which is `FUTURE / CONSIDERATION` — and the status rules say a FUTURE capability is
 *    never advertised as a product capability. The portal exists as an access boundary
 *    with nothing behind it; saying otherwise would be selling a locked door.
 */
export type EcosystemEntry = {
  name: string;
  icon: LucideIcon;
  audience: string;
  blurb: string;
  status: Availability;
};

export const ECOSYSTEM: EcosystemEntry[] = [
  {
    name: 'Nirogix HMS',
    icon: Building2,
    audience: 'Hospital administrators, doctors and staff',
    blurb:
      "The hospital's own system: patients, appointments, OPD, the consultation record, pharmacy, laboratory and billing, with role-based access across the whole team.",
    status: 'built',
  },
  {
    name: 'Nirogix Patient Portal',
    icon: Users,
    audience: 'Patients registered at a Nirogix hospital',
    blurb:
      'Patients sign in with a one-time code to a contact their hospital already holds, and read their own record, appointments, bills and finished laboratory reports, across every hospital that has given them access. Read-only, and there is no public sign-up: the hospital grants access.',
    status: 'built',
  },
];

// Platform Core — always included, never a line item. Good "in every plan" content.
export type CoreService = { name: string; icon: LucideIcon; blurb: string };

export const PLATFORM_CORE: CoreService[] = [
  {
    name: 'Tenant & branch isolation',
    icon: Building2,
    blurb:
      "Every hospital's data is isolated at the database layer with PostgreSQL row-level security. Unlimited branches per tenant.",
  },
  {
    name: 'Role-based access control',
    icon: KeyRound,
    blurb:
      'Fine-grained permissions per role, per-user overrides, and time-bound grants. Explicit deny always wins.',
  },
  {
    name: 'Module entitlements',
    icon: Layers,
    blurb:
      'Turn modules on per hospital as entitlements, not forks. Entitlement and user access are separate levers.',
  },
  {
    name: 'Immutable audit trail',
    icon: ScrollText,
    blurb:
      'Every security-relevant action is written to an append-only, tamper-evident log that is never physically deleted.',
  },
  {
    name: 'Notifications',
    icon: Bell,
    // Email sends today; SMS is pending DLT template registration (BACKLOG I-1). WhatsApp is a
    // PRD add-on channel (projectrequirementdoc.md) and is not built.
    blurb:
      'One provider abstraction for transactional email and SMS, with idempotency on every send. Email is live; SMS is pending DLT template registration. WhatsApp is a planned channel.',
  },
  {
    name: 'Financial infrastructure',
    icon: ReceiptIndianRupee,
    blurb:
      'Invoice, payment, tax, and receipt primitives live in one place; every billing module builds on them.',
  },
];

// Trust facts — honest, PRD-backed security posture. No certification claims.
export type TrustFact = { title: string; icon: LucideIcon; body: string };

export const TRUST_FACTS: TrustFact[] = [
  {
    title: 'Isolated per tenant',
    icon: DatabaseZap,
    body: "PostgreSQL row-level security keeps one hospital's data unreachable from another. Tested on every module, not assumed.",
  },
  {
    // Deployment target from resources/architecture.md; the platform is not in
    // production yet, so this is written as the commitment it is.
    title: 'India-resident by design',
    icon: Building2,
    body: 'Built to run on E2E Networks, a MeitY-empanelled, India-headquartered cloud, with health data kept in-region.',
  },
  {
    title: 'Auditable by design',
    icon: ScrollText,
    body: 'An append-only audit trail records every meaningful action and is retained, tamper-evident, and queryable.',
  },
  {
    title: 'Encryption and least privilege',
    icon: ShieldCheck,
    body: "TLS in transit and AES-256 at rest are the platform's encryption standard, on a least-privilege architecture with PII masked outside production.",
  },
];

// Personas / roles — drives the by-role solutions content.
export type Role = { name: string; icon: LucideIcon; blurb: string };

export const ROLES: Role[] = [
  {
    name: 'Receptionist',
    icon: ClipboardList,
    blurb: 'Register patients, book and check in appointments, manage the front-desk queue.',
  },
  {
    name: 'Doctor',
    icon: Stethoscope,
    blurb:
      'Open an encounter, record vitals and SOAP notes with ICD-10 coding, and issue prescriptions and lab orders.',
  },
  {
    name: 'Pharmacist',
    icon: Pill,
    blurb:
      'Dispense against prescriptions and manage stock by batch and expiry, first-expiry-first-out.',
  },
  {
    name: 'Lab Technician',
    icon: Microscope,
    blurb:
      'Work the order-to-result worklist, record collection, and enter results against reference ranges.',
  },
  {
    name: 'Cashier',
    icon: ReceiptIndianRupee,
    blurb:
      "Raise the visit invoice, record part payments, and see the day's collections in the reports.",
  },
  {
    name: 'Organization Admin',
    icon: UserCog,
    blurb:
      'Manage users, roles, branches, and branding across the organization, with full visibility inside the tenant.',
  },
  {
    name: 'Branch Admin',
    icon: Building2,
    blurb:
      "Run a single branch, its users and day-to-day operations, within the organization's rules.",
  },
];

// Facility segments — drives by-facility solutions content (PRD target segments).
// These describe who the platform is *for*, in the order we are building for them —
// not a claim that every segment's modules exist today (see ./availability).
export type Facility = { name: string; icon: LucideIcon; blurb: string };

export const FACILITIES: Facility[] = [
  {
    name: 'OPD clinics',
    icon: Stethoscope,
    blurb:
      'Single and multi-doctor clinics that need patients, appointments, EMR, and billing on day one.',
  },
  {
    name: 'Nursing homes',
    icon: BedDouble,
    blurb: 'Small facilities that add pharmacy, lab, and light in-patient workflows as they grow.',
  },
  {
    name: 'Multi-specialty hospitals',
    icon: Building2,
    blurb:
      'Multi-branch organisations that will run the full clinical and operational set as each module is released.',
  },
  {
    name: 'Diagnostic centres',
    icon: FlaskConical,
    blurb:
      'Lab-led centres running the order-to-result worklist today, with radiology and report delivery planned.',
  },
  {
    name: 'Standalone pharmacies',
    icon: Pill,
    blurb:
      'Retail pharmacies running the drug master, batch stock, and dispensing, with procurement planned.',
  },
];

export const COUNTS = {
  modules: 25,
  addons: 2,
} as const;
