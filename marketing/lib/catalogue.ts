// Extended marketing content: the full module catalogue (grouped), platform
// pillars, integrations, and the pricing packaging model. Grounded in
// resources/projectrequirementdoc.md. Home-level data lives in ./site.
//
// Every entry carries an availability status (./availability). The hospital-grade,
// operational, and add-on modules and every integration below are PRD scope
// scheduled for a later phase — they are shown as planned, never as available
// (rules.md → Marketing Content & Claim Accuracy).

import type { LucideIcon } from "lucide-react";
import {
  Layers,
  Building2,
  GitBranch,
  SlidersHorizontal,
  HeartPulse,
  Scan,
  BedDouble,
  Ambulance,
  Syringe,
  ShieldPlus,
  Droplet,
  Activity,
  Boxes,
  Landmark,
  Wallet,
  Utensils,
  SprayCan,
  Truck,
  Wrench,
  Trash2,
  UserCog,
  HeartHandshake,
  Video,
  Network,
  Braces,
  FileHeart,
  Scan as ScanIcon,
  MessageSquare,
  CreditCard,
  FileSpreadsheet,
} from "lucide-react";
import { CLINIC_MODULES, type ModuleEntry } from "./site";
import type { Availability } from "./availability";

/* -------------------------------------------------------------------------- */
/* Platform pillars — the four architecture value props (/platform)            */
/* -------------------------------------------------------------------------- */
export type Pillar = { title: string; icon: LucideIcon; body: string };

export const PLATFORM_PILLARS: Pillar[] = [
  {
    title: "Multi-tenant by design",
    icon: Building2,
    body: "Every hospital is a fully isolated tenant. Data never crosses the boundary, and isolation is enforced in the database, not the application.",
  },
  {
    title: "Modular and independently sellable",
    icon: Layers,
    body: "Each module installs and bills on its own. Enable one module or the full set per hospital, all from the same deployed platform.",
  },
  {
    title: "Multi-branch",
    icon: GitBranch,
    body: "Unlimited branches per tenant, each with its own doctors, inventory, and billing, rolled up to central corporate visibility.",
  },
  {
    title: "Configurable without forks",
    icon: SlidersHorizontal,
    body: "Feature flags per tenant let a single-doctor clinic stay simple while a hospital chain runs the full configuration, from one codebase.",
  },
];

/* -------------------------------------------------------------------------- */
/* Full module catalogue, grouped (/modules)                                   */
/* -------------------------------------------------------------------------- */
export const HOSPITAL_MODULES: ModuleEntry[] = [
  { slug: "nursing", name: "Nursing", icon: HeartPulse, tagline: "Assigned-patient dashboards, vitals and MAR charting, and shift handover.", status: "planned", live: [], planned: [] },
  { slug: "radiology", name: "Radiology & PACS", icon: Scan, tagline: "Imaging orders, radiologist sign-off, and a DICOM viewer with modality worklist.", status: "planned", live: [], planned: [] },
  { slug: "ipd", name: "Admission (IPD)", icon: BedDouble, tagline: "Admission workflow, a visual bed board, ward and ICU management, and discharge.", status: "planned", live: [], planned: [] },
  { slug: "emergency", name: "Emergency (ER)", icon: Ambulance, tagline: "Rapid registration, triage, ambulance integration, and ER-to-IPD conversion.", status: "planned", live: [], planned: [] },
  { slug: "ot", name: "Operation Theatre", icon: Syringe, tagline: "Surgery scheduling, pre-op checklists, digital consent, and implant billing.", status: "planned", live: [], planned: [] },
  { slug: "cssd", name: "CSSD", icon: ShieldPlus, tagline: "Instrument and tray lifecycle with barcode tracking and sterilization cycles.", status: "planned", live: [], planned: [] },
  { slug: "blood-bank", name: "Blood Bank", icon: Droplet, tagline: "Donor screening, unit inventory by component, and cross-match traceability.", status: "planned", live: [], planned: [] },
  { slug: "specialty", name: "Specialty Clinical", icon: Activity, tagline: "Dialysis, oncology, maternity, dental, and more on the EMR backbone.", status: "planned", live: [], planned: [] },
];

