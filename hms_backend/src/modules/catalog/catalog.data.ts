// System master-data catalogue as code (ADR-072), seeded into the global `reference_catalog`
// table in every environment (like the specialty catalogue, ADR-008). Adding or updating an item
// is a data change here — no schema migration, and the frontend never changes.
//
// India-context: the lab panels, generic drugs, and immunisation schedule below follow common
// Indian OPD practice and the National / IAP immunisation schedule. `attributes` carries pre-fill
// hints only (never a price — a hospital always sets its own), consumed by the add-forms.
//
// `code` is the stable identity within a category. Keep it stable once shipped: tenant rows and
// records reference it. `sortOrder` (optional) controls display order; ties fall back to name.

export type CatalogAttributes = Record<string, string | number | boolean | null>;

export interface CatalogEntry {
  category: 'lab_test' | 'drug' | 'service' | 'vaccine' | 'department';
  code: string;
  name: string;
  attributes?: CatalogAttributes;
  sortOrder?: number;
}

// ── Lab tests ──────────────────────────────────────────────────────────────────────────────────
// attributes: sampleType, unit, refLow, refHigh (strings — a range may be qualitative), loinc.
const LAB_TESTS: CatalogEntry[] = [
  {
    category: 'lab_test',
    code: 'CBC',
    name: 'Complete Blood Count (CBC)',
    attributes: { sampleType: 'blood', loinc: '58410-2' },
  },
  {
    category: 'lab_test',
    code: 'HB',
    name: 'Haemoglobin',
    attributes: { sampleType: 'blood', unit: 'g/dL', refLow: '12', refHigh: '17', loinc: '718-7' },
  },
  {
    category: 'lab_test',
    code: 'GLU_F',
    name: 'Blood Glucose (Fasting)',
    attributes: {
      sampleType: 'blood',
      unit: 'mg/dL',
      refLow: '70',
      refHigh: '100',
      loinc: '1558-6',
    },
  },
  {
    category: 'lab_test',
    code: 'GLU_PP',
    name: 'Blood Glucose (Post-Prandial)',
    attributes: { sampleType: 'blood', unit: 'mg/dL', refLow: '0', refHigh: '140' },
  },
  {
    category: 'lab_test',
    code: 'HBA1C',
    name: 'Glycated Haemoglobin (HbA1c)',
    attributes: { sampleType: 'blood', unit: '%', refLow: '4', refHigh: '5.7', loinc: '4548-4' },
  },
  {
    category: 'lab_test',
    code: 'LIPID',
    name: 'Lipid Profile',
    attributes: { sampleType: 'blood' },
  },
  {
    category: 'lab_test',
    code: 'LFT',
    name: 'Liver Function Test (LFT)',
    attributes: { sampleType: 'blood' },
  },
  {
    category: 'lab_test',
    code: 'KFT',
    name: 'Kidney Function Test (KFT)',
    attributes: { sampleType: 'blood' },
  },
  {
    category: 'lab_test',
    code: 'CREAT',
    name: 'Serum Creatinine',
    attributes: {
      sampleType: 'blood',
      unit: 'mg/dL',
      refLow: '0.6',
      refHigh: '1.3',
      loinc: '2160-0',
    },
  },
  {
    category: 'lab_test',
    code: 'UREA',
    name: 'Blood Urea',
    attributes: { sampleType: 'blood', unit: 'mg/dL', refLow: '15', refHigh: '40' },
  },
  {
    category: 'lab_test',
    code: 'TSH',
    name: 'Thyroid Stimulating Hormone (TSH)',
    attributes: {
      sampleType: 'blood',
      unit: 'µIU/mL',
      refLow: '0.4',
      refHigh: '4.0',
      loinc: '3016-3',
    },
  },
  {
    category: 'lab_test',
    code: 'THYROID',
    name: 'Thyroid Profile (T3, T4, TSH)',
    attributes: { sampleType: 'blood' },
  },
  {
    category: 'lab_test',
    code: 'URINE_RM',
    name: 'Urine Routine & Microscopy',
    attributes: { sampleType: 'urine' },
  },
  {
    category: 'lab_test',
    code: 'ELECTRO',
    name: 'Serum Electrolytes (Na, K, Cl)',
    attributes: { sampleType: 'blood' },
  },
  {
    category: 'lab_test',
    code: 'CRP',
    name: 'C-Reactive Protein (CRP)',
    attributes: { sampleType: 'blood', unit: 'mg/L', refLow: '0', refHigh: '5' },
  },
  {
    category: 'lab_test',
    code: 'ESR',
    name: 'Erythrocyte Sedimentation Rate (ESR)',
    attributes: { sampleType: 'blood', unit: 'mm/hr', refLow: '0', refHigh: '20' },
  },
  {
    category: 'lab_test',
    code: 'URIC',
    name: 'Serum Uric Acid',
    attributes: { sampleType: 'blood', unit: 'mg/dL', refLow: '3.5', refHigh: '7.2' },
  },
  {
    category: 'lab_test',
    code: 'VITD',
    name: 'Vitamin D (25-OH)',
    attributes: { sampleType: 'blood', unit: 'ng/mL', refLow: '30', refHigh: '100' },
  },
  {
    category: 'lab_test',
    code: 'VITB12',
    name: 'Vitamin B12',
    attributes: { sampleType: 'blood', unit: 'pg/mL', refLow: '200', refHigh: '900' },
  },
  {
    category: 'lab_test',
    code: 'DENGUE_NS1',
    name: 'Dengue NS1 Antigen',
    attributes: { sampleType: 'serum', refLow: 'Negative', refHigh: 'Negative' },
  },
  {
    category: 'lab_test',
    code: 'DENGUE_SERO',
    name: 'Dengue IgG / IgM',
    attributes: { sampleType: 'serum', refLow: 'Negative', refHigh: 'Negative' },
  },
  {
    category: 'lab_test',
    code: 'MALARIA',
    name: 'Malaria Parasite (MP)',
    attributes: { sampleType: 'blood', refLow: 'Not detected', refHigh: 'Not detected' },
  },
  {
    category: 'lab_test',
    code: 'WIDAL',
    name: 'Widal Test (Typhoid)',
    attributes: { sampleType: 'serum' },
  },
  {
    category: 'lab_test',
    code: 'HBSAG',
    name: 'HBsAg (Hepatitis B Surface Antigen)',
    attributes: { sampleType: 'serum', refLow: 'Non-reactive', refHigh: 'Non-reactive' },
  },
  {
    category: 'lab_test',
    code: 'STOOL_RM',
    name: 'Stool Routine & Microscopy',
    attributes: { sampleType: 'stool' },
  },
];

