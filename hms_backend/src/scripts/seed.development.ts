import 'dotenv/config';
import { pool } from '../db/client';
import { requireEnvironment, describeTarget, SeedRefused } from './seedGuard';
import { dayOffset, isoDate, printReport, resetSeedData, runSeed, type SeedDataset } from './seedKit';

/**
 * **The development seeder** (ADR-058, ADR-114). One file, one environment — this is the only
 * place development demo data is declared, and `seedKit.ts` is the only place it is built.
 *
 * The dataset is deliberately *busy*. A database with three patients and one appointment lets
 * every screen pass and every filter lie: an empty status facet looks the same as a broken one,
 * pagination never appears, a date range never excludes anything, and a detail page with no
 * related records looks finished. So this seeds a hospital that has been open for a while —
 * about six weeks of completed traffic behind today, a live OPD queue this morning with a
 * patient sitting in every stage of the workflow, appointments ahead, bills in every state,
 * lab orders at every step, stock that needs attention, and public form submissions waiting to
 * be reviewed.
 *
 * Everything is synthetic and obviously so on inspection, but nothing is *shaped* like a
 * fixture: no "Test Patient 1". Names, addresses, complaints, prescriptions and prices are
 * ordinary Indian OPD material, because a dataset that does not look like production cannot
 * find the bugs production will.
 *
 * Run it:
 *
 *     npm run db:seed --workspace=hms_backend             # idempotent top-up
 *     npm run db:seed --workspace=hms_backend -- --reset  # wipe tenant data, then reseed
 *
 * It refuses to run against anything but a development database. See `seedGuard.ts`.
 */

/** Published, non-secret, and the same value `TESTING_CREDENTIALS.md` documents. */
const PASSWORD = 'ChangeMe#123';

/**
 * A full-week OPD roster. Morning and evening clinics Monday to Saturday, morning only on
 * Sunday — the pattern most Indian OPDs actually run, and wide enough that the seeded history
 * always falls inside a real window rather than being refused by the roster rule (ADR-069).
 */
const CLINIC_ROSTER = [
  ...[1, 2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, startTime: '09:00', endTime: '13:00', slotMinutes: 15 },
    { weekday, startTime: '17:00', endTime: '20:00', slotMinutes: 15 },
  ]),
  { weekday: 0, startTime: '09:00', endTime: '13:00', slotMinutes: 15 },
];

/** Expiry dates are computed from the run date, so "expiring soon" stays true next month. */
const EXPIRY_SOON = isoDate(dayOffset(38));
const EXPIRY_NEAR = isoDate(dayOffset(95));
const EXPIRY_FAR = isoDate(dayOffset(520));
const EXPIRY_FURTHER = isoDate(dayOffset(700));

// ---------------------------------------------------------------------------
// Shared clinical catalogues
// ---------------------------------------------------------------------------

const LAB_TESTS = [
  { name: 'Complete Blood Count', code: 'CBC', sampleType: 'blood', unit: 'cells/µL', refLow: '4000', refHigh: '11000', pricePaise: 35000 },
  { name: 'Hemoglobin', code: 'HB', sampleType: 'blood', unit: 'g/dL', refLow: '12', refHigh: '17', pricePaise: 20000 },
  { name: 'Fasting Blood Sugar', code: 'FBS', sampleType: 'blood', unit: 'mg/dL', refLow: '70', refHigh: '110', pricePaise: 15000 },
  { name: 'HbA1c', code: 'HBA1C', sampleType: 'blood', unit: '%', refLow: '4', refHigh: '5.7', pricePaise: 55000 },
  { name: 'Lipid Profile', code: 'LIPID', sampleType: 'blood', unit: 'mg/dL', refLow: '0', refHigh: '200', pricePaise: 60000 },
  { name: 'Thyroid Stimulating Hormone', code: 'TSH', sampleType: 'blood', unit: 'µIU/mL', refLow: '0.4', refHigh: '4.2', pricePaise: 35000 },
  { name: 'Liver Function Test', code: 'LFT', sampleType: 'blood', unit: 'U/L', refLow: '10', refHigh: '50', pricePaise: 65000 },
  { name: 'Kidney Function Test', code: 'KFT', sampleType: 'blood', unit: 'mg/dL', refLow: '0.6', refHigh: '1.3', pricePaise: 65000 },
  { name: 'Urine Routine', code: 'URINE-R', sampleType: 'urine', unit: null, refLow: null, refHigh: null, pricePaise: 12000 },
  { name: 'Dengue NS1 Antigen', code: 'DENG-NS1', sampleType: 'blood', unit: null, refLow: null, refHigh: null, pricePaise: 90000 },
  { name: 'C-Reactive Protein', code: 'CRP', sampleType: 'blood', unit: 'mg/L', refLow: '0', refHigh: '6', pricePaise: 45000 },
];

/**
 * `department` is a department CODE, resolved per tenant at seed time (ADR-122). Every tenant in
 * this dataset has GENMED; a tenant without ORTHO or CARDIO simply gets a service with no
 * department, which is a real state and not a defect. Naming the department matters: a services
 * table whose Department column reads "—" on every row teaches nobody anything.
 */
const SERVICES = [
  { code: 'DRESS-S', name: 'Dressing (small)', pricePaise: 15000, department: 'GENMED' },
  { code: 'DRESS-L', name: 'Dressing (large)', pricePaise: 32000, department: 'GENMED' },
  { code: 'INJ-IM', name: 'Injection (intramuscular)', pricePaise: 5000, department: 'GENMED' },
  { code: 'NEBU', name: 'Nebulisation', pricePaise: 20000, department: 'GENMED' },
  { code: 'FOLLOWUP', name: 'Follow-up consultation', pricePaise: 20000, department: 'GENMED' },
  { code: 'ECG', name: 'ECG (12 lead)', pricePaise: 30000, department: 'CARDIO' },
  { code: 'SUTURE', name: 'Suturing (minor wound)', pricePaise: 85000, department: 'ORTHO' },
  { code: 'PHYSIO', name: 'Physiotherapy session', pricePaise: 45000, department: 'ORTHO' },
  // Retired, but historical invoices still reference it — deactivated, never deleted. No
  // department on purpose: "not assigned" is a state the Department column has to render too.
  { code: 'HOMEVISIT', name: 'Home visit (discontinued)', pricePaise: 120000, isActive: false },
];