export const OPERATIONAL_MODULES: ModuleEntry[] = [
  { slug: "inventory", name: "Inventory & Procurement", icon: Boxes, tagline: "Indent to PO to GRN to issue, with vendor contracts and inter-branch transfers.", status: "planned", live: [], planned: [] },
  { slug: "insurance", name: "Insurance & Schemes", icon: Landmark, tagline: "Pre-auth, cashless claims, and government schemes like PM-JAY.", status: "planned", live: [], planned: [] },
  { slug: "financial", name: "Financial Management", icon: Wallet, tagline: "Revenue and expense, P&L dashboards, GST and TDS reports, and Tally export.", status: "planned", live: [], planned: [] },
  { slug: "dietary", name: "Dietary & Kitchen", icon: Utensils, tagline: "Diet plans mapped to orders, ward meal scheduling, and kitchen indents.", status: "planned", live: [], planned: [] },
  { slug: "housekeeping", name: "Housekeeping & Laundry", icon: SprayCan, tagline: "Cleaning rotas, terminal-cleaning gates, and linen cycle tracking.", status: "planned", live: [], planned: [] },
  { slug: "ambulance", name: "Ambulance & Fleet", icon: Truck, tagline: "Fleet and crew management, GPS dispatch, and trip billing.", status: "planned", live: [], planned: [] },
  { slug: "biomedical", name: "Biomedical Assets", icon: Wrench, tagline: "Asset register, AMC and calibration schedules, and breakdown logs.", status: "planned", live: [], planned: [] },
  { slug: "bmw", name: "Biomedical Waste", icon: Trash2, tagline: "Colour-coded segregation, barcoded chain-of-custody, and CBWTF manifests.", status: "planned", live: [], planned: [] },
  { slug: "hr-payroll", name: "HR & Payroll", icon: UserCog, tagline: "Rosters, attendance, payroll with statutory deductions, and doctor payouts.", status: "planned", live: [], planned: [] },
  { slug: "crm", name: "CRM & Engagement", icon: HeartHandshake, tagline: "Lead and enquiry management, recall campaigns, and feedback.", status: "planned", live: [], planned: [] },
];

export const CATALOGUE_ADDONS: ModuleEntry[] = [
  { slug: "telemedicine", name: "Telemedicine", icon: Video, tagline: "Video consults with in-call e-prescription, a virtual queue, and pre-consult payment.", status: "planned", live: [], planned: [] },
  { slug: "abdm", name: "ABDM & Health Records", icon: Network, tagline: "ABHA linking and consent-based record exchange with FHIR R4 bundles.", status: "planned", live: [], planned: [] },
];

export type ModuleGroup = {
  id: string;
  title: string;
  blurb: string;
  modules: ModuleEntry[];
};

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "clinic-core",
    title: "Clinic core",
    blurb: "The outpatient journey, from the front desk to the pharmacy counter. These are the modules we have built.",
    modules: CLINIC_MODULES,
  },
  {
    id: "hospital-grade",
    title: "Hospital-grade",
    blurb: "In-patient, surgical, and diagnostic depth for multi-specialty hospitals. Planned scope, scheduled after the clinic core.",
    modules: HOSPITAL_MODULES,
  },
  {
    id: "operational",
    title: "Operations & back office",
    blurb: "The supporting modules that keep a hospital running and its finances clean. Planned scope, not yet built.",
    modules: OPERATIONAL_MODULES,
  },
];

/* -------------------------------------------------------------------------- */
/* Integrations (/integrations)                                                */
/* -------------------------------------------------------------------------- */
export type Integration = { name: string; icon: LucideIcon; body: string; status: Availability };
export type IntegrationGroup = { title: string; items: Integration[] };

