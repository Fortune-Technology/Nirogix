// Healthcare specializations the platform is configured for (ADR-034).
//
// One reusable specialization system → many specialty configurations. Each entry
// drives the /specialties grid, and the `featured` ones additionally get a
// /specialties/[slug] page with real, differentiated content.
//
// CONTENT RULE: every claim here must map to a capability that actually exists
// today (see ./availability and the module catalogue). We describe how
// configurable modules serve a specialty's workflow — never "we have a cardiology
// module". Anything the platform does not do yet is written as planned, in so many
// words (rules.md → Marketing Content & Claim Accuracy). Thin pages that only swap
// the specialty name are worse than no page at all (rules.md → SEO / AEO / GEO).

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Baby,
  Bone,
  Brain,
  Ear,
  Eye,
  FlaskConical,
  HeartPulse,
  Microscope,
  Ribbon,
  Scan,
  Scissors,
  Smile,
  Sparkles,
  Stethoscope,
  Syringe,
  Users,
  Wind,
  Droplets,
  Dumbbell,
  ClipboardPlus,
} from "lucide-react";

export interface Specialty {
  slug: string;
  name: string;
  icon: LucideIcon;
  /** One line for the grid card. */
  summary: string;
  /** Featured specialties get their own page; the rest appear on the index. */
  featured?: boolean;
  /** What makes this specialty's day operationally hard. */
  challenges?: string[];
  /** How the platform's configurable modules answer those challenges. */
  support?: string[];
  /** Module names, matching the catalogue on /modules. */
  modules?: string[];
  /** Specialty-specific configuration a hospital would set up. */
  configuration?: string[];
}

