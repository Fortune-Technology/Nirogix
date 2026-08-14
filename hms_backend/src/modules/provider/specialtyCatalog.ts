// Specialty catalog as data (ADR-008). Seeded into the global `specialties` table. Adding a
// specialty is a data change here (no schema migration). `snomedCode` is intentionally left unset
// — SNOMED CT codes must be sourced from the authoritative value set before clinical/interop use
// (resources/rules.md → Regulatory Claim Discipline), not guessed here.
export type SpecialtyDef = { code: string; name: string; snomedCode?: string };

export const SPECIALTY_CATALOG: readonly SpecialtyDef[] = [
  { code: 'general_medicine', name: 'General Medicine' },
  { code: 'general_surgery', name: 'General Surgery' },
  { code: 'cardiology', name: 'Cardiology' },
  { code: 'orthopedics', name: 'Orthopaedics' },
  { code: 'pediatrics', name: 'Paediatrics' },
  { code: 'gynecology', name: 'Obstetrics & Gynaecology' },
  { code: 'dermatology', name: 'Dermatology' },
  { code: 'ophthalmology', name: 'Ophthalmology' },
  { code: 'ent', name: 'ENT (Otolaryngology)' },
  { code: 'dental', name: 'Dentistry' },
  { code: 'psychiatry', name: 'Psychiatry' },
  { code: 'neurology', name: 'Neurology' },
  { code: 'nephrology', name: 'Nephrology' },
  { code: 'oncology', name: 'Oncology' },
  { code: 'radiology', name: 'Radiology' },
  { code: 'anesthesiology', name: 'Anaesthesiology' },
  { code: 'emergency_medicine', name: 'Emergency Medicine' },
];

export const SPECIALTY_CODES: ReadonlySet<string> = new Set(SPECIALTY_CATALOG.map((s) => s.code));
