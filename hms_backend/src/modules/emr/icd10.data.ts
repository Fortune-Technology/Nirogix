// Curated ICD-10 lookup for the MVP diagnosis picker. A small, common-in-OPD subset kept
// in-memory (the full ICD-10 is ~70k codes); when the product needs the complete set this
// becomes a reference table behind the same `/icd10` search contract. Not clinical advice —
// a coding aid for the doctor.
export interface Icd10Code {
  code: string;
  term: string;
}

export const ICD10_CODES: readonly Icd10Code[] = [
  { code: 'J00', term: 'Acute nasopharyngitis (common cold)' },
  { code: 'J02.9', term: 'Acute pharyngitis, unspecified' },
  { code: 'J03.90', term: 'Acute tonsillitis, unspecified' },
  { code: 'J06.9', term: 'Acute upper respiratory infection, unspecified' },
  { code: 'J11.1', term: 'Influenza with respiratory manifestations' },
  { code: 'J18.9', term: 'Pneumonia, unspecified organism' },
  { code: 'J20.9', term: 'Acute bronchitis, unspecified' },
  { code: 'J45.909', term: 'Unspecified asthma, uncomplicated' },
  { code: 'A09', term: 'Infectious gastroenteritis and colitis, unspecified' },
  { code: 'A90', term: 'Dengue fever (classical)' },
  { code: 'B54', term: 'Unspecified malaria' },
  { code: 'A01.00', term: 'Typhoid fever, unspecified' },
  { code: 'R50.9', term: 'Fever, unspecified' },
  { code: 'R51.9', term: 'Headache, unspecified' },
  { code: 'R05.9', term: 'Cough, unspecified' },
  { code: 'R07.9', term: 'Chest pain, unspecified' },
  { code: 'R10.9', term: 'Unspecified abdominal pain' },
  { code: 'R11.2', term: 'Nausea with vomiting, unspecified' },
  { code: 'R42', term: 'Dizziness and giddiness' },
  { code: 'I10', term: 'Essential (primary) hypertension' },
  { code: 'E11.9', term: 'Type 2 diabetes mellitus without complications' },
  { code: 'E78.5', term: 'Hyperlipidaemia, unspecified' },
  { code: 'E03.9', term: 'Hypothyroidism, unspecified' },
  { code: 'D50.9', term: 'Iron deficiency anaemia, unspecified' },
  { code: 'K21.9', term: 'Gastro-oesophageal reflux disease without oesophagitis' },
  { code: 'K29.70', term: 'Gastritis, unspecified, without bleeding' },
  { code: 'K30', term: 'Functional dyspepsia' },
  { code: 'N39.0', term: 'Urinary tract infection, site not specified' },
  { code: 'L30.9', term: 'Dermatitis, unspecified' },
  { code: 'L23.9', term: 'Allergic contact dermatitis, unspecified cause' },
  { code: 'H10.9', term: 'Unspecified conjunctivitis' },
  { code: 'H66.90', term: 'Otitis media, unspecified' },
  { code: 'M54.5', term: 'Low back pain' },
  { code: 'M25.50', term: 'Pain in unspecified joint' },
  { code: 'M79.1', term: 'Myalgia' },
  { code: 'G43.909', term: 'Migraine, unspecified, not intractable' },
  { code: 'F41.9', term: 'Anxiety disorder, unspecified' },
  { code: 'F32.9', term: 'Major depressive disorder, single episode, unspecified' },
  { code: 'Z00.00', term: 'General adult medical examination without abnormal findings' },
  { code: 'Z23', term: 'Encounter for immunization' },
];

export function searchIcd10(query: string, limit = 12): Icd10Code[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ICD10_CODES.filter(
    (c) => c.code.toLowerCase().includes(q) || c.term.toLowerCase().includes(q),
  ).slice(0, limit);
}
