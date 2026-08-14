// Single source of truth for marketing content: navigation, module catalogue,
// roles, facility segments, trust facts, and company details. Everything here is
// grounded in resources/projectrequirementdoc.md + user-journeys.md so pages stay
// consistent and honest. Content guardrails (from the PRD's Regulatory Register):
//   - No prices / named tiers exist yet — present the packaging model, never numbers.
//   - No certified-compliance claims — the platform is "designed for / aligned with"
//     DPDP / ABDM / GST and "hosted in India"; never assert certification.
//   - Onboarding is operator-driven (demo / sales led), not public self-serve signup.

import type { LucideIcon } from "lucide-react";
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
} from "lucide-react";

export const SITE = {
  name: "HMS",
  legalName: "Takoriya Technology LLP",
  wordmark: "HMS",
  tagline: "The hospital management system built for multi-tenant scale.",
  description:
    "A multi-tenant, India-resident hospital management system. Run patients, appointments, OPD/EMR, pharmacy, lab, and billing on one platform, and turn on only the modules each hospital needs.",
  primaryCta: { label: "Book a demo", href: "/contact" },
  // The Portal login target is env-driven (see lib/portal.ts).
} as const;

export type NavLink = { label: string; href: string };

export const NAV_LINKS: NavLink[] = [
  { label: "Platform", href: "/platform" },
  { label: "Modules", href: "/modules" },
  { label: "Solutions", href: "/solutions" },
  { label: "Security", href: "/security" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export type ModuleEntry = {
  slug: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  points: string[];
  /** True for the seven MVP clinic-core modules that get dedicated pages. */
  flagship?: boolean;
  /** Sold as a standalone module (no hard dependency on another). */
  standalone?: boolean;
};

// The seven MVP clinic-core modules (dedicated pages). One-liners drawn from the PRD.
export const CLINIC_MODULES: ModuleEntry[] = [
  {
    slug: "patients",
    name: "Patient Management",
    icon: Users,
    flagship: true,
    standalone: true,
    tagline: "One record per patient, from first visit onward.",
    points: [
      "Walk-in, online, and QR self-registration",
      "UHID with barcode / QR and duplicate detection",
      "Family linking and a full medical timeline",
    ],
  },
  {
    slug: "appointments",
    name: "Appointment Management",
    icon: CalendarDays,
    flagship: true,
    tagline: "Booking across every channel, without double-booking.",
    points: [
      "Slot and availability management per provider",
      "Reminders, rescheduling, and waitlist estimates",
      "No-show tracking and queue visibility",
    ],
  },
  {
    slug: "opd",
    name: "OPD & Check-in",
    icon: ClipboardList,
    flagship: true,
    tagline: "Kiosk to consult, with live queues.",
    points: [
      "Reception, kiosk, and mobile check-in",
      "Token generation and department / doctor queues",
      "Priority handling and digital signage",
    ],
  },
  {
    slug: "emr",
    name: "Clinical Workflow (EMR)",
    icon: Stethoscope,
    flagship: true,
    tagline: "SOAP notes, coding, and e-prescriptions.",
    points: [
      "Specialty templates with ICD-10 / 11 coding",
      "Vitals trends and a longitudinal record",
      "E-prescribing with interaction and allergy alerts",
    ],
  },
  {
    slug: "pharmacy",
    name: "Pharmacy Management",
    icon: Pill,
    flagship: true,
    standalone: true,
    tagline: "Dispensing, inventory, and compliant billing.",
    points: [
      "Batch, expiry, and rack-level inventory",
      "Purchase orders, GRN, and vendor management",
      "Schedule H / H1 / X registers and GST billing",
    ],
  },
  {
    slug: "laboratory",
    name: "Laboratory Management",
    icon: FlaskConical,
    flagship: true,
    standalone: true,
    tagline: "Order to signed report, sample tracked throughout.",
    points: [
      "Test catalogue with LOINC coding",
      "Barcoded samples and abnormal-value flags",
      "Pathologist sign-off and digital report delivery",
    ],
  },
  {
    slug: "billing",
    name: "Billing & Payments",
    icon: ReceiptIndianRupee,
    flagship: true,
    standalone: true,
    tagline: "Unified billing across every department.",
    points: [
      "GST and e-invoice with HSN / SAC",
      "Cash, card, UPI, net-banking, and payment links",
      "Payer-wise rate lists and package billing",
    ],
  },
];

// A representative slice of the wider catalogue for the Modules index. The PRD
// defines 25 modules plus add-ons; the full set is enumerated on /modules.
export const MORE_MODULES: ModuleEntry[] = [
  {
    slug: "nursing",
    name: "Nursing",
    icon: HeartPulse,
    tagline: "Assigned-patient dashboards, vitals, and shift handover.",
    points: [],
  },
  {
    slug: "radiology",
    name: "Radiology & PACS",
    icon: Scan,
    tagline: "Imaging orders, radiologist sign-off, DICOM viewer.",
    points: [],
  },
  {
    slug: "ipd",
    name: "Admission (IPD)",
    icon: BedDouble,
    tagline: "Bed board, ward management, and discharge.",
    points: [],
  },
  {
    slug: "emergency",
    name: "Emergency (ER)",
    icon: Ambulance,
    tagline: "Rapid registration, triage, and ER-to-IPD conversion.",
    points: [],
  },
  {
    slug: "ot",
    name: "Operation Theatre",
    icon: Syringe,
    tagline: "Surgery scheduling, checklists, and consumable billing.",
    points: [],
  },
  {
    slug: "inventory",
    name: "Inventory & Procurement",
    icon: Boxes,
    tagline: "Indent to PO to GRN, with inter-branch transfers.",
    points: [],
  },
  {
    slug: "insurance",
    name: "Insurance & Schemes",
    icon: Landmark,
    tagline: "Pre-auth, cashless claims, PM-JAY and state schemes.",
    points: [],
  },
  {
    slug: "hr-payroll",
    name: "HR & Payroll",
    icon: UserCog,
    tagline: "Rosters, attendance, payroll, and doctor payouts.",
    points: [],
  },
];

export const ADDONS: ModuleEntry[] = [
  {
    slug: "telemedicine",
    name: "Telemedicine",
    icon: Video,
    tagline: "Video consults with in-call e-prescription and virtual queue.",
    points: [],
  },
  {
    slug: "abdm",
    name: "ABDM & Health Records",
    icon: Network,
    tagline: "ABHA linking and consent-based record exchange over FHIR R4.",
    points: [],
  },
];

// Platform Core — always included, never a line item. Good "in every plan" content.
export type CoreService = { name: string; icon: LucideIcon; blurb: string };

export const PLATFORM_CORE: CoreService[] = [
  {
    name: "Tenant & branch isolation",
    icon: Building2,
    blurb:
      "Every hospital's data is isolated at the database layer with PostgreSQL row-level security. Unlimited branches per tenant.",
  },
  {
    name: "Role-based access control",
    icon: KeyRound,
    blurb:
      "Fine-grained permissions per role, per-user overrides, and time-bound grants. Explicit deny always wins.",
  },
  {
    name: "Module entitlements",
    icon: Layers,
    blurb:
      "Turn modules on per hospital as entitlements, not forks. Entitlement and user access are separate levers.",
  },
  {
    name: "Immutable audit trail",
    icon: ScrollText,
    blurb:
      "Every security-relevant action is written to an append-only, tamper-evident log that is never physically deleted.",
  },
  {
    name: "Notifications",
    icon: Bell,
    blurb:
      "SMS, WhatsApp, and email behind one provider abstraction, with idempotency on every send.",
  },
  {
    name: "Financial infrastructure",
    icon: ReceiptIndianRupee,
    blurb:
      "Invoice, payment, tax, and receipt primitives live in one place; every billing module builds on them.",
  },
];

// Trust facts — honest, PRD-backed security posture. No certification claims.
export type TrustFact = { title: string; icon: LucideIcon; body: string };

export const TRUST_FACTS: TrustFact[] = [
  {
    title: "Isolated per tenant",
    icon: DatabaseZap,
    body: "PostgreSQL row-level security keeps one hospital's data unreachable from another. Tested on every module, not assumed.",
  },
  {
    title: "Hosted in India",
    icon: Building2,
    body: "Runs on E2E Networks, a MeitY-empanelled, India-headquartered cloud, with health data kept in-region.",
  },
  {
    title: "Auditable by design",
    icon: ScrollText,
    body: "An append-only audit trail records every meaningful action and is retained, tamper-evident, and queryable.",
  },
  {
    title: "Encrypted end to end",
    icon: ShieldCheck,
    body: "AES-256 at rest and TLS 1.2+ in transit, with least-privilege access and PII masking outside production.",
  },
];

// Personas / roles — drives the by-role solutions content.
export type Role = { name: string; icon: LucideIcon; blurb: string };

export const ROLES: Role[] = [
  {
    name: "Receptionist",
    icon: ClipboardList,
    blurb: "Register patients, book and check in appointments, manage the front-desk queue.",
  },
  {
    name: "Doctor",
    icon: Stethoscope,
    blurb: "Open an encounter, record SOAP notes, and issue e-prescriptions with safety alerts.",
  },
  {
    name: "Pharmacist",
    icon: Pill,
    blurb: "Dispense against prescriptions, manage batch and expiry, and keep compliant registers.",
  },
  {
    name: "Lab technician",
    icon: Microscope,
    blurb: "Collect and track barcoded samples, enter results, and route reports for sign-off.",
  },
  {
    name: "Cashier",
    icon: ReceiptIndianRupee,
    blurb: "Raise GST invoices, collect across payment methods, and reconcile at day end.",
  },
  {
    name: "Hospital admin",
    icon: UserCog,
    blurb: "Manage users, roles, branches, and branding, with full visibility inside the tenant.",
  },
];

// Facility segments — drives by-facility solutions content (PRD target segments).
export type Facility = { name: string; icon: LucideIcon; blurb: string };

export const FACILITIES: Facility[] = [
  {
    name: "OPD clinics",
    icon: Stethoscope,
    blurb: "Single and multi-doctor clinics that need patients, appointments, EMR, and billing on day one.",
  },
  {
    name: "Nursing homes",
    icon: BedDouble,
    blurb: "Small facilities that add pharmacy, lab, and light in-patient workflows as they grow.",
  },
  {
    name: "Multi-specialty hospitals",
    icon: Building2,
    blurb: "Multi-branch organisations running the full clinical and operational module set.",
  },
  {
    name: "Diagnostic centres",
    icon: FlaskConical,
    blurb: "Lab and radiology-led centres with sample tracking and digital report delivery.",
  },
  {
    name: "Standalone pharmacies",
    icon: Pill,
    blurb: "Retail pharmacies running inventory, procurement, and GST-compliant billing on their own.",
  },
];

export const COUNTS = {
  modules: 25,
  addons: 2,
} as const;