const SUPPLIERS = [
  { name: 'Deccan Pharma Distributors', phone: '02026551234', email: 'orders@deccanpharma.example', gstin: '27AABCD1234E1Z5', addressLine: 'Shop 14, Market Yard, Pune 411037' },
  { name: 'Sahyadri Medico Agencies', phone: '02024449876', email: 'sales@sahyadrimedico.example', gstin: '27AACCS5678F1Z2', addressLine: 'Plot 8, MIDC Bhosari, Pune 411026' },
  { name: 'Gujarat Health Supplies', phone: '07926781234', email: 'contact@gujhealth.example', gstin: '24AAGCG9012K1Z9', addressLine: 'Nr. Gurukul Road, Ahmedabad 380052' },
  { name: 'Bharat Surgicals', phone: '08028776543', email: 'info@bharatsurgicals.example', gstin: '29AABCB3456L1Z4', addressLine: 'Jayanagar 4th Block, Bengaluru 560011' },
  { name: 'Nova Life Sciences', phone: '02228990011', email: 'support@novalifesciences.example', gstin: '27AAECN7788M1Z1', addressLine: 'Andheri East, Mumbai 400069' },
];

const DRUGS = [
  { name: 'Paracetamol 500 mg', form: 'tablet', strength: '500 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 200, taxRateBps: 500, reorderLevel: 100, batches: [{ batchNo: 'PCM-2601', expiryDate: EXPIRY_FAR, quantity: 480, costPricePaise: 120, supplier: 'Deccan Pharma Distributors' }, { batchNo: 'PCM-2588', expiryDate: EXPIRY_SOON, quantity: 60, costPricePaise: 115, supplier: 'Deccan Pharma Distributors' }] },
  { name: 'Amoxicillin 500 mg', form: 'capsule', strength: '500 mg', unit: 'capsule', hsnSac: '3004', unitPricePaise: 1200, taxRateBps: 1200, reorderLevel: 80, batches: [{ batchNo: 'AMX-2602', expiryDate: EXPIRY_FURTHER, quantity: 300, costPricePaise: 820, supplier: 'Sahyadri Medico Agencies' }] },
  { name: 'Azithromycin 500 mg', form: 'tablet', strength: '500 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 2400, taxRateBps: 1200, reorderLevel: 40, batches: [{ batchNo: 'AZI-2611', expiryDate: EXPIRY_FAR, quantity: 120, costPricePaise: 1750, supplier: 'Sahyadri Medico Agencies' }] },
  { name: 'Cetirizine 10 mg', form: 'tablet', strength: '10 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 300, taxRateBps: 500, reorderLevel: 60, batches: [{ batchNo: 'CTZ-2603', expiryDate: EXPIRY_NEAR, quantity: 380, costPricePaise: 180, supplier: 'Deccan Pharma Distributors' }] },
  { name: 'Pantoprazole 40 mg', form: 'tablet', strength: '40 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 800, taxRateBps: 1200, reorderLevel: 90, batches: [{ batchNo: 'PAN-2604', expiryDate: EXPIRY_FAR, quantity: 340, costPricePaise: 510, supplier: 'Nova Life Sciences' }] },
  { name: 'ORS Sachet 21 g', form: 'sachet', strength: '21 g', unit: 'sachet', hsnSac: '3004', unitPricePaise: 1800, taxRateBps: 500, reorderLevel: 50, batches: [{ batchNo: 'ORS-2605', expiryDate: EXPIRY_FAR, quantity: 200, costPricePaise: 1100, supplier: 'Gujarat Health Supplies' }] },
  { name: 'Metformin 500 mg', form: 'tablet', strength: '500 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 400, taxRateBps: 500, reorderLevel: 120, batches: [{ batchNo: 'MET-2606', expiryDate: EXPIRY_FURTHER, quantity: 620, costPricePaise: 230, supplier: 'Nova Life Sciences' }] },
  { name: 'Amlodipine 5 mg', form: 'tablet', strength: '5 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 350, taxRateBps: 500, reorderLevel: 100, batches: [{ batchNo: 'AML-2607', expiryDate: EXPIRY_FAR, quantity: 540, costPricePaise: 190, supplier: 'Deccan Pharma Distributors' }] },
  // Deliberately below its reorder level, so the dashboard's low-stock tile has something real.
  { name: 'Salbutamol Inhaler 100 mcg', form: 'inhaler', strength: '100 mcg', unit: 'inhaler', hsnSac: '3004', unitPricePaise: 21000, taxRateBps: 1200, reorderLevel: 25, batches: [{ batchNo: 'SAL-2608', expiryDate: EXPIRY_NEAR, quantity: 9, costPricePaise: 16500, supplier: 'Bharat Surgicals' }] },
  { name: 'Montelukast 10 mg', form: 'tablet', strength: '10 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 900, taxRateBps: 1200, reorderLevel: 40, batches: [{ batchNo: 'MON-2609', expiryDate: EXPIRY_FAR, quantity: 180, costPricePaise: 640, supplier: 'Nova Life Sciences' }] },
  { name: 'Ferrous Ascorbate 100 mg', form: 'tablet', strength: '100 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 1500, taxRateBps: 500, reorderLevel: 45, batches: [{ batchNo: 'FER-2610', expiryDate: EXPIRY_FAR, quantity: 210, costPricePaise: 980, supplier: 'Gujarat Health Supplies' }] },
  { name: 'Ondansetron 4 mg', form: 'tablet', strength: '4 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 700, taxRateBps: 1200, reorderLevel: 30, batches: [{ batchNo: 'OND-2612', expiryDate: EXPIRY_SOON, quantity: 24, costPricePaise: 430, supplier: 'Bharat Surgicals' }] },
];

/** The childhood schedule a paediatric chart carries — enough to fill an immunisation tab. */
const CHILD_VACCINES = [
  { vaccineCode: 'BCG', vaccineName: 'BCG', dateGiven: '2019-07-03', doseLabel: 'Birth' },
  { vaccineCode: 'HEPB', vaccineName: 'Hepatitis B', dateGiven: '2019-07-03', doseLabel: 'Birth dose' },
  { vaccineCode: 'OPV', vaccineName: 'Oral Polio Vaccine', dateGiven: '2019-08-14', doseLabel: 'OPV-1' },
  { vaccineCode: 'PENTA', vaccineName: 'Pentavalent', dateGiven: '2019-08-14', doseLabel: 'Dose 1' },
  { vaccineCode: 'MR', vaccineName: 'Measles-Rubella', dateGiven: '2020-04-22', doseLabel: 'Dose 1' },
  { vaccineCode: 'DPT', vaccineName: 'DPT Booster', dateGiven: '2021-01-18', doseLabel: 'Booster 1' },
];

// ---------------------------------------------------------------------------
// The dataset
// ---------------------------------------------------------------------------

export const DEVELOPMENT_DATASET: SeedDataset = {
  environment: 'development',
  password: PASSWORD,
  tenants: [
    {
      // Tier 0 — the vendor's own organization (ADR-022). Operators who onboard hospitals live
      // here. Not a hospital: no modules, no branches, no clinical data, ever.
      code: 'NIROGIX',
      name: 'Nirogix',
      kind: 'platform',
      modules: [],
      users: [
        { email: 'jaivik@thefortunetech.com', fullName: 'Jaivik Patel', role: 'super_admin' },
        { email: 'nishant@thefortunetech.com', fullName: 'Nishant Patel', role: 'super_admin' },
      ],
    },

    // -----------------------------------------------------------------------
    // CityCare — Pune. The reference hospital: everything on, everything busy.
    // -----------------------------------------------------------------------
    {
      code: 'CITYCARE',
      name: 'CityCare Multispeciality Hospital',
      kind: 'hospital',
      profile: {
        legalName: 'CityCare Healthcare LLP',
        addressLine1: 'Survey 42, Paud Road',
        addressLine2: 'Kothrud',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411038',
        country: 'India',
        phone: '02025432100',
        email: 'contact@citycare.example',
        website: 'https://citycare.example',
        registrationNumber: 'MH-HOSP-2016-4821',
        gstin: '27AAECC1234H1ZP',
        supportEmail: 'help@citycare.example',
        letterheadHeader: 'CityCare Multispeciality Hospital',
        letterheadFooter: 'Kothrud · Baner · Hadapsar   |   24×7 emergency: 020 2543 2100',
        signatoryName: 'Dr. Ananya Sharma',
        signatoryDesignation: 'Medical Director',
      },
      branding: { brandColor: '#0F766E', secondaryColor: '#B45309' },
      selfRegistration: true,
      onlineBooking: true,
      branches: [
        { code: 'KTD', name: 'Kothrud (Main)' },
        { code: 'BNR', name: 'Baner' },
        // Closed branch — its history stays, but nothing new is booked into it.
        { code: 'HDP', name: 'Hadapsar (closed)', isActive: false },
      ],
      departments: [
        { code: 'GENMED', name: 'General Medicine', specialty: 'general_medicine' },
        { code: 'CARDIO', name: 'Cardiology', specialty: 'cardiology' },
        { code: 'ORTHO', name: 'Orthopaedics', specialty: 'orthopedics' },
        { code: 'PAEDS', name: 'Paediatrics', specialty: 'pediatrics' },
        { code: 'DERM', name: 'Dermatology', specialty: 'dermatology' },
        { code: 'ENT', name: 'ENT', specialty: 'ent' },
        { code: 'PSYCH', name: 'Psychiatry (not staffed)', specialty: 'psychiatry', isActive: false },
      ],
      users: [
        // A hospital has no System Super Admin — that role belongs to the platform org.
        { email: 'admin@citycare.example', fullName: 'Dr. Ananya Sharma', role: 'org_admin' },
        { email: 'branchadmin@citycare.example', fullName: 'Suresh Iyer', role: 'branch_admin' },
        { email: 'doctor@citycare.example', fullName: 'Dr. Rajesh Gupta', role: 'doctor' },
        { email: 'doctor2@citycare.example', fullName: 'Dr. Neelam Kulkarni', role: 'doctor' },
        { email: 'doctor3@citycare.example', fullName: 'Dr. Faisal Ahmed', role: 'doctor' },
        { email: 'reception@citycare.example', fullName: 'Rahul Verma', role: 'receptionist' },
        { email: 'reception2@citycare.example', fullName: 'Snehal Jadhav', role: 'receptionist' },
        { email: 'pharmacist@citycare.example', fullName: 'Meena Nair', role: 'pharmacist' },
        { email: 'lab@citycare.example', fullName: 'Karthik Menon', role: 'lab_technician' },
        { email: 'cashier@citycare.example', fullName: 'Pooja Deshmukh', role: 'cashier' },
        // Left the hospital. Disabled, not deleted — their audit trail has to stay attributable.
        { email: 'former.staff@citycare.example', fullName: 'Vikas Bhosale', role: 'receptionist', status: 'inactive' },
      ],
      providers: [
        { fullName: 'Dr. Ananya Sharma', qualification: 'MBBS, MD (Cardiology)', registrationNumber: 'MMC-2011-04821', specialty: 'cardiology', userEmail: 'admin@citycare.example', consultationFeePaise: 80000, schedule: CLINIC_ROSTER },
        { fullName: 'Dr. Rajesh Gupta', qualification: 'MBBS, MD (General Medicine)', registrationNumber: 'MMC-2014-11733', specialty: 'general_medicine', userEmail: 'doctor@citycare.example', consultationFeePaise: 50000, schedule: CLINIC_ROSTER },
        { fullName: 'Dr. Neelam Kulkarni', qualification: 'MBBS, DCH', registrationNumber: 'MMC-2016-20194', specialty: 'pediatrics', userEmail: 'doctor2@citycare.example', consultationFeePaise: 45000, schedule: CLINIC_ROSTER },
        { fullName: 'Dr. Faisal Ahmed', qualification: 'MBBS, MS (Orthopaedics)', registrationNumber: 'MMC-2013-08877', specialty: 'orthopedics', userEmail: 'doctor3@citycare.example', consultationFeePaise: 70000, schedule: CLINIC_ROSTER },
        // No roster — free-form booking is still supported and needs a doctor who shows it.
        { fullName: 'Dr. Shalini Rao', qualification: 'MBBS, MD (Dermatology)', registrationNumber: 'MMC-2018-30455', specialty: 'dermatology', consultationFeePaise: 60000 },
        // Retired consultant: inactive, so they cannot be booked but their history remains.
        { fullName: 'Dr. Mohan Kelkar', qualification: 'MBBS, MD', registrationNumber: 'MMC-1998-00312', specialty: 'general_medicine', consultationFeePaise: 40000, isActive: false },
      ],
      labTests: LAB_TESTS,
      services: SERVICES,
      suppliers: SUPPLIERS,
      drugs: DRUGS,
      patients: [
        { firstName: 'Aarav', lastName: 'Kulkarni', gender: 'male', dateOfBirth: '1990-04-12', phone: '9820011234', email: 'aarav.kulkarni@example.com', bloodGroup: 'B+', addressLine: 'Flat 302, Sunshine Residency, Karve Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411052', emergencyContactName: 'Sneha Kulkarni', emergencyContactPhone: '9820011235' },
        { firstName: 'Isha', lastName: 'Deshpande', gender: 'female', dateOfBirth: '1985-11-03', phone: '9822045678', email: 'isha.deshpande@example.com', bloodGroup: 'O+', addressLine: '14, Prabhat Road Lane 6', city: 'Pune', state: 'Maharashtra', pincode: '411004' },
        { firstName: 'Vivaan', lastName: 'Patil', gender: 'male', dateOfBirth: '2019-06-20', phone: '9821099887', bloodGroup: 'A+', addressLine: 'Row House 7, Sus Road', city: 'Pune', state: 'Maharashtra', pincode: '411021', emergencyContactName: 'Rohit Patil', emergencyContactPhone: '9821099888', immunizations: CHILD_VACCINES },
        { firstName: 'Meera', lastName: 'Joshi', gender: 'female', dateOfBirth: '1972-01-28', phone: '9823310022', bloodGroup: 'AB+', addressLine: 'Bungalow 5, Model Colony', city: 'Pune', state: 'Maharashtra', pincode: '411016' },
        { firstName: 'Rohan', lastName: 'Shinde', gender: 'male', dateOfBirth: '1996-09-15', phone: '9765443321', email: 'rohan.shinde@example.com', bloodGroup: 'O-', addressLine: '22, Baner Road', city: 'Pune', state: 'Maharashtra', pincode: '411045' },
        { firstName: 'Sanjana', lastName: 'Chavan', gender: 'female', dateOfBirth: '1988-03-07', phone: '9766120045', bloodGroup: 'B-', addressLine: 'Plot 19, Aundh', city: 'Pune', state: 'Maharashtra', pincode: '411007' },
        { firstName: 'Aditya', lastName: 'Pawar', gender: 'male', dateOfBirth: '1979-12-11', phone: '9890034512', email: 'aditya.pawar@example.com', bloodGroup: 'A-', addressLine: 'Shivaji Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411005' },
        { firstName: 'Kavya', lastName: 'Bhosale', gender: 'female', dateOfBirth: '2001-05-30', phone: '9890220198', bloodGroup: 'O+', addressLine: 'Lane 3, Kalyani Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411006' },
        { firstName: 'Nikhil', lastName: 'Gaikwad', gender: 'male', dateOfBirth: '1993-08-19', phone: '9922110034', bloodGroup: 'B+', addressLine: 'Sector 12, Pimpri', city: 'Pimpri-Chinchwad', state: 'Maharashtra', pincode: '411018' },
        { firstName: 'Ananya', lastName: 'Mehta', gender: 'female', dateOfBirth: '1998-02-24', phone: '9922884411', email: 'ananya.mehta@example.com', bloodGroup: 'AB-', addressLine: 'Wakad Road', city: 'Pimpri-Chinchwad', state: 'Maharashtra', pincode: '411057' },
        { firstName: 'Rajiv', lastName: 'Naik', gender: 'male', dateOfBirth: '1965-07-02', phone: '9860012399', bloodGroup: 'A+', addressLine: 'Gultekdi', city: 'Pune', state: 'Maharashtra', pincode: '411037' },
        { firstName: 'Sunita', lastName: 'Rane', gender: 'female', dateOfBirth: '1958-10-16', phone: '9860334455', bloodGroup: 'O+', addressLine: 'Sadashiv Peth', city: 'Pune', state: 'Maharashtra', pincode: '411030' },
        { firstName: 'Tanvi', lastName: 'Sawant', gender: 'female', dateOfBirth: '2015-11-09', phone: '9028776611', bloodGroup: 'B+', addressLine: 'Warje', city: 'Pune', state: 'Maharashtra', pincode: '411058', emergencyContactName: 'Prashant Sawant', emergencyContactPhone: '9028776612', immunizations: CHILD_VACCINES.slice(0, 4) },
        { firstName: 'Omkar', lastName: 'Kadam', gender: 'male', dateOfBirth: '1991-01-05', phone: '9028443300', bloodGroup: 'A+', addressLine: 'Hinjawadi Phase 2', city: 'Pune', state: 'Maharashtra', pincode: '411057' },
        { firstName: 'Priyanka', lastName: 'Dhole', gender: 'female', dateOfBirth: '1983-06-27', phone: '7020118899', email: 'priyanka.dhole@example.com', bloodGroup: 'O-', addressLine: 'Viman Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411014' },
        { firstName: 'Harshad', lastName: 'More', gender: 'male', dateOfBirth: '1975-04-18', phone: '7020556677', bloodGroup: 'B+', addressLine: 'Kondhwa', city: 'Pune', state: 'Maharashtra', pincode: '411048' },
        { firstName: 'Nisha', lastName: 'Agarwal', gender: 'female', dateOfBirth: '1994-09-08', phone: '8888220011', bloodGroup: 'A+', addressLine: 'Camp Area', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
        { firstName: 'Girish', lastName: 'Salunkhe', gender: 'male', dateOfBirth: '1969-03-21', phone: '8888660022', bloodGroup: 'AB+', addressLine: 'Dhankawadi', city: 'Pune', state: 'Maharashtra', pincode: '411043' },
        { firstName: 'Pallavi', lastName: 'Wagh', gender: 'female', dateOfBirth: '1990-12-01', phone: '7385220099', bloodGroup: 'O+', addressLine: 'Chinchwad Station Road', city: 'Pimpri-Chinchwad', state: 'Maharashtra', pincode: '411019' },
        { firstName: 'Sameer', lastName: 'Qureshi', gender: 'male', dateOfBirth: '1987-05-14', phone: '7385990011', email: 'sameer.qureshi@example.com', bloodGroup: 'B-', addressLine: 'Kharadi Bypass', city: 'Pune', state: 'Maharashtra', pincode: '411014' },
        { firstName: 'Deepa', lastName: 'Nadkarni', gender: 'female', dateOfBirth: '1962-08-30', phone: '9767001122', bloodGroup: 'A-', addressLine: 'Erandwane', city: 'Pune', state: 'Maharashtra', pincode: '411004' },
        { firstName: 'Kabir', lastName: 'Sheikh', gender: 'male', dateOfBirth: '2012-02-14', phone: '9767334455', bloodGroup: 'O+', addressLine: 'Yerawada', city: 'Pune', state: 'Maharashtra', pincode: '411006', immunizations: CHILD_VACCINES.slice(0, 5) },
        { firstName: 'Ishaan', lastName: 'Kamat', gender: 'other', dateOfBirth: '1997-07-19', phone: '9503221100', bloodGroup: 'B+', addressLine: 'Bavdhan', city: 'Pune', state: 'Maharashtra', pincode: '411021' },
        // Moved out of the city; kept for history, excluded from the working list.
        { firstName: 'Mahesh', lastName: 'Borkar', gender: 'male', dateOfBirth: '1980-10-25', phone: '9503667788', bloodGroup: 'A+', addressLine: 'Katraj', city: 'Pune', state: 'Maharashtra', pincode: '411046', status: 'inactive' },
        // The two newest charts: registered this week, nothing on them yet.
        { firstName: 'Ritika', lastName: 'Sane', gender: 'female', dateOfBirth: '2000-04-04', phone: '9130445566', bloodGroup: 'O+', addressLine: 'Pashan', city: 'Pune', state: 'Maharashtra', pincode: '411008' },
        { firstName: 'Devendra', lastName: 'Chaudhari', gender: 'male', dateOfBirth: '1976-11-22', phone: '9130778899', bloodGroup: 'B+', addressLine: 'Wanowrie', city: 'Pune', state: 'Maharashtra', pincode: '411040' },
      ],
      registrationRequests: [
        { firstName: 'Prakash', lastName: 'Bhagat', gender: 'male', dateOfBirth: '1981-02-11', phone: '9145220033', city: 'Pune', note: 'Scanned the QR at the reception desk', decision: 'pending' },
        { firstName: 'Vaishali', lastName: 'Thorat', gender: 'female', dateOfBirth: '1993-06-06', phone: '9145660077', city: 'Pune', decision: 'pending' },
        { firstName: 'Imran', lastName: 'Shaikh', gender: 'male', dateOfBirth: '1988-09-23', phone: '9145880099', city: 'Pimpri-Chinchwad', note: 'Wants an appointment with Orthopaedics', decision: 'pending' },
        { firstName: 'Sarika', lastName: 'Patil', gender: 'female', dateOfBirth: '1979-12-30', phone: '9146110022', city: 'Pune', decision: 'approved' },
        { firstName: 'Yash', lastName: 'Kale', gender: 'male', dateOfBirth: '2002-03-17', phone: '9146330044', city: 'Pune', decision: 'approved' },
        { firstName: 'Test', lastName: 'Entry', gender: 'male', phone: '9000000000', city: 'Pune', note: 'Obvious junk submission', decision: 'rejected', rejectionReason: 'Not a genuine registration' },
        { firstName: 'Anjali', lastName: 'Kamble', gender: 'female', dateOfBirth: '1991-08-08', phone: '9146770088', city: 'Pune', decision: 'rejected', rejectionReason: 'Duplicate of an existing chart' },
      ],
      bookingRequests: [
        { firstName: 'Ramesh', lastName: 'Kulkarni', phone: '9147220011', email: 'ramesh.k@example.com', note: 'Prefers a morning slot', decision: 'pending' },
        { firstName: 'Farida', lastName: 'Merchant', phone: '9147440022', note: 'Follow-up for blood pressure', decision: 'pending' },
        { firstName: 'Sachin', lastName: 'Gokhale', phone: '9147660033', decision: 'pending' },
        { firstName: 'Leena', lastName: 'Fernandes', phone: '9147880044', email: 'leena.f@example.com', decision: 'approved' },
        { firstName: 'Abhay', lastName: 'Dixit', phone: '9148110055', decision: 'approved' },
        { firstName: 'Unknown', lastName: 'Caller', phone: '9148330066', decision: 'rejected', rejectionReason: 'Could not be reached to confirm' },
        { firstName: 'Manisha', lastName: 'Yadav', phone: '9148550077', decision: 'rejected', rejectionReason: 'Requested department is not available at this branch' },
      ],
      story: { historyDays: 42, visitsPerDay: 3, futureDays: 14, futureAppointments: 12 },
    },

    // -----------------------------------------------------------------------
    // Sunrise — Ahmedabad. A second, differently-branded tenant: the one that proves
    // isolation, and that nothing is hard-coded to CityCare.
    // -----------------------------------------------------------------------
    {
      code: 'SUNRISE',
      name: 'Sunrise Diagnostics & Polyclinic',
      kind: 'hospital',
      profile: {
        legalName: 'Sunrise Diagnostics Pvt Ltd',
        addressLine1: '3rd Floor, Shivalik Plaza',
        addressLine2: 'Satellite',
        city: 'Ahmedabad',
        state: 'Gujarat',
        postalCode: '380015',
        country: 'India',
        phone: '07926304050',
        email: 'care@sunrisediagnostics.example',
        registrationNumber: 'GJ-CLIN-2018-1180',
        gstin: '24AAJCS4455P1ZQ',
        letterheadHeader: 'Sunrise Diagnostics & Polyclinic',
        letterheadFooter: 'Satellite · Maninagar   |   Reports on WhatsApp: 079 2630 4050',
        signatoryName: 'Dr. Priya Patel',
        signatoryDesignation: 'Chief Pathologist',
      },
      branding: { brandColor: '#B91C1C', secondaryColor: '#1D4ED8' },
      selfRegistration: true,
      onlineBooking: false,
      branches: [
        { code: 'STL', name: 'Satellite (Main)' },
        { code: 'MNG', name: 'Maninagar' },
      ],
      departments: [
        { code: 'GENMED', name: 'General Medicine', specialty: 'general_medicine' },
        { code: 'RADIO', name: 'Radiology', specialty: 'radiology' },
        { code: 'PATH', name: 'Pathology', specialty: 'general_medicine' },
        { code: 'GYNAE', name: 'Gynaecology', specialty: 'gynecology' },
        { code: 'DIET', name: 'Dietetics (on hold)', specialty: 'general_medicine', isActive: false },
      ],
      users: [
        { email: 'admin@sunrise.example', fullName: 'Dr. Priya Patel', role: 'org_admin' },
        { email: 'branchadmin@sunrise.example', fullName: 'Amit Shah', role: 'branch_admin' },
        { email: 'doctor@sunrise.example', fullName: 'Dr. Sanjay Desai', role: 'doctor' },
        { email: 'doctor2@sunrise.example', fullName: 'Dr. Hetal Bhatt', role: 'doctor' },
        { email: 'reception@sunrise.example', fullName: 'Neha Joshi', role: 'receptionist' },
        { email: 'pharmacist@sunrise.example', fullName: 'Kiran Modi', role: 'pharmacist' },
        { email: 'lab@sunrise.example', fullName: 'Harish Trivedi', role: 'lab_technician' },
        { email: 'cashier@sunrise.example', fullName: 'Divya Mehta', role: 'cashier' },
      ],
      providers: [
        { fullName: 'Dr. Sanjay Desai', qualification: 'MBBS, MD (Radiodiagnosis)', registrationNumber: 'GMC-2012-07655', specialty: 'radiology', userEmail: 'doctor@sunrise.example', consultationFeePaise: 60000, schedule: CLINIC_ROSTER },
        { fullName: 'Dr. Hetal Bhatt', qualification: 'MBBS, DGO', registrationNumber: 'GMC-2015-14200', specialty: 'gynecology', userEmail: 'doctor2@sunrise.example', consultationFeePaise: 55000, schedule: CLINIC_ROSTER },
        { fullName: 'Dr. Priya Patel', qualification: 'MBBS, MD (Pathology)', registrationNumber: 'GMC-2009-03311', specialty: 'general_medicine', userEmail: 'admin@sunrise.example', consultationFeePaise: 40000 },
      ],
      labTests: LAB_TESTS,
      services: SERVICES.slice(0, 6),
      suppliers: SUPPLIERS.slice(2),
      drugs: DRUGS.slice(0, 8),
      patients: [
        { firstName: 'Rajesh', lastName: 'Chaudhary', gender: 'male', dateOfBirth: '1978-07-22', phone: '9898012345', email: 'rajesh.chaudhary@example.com', bloodGroup: 'A+', addressLine: '12, Prernatirth Derasar Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
        { firstName: 'Meera', lastName: 'Shah', gender: 'female', dateOfBirth: '1992-02-14', phone: '9898067890', bloodGroup: 'AB+', addressLine: 'Navrangpura', city: 'Ahmedabad', state: 'Gujarat', pincode: '380009' },
        { firstName: 'Jayesh', lastName: 'Trivedi', gender: 'male', dateOfBirth: '1969-11-09', phone: '9825110022', bloodGroup: 'O+', addressLine: 'Maninagar East', city: 'Ahmedabad', state: 'Gujarat', pincode: '380008' },
        { firstName: 'Nandini', lastName: 'Vyas', gender: 'female', dateOfBirth: '1986-05-03', phone: '9825440033', email: 'nandini.vyas@example.com', bloodGroup: 'B+', addressLine: 'Bodakdev', city: 'Ahmedabad', state: 'Gujarat', pincode: '380054' },
        { firstName: 'Bhavesh', lastName: 'Panchal', gender: 'male', dateOfBirth: '1995-09-27', phone: '9825770044', bloodGroup: 'A-', addressLine: 'Chandkheda', city: 'Ahmedabad', state: 'Gujarat', pincode: '382424' },
        { firstName: 'Krishna', lastName: 'Solanki', gender: 'female', dateOfBirth: '1974-12-19', phone: '9909220011', bloodGroup: 'O-', addressLine: 'Vastrapur', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
        { firstName: 'Dhruv', lastName: 'Amin', gender: 'male', dateOfBirth: '2016-08-02', phone: '9909550022', bloodGroup: 'B+', addressLine: 'Thaltej', city: 'Ahmedabad', state: 'Gujarat', pincode: '380059', immunizations: CHILD_VACCINES.slice(0, 4) },
        { firstName: 'Roshni', lastName: 'Parekh', gender: 'female', dateOfBirth: '1990-01-31', phone: '9909880033', bloodGroup: 'AB-', addressLine: 'Paldi', city: 'Ahmedabad', state: 'Gujarat', pincode: '380007' },
        { firstName: 'Manish', lastName: 'Dave', gender: 'male', dateOfBirth: '1983-04-25', phone: '9377110044', bloodGroup: 'A+', addressLine: 'Gota', city: 'Ahmedabad', state: 'Gujarat', pincode: '382481' },
        { firstName: 'Zeel', lastName: 'Kothari', gender: 'female', dateOfBirth: '1999-06-12', phone: '9377440055', email: 'zeel.kothari@example.com', bloodGroup: 'O+', addressLine: 'Bopal', city: 'Ahmedabad', state: 'Gujarat', pincode: '380058' },
        { firstName: 'Hardik', lastName: 'Rathod', gender: 'male', dateOfBirth: '1971-03-08', phone: '9377770066', bloodGroup: 'B-', addressLine: 'Sabarmati', city: 'Gandhinagar', state: 'Gujarat', pincode: '382007' },
        { firstName: 'Falguni', lastName: 'Bhatt', gender: 'female', dateOfBirth: '1966-10-14', phone: '9426110077', bloodGroup: 'A+', addressLine: 'Sector 21', city: 'Gandhinagar', state: 'Gujarat', pincode: '382021' },
        { firstName: 'Parth', lastName: 'Modi', gender: 'male', dateOfBirth: '2004-02-07', phone: '9426440088', bloodGroup: 'O+', addressLine: 'Nikol', city: 'Ahmedabad', state: 'Gujarat', pincode: '382350' },
        { firstName: 'Sneha', lastName: 'Pandya', gender: 'female', dateOfBirth: '1997-11-28', phone: '9426770099', bloodGroup: 'B+', addressLine: 'Shela', city: 'Ahmedabad', state: 'Gujarat', pincode: '380058' },
        { firstName: 'Kirit', lastName: 'Joshi', gender: 'male', dateOfBirth: '1959-05-16', phone: '9558110011', bloodGroup: 'AB+', addressLine: 'Ellis Bridge', city: 'Ahmedabad', state: 'Gujarat', pincode: '380006', status: 'inactive' },
        { firstName: 'Aditi', lastName: 'Raval', gender: 'female', dateOfBirth: '1994-07-21', phone: '9558440022', bloodGroup: 'O+', addressLine: 'Naranpura', city: 'Ahmedabad', state: 'Gujarat', pincode: '380013' },
        { firstName: 'Ridham', lastName: 'Chokshi', gender: 'other', dateOfBirth: '1989-09-05', phone: '9558770033', bloodGroup: 'A+', addressLine: 'Ambawadi', city: 'Ahmedabad', state: 'Gujarat', pincode: '380006' },
      ],
      registrationRequests: [
        { firstName: 'Urvashi', lastName: 'Desai', gender: 'female', dateOfBirth: '1992-04-19', phone: '9558990044', city: 'Ahmedabad', decision: 'pending' },
        { firstName: 'Nirav', lastName: 'Shah', gender: 'male', dateOfBirth: '1985-01-12', phone: '9558990055', city: 'Ahmedabad', decision: 'pending' },
        { firstName: 'Palak', lastName: 'Gandhi', gender: 'female', dateOfBirth: '2000-08-30', phone: '9558990066', city: 'Gandhinagar', decision: 'approved' },
        { firstName: 'Tejas', lastName: 'Barot', gender: 'male', dateOfBirth: '1977-06-25', phone: '9558990077', city: 'Ahmedabad', decision: 'approved' },
        { firstName: 'Blank', lastName: 'Form', phone: '9000000001', decision: 'rejected', rejectionReason: 'Incomplete details' },
      ],
      bookingRequests: [
        { firstName: 'Ketan', lastName: 'Bhavsar', phone: '9558991100', decision: 'pending' },
        { firstName: 'Rekha', lastName: 'Sompura', phone: '9558991111', note: 'Sonography appointment', decision: 'pending' },
        { firstName: 'Alpesh', lastName: 'Prajapati', phone: '9558991122', decision: 'approved' },
        { firstName: 'Nita', lastName: 'Vaghela', phone: '9558991133', decision: 'approved' },
        { firstName: 'Wrong', lastName: 'Number', phone: '9000000002', decision: 'rejected', rejectionReason: 'Number not reachable' },
      ],
      story: { historyDays: 28, visitsPerDay: 2, futureDays: 10, futureAppointments: 8 },
    },

    // -----------------------------------------------------------------------
    // Lotus — Bengaluru. A small clinic with pharmacy and laboratory switched OFF:
    // the tenant that proves module entitlement hides a whole area of the product.
    // -----------------------------------------------------------------------
    {
      code: 'LOTUS',
      name: 'Lotus Family Clinic',
      kind: 'hospital',
      modules: ['patient', 'appointment', 'opd', 'emr', 'billing'],
      profile: {
        legalName: 'Lotus Family Clinic',
        addressLine1: '2nd Cross, 5th Block',
        addressLine2: 'Jayanagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560041',
        country: 'India',
        phone: '08041234567',
        email: 'hello@lotusclinic.example',
      },
      selfRegistration: false,
      onlineBooking: true,
      branches: [{ code: 'JYN', name: 'Jayanagar' }],
      departments: [
        { code: 'GENMED', name: 'General Medicine', specialty: 'general_medicine' },
        { code: 'PAEDS', name: 'Paediatrics', specialty: 'pediatrics' },
      ],
      users: [
        { email: 'admin@lotus.example', fullName: 'Dr. Latha Srinivas', role: 'org_admin' },
        { email: 'doctor@lotus.example', fullName: 'Dr. Girish Rao', role: 'doctor' },
        { email: 'reception@lotus.example', fullName: 'Deepa Krishnan', role: 'receptionist' },
        { email: 'cashier@lotus.example', fullName: 'Manoj Hegde', role: 'cashier' },
      ],
      providers: [
        { fullName: 'Dr. Latha Srinivas', qualification: 'MBBS, DNB (Family Medicine)', registrationNumber: 'KMC-2010-05512', specialty: 'general_medicine', userEmail: 'admin@lotus.example', consultationFeePaise: 40000, schedule: CLINIC_ROSTER },
        { fullName: 'Dr. Girish Rao', qualification: 'MBBS, DCH', registrationNumber: 'KMC-2017-22190', specialty: 'pediatrics', userEmail: 'doctor@lotus.example', consultationFeePaise: 35000, schedule: CLINIC_ROSTER },
      ],
      services: SERVICES.slice(0, 5),
      patients: [
        { firstName: 'Karthik', lastName: 'Iyer', gender: 'male', dateOfBirth: '1987-03-14', phone: '9845110011', bloodGroup: 'B+', addressLine: '4th Block, Jayanagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560011' },
        { firstName: 'Divya', lastName: 'Shetty', gender: 'female', dateOfBirth: '1993-10-02', phone: '9845220022', bloodGroup: 'O+', addressLine: 'BTM Layout', city: 'Bengaluru', state: 'Karnataka', pincode: '560076' },
        { firstName: 'Arjun', lastName: 'Reddy', gender: 'male', dateOfBirth: '1981-06-18', phone: '9845330033', bloodGroup: 'A+', addressLine: 'Koramangala', city: 'Bengaluru', state: 'Karnataka', pincode: '560034' },
        { firstName: 'Lakshmi', lastName: 'Narayan', gender: 'female', dateOfBirth: '1964-01-25', phone: '9845440044', bloodGroup: 'AB+', addressLine: 'Basavanagudi', city: 'Bengaluru', state: 'Karnataka', pincode: '560004' },
        { firstName: 'Nithya', lastName: 'Bhat', gender: 'female', dateOfBirth: '2014-09-11', phone: '9845550055', bloodGroup: 'O+', addressLine: 'JP Nagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560078', immunizations: CHILD_VACCINES.slice(0, 4) },
        { firstName: 'Suhas', lastName: 'Kamath', gender: 'male', dateOfBirth: '1998-12-06', phone: '9845660066', bloodGroup: 'B-', addressLine: 'Banashankari', city: 'Bengaluru', state: 'Karnataka', pincode: '560070' },
        { firstName: 'Rekha', lastName: 'Gowda', gender: 'female', dateOfBirth: '1976-04-29', phone: '9845770077', bloodGroup: 'A-', addressLine: 'Vijayanagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560040' },
        { firstName: 'Prakash', lastName: 'Murthy', gender: 'male', dateOfBirth: '1959-08-08', phone: '9845880088', bloodGroup: 'O+', addressLine: 'Malleshwaram', city: 'Bengaluru', state: 'Karnataka', pincode: '560003' },
        { firstName: 'Anitha', lastName: 'Raj', gender: 'female', dateOfBirth: '1991-02-20', phone: '9845990099', bloodGroup: 'B+', addressLine: 'HSR Layout', city: 'Bengaluru', state: 'Karnataka', pincode: '560102' },
        { firstName: 'Vikram', lastName: 'Nair', gender: 'male', dateOfBirth: '1985-11-15', phone: '9846110011', bloodGroup: 'A+', addressLine: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560038' },
        { firstName: 'Shruti', lastName: 'Pai', gender: 'female', dateOfBirth: '2003-05-07', phone: '9846220022', bloodGroup: 'O-', addressLine: 'Rajajinagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560010' },
        { firstName: 'Mohan', lastName: 'Das', gender: 'male', dateOfBirth: '1972-07-23', phone: '9846330033', bloodGroup: 'AB-', addressLine: 'Yelahanka', city: 'Bengaluru', state: 'Karnataka', pincode: '560064' },
      ],
      // Self-registration is switched off here on purpose: the Patient registrations screen
      // needs an empty state to render somewhere, and this is the tenant that provides it.
      registrationRequests: [],
      bookingRequests: [
        { firstName: 'Shalini', lastName: 'Prabhu', phone: '9846440044', decision: 'pending' },
        { firstName: 'Ganesh', lastName: 'Rao', phone: '9846550055', note: 'Evening slot if possible', decision: 'pending' },
        { firstName: 'Meghana', lastName: 'Acharya', phone: '9846880088', decision: 'pending' },
        { firstName: 'Bhavana', lastName: 'Hegde', phone: '9846660066', decision: 'approved' },
        { firstName: 'Srinivas', lastName: 'Rao', phone: '9846990099', decision: 'approved' },
        { firstName: 'Naveen', lastName: 'Kumar', phone: '9846770077', decision: 'rejected', rejectionReason: 'Requested a service the clinic does not offer' },
      ],
      story: { historyDays: 14, visitsPerDay: 2, futureDays: 7, futureAppointments: 5 },
    },

    // -----------------------------------------------------------------------
    // Greenleaf — a suspended tenant. Configured, then switched off: the Admin console's
    // status filter needs a row on the other side, and a suspended hospital must still
    // render everywhere it appears.
    // -----------------------------------------------------------------------
    {
      code: 'GREENLEAF',
      name: 'Greenleaf Wellness Centre',
      kind: 'hospital',
      status: 'suspended',
      modules: ['patient', 'appointment', 'opd', 'emr'],
      branches: [{ code: 'MAIN', name: 'Indore (Main)' }],
      departments: [{ code: 'GENMED', name: 'General Medicine', specialty: 'general_medicine' }],
      users: [
        { email: 'admin@greenleaf.example', fullName: 'Dr. Sameera Qureshi', role: 'org_admin' },
        { email: 'reception@greenleaf.example', fullName: 'Ajay Malviya', role: 'receptionist' },
      ],
      providers: [
        { fullName: 'Dr. Sameera Qureshi', qualification: 'MBBS', registrationNumber: 'MPMC-2019-40011', specialty: 'general_medicine', userEmail: 'admin@greenleaf.example', consultationFeePaise: 30000 },
      ],
      patients: [
        { firstName: 'Ravi', lastName: 'Sharma', gender: 'male', dateOfBirth: '1990-06-15', phone: '9977110011', bloodGroup: 'B+', city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' },
        { firstName: 'Kalpana', lastName: 'Jain', gender: 'female', dateOfBirth: '1984-02-09', phone: '9977220022', bloodGroup: 'O+', city: 'Indore', state: 'Madhya Pradesh', pincode: '452010' },
      ],
      // Suspended before it ever ran a clinic — configuration only, no clinical history.
      story: false,
    },
  ],
};

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Refuses outright unless this really is a development database (ADR-058). The dataset below
  // invents hospitals, doctors and patients; against a live database that is unrecoverable, so
  // the check comes before the first write.
  requireEnvironment('development');
  // eslint-disable-next-line no-console
  console.log(describeTarget('development'));

  if (process.argv.includes('--reset')) {
    const tables = await resetSeedData();
    // eslint-disable-next-line no-console
    console.log(`  reset: emptied ${tables.length} tenant-scoped tables (catalogues kept)`);
  }

  const reports = await runSeed(DEVELOPMENT_DATASET);
  printReport(reports);

  /* eslint-disable no-console */
  console.log(`\nSign in with organisation code + email + "${PASSWORD}".`);
  console.log('  Portal   CITYCARE / admin@citycare.example      (busy hospital — every module on)');
  console.log('  Portal   SUNRISE  / admin@sunrise.example       (second tenant — isolation checks)');
  console.log('  Portal   LOTUS    / admin@lotus.example         (no pharmacy, no laboratory)');
  console.log('  Admin    NIROGIX  / jaivik@thefortunetech.com   (platform operator)');
  console.log('\nRe-run any time — it tops up what is missing. `-- --reset` starts from empty.');
  /* eslint-enable no-console */

  await pool.end();
  process.exit(0);
}

/**
 * Only when this file is the command being run. Importing it — a test reading the dataset, a
 * script reusing it — must not seed anything or refuse anything (ADR-132).
 */
if (require.main === module) {
  main().catch((err) => {
    // A refusal is a correct outcome, not a crash — say so plainly rather than printing a stack
    // trace that invites someone to "fix" the guard.
    if (err instanceof SeedRefused) {
      // eslint-disable-next-line no-console
      console.error(`\nseed refused: ${err.message}\n`);
      process.exit(2);
    }
    // eslint-disable-next-line no-console
    console.error('development seed failed:', err);
    process.exit(1);
  });
}
