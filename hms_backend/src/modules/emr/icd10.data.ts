// Curated ICD-10 lookup for the MVP diagnosis picker. A small, common-in-OPD subset kept
// in-memory (the full ICD-10 is ~70k codes); when the product needs the complete set this
// becomes a reference table behind the same `/icd10` search contract. Not clinical advice —
// a coding aid for the doctor. Grouped by ICD chapter, and within a group the most frequently
// coded terms come first, because search returns matches in array order.
export interface Icd10Code {
  code: string;
  term: string;
}

export const ICD10_CODES: readonly Icd10Code[] = [
  // Respiratory (J) — with pulmonary tuberculosis, which ICD codes in the infectious chapter
  { code: 'J00', term: 'Acute nasopharyngitis (common cold)' },
  { code: 'J02.9', term: 'Acute pharyngitis, unspecified' },
  { code: 'J03.90', term: 'Acute tonsillitis, unspecified' },
  { code: 'J06.9', term: 'Acute upper respiratory infection (URI), unspecified' },
  { code: 'J11.1', term: 'Influenza with respiratory manifestations' },
  { code: 'J18.9', term: 'Pneumonia, unspecified organism' },
  { code: 'J20.9', term: 'Acute bronchitis, unspecified' },
  { code: 'J45.909', term: 'Unspecified asthma, uncomplicated' },
  { code: 'J01.90', term: 'Acute sinusitis, unspecified' },
  { code: 'J04.0', term: 'Acute laryngitis' },
  { code: 'J21.9', term: 'Acute bronchiolitis, unspecified' },
  { code: 'J30.9', term: 'Allergic rhinitis, unspecified' },
  { code: 'J31.0', term: 'Chronic rhinitis' },
  { code: 'J40', term: 'Bronchitis, not specified as acute or chronic' },
  { code: 'J42', term: 'Unspecified chronic bronchitis' },
  { code: 'J44.9', term: 'Chronic obstructive pulmonary disease (COPD), unspecified' },
  { code: 'J45.901', term: 'Unspecified asthma with (acute) exacerbation' },
  { code: 'A15.0', term: 'Tuberculosis of lung (TB)' },
  { code: 'A15.9', term: 'Respiratory tuberculosis (TB), unspecified' },

  // Infectious & parasitic (A, B, U)
  { code: 'A09', term: 'Infectious gastroenteritis and colitis, unspecified' },
  { code: 'A90', term: 'Dengue fever (classical)' },
  { code: 'B54', term: 'Unspecified malaria' },
  { code: 'A01.00', term: 'Typhoid fever, unspecified' },
  { code: 'A91', term: 'Dengue haemorrhagic fever' },
  { code: 'B50.9', term: 'Plasmodium falciparum malaria, unspecified' },
  { code: 'B51.9', term: 'Plasmodium vivax malaria without complication' },
  { code: 'U07.1', term: 'COVID-19' },
  { code: 'A03.9', term: 'Shigellosis, unspecified' },
  { code: 'A06.0', term: 'Acute amoebic dysentery' },
  { code: 'A08.4', term: 'Viral intestinal infection, unspecified' },
  { code: 'B01.9', term: 'Varicella (chickenpox) without complication' },
  { code: 'B02.9', term: 'Zoster (shingles) without complications' },
  { code: 'B05.9', term: 'Measles without complication' },
  { code: 'B19.9', term: 'Unspecified viral hepatitis without hepatic coma' },
  { code: 'B20', term: 'Human immunodeficiency virus (HIV) disease' },
  { code: 'B35.4', term: 'Tinea corporis (ringworm of the body)' },
  { code: 'B37.9', term: 'Candidiasis, unspecified' },
  { code: 'B82.9', term: 'Intestinal parasitism, unspecified' },
  { code: 'B86', term: 'Scabies' },

  // Symptoms & signs (R) — the presenting complaint, where no cause is established yet
  { code: 'R50.9', term: 'Fever, unspecified' },
  { code: 'R51.9', term: 'Headache, unspecified' },
  { code: 'R05.9', term: 'Cough, unspecified' },
  { code: 'R07.9', term: 'Chest pain, unspecified' },
  { code: 'R10.9', term: 'Unspecified abdominal pain' },
  { code: 'R11.2', term: 'Nausea with vomiting, unspecified' },
  { code: 'R42', term: 'Dizziness and giddiness' },
  { code: 'R11.10', term: 'Vomiting, unspecified' },
  { code: 'R19.7', term: 'Diarrhoea, unspecified' },
  { code: 'R14.0', term: 'Abdominal distension (gaseous)' },
  { code: 'R06.02', term: 'Shortness of breath' },
  { code: 'R53.83', term: 'Other fatigue' },
  { code: 'R53.1', term: 'Weakness' },
  { code: 'R63.0', term: 'Anorexia (loss of appetite)' },
  { code: 'R21', term: 'Rash and other nonspecific skin eruption' },
  { code: 'R30.0', term: 'Dysuria' },
  { code: 'R35.0', term: 'Frequency of micturition' },
  { code: 'R55', term: 'Syncope and collapse' },
  { code: 'R56.9', term: 'Unspecified convulsions' },
  { code: 'R59.0', term: 'Localized enlarged lymph nodes' },
  { code: 'R60.0', term: 'Localized oedema' },
  { code: 'R00.0', term: 'Tachycardia, unspecified' },
  { code: 'R03.0', term: 'Elevated blood-pressure reading, without diagnosis of hypertension' },

  // Circulatory (I)
  { code: 'I10', term: 'Essential (primary) hypertension' },
  { code: 'I11.9', term: 'Hypertensive heart disease without heart failure' },
  { code: 'I20.9', term: 'Angina pectoris, unspecified' },
  { code: 'I21.9', term: 'Acute myocardial infarction (MI), unspecified' },
  { code: 'I25.10', term: 'Atherosclerotic heart disease (CAD) of native coronary artery' },
  { code: 'I48.91', term: 'Unspecified atrial fibrillation (AF)' },
  { code: 'I50.9', term: 'Heart failure, unspecified' },
  { code: 'I63.9', term: 'Cerebral infarction, unspecified' },
  { code: 'I95.9', term: 'Hypotension, unspecified' },

  // Endocrine, nutritional & metabolic (E)
  { code: 'E11.9', term: 'Type 2 diabetes mellitus without complications' },
  { code: 'E78.5', term: 'Hyperlipidaemia, unspecified' },
  { code: 'E03.9', term: 'Hypothyroidism, unspecified' },
  { code: 'E11.65', term: 'Type 2 diabetes mellitus with hyperglycaemia' },
  { code: 'E10.9', term: 'Type 1 diabetes mellitus without complications' },
  { code: 'E16.2', term: 'Hypoglycaemia, unspecified' },
  { code: 'E05.90', term: 'Thyrotoxicosis, unspecified without thyrotoxic crisis or storm' },
  { code: 'E28.2', term: 'Polycystic ovarian syndrome (PCOS)' },
  { code: 'E55.9', term: 'Vitamin D deficiency, unspecified' },
  { code: 'E53.8', term: 'Deficiency of other specified B group vitamins (vitamin B12)' },
  { code: 'E66.9', term: 'Obesity, unspecified' },
  { code: 'E44.0', term: 'Moderate protein-calorie malnutrition' },
  { code: 'E86.0', term: 'Dehydration' },

  // Blood & blood-forming organs (D)
  { code: 'D50.9', term: 'Iron deficiency anaemia, unspecified' },
  { code: 'D64.9', term: 'Anaemia, unspecified' },
  { code: 'D56.9', term: 'Thalassaemia, unspecified' },
  { code: 'D69.6', term: 'Thrombocytopenia, unspecified' },

  // Digestive (K)
  { code: 'K21.9', term: 'Gastro-oesophageal reflux disease (GERD) without oesophagitis' },
  { code: 'K29.70', term: 'Gastritis, unspecified, without bleeding' },
  { code: 'K30', term: 'Functional dyspepsia' },
  { code: 'K59.00', term: 'Constipation, unspecified' },
  { code: 'K52.9', term: 'Noninfective gastroenteritis and colitis, unspecified' },
  { code: 'K58.9', term: 'Irritable bowel syndrome (IBS) without diarrhoea' },
  { code: 'K64.9', term: 'Unspecified haemorrhoids' },
  { code: 'K76.0', term: 'Fatty liver (hepatic steatosis), not elsewhere classified' },
  { code: 'K80.20', term: 'Calculus of gallbladder without cholecystitis without obstruction' },
  { code: 'K35.80', term: 'Unspecified acute appendicitis' },
  { code: 'K40.90', term: 'Unilateral inguinal hernia without obstruction or gangrene' },
  { code: 'K12.0', term: 'Recurrent oral aphthae' },
  { code: 'K02.9', term: 'Dental caries, unspecified' },

  // Genitourinary, obstetric & women's health (N, O, Z)
  { code: 'N39.0', term: 'Urinary tract infection (UTI), site not specified' },
  { code: 'N30.00', term: 'Acute cystitis without haematuria' },
  { code: 'N20.0', term: 'Calculus of kidney' },
  { code: 'N18.9', term: 'Chronic kidney disease (CKD), unspecified' },
  { code: 'N40.0', term: 'Benign prostatic hyperplasia (BPH), no lower urinary tract symptoms' },
  { code: 'N76.0', term: 'Acute vaginitis' },
  { code: 'N91.2', term: 'Amenorrhoea, unspecified' },
  { code: 'N92.0', term: 'Excessive and frequent menstruation with regular cycle' },
  { code: 'N94.6', term: 'Dysmenorrhoea, unspecified' },
  { code: 'Z34.90', term: 'Supervision of normal pregnancy, unspecified trimester' },
  { code: 'O21.0', term: 'Mild hyperemesis gravidarum' },
  { code: 'O99.019', term: 'Anaemia complicating pregnancy, unspecified trimester' },

  // Skin & subcutaneous tissue (L)
  { code: 'L30.9', term: 'Dermatitis, unspecified' },
  { code: 'L23.9', term: 'Allergic contact dermatitis, unspecified cause' },
  { code: 'L20.9', term: 'Atopic dermatitis, unspecified' },
  { code: 'L21.9', term: 'Seborrhoeic dermatitis, unspecified' },
  { code: 'L50.9', term: 'Urticaria, unspecified' },
  { code: 'L70.0', term: 'Acne vulgaris' },
  { code: 'L40.9', term: 'Psoriasis, unspecified' },
  { code: 'L03.90', term: 'Cellulitis, unspecified' },

  // Eye & ear (H)
  { code: 'H10.9', term: 'Unspecified conjunctivitis' },
  { code: 'H66.90', term: 'Otitis media, unspecified' },
  { code: 'H60.90', term: 'Unspecified otitis externa, unspecified ear' },
  { code: 'H61.20', term: 'Impacted cerumen, unspecified ear' },
  { code: 'H81.10', term: 'Benign paroxysmal vertigo (BPPV), unspecified ear' },
  { code: 'H52.10', term: 'Myopia, unspecified eye' },
  { code: 'H52.4', term: 'Presbyopia' },
  { code: 'H25.9', term: 'Unspecified age-related cataract' },
  { code: 'H40.9', term: 'Unspecified glaucoma' },

  // Musculoskeletal & injury (M, T)
  { code: 'M54.5', term: 'Low back pain' },
  { code: 'M25.50', term: 'Pain in unspecified joint' },
  { code: 'M79.1', term: 'Myalgia' },
  { code: 'M54.2', term: 'Cervicalgia (neck pain)' },
  { code: 'M17.9', term: 'Osteoarthritis (OA) of knee, unspecified' },
  { code: 'M15.9', term: 'Polyosteoarthritis, unspecified' },
  { code: 'M06.9', term: 'Rheumatoid arthritis (RA), unspecified' },
  { code: 'M10.9', term: 'Gout, unspecified' },
  { code: 'M81.0', term: 'Age-related osteoporosis without current pathological fracture' },
  { code: 'T14.90', term: 'Injury, unspecified' },

  // Nervous system (G)
  { code: 'G43.909', term: 'Migraine, unspecified, not intractable' },
  { code: 'G44.209', term: 'Tension-type headache, unspecified, not intractable' },
  { code: 'G40.909', term: 'Epilepsy, unspecified, not intractable, without status epilepticus' },
  { code: 'G47.00', term: 'Insomnia, unspecified' },
  { code: 'G62.9', term: 'Polyneuropathy, unspecified' },
  { code: 'G56.00', term: 'Carpal tunnel syndrome, unspecified upper limb' },
  { code: 'G51.0', term: "Bell's palsy" },
  { code: 'G20', term: "Parkinson's disease" },

  // Mental & behavioural (F)
  { code: 'F41.9', term: 'Anxiety disorder, unspecified' },
  { code: 'F32.9', term: 'Major depressive disorder, single episode, unspecified' },
  { code: 'F41.1', term: 'Generalized anxiety disorder (GAD)' },
  { code: 'F33.9', term: 'Major depressive disorder, recurrent, unspecified' },
  { code: 'F31.9', term: 'Bipolar disorder, unspecified' },
  { code: 'F90.9', term: 'Attention-deficit hyperactivity disorder (ADHD), unspecified type' },
  { code: 'F17.200', term: 'Nicotine dependence, unspecified, uncomplicated' },
  { code: 'F10.10', term: 'Alcohol abuse, uncomplicated' },

  // Encounters & preventive care (Z)
  { code: 'Z00.00', term: 'General adult medical examination without abnormal findings' },
  { code: 'Z23', term: 'Encounter for immunization' },
  { code: 'Z00.129', term: 'Routine child health examination without abnormal findings' },
  { code: 'Z09', term: 'Encounter for follow-up examination after completed treatment' },
  { code: 'Z76.0', term: 'Encounter for issue of repeat prescription' },
  { code: 'Z30.9', term: 'Encounter for contraceptive management, unspecified' },
];

export function searchIcd10(query: string, limit = 12): Icd10Code[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ICD10_CODES.filter(
    (c) => c.code.toLowerCase().includes(q) || c.term.toLowerCase().includes(q),
  ).slice(0, limit);
}
