// Extended marketing content: the full module catalogue (grouped), platform
// pillars, integrations, and the pricing packaging model. Grounded in
// resources/projectrequirementdoc.md. Home-level data lives in ./site.

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
  { slug: "nursing", name: "Nursing", icon: HeartPulse, tagline: "Assigned-patient dashboards, vitals and MAR charting, and shift handover.", points: [] },
  { slug: "radiology", name: "Radiology & PACS", icon: Scan, tagline: "Imaging orders, radiologist sign-off, and a DICOM viewer with modality worklist.", points: [] },
  { slug: "ipd", name: "Admission (IPD)", icon: BedDouble, tagline: "Admission workflow, a visual bed board, ward and ICU management, and discharge.", points: [] },
  { slug: "emergency", name: "Emergency (ER)", icon: Ambulance, tagline: "Rapid registration, triage, ambulance integration, and ER-to-IPD conversion.", points: [] },
  { slug: "ot", name: "Operation Theatre", icon: Syringe, tagline: "Surgery scheduling, pre-op checklists, digital consent, and implant billing.", points: [] },
  { slug: "cssd", name: "CSSD", icon: ShieldPlus, tagline: "Instrument and tray lifecycle with barcode tracking and sterilization cycles.", points: [] },
  { slug: "blood-bank", name: "Blood Bank", icon: Droplet, tagline: "Donor screening, unit inventory by component, and cross-match traceability.", points: [] },
  { slug: "specialty", name: "Specialty Clinical", icon: Activity, tagline: "Dialysis, oncology, maternity, dental, and more on the EMR backbone.", points: [] },
];

export const OPERATIONAL_MODULES: ModuleEntry[] = [
  { slug: "inventory", name: "Inventory & Procurement", icon: Boxes, tagline: "Indent to PO to GRN to issue, with vendor contracts and inter-branch transfers.", points: [] },
  { slug: "insurance", name: "Insurance & Schemes", icon: Landmark, tagline: "Pre-auth, cashless claims, and government schemes like PM-JAY.", points: [] },
  { slug: "financial", name: "Financial Management", icon: Wallet, tagline: "Revenue and expense, P&L dashboards, GST and TDS reports, and Tally export.", points: [] },
  { slug: "dietary", name: "Dietary & Kitchen", icon: Utensils, tagline: "Diet plans mapped to orders, ward meal scheduling, and kitchen indents.", points: [] },
  { slug: "housekeeping", name: "Housekeeping & Laundry", icon: SprayCan, tagline: "Cleaning rotas, terminal-cleaning gates, and linen cycle tracking.", points: [] },
  { slug: "ambulance", name: "Ambulance & Fleet", icon: Truck, tagline: "Fleet and crew management, GPS dispatch, and trip billing.", points: [] },
  { slug: "biomedical", name: "Biomedical Assets", icon: Wrench, tagline: "Asset register, AMC and calibration schedules, and breakdown logs.", points: [] },
  { slug: "bmw", name: "Biomedical Waste", icon: Trash2, tagline: "Colour-coded segregation, barcoded chain-of-custody, and CBWTF manifests.", points: [] },
  { slug: "hr-payroll", name: "HR & Payroll", icon: UserCog, tagline: "Rosters, attendance, payroll with statutory deductions, and doctor payouts.", points: [] },
  { slug: "crm", name: "CRM & Engagement", icon: HeartHandshake, tagline: "Lead and enquiry management, recall campaigns, and feedback.", points: [] },
];

export const CATALOGUE_ADDONS: ModuleEntry[] = [
  { slug: "telemedicine", name: "Telemedicine", icon: Video, tagline: "Video consults with in-call e-prescription, a virtual queue, and pre-consult payment.", points: [] },
  { slug: "abdm", name: "ABDM & Health Records", icon: Network, tagline: "ABHA linking and consent-based record exchange with FHIR R4 bundles.", points: [] },
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
    blurb: "The outpatient journey, from the front desk to the pharmacy counter. Available now.",
    modules: CLINIC_MODULES,
  },
  {
    id: "hospital-grade",
    title: "Hospital-grade",
    blurb: "In-patient, surgical, and diagnostic depth for multi-specialty hospitals.",
    modules: HOSPITAL_MODULES,
  },
  {
    id: "operational",
    title: "Operations & back office",
    blurb: "The supporting modules that keep a hospital running and its finances clean.",
    modules: OPERATIONAL_MODULES,
  },
];

/* -------------------------------------------------------------------------- */
/* Integrations (/integrations)                                                */
/* -------------------------------------------------------------------------- */
export type Integration = { name: string; icon: LucideIcon; body: string };
export type IntegrationGroup = { title: string; items: Integration[] };

export const INTEGRATION_GROUPS: IntegrationGroup[] = [
  {
    title: "Health standards",
    items: [
      { name: "HL7 FHIR R4", icon: Braces, body: "FHIR R4 APIs and bundles for interoperable clinical records." },
      { name: "ICD-10 / ICD-11", icon: FileHeart, body: "Standard diagnosis coding across the clinical workflow." },
      { name: "SNOMED CT & LOINC", icon: Activity, body: "Clinical terminology and lab codes where licensed." },
      { name: "DICOM & PACS", icon: ScanIcon, body: "Imaging exchange and a DICOM viewer for radiology." },
    ],
  },
  {
    title: "India digital health",
    items: [
      { name: "ABDM & ABHA", icon: Network, body: "ABHA creation and linking, and consent-based record sharing." },
      { name: "Scan-and-share OPD", icon: ScanIcon, body: "Fast OPD registration through the ABDM scan-and-share flow." },
    ],
  },
  {
    title: "Communications & payments",
    items: [
      { name: "SMS & WhatsApp", icon: MessageSquare, body: "DLT-compliant messaging behind one provider abstraction." },
      { name: "Payments & UPI", icon: CreditCard, body: "Cards, UPI, net-banking, and payment links, with no card data stored." },
      { name: "Tally & ERP export", icon: FileSpreadsheet, body: "Financial exports to Tally and other accounting systems." },
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
  },
  {
    name: "Enterprise",
    icon: Building2,
    summary: "The full module set for multi-specialty hospital groups.",
    points: [
      "Every clinical and operational module",
      "Premium data-isolation tier available",
      "Priority onboarding and support",
    ],
  },
];

export type Faq = { q: string; a: string };

export const PRICING_FAQ: Faq[] = [
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
    q: "Where is our data stored?",
    a: "In India. The platform runs on India-headquartered infrastructure, and health data is kept in-region. See the Security page for details.",
  },
];