export const INTEGRATION_GROUPS: IntegrationGroup[] = [
  {
    title: "Health standards",
    items: [
      {
        name: "HL7 FHIR R4",
        icon: Braces,
        status: "planned",
        // The provider/specialty core is FHIR-aligned today (ADR-008); the FHIR
        // APIs and bundles themselves are Phase 3 scope.
        body: "The clinical core is modelled on FHIR (Practitioner / PractitionerRole) so the FHIR R4 APIs and bundles can sit on top of it. The APIs are Phase 3 scope.",
      },
      {
        name: "ICD-10 diagnosis coding",
        icon: FileHeart,
        status: "built",
        body: "ICD-10 lookup on the consultation screen, stored with the encounter. ICD-11 is planned.",
      },
      {
        name: "SNOMED CT & LOINC",
        icon: Activity,
        status: "planned",
        body: "Clinical terminology and lab codes, where licensed and applicable.",
      },
      {
        name: "DICOM & PACS",
        icon: ScanIcon,
        status: "planned",
        body: "Imaging exchange and a DICOM viewer, with the Radiology module.",
      },
    ],
  },
  {
    title: "India digital health",
    items: [
      {
        name: "ABDM & ABHA",
        icon: Network,
        status: "planned",
        // A patient's ABHA number can be recorded today; ABDM linking and consent
        // exchange are the ABDM add-on module, not built.
        body: "ABHA creation and linking, and consent-based record sharing. A patient's ABHA number can already be recorded against their file.",
      },
      {
        name: "Scan-and-share OPD",
        icon: ScanIcon,
        status: "planned",
        body: "Fast OPD registration through the ABDM scan-and-share flow.",
      },
    ],
  },
  {
    title: "Communications & payments",
    items: [
      {
        name: "SMS & email",
        icon: MessageSquare,
        status: "built",
        body: "Transactional SMS and email through MSG91, behind one provider abstraction, with DLT-registered templates.",
      },
      {
        name: "WhatsApp Business",
        icon: MessageSquare,
        status: "planned",
        body: "WhatsApp as an additional notification channel on the same abstraction.",
      },
      {
        name: "Payment gateway & links",
        icon: CreditCard,
        status: "planned",
        // Cash and UPI collection is recorded against the invoice today; the
        // gateway, cards, net-banking and payment links are the add-on.
        body: "Cards, net-banking, and shareable payment links, with no card data stored. Cash and UPI collection is recorded against the invoice today.",
      },
      {
        name: "Tally & ERP export",
        icon: FileSpreadsheet,
        status: "planned",
        body: "Voucher and ledger-level financial export to Tally and other accounting systems.",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Pricing packaging model (/pricing) — packaging, not prices                  */
/* -------------------------------------------------------------------------- */
export type Package = {
  name: string;
  icon: LucideIcon;
  summary: string;
  points: string[];
  featured?: boolean;
  /** Shown on the emphasised package — a fact about the product, never a popularity claim. */
  badge?: string;
};

export const PACKAGES: Package[] = [
  {
    name: "Single module",
    icon: Layers,
    summary: "Start with one standalone module and its platform core.",
    points: [
      "Any standalone module (patients, pharmacy, lab, or billing)",
      "Full platform core included",
      "One branch, add users as you grow",
    ],
  },
  {
    name: "Clinic bundle",
    icon: HeartPulse,
    summary: "The full outpatient journey for a clinic or nursing home.",
    points: [
      "Patients, appointments, OPD, EMR, pharmacy, lab, billing",
      "Multi-branch ready",
      "Role-based access for the whole team",
    ],
    featured: true,
    // Factual, not social proof: this bundle is exactly the module set we have built.
    badge: "What we have built",
  },
  {
    name: "Enterprise",
    icon: Building2,
    summary: "The full module set for multi-specialty hospital groups.",
    points: [
      "Every clinical and operational module, as each one is released",
      "A dedicated-schema isolation tier for contractual isolation requirements (planned)",
      "Priority onboarding and support",
    ],
  },
];

export type Faq = { q: string; a: string };

export const PRICING_FAQ: Faq[] = [
  {
    q: "Which modules can we actually use today?",
    a: "The clinic core: patient management, appointments, OPD and check-in, the consultation record, pharmacy, laboratory, and billing, on top of the platform core. Everything else in the catalogue is planned scope from our product plan and is marked as planned wherever it appears on this site.",
  },
  {
    q: "How is the platform priced?",
    a: "Pricing is tailored to the modules a hospital enables and its size. Because you pay only for the modules you turn on, a single-doctor clinic and a hospital group pay very differently. Talk to us for a quote.",
  },
  {
    q: "Can we start with one module and add more later?",
    a: "Yes. Modules are entitlements, so a hospital can start with one and enable others the day it is ready. Nothing is re-implemented; the module simply turns on.",
  },
  {
    q: "Is there a self-serve signup?",
    a: "Not yet. Onboarding is guided by our team so each hospital's branches, users, and modules are set up correctly from day one. Book a demo to begin.",
  },
  {
    q: "Where will our data be stored?",
    a: "In India. The platform is built to run on India-headquartered infrastructure with health data kept in-region, and object storage pinned to India. See the Security page for what that covers and what it does not.",
  },
];