// ── Drugs ──────────────────────────────────────────────────────────────────────────────────────
// attributes: form, strength, unit. Generic/molecule names; brand, price and stock stay per-hospital.
const DRUGS: CatalogEntry[] = [
  {
    category: 'drug',
    code: 'PARA500',
    name: 'Paracetamol 500 mg',
    attributes: { form: 'tablet', strength: '500 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'PARA650',
    name: 'Paracetamol 650 mg',
    attributes: { form: 'tablet', strength: '650 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'AMOX500',
    name: 'Amoxicillin 500 mg',
    attributes: { form: 'capsule', strength: '500 mg', unit: 'capsule' },
  },
  {
    category: 'drug',
    code: 'AMOXCLAV625',
    name: 'Amoxicillin + Clavulanic Acid 625 mg',
    attributes: { form: 'tablet', strength: '625 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'AZITH500',
    name: 'Azithromycin 500 mg',
    attributes: { form: 'tablet', strength: '500 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'CEFIX200',
    name: 'Cefixime 200 mg',
    attributes: { form: 'tablet', strength: '200 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'CIPRO500',
    name: 'Ciprofloxacin 500 mg',
    attributes: { form: 'tablet', strength: '500 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'METRO400',
    name: 'Metronidazole 400 mg',
    attributes: { form: 'tablet', strength: '400 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'PANTO40',
    name: 'Pantoprazole 40 mg',
    attributes: { form: 'tablet', strength: '40 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'OMEP20',
    name: 'Omeprazole 20 mg',
    attributes: { form: 'capsule', strength: '20 mg', unit: 'capsule' },
  },
  {
    category: 'drug',
    code: 'ONDA4',
    name: 'Ondansetron 4 mg',
    attributes: { form: 'tablet', strength: '4 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'DOMP10',
    name: 'Domperidone 10 mg',
    attributes: { form: 'tablet', strength: '10 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'DICLO50',
    name: 'Diclofenac 50 mg',
    attributes: { form: 'tablet', strength: '50 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'IBU400',
    name: 'Ibuprofen 400 mg',
    attributes: { form: 'tablet', strength: '400 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'CETI10',
    name: 'Cetirizine 10 mg',
    attributes: { form: 'tablet', strength: '10 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'LEVO5',
    name: 'Levocetirizine 5 mg',
    attributes: { form: 'tablet', strength: '5 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'MONT10',
    name: 'Montelukast 10 mg',
    attributes: { form: 'tablet', strength: '10 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'AMLO5',
    name: 'Amlodipine 5 mg',
    attributes: { form: 'tablet', strength: '5 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'TELMI40',
    name: 'Telmisartan 40 mg',
    attributes: { form: 'tablet', strength: '40 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'METF500',
    name: 'Metformin 500 mg',
    attributes: { form: 'tablet', strength: '500 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'ATOR10',
    name: 'Atorvastatin 10 mg',
    attributes: { form: 'tablet', strength: '10 mg', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'CEFTRI1G',
    name: 'Ceftriaxone 1 g Injection',
    attributes: { form: 'injection', strength: '1 g', unit: 'vial' },
  },
  {
    category: 'drug',
    code: 'ORS',
    name: 'ORS (Oral Rehydration Salts)',
    attributes: { form: 'sachet', unit: 'sachet' },
  },
  {
    category: 'drug',
    code: 'IRONFOL',
    name: 'Iron + Folic Acid',
    attributes: { form: 'tablet', unit: 'tablet' },
  },
  {
    category: 'drug',
    code: 'CALD3',
    name: 'Calcium + Vitamin D3',
    attributes: { form: 'tablet', unit: 'tablet' },
  },
];

// ── Services / procedures ───────────────────────────────────────────────────────────────────────
// Names only. Price, tax and HSN/SAC are the hospital's own and are never seeded.
const SERVICES: CatalogEntry[] = [
  { category: 'service', code: 'CONSULT_GEN', name: 'General Consultation' },
  { category: 'service', code: 'CONSULT_FU', name: 'Follow-up Consultation' },
  { category: 'service', code: 'CONSULT_SPEC', name: 'Specialist Consultation' },
  { category: 'service', code: 'INJ_ADMIN', name: 'Injection Administration' },
  { category: 'service', code: 'DRESS_S', name: 'Dressing (Small)' },
  { category: 'service', code: 'DRESS_L', name: 'Dressing (Large)' },
  { category: 'service', code: 'SUTURE', name: 'Suturing / Wound Closure' },
  { category: 'service', code: 'SUTURE_REMOVE', name: 'Suture Removal' },
  { category: 'service', code: 'NEBUL', name: 'Nebulisation' },
  { category: 'service', code: 'ECG', name: 'ECG' },
  { category: 'service', code: 'IV_CANN', name: 'IV Cannulation' },
  { category: 'service', code: 'CATH', name: 'Urinary Catheterisation' },
  { category: 'service', code: 'POP', name: 'Plaster (POP) Application' },
  { category: 'service', code: 'EAR_SYRINGE', name: 'Ear Syringing' },
  { category: 'service', code: 'VACC_ADMIN', name: 'Vaccination Administration' },
];

// ── Vaccines ────────────────────────────────────────────────────────────────────────────────────
// India National / IAP immunisation schedule. attributes: schedule (when it is given).
const VACCINES: CatalogEntry[] = [
  { category: 'vaccine', code: 'BCG', name: 'BCG', attributes: { schedule: 'At birth' } },
  {
    category: 'vaccine',
    code: 'HEPB',
    name: 'Hepatitis B',
    attributes: { schedule: 'Birth, 6, 10, 14 weeks' },
  },
  {
    category: 'vaccine',
    code: 'OPV',
    name: 'Oral Polio Vaccine (OPV)',
    attributes: { schedule: 'Birth, 6, 10, 14 weeks; boosters' },
  },
  {
    category: 'vaccine',
    code: 'IPV',
    name: 'Inactivated Polio Vaccine (IPV)',
    attributes: { schedule: '6 and 14 weeks' },
  },
  {
    category: 'vaccine',
    code: 'PENTA',
    name: 'Pentavalent (DPT + HepB + Hib)',
    attributes: { schedule: '6, 10, 14 weeks' },
  },
  {
    category: 'vaccine',
    code: 'ROTA',
    name: 'Rotavirus',
    attributes: { schedule: '6, 10, 14 weeks' },
  },
  {
    category: 'vaccine',
    code: 'PCV',
    name: 'Pneumococcal Conjugate (PCV)',
    attributes: { schedule: '6, 14 weeks; booster at 9 months' },
  },
  {
    category: 'vaccine',
    code: 'MR',
    name: 'Measles-Rubella (MR)',
    attributes: { schedule: '9-12 and 16-24 months' },
  },
  {
    category: 'vaccine',
    code: 'MMR',
    name: 'Measles-Mumps-Rubella (MMR)',
    attributes: { schedule: '12-15 months; 4-6 years' },
  },
  {
    category: 'vaccine',
    code: 'JE',
    name: 'Japanese Encephalitis (JE)',
    attributes: { schedule: '9-12 and 16-24 months (endemic areas)' },
  },
  {
    category: 'vaccine',
    code: 'DPT_B',
    name: 'DPT Booster',
    attributes: { schedule: '16-24 months; 5-6 years' },
  },
  {
    category: 'vaccine',
    code: 'TD',
    name: 'Td (Tetanus-Diphtheria)',
    attributes: { schedule: '10 and 16 years; pregnancy' },
  },
  {
    category: 'vaccine',
    code: 'TYPHOID',
    name: 'Typhoid',
    attributes: { schedule: '9-12 months; booster every 3 years' },
  },
  {
    category: 'vaccine',
    code: 'HEPA',
    name: 'Hepatitis A',
    attributes: { schedule: '12 months onward' },
  },
  {
    category: 'vaccine',
    code: 'VARICELLA',
    name: 'Varicella (Chickenpox)',
    attributes: { schedule: '15 months; 4-6 years' },
  },
  { category: 'vaccine', code: 'INFLUENZA', name: 'Influenza', attributes: { schedule: 'Annual' } },
  {
    category: 'vaccine',
    code: 'HPV',
    name: 'HPV (Human Papillomavirus)',
    attributes: { schedule: '9-14 years (girls)' },
  },
];

// ── Departments (suggested) ─────────────────────────────────────────────────────────────────────
// attributes: specialtyCode (matches the global specialty catalogue). The hospital's own code,
// head and branch stay custom; this only pre-fills the "New department" form.
const DEPARTMENTS: CatalogEntry[] = [
  {
    category: 'department',
    code: 'GENMED',
    name: 'General Medicine',
    attributes: { specialtyCode: 'general_medicine' },
  },
  {
    category: 'department',
    code: 'GENSURG',
    name: 'General Surgery',
    attributes: { specialtyCode: 'general_surgery' },
  },
  {
    category: 'department',
    code: 'CARDIO',
    name: 'Cardiology',
    attributes: { specialtyCode: 'cardiology' },
  },
  {
    category: 'department',
    code: 'ORTHO',
    name: 'Orthopaedics',
    attributes: { specialtyCode: 'orthopedics' },
  },
  {
    category: 'department',
    code: 'PAEDS',
    name: 'Paediatrics',
    attributes: { specialtyCode: 'pediatrics' },
  },
  {
    category: 'department',
    code: 'OBG',
    name: 'Obstetrics & Gynaecology',
    attributes: { specialtyCode: 'gynecology' },
  },
  {
    category: 'department',
    code: 'DERMA',
    name: 'Dermatology',
    attributes: { specialtyCode: 'dermatology' },
  },
  {
    category: 'department',
    code: 'OPHTHAL',
    name: 'Ophthalmology',
    attributes: { specialtyCode: 'ophthalmology' },
  },
  { category: 'department', code: 'ENT', name: 'ENT', attributes: { specialtyCode: 'ent' } },
  {
    category: 'department',
    code: 'DENTAL',
    name: 'Dentistry',
    attributes: { specialtyCode: 'dental' },
  },
  {
    category: 'department',
    code: 'PSYCH',
    name: 'Psychiatry',
    attributes: { specialtyCode: 'psychiatry' },
  },
  {
    category: 'department',
    code: 'NEURO',
    name: 'Neurology',
    attributes: { specialtyCode: 'neurology' },
  },
  {
    category: 'department',
    code: 'RADIOLOGY',
    name: 'Radiology',
    attributes: { specialtyCode: 'radiology' },
  },
  {
    category: 'department',
    code: 'EMERGENCY',
    name: 'Emergency',
    attributes: { specialtyCode: 'emergency_medicine' },
  },
];

/** The full system catalogue, in one array, with a stable per-category display order applied. */
export const REFERENCE_CATALOG: readonly CatalogEntry[] = [
  ...LAB_TESTS,
  ...DRUGS,
  ...SERVICES,
  ...VACCINES,
  ...DEPARTMENTS,
].map((entry, index) => ({ ...entry, sortOrder: entry.sortOrder ?? index }));

/** Categories that accept hospital-specific custom items stored in `tenant_reference_items`. */
export const CUSTOM_CAPABLE_CATEGORIES = ['vaccine'] as const;