export const SPECIALTIES: Specialty[] = [
  {
    slug: "cardiology",
    name: "Cardiology",
    icon: HeartPulse,
    featured: true,
    summary: "Follow-up-heavy outpatient care with recurring diagnostics and long patient histories.",
    challenges: [
      "Patients return for years, so the record has to stay readable across dozens of visits.",
      "Every consultation pulls in diagnostics such as ECG, echo and lipid panels, and they arrive at different times.",
      "Procedure and package billing sits alongside ordinary consultation fees.",
    ],
    support: [
      "One patient record with a full visit timeline, so a returning patient's history opens in a single view rather than being reassembled from paper.",
      "Lab orders raised inside the consultation come back to the same encounter, and the charge lands on the patient's existing invoice.",
      "The test catalogue carries each investigation's reference range, so an out-of-range result is flagged when it is entered.",
      "Follow-up appointments are booked against the cardiologist's own slots. Specialty consultation templates and automated reminders are planned.",
    ],
    modules: ["Patient Management", "Appointment Management", "OPD & Check-in", "Clinical Workflow (EMR)", "Laboratory", "Billing & Payments"],
    configuration: [
      "Diagnostic test catalogue with reference ranges",
      "Provider slots for follow-up-heavy schedules",
      "Consultation fee and investigation pricing",
    ],
  },
  {
    slug: "dentistry",
    name: "Dentistry",
    icon: Smile,
    featured: true,
    summary: "Chair-based scheduling, multi-visit treatment plans, and per-procedure billing.",
    challenges: [
      "Treatment runs across several appointments, so the plan matters as much as the visit.",
      "Scheduling is chair- and dentist-bound, and a no-show costs a whole slot.",
      "Billing is per procedure, often part-paid across visits.",
    ],
    support: [
      "Provider-wise slot management maps to chairs and dentists, and a cancellation frees the slot immediately.",
      "The consultation record carries findings, procedures performed, and the prescription, visit after visit, under one patient.",
      "Part payments and running balances are native to the billing engine, so a multi-visit treatment plan bills honestly across visits.",
      "Waitlists, no-show tracking, and automated reminders are planned, not built.",
    ],
    modules: ["Patient Management", "Appointment Management", "OPD & Check-in", "Clinical Workflow (EMR)", "Billing & Payments"],
    configuration: ["Chair/operatory-wise provider slots", "Procedure pricing on the invoice", "Multi-visit treatment notes"],
  },
  {
    slug: "pediatrics",
    name: "Pediatrics",
    icon: Baby,
    featured: true,
    summary: "Growth tracking, immunisation schedules, and a parent as the point of contact.",
    challenges: [
      "The patient is a child; the contact, consent, and payer is a parent or guardian.",
      "Immunisation and growth follow a schedule, not an episode.",
      "Weight-based dosing has to be right every time.",
    ],
    support: [
      "The guardian's phone and contact details sit on the child's record, so the front desk always reaches the right adult.",
      "Vitals captured at every visit (weight, height, temperature) build the growth record inside the same encounter history.",
      "Prescriptions record dose, frequency, duration and route explicitly, so weight-based dosing is written down, not remembered.",
      "Follow-ups are booked from the front desk. Family and dependant linking, and automated recall reminders, are planned.",
    ],
    modules: ["Patient Management", "Appointment Management", "Clinical Workflow (EMR)", "Pharmacy", "Billing & Payments"],
    configuration: ["Guardian contact on the patient record", "Vitals captured per visit", "Immunisation and review visit scheduling"],
  },
  {
    slug: "gynecology",
    name: "Gynecology & Obstetrics",
    icon: ClipboardPlus,
    featured: true,
    summary: "Long-running episodes of care, scheduled scans, and strict confidentiality.",
    challenges: [
      "Antenatal care is a months-long episode with a fixed visit schedule.",
      "Each visit combines examination, scans, and labs from different departments.",
      "Records are unusually sensitive, even by clinical standards.",
    ],
    support: [
      "A continuous patient timeline holds the whole episode: visits, diagnoses, prescriptions and lab results, rather than isolated appointments.",
      "Lab orders raised in the consultation return to the same encounter and bill to the same invoice.",
      "Access is permission-gated per user, and mutating actions are written to an append-only audit trail.",
      "The antenatal visit series is booked appointment by appointment today; imaging orders arrive with the planned Radiology module, and automated reminders are planned too.",
    ],
    modules: ["Patient Management", "Appointment Management", "Clinical Workflow (EMR)", "Laboratory", "Billing & Payments"],
    configuration: ["Visit scheduling across a long episode", "Role-based access to sensitive records", "Investigation catalogue and pricing"],
  },
  {
    slug: "physiotherapy",
    name: "Physiotherapy & Rehabilitation",
    icon: Dumbbell,
    featured: true,
    summary: "Session packages, therapist scheduling, and progress measured over time.",
    challenges: [
      "Care is sold and delivered as a package of sessions, not a single consultation.",
      "Therapists, not just doctors, own the schedule and the notes.",
      "Progress only makes sense when this session is compared with the last.",
    ],
    support: [
      "Providers are modelled as practitioners with their own schedules, so a therapist's day books like a doctor's.",
      "Each session is an encounter on the patient's timeline, so progress notes read in sequence.",
      "Part payments and a running balance are native to the billing engine, so a block of sessions can be paid down over time.",
      "Staff roles and permissions decide who can record a session and who can see it. Package billing that draws down a prepaid block is planned.",
    ],
    modules: ["Patient Management", "Appointment Management", "Clinical Workflow (EMR)", "Billing & Payments"],
    configuration: ["Therapist schedules", "Session pricing on the invoice", "Session notes per encounter"],
  },
  {
    slug: "radiology",
    name: "Radiology & Imaging",
    icon: Scan,
    featured: true,
    summary: "Order to report. The diagnostic worklist runs today for labs; the imaging module is planned.",
    challenges: [
      "An order arrives from another department and has to be tracked to a reported result.",
      "The report, not the appointment, is the deliverable.",
      "Imaging is billed per study, often per modality.",
    ],
    support: [
      "The order-to-result worklist exists today for laboratory: an order raised in a consultation appears with its status, so nothing sits unclaimed.",
      "Results are entered against the order and open as a printable report on the patient's record.",
      "The charge is added to the patient's existing invoice rather than a separate bill.",
      "Imaging itself — modality worklists, radiologist sign-off, and the DICOM viewer — is the planned Radiology & PACS module. It is not built, so an imaging centre cannot run its studies on the platform yet.",
    ],
    modules: ["Patient Management", "Clinical Workflow (EMR)", "Laboratory", "Billing & Payments"],
    configuration: ["Investigation catalogue and reference ranges", "Per-study pricing on the invoice", "Worklist roles and permissions"],
  },
  { slug: "psychiatry", name: "Psychiatry", icon: Brain, summary: "Confidential long-term records, recurring reviews, and controlled prescribing." },
  { slug: "psychology", name: "Psychology & Counselling", icon: Sparkles, summary: "Session-based care with private notes and therapist-owned schedules." },
  { slug: "orthopedics", name: "Orthopedics", icon: Bone, summary: "Imaging-led diagnosis, procedures, and structured follow-up." },
  { slug: "dermatology", name: "Dermatology", icon: Activity, summary: "High outpatient volume, repeat visits, and procedure billing." },
  { slug: "neurology", name: "Neurology", icon: Brain, summary: "Complex histories, diagnostics, and long-running review cycles." },
  { slug: "general-medicine", name: "General Medicine", icon: Stethoscope, summary: "The everyday OPD backbone: queue, consult, prescribe, bill." },
  { slug: "general-surgery", name: "General Surgery", icon: Scissors, summary: "Pre-op workup, procedure records, and post-op follow-up." },
  { slug: "ophthalmology", name: "Ophthalmology", icon: Eye, summary: "Investigation-heavy consults with optical and procedure billing." },
  { slug: "ent", name: "ENT", icon: Ear, summary: "Procedure-led outpatient care with day-case workflows." },
  { slug: "urology", name: "Urology", icon: Droplets, summary: "Diagnostics, procedures, and structured follow-up scheduling." },
  { slug: "gastroenterology", name: "Gastroenterology", icon: Microscope, summary: "Endoscopy scheduling, reports, and per-procedure billing." },
  { slug: "pulmonology", name: "Pulmonology", icon: Wind, summary: "Diagnostic-led review cycles and long-term patient tracking." },
  { slug: "oncology", name: "Oncology", icon: Ribbon, summary: "Protocol-driven cycles with heavy diagnostics and pharmacy involvement." },
  { slug: "nephrology", name: "Nephrology", icon: FlaskConical, summary: "Recurring treatment schedules with continuous lab monitoring." },
  { slug: "endocrinology", name: "Endocrinology", icon: Syringe, summary: "Chronic-condition follow-up driven by regular lab results." },
  { slug: "multi-specialty", name: "Multi-specialty hospitals", icon: Users, summary: "Several departments on one platform, each configured its own way." },
];

export const FEATURED_SPECIALTIES = SPECIALTIES.filter((s) => s.featured);

export function specialtyBySlug(slug: string): Specialty | undefined {
  return SPECIALTIES.find((s) => s.slug === slug);
}

/** Shared framing for the index and every specialty page — one honest promise, stated once. */
export const SPECIALTY_PROMISE = {
  eyebrow: "By specialty",
  title: "One platform, configured for how your specialty actually works",
  lede:
    "Nirogix is not a different product per specialty. It is one multi-tenant platform whose modules, consultation templates, catalogues, schedules and price lists are configured per hospital, so a dental clinic, a cardiology practice and a multi-specialty hospital each run the workflow they need on the same core.",
  disclaimer:
    "Specialties differ in configuration, not in code: the same modules are enabled and set up differently. Where a specialty needs a capability the platform does not have yet, we say so during the demo rather than after you buy.",
} as const;
