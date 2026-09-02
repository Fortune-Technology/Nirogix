import 'dotenv/config';
import { pool } from '../db/client';
import { requireEnvironment, describeTarget, SeedRefused } from './seedGuard';
import { dayOffset, isoDate, printReport, resetSeedData, runSeed, type SeedDataset } from './seedKit';

/**
 * **The staging seeder** (ADR-058, ADR-114). One file, one environment.
 *
 * Shaped like production, sized for QA, and above all **deterministic**: the generator is
 * seeded from the tenant code and never consults the clock except for "today", so the same
 * script against an empty database always produces the same organisation, the same accounts,
 * the same UHIDs in the same order and the same queue. Automated E2E asserts against those
 * values, so this file is a contract — changing a name, a code or an ordering breaks
 * assertions elsewhere, and that is the intended trade.
 *
 * It is smaller than the development dataset but not thin. Staging is where the manual
 * regression script runs, and that script needs a filter to have both sides, a table to have a
 * second page, and a workflow to have a record sitting in each of its states. What it does not
 * need is volume for its own sake.
 *
 * As in every environment: **no real patient information, ever.**
 *
 *     npm run db:seed:staging --workspace=hms_backend
 *     CONFIRM_SEED_RESET=yes npm run db:seed:staging --workspace=hms_backend -- --reset
 */

/**
 * Fixed and known, because the E2E suite signs in with it. Staging sits behind access control
 * (deploy/README.md) and is never reachable from the public internet. Not a real credential.
 */
const STAGING_PASSWORD = 'StagingOnly#2026';

const QA_ROSTER = [
  ...[1, 2, 3, 4, 5, 6].flatMap((weekday) => [
    { weekday, startTime: '09:00', endTime: '13:00', slotMinutes: 15 },
    { weekday, startTime: '17:00', endTime: '20:00', slotMinutes: 15 },
  ]),
  { weekday: 0, startTime: '09:00', endTime: '13:00', slotMinutes: 15 },
];

const EXPIRY_SOON = isoDate(dayOffset(40));
const EXPIRY_FAR = isoDate(dayOffset(540));

export const STAGING_DATASET: SeedDataset = {
  environment: 'staging',
  password: STAGING_PASSWORD,
  tenants: [
    {
      // The vendor org, so operator-side flows are testable too. Its passwords are real on
      // staging, which is why no quick-login list ever offers them (ADR-080).
      code: 'NIROGIX',
      name: 'Nirogix',
      kind: 'platform',
      modules: [],
      users: [
        { email: 'jaivik@thefortunetech.com', fullName: 'Jaivik Patel', role: 'super_admin' },
        { email: 'nishant@thefortunetech.com', fullName: 'Nishant Patel', role: 'super_admin' },
      ],
    },
    {
      code: 'QAHOSP',
      name: 'QA General Hospital',
      kind: 'hospital',
      // `abdm` included (ADR-084) so QA can run the ABHA cases end to end. Which ABDM provider
      // staging talks to is configuration (`ABDM_PROVIDER`), not a seeding decision.
      modules: ['patient', 'appointment', 'opd', 'emr', 'pharmacy', 'laboratory', 'billing', 'abdm'],
      profile: {
        legalName: 'QA General Hospital Trust',
        addressLine1: '1, Quality Assurance Road',
        addressLine2: 'Satellite',
        city: 'Ahmedabad',
        state: 'Gujarat',
        postalCode: '380015',
        country: 'India',
        phone: '07900000000',
        email: 'qa.desk@qahospital.example',
        registrationNumber: 'QA-REG-HOSP-0001',
        gstin: '24AAQCQ0001Q1ZZ',
        letterheadHeader: 'QA General Hospital',
        letterheadFooter: 'QA Main Campus · QA Annexe Clinic',
        signatoryName: 'QA Org Admin',
        signatoryDesignation: 'Medical Superintendent',
      },
      branding: { brandColor: '#7C3AED', secondaryColor: '#0891B2' },
      selfRegistration: true,
      onlineBooking: true,
      selfCheckin: true,
      // A separate vitals step, because the **Vitals queue is empty in every other mode**
      // (ADR-133) and a QA environment that never set one had a permanently blank screen.
      // The hospital's own consultation and case vocabularies come with it, so the fee schedule's
      // two newest dimensions and the check-in form's type fields have something to offer.
      workflow: {
        vitalsMode: 'after_checkin',
        vitalsRequiredParams: ['bloodPressure'],
        vitalsOptionalParams: ['pulse', 'tempC', 'weightKg', 'spo2'],
        consultationTypes: ['First OPD', 'Review', 'Teleconsultation', 'Procedure'],
        caseTypes: ['Corporate', 'Insurance', 'Camp', 'Medico-legal'],
      },
      branches: [
        { code: 'QA-MAIN', name: 'QA Main Campus' },
        { code: 'QA-ANNEX', name: 'QA Annexe Clinic' },
        { code: 'QA-CLOSED', name: 'QA Retired Site', isActive: false },
      ],
      departments: [
        { code: 'QA-GEN', name: 'General Medicine', specialty: 'general_medicine' },
        { code: 'QA-CARD', name: 'Cardiology', specialty: 'cardiology' },
        { code: 'QA-PAED', name: 'Paediatrics', specialty: 'pediatrics' },
        { code: 'QA-ORTH', name: 'Orthopaedics', specialty: 'orthopedics' },
        { code: 'QA-OLD', name: 'Retired Department', specialty: 'general_medicine', isActive: false },
      ],
      // One account per role, so every permission boundary is testable in both directions.
      users: [
        { email: 'qa.admin@qahospital.example', fullName: 'QA Org Admin', role: 'org_admin' },
        { email: 'qa.branchadmin@qahospital.example', fullName: 'QA Branch Admin', role: 'branch_admin' },
        { email: 'qa.doctor@qahospital.example', fullName: 'QA Doctor', role: 'doctor' },
        { email: 'qa.doctor2@qahospital.example', fullName: 'QA Second Doctor', role: 'doctor' },
        { email: 'qa.reception@qahospital.example', fullName: 'QA Receptionist', role: 'receptionist' },
        { email: 'qa.pharmacist@qahospital.example', fullName: 'QA Pharmacist', role: 'pharmacist' },
        { email: 'qa.lab@qahospital.example', fullName: 'QA Lab Technician', role: 'lab_technician' },
        { email: 'qa.cashier@qahospital.example', fullName: 'QA Cashier', role: 'cashier' },
        { email: 'qa.disabled@qahospital.example', fullName: 'QA Disabled Account', role: 'receptionist', status: 'inactive' },
      ],
      providers: [
        { fullName: 'Dr QA Physician', qualification: 'MBBS, MD', registrationNumber: 'QA-REG-0001', specialty: 'general_medicine', userEmail: 'qa.doctor@qahospital.example', consultationFeePaise: 50000, schedule: QA_ROSTER },
        { fullName: 'Dr QA Cardiologist', qualification: 'MBBS, DM (Cardiology)', registrationNumber: 'QA-REG-0002', specialty: 'cardiology', userEmail: 'qa.doctor2@qahospital.example', consultationFeePaise: 80000, schedule: QA_ROSTER },
        // No roster: free-form booking has to stay testable alongside the roster rule.
        { fullName: 'Dr QA Paediatrician', qualification: 'MBBS, DCH', registrationNumber: 'QA-REG-0003', specialty: 'pediatrics', consultationFeePaise: 45000 },
        // Inactive: cannot be booked, but their past records must still render.
        { fullName: 'Dr QA Retired', qualification: 'MBBS', registrationNumber: 'QA-REG-0004', specialty: 'general_medicine', consultationFeePaise: 30000, isActive: false },
      ],
      labTests: [
        { name: 'Complete Blood Count', code: 'CBC', sampleType: 'blood', unit: 'cells/µL', refLow: '4000', refHigh: '11000', pricePaise: 35000 },
        { name: 'Hemoglobin', code: 'HB', sampleType: 'blood', unit: 'g/dL', refLow: '12', refHigh: '17', pricePaise: 20000 },
        { name: 'Fasting Blood Sugar', code: 'FBS', sampleType: 'blood', unit: 'mg/dL', refLow: '70', refHigh: '110', pricePaise: 15000 },
        { name: 'HbA1c', code: 'HBA1C', sampleType: 'blood', unit: '%', refLow: '4', refHigh: '5.7', pricePaise: 55000 },
        { name: 'Lipid Profile', code: 'LIPID', sampleType: 'blood', unit: 'mg/dL', refLow: '0', refHigh: '200', pricePaise: 60000 },
        { name: 'Thyroid Stimulating Hormone', code: 'TSH', sampleType: 'blood', unit: 'µIU/mL', refLow: '0.4', refHigh: '4.2', pricePaise: 35000 },
        { name: 'Urine Routine', code: 'URINE-R', sampleType: 'urine', unit: null, refLow: null, refHigh: null, pricePaise: 12000 },
        { name: 'Dengue NS1 Antigen', code: 'DENG-NS1', sampleType: 'blood', unit: null, refLow: null, refHigh: null, pricePaise: 90000 },
      ],
      // `department` is a department CODE from the list above, resolved at seed time (ADR-122).
      // QA-RETIRED deliberately has none: an unassigned service is a state the table renders too.
      services: [
        { code: 'QA-DRESS', name: 'Dressing (small)', pricePaise: 15000, department: 'QA-GEN' },
        { code: 'QA-INJ', name: 'Injection (intramuscular)', pricePaise: 5000, department: 'QA-GEN' },
        { code: 'QA-NEBU', name: 'Nebulisation', pricePaise: 20000, department: 'QA-PAED' },
        { code: 'QA-ECG', name: 'ECG (12 lead)', pricePaise: 30000, department: 'QA-CARD' },
        { code: 'QA-FOLLOWUP', name: 'Follow-up consultation', pricePaise: 20000, department: 'QA-GEN' },
        { code: 'QA-PHYSIO', name: 'Physiotherapy session', pricePaise: 45000, department: 'QA-ORTH' },
        { code: 'QA-RETIRED', name: 'Retired service', pricePaise: 99000, isActive: false },
      ],
      suppliers: [
        { name: 'QA Pharma Distributors', phone: '07911110000', email: 'qa.supplier1@example.com', gstin: '24AAQCS0001S1Z1', addressLine: 'QA Industrial Estate, Ahmedabad 382210' },
        { name: 'QA Surgical Supplies', phone: '07922220000', email: 'qa.supplier2@example.com', gstin: '24AAQCS0002S1Z2', addressLine: 'QA Trade Centre, Ahmedabad 380054' },
        { name: 'QA Cold Chain Agencies', phone: '07933330000', email: 'qa.supplier3@example.com', gstin: '24AAQCS0003S1Z3', addressLine: 'QA Logistics Park, Ahmedabad 382330' },
      ],
      drugs: [
        { name: 'Paracetamol 500 mg', form: 'tablet', strength: '500 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 200, taxRateBps: 500, reorderLevel: 100, batches: [{ batchNo: 'QA-PCM-01', expiryDate: EXPIRY_FAR, quantity: 400, costPricePaise: 120, supplier: 'QA Pharma Distributors' }, { batchNo: 'QA-PCM-02', expiryDate: EXPIRY_SOON, quantity: 50, costPricePaise: 118, supplier: 'QA Pharma Distributors' }] },
        { name: 'Amoxicillin 500 mg', form: 'capsule', strength: '500 mg', unit: 'capsule', hsnSac: '3004', unitPricePaise: 1200, taxRateBps: 1200, reorderLevel: 60, batches: [{ batchNo: 'QA-AMX-01', expiryDate: EXPIRY_FAR, quantity: 240, costPricePaise: 800, supplier: 'QA Pharma Distributors' }] },
        { name: 'Cetirizine 10 mg', form: 'tablet', strength: '10 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 300, taxRateBps: 500, reorderLevel: 50, batches: [{ batchNo: 'QA-CTZ-01', expiryDate: EXPIRY_FAR, quantity: 300, costPricePaise: 180, supplier: 'QA Pharma Distributors' }] },
        { name: 'Pantoprazole 40 mg', form: 'tablet', strength: '40 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 800, taxRateBps: 1200, reorderLevel: 60, batches: [{ batchNo: 'QA-PAN-01', expiryDate: EXPIRY_FAR, quantity: 260, costPricePaise: 500, supplier: 'QA Surgical Supplies' }] },
        { name: 'ORS Sachet 21 g', form: 'sachet', strength: '21 g', unit: 'sachet', hsnSac: '3004', unitPricePaise: 1800, taxRateBps: 500, reorderLevel: 40, batches: [{ batchNo: 'QA-ORS-01', expiryDate: EXPIRY_FAR, quantity: 150, costPricePaise: 1100, supplier: 'QA Cold Chain Agencies' }] },
        { name: 'Metformin 500 mg', form: 'tablet', strength: '500 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 400, taxRateBps: 500, reorderLevel: 80, batches: [{ batchNo: 'QA-MET-01', expiryDate: EXPIRY_FAR, quantity: 420, costPricePaise: 230, supplier: 'QA Pharma Distributors' }] },
        { name: 'Amlodipine 5 mg', form: 'tablet', strength: '5 mg', unit: 'tablet', hsnSac: '3004', unitPricePaise: 350, taxRateBps: 500, reorderLevel: 70, batches: [{ batchNo: 'QA-AML-01', expiryDate: EXPIRY_FAR, quantity: 360, costPricePaise: 190, supplier: 'QA Pharma Distributors' }] },
        // Below its reorder level on purpose: the low-stock tile needs a row it can point at.
        { name: 'Salbutamol Inhaler 100 mcg', form: 'inhaler', strength: '100 mcg', unit: 'inhaler', hsnSac: '3004', unitPricePaise: 21000, taxRateBps: 1200, reorderLevel: 20, batches: [{ batchNo: 'QA-SAL-01', expiryDate: EXPIRY_SOON, quantity: 6, costPricePaise: 16500, supplier: 'QA Surgical Supplies' }] },
      ],
      /**
       * The first two are the long-standing E2E fixtures and their names are asserted on —
       * leave them first and leave them spelled exactly this way. The rest carry ordinary
       * names so the tables, sorting and search behave the way they will in production, and
       * are still unmistakably synthetic on inspection.
       */
      patients: [
        { firstName: 'QA Patient', lastName: 'One', gender: 'female', dateOfBirth: '1990-01-01', phone: '+919000000001', email: 'qa.patient.one@example.com', bloodGroup: 'O+', addressLine: '1 QA Street', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
        { firstName: 'QA Patient', lastName: 'Two', gender: 'male', dateOfBirth: '1985-05-05', phone: '+919000000002', bloodGroup: 'B+', addressLine: '2 QA Street', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
        { firstName: 'Rakesh', lastName: 'Panchal', gender: 'male', dateOfBirth: '1979-03-11', phone: '+919000000003', bloodGroup: 'A+', addressLine: 'Vastrapur', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
        { firstName: 'Sonal', lastName: 'Mehta', gender: 'female', dateOfBirth: '1992-08-24', phone: '+919000000004', email: 'sonal.mehta@example.com', bloodGroup: 'AB+', addressLine: 'Navrangpura', city: 'Ahmedabad', state: 'Gujarat', pincode: '380009' },
        { firstName: 'Imtiaz', lastName: 'Sheikh', gender: 'male', dateOfBirth: '1968-12-02', phone: '+919000000005', bloodGroup: 'O-', addressLine: 'Maninagar', city: 'Ahmedabad', state: 'Gujarat', pincode: '380008' },
        { firstName: 'Bhavna', lastName: 'Rathod', gender: 'female', dateOfBirth: '1987-06-30', phone: '+919000000006', bloodGroup: 'B-', addressLine: 'Bodakdev', city: 'Ahmedabad', state: 'Gujarat', pincode: '380054' },
        { firstName: 'Aryan', lastName: 'Desai', gender: 'male', dateOfBirth: '2017-04-16', phone: '+919000000007', bloodGroup: 'A-', addressLine: 'Thaltej', city: 'Ahmedabad', state: 'Gujarat', pincode: '380059', immunizations: [
          { vaccineCode: 'BCG', vaccineName: 'BCG', dateGiven: '2017-04-18', doseLabel: 'Birth' },
          { vaccineCode: 'HEPB', vaccineName: 'Hepatitis B', dateGiven: '2017-04-18', doseLabel: 'Birth dose' },
          { vaccineCode: 'OPV', vaccineName: 'Oral Polio Vaccine', dateGiven: '2017-06-01', doseLabel: 'OPV-1' },
          { vaccineCode: 'PENTA', vaccineName: 'Pentavalent', dateGiven: '2017-06-01', doseLabel: 'Dose 1' },
          { vaccineCode: 'MR', vaccineName: 'Measles-Rubella', dateGiven: '2018-05-10', doseLabel: 'Dose 1' },
        ] },
        { firstName: 'Kinjal', lastName: 'Shah', gender: 'female', dateOfBirth: '1996-10-08', phone: '+919000000008', bloodGroup: 'O+', addressLine: 'Paldi', city: 'Ahmedabad', state: 'Gujarat', pincode: '380007' },
        { firstName: 'Devang', lastName: 'Joshi', gender: 'male', dateOfBirth: '1974-01-19', phone: '+919000000009', bloodGroup: 'AB-', addressLine: 'Gota', city: 'Ahmedabad', state: 'Gujarat', pincode: '382481' },
        { firstName: 'Payal', lastName: 'Chauhan', gender: 'female', dateOfBirth: '2001-07-27', phone: '+919000000010', bloodGroup: 'A+', addressLine: 'Bopal', city: 'Ahmedabad', state: 'Gujarat', pincode: '380058' },
        { firstName: 'Nirmal', lastName: 'Bhavsar', gender: 'male', dateOfBirth: '1962-09-13', phone: '+919000000011', bloodGroup: 'B+', addressLine: 'Sector 21', city: 'Gandhinagar', state: 'Gujarat', pincode: '382021' },
        { firstName: 'Ruchi', lastName: 'Parmar', gender: 'female', dateOfBirth: '1989-02-05', phone: '+919000000012', bloodGroup: 'O+', addressLine: 'Sabarmati', city: 'Gandhinagar', state: 'Gujarat', pincode: '382007' },
        { firstName: 'Salim', lastName: 'Mirza', gender: 'other', dateOfBirth: '1983-11-21', phone: '+919000000013', bloodGroup: 'A+', addressLine: 'Nikol', city: 'Ahmedabad', state: 'Gujarat', pincode: '382350' },
        // Deactivated chart — the Patients status filter needs its other side.
        { firstName: 'Hasmukh', lastName: 'Patel', gender: 'male', dateOfBirth: '1955-05-09', phone: '+919000000014', bloodGroup: 'B+', addressLine: 'Ellis Bridge', city: 'Ahmedabad', state: 'Gujarat', pincode: '380006', status: 'inactive' },
        // A second page of patients, and enough variety for the list's filters to cut on
        // something (ADR-132). Deliberately ordinary names: the tables, sorting and search behave
        // the way they will in production, and every one is still unmistakably synthetic.
        { firstName: 'Falguni', lastName: 'Dave', gender: 'female', dateOfBirth: '1991-11-11', phone: '+919000000301', bloodGroup: 'A+', addressLine: 'Vejalpur', city: 'Ahmedabad', state: 'Gujarat', pincode: '380051' },
        { firstName: 'Yashpal', lastName: 'Rana', gender: 'male', dateOfBirth: '1966-02-18', phone: '+919000000302', bloodGroup: 'B+', addressLine: 'Ranip', city: 'Ahmedabad', state: 'Gujarat', pincode: '382480' },
        { firstName: 'Alpa', lastName: 'Trivedi', gender: 'female', dateOfBirth: '1984-07-04', phone: '+919000000303', email: 'alpa.trivedi@example.com', bloodGroup: 'O+', addressLine: 'Chandkheda', city: 'Ahmedabad', state: 'Gujarat', pincode: '382424' },
        { firstName: 'Mitesh', lastName: 'Barot', gender: 'male', dateOfBirth: '1997-01-29', phone: '+919000000304', bloodGroup: 'AB+', addressLine: 'Nikol', city: 'Ahmedabad', state: 'Gujarat', pincode: '382350' },
        { firstName: 'Hetal', lastName: 'Modi', gender: 'female', dateOfBirth: '1973-09-16', phone: '+919000000305', bloodGroup: 'A-', addressLine: 'Ghatlodia', city: 'Ahmedabad', state: 'Gujarat', pincode: '380061' },
        { firstName: 'Chirag', lastName: 'Suthar', gender: 'male', dateOfBirth: '2005-03-22', phone: '+919000000306', bloodGroup: 'O+', addressLine: 'Sola', city: 'Ahmedabad', state: 'Gujarat', pincode: '380060', immunizations: [
          { vaccineCode: 'BCG', vaccineName: 'BCG', dateGiven: '2005-03-24', doseLabel: 'Birth' },
          { vaccineCode: 'MR', vaccineName: 'Measles-Rubella', dateGiven: '2006-04-10', doseLabel: 'Dose 1' },
        ] },
        { firstName: 'Rekha', lastName: 'Vaghela', gender: 'female', dateOfBirth: '1959-12-08', phone: '+919000000307', bloodGroup: 'B-', addressLine: 'Saraspur', city: 'Ahmedabad', state: 'Gujarat', pincode: '380018' },
        { firstName: 'Paresh', lastName: 'Thakkar', gender: 'male', dateOfBirth: '1980-05-14', phone: '+919000000308', bloodGroup: 'A+', addressLine: 'Naroda', city: 'Ahmedabad', state: 'Gujarat', pincode: '382330' },
        { firstName: 'Vaishali', lastName: 'Gohel', gender: 'female', dateOfBirth: '1994-08-03', phone: '+919000000309', email: 'vaishali.gohel@example.com', bloodGroup: 'AB-', addressLine: 'Sector 7', city: 'Gandhinagar', state: 'Gujarat', pincode: '382007' },
        { firstName: 'Ketan', lastName: 'Solanki', gender: 'male', dateOfBirth: '1970-10-27', phone: '+919000000310', bloodGroup: 'O-', addressLine: 'Sector 16', city: 'Gandhinagar', state: 'Gujarat', pincode: '382016' },
        { firstName: 'Urvashi', lastName: 'Pandya', gender: 'female', dateOfBirth: '2000-04-19', phone: '+919000000311', bloodGroup: 'B+', addressLine: 'Kalol Road', city: 'Gandhinagar', state: 'Gujarat', pincode: '382721' },
        { firstName: 'Anand', lastName: 'Prajapati', gender: 'male', dateOfBirth: '1988-06-11', phone: '+919000000312', bloodGroup: 'A+', addressLine: 'Adalaj', city: 'Gandhinagar', state: 'Gujarat', pincode: '382421' },
        // The two newest charts stay activity-free: an empty patient detail page is a state too.
        { firstName: 'Trupti', lastName: 'Raval', gender: 'female', dateOfBirth: '1998-03-03', phone: '+919000000015', bloodGroup: 'O+', addressLine: 'Naranpura', city: 'Ahmedabad', state: 'Gujarat', pincode: '380013' },
        { firstName: 'Jignesh', lastName: 'Chokshi', gender: 'male', dateOfBirth: '1977-08-17', phone: '+919000000016', bloodGroup: 'A+', addressLine: 'Ambawadi', city: 'Ahmedabad', state: 'Gujarat', pincode: '380006' },
      ],
      registrationRequests: [
        { firstName: 'QA Walkin', lastName: 'Pending One', gender: 'female', dateOfBirth: '1994-04-04', phone: '+919000001001', city: 'Ahmedabad', note: 'Submitted from the QR poster', decision: 'pending' },
        { firstName: 'QA Walkin', lastName: 'Pending Two', gender: 'male', dateOfBirth: '1986-06-06', phone: '+919000001002', city: 'Ahmedabad', decision: 'pending' },
        { firstName: 'QA Walkin', lastName: 'Pending Three', gender: 'female', dateOfBirth: '1999-09-09', phone: '+919000001003', city: 'Gandhinagar', decision: 'pending' },
        { firstName: 'QA Walkin', lastName: 'Approved One', gender: 'male', dateOfBirth: '1981-01-11', phone: '+919000001004', city: 'Ahmedabad', decision: 'approved' },
        { firstName: 'QA Walkin', lastName: 'Approved Two', gender: 'female', dateOfBirth: '1975-02-12', phone: '+919000001005', city: 'Ahmedabad', decision: 'approved' },
        { firstName: 'QA Walkin', lastName: 'Rejected One', gender: 'male', phone: '+919000001006', city: 'Ahmedabad', decision: 'rejected', rejectionReason: 'Incomplete details on the form' },
        { firstName: 'QA Walkin', lastName: 'Rejected Two', gender: 'female', phone: '+919000001007', city: 'Ahmedabad', decision: 'rejected', rejectionReason: 'Duplicate of an existing chart' },
      ],
      bookingRequests: [
        { firstName: 'QA Booking', lastName: 'Pending One', phone: '+919000002001', email: 'qa.booking1@example.com', note: 'Morning slot preferred', decision: 'pending' },
        { firstName: 'QA Booking', lastName: 'Pending Two', phone: '+919000002002', decision: 'pending' },
        { firstName: 'QA Booking', lastName: 'Pending Three', phone: '+919000002003', note: 'Cardiology follow-up', decision: 'pending' },
        { firstName: 'QA Booking', lastName: 'Approved One', phone: '+919000002004', decision: 'approved' },
        { firstName: 'QA Booking', lastName: 'Approved Two', phone: '+919000002005', decision: 'approved' },
        { firstName: 'QA Booking', lastName: 'Rejected One', phone: '+919000002006', decision: 'rejected', rejectionReason: 'No slot available on the requested day' },
        { firstName: 'QA Booking', lastName: 'Rejected Two', phone: '+919000002007', decision: 'rejected', rejectionReason: 'Could not be reached to confirm' },
      ],
      // Matched to the busiest development hospital (ADR-132): six weeks of completed traffic at
      // three visits a day is what gives a dashboard a real trend, a collections report a range
      // worth summing, and the Visits table more than one page.
      story: { historyDays: 42, visitsPerDay: 3, futureDays: 14, futureAppointments: 12 },
    },

    // ---------------------------------------------------------------------------------------
    // A SECOND hospital. Staging had exactly one, which meant the two things a multi-tenant
    // platform must be tested for could not be tested on it at all: that one hospital cannot
    // see another's data, and that a module a hospital has not bought is genuinely absent.
    //
    // Pharmacy and laboratory are OFF here, so this tenant proves both at once (ADR-132).
    // ---------------------------------------------------------------------------------------
    {
      code: 'QACLINIC',
      name: 'QA Family Clinic',
      kind: 'hospital',
      modules: ['patient', 'appointment', 'opd', 'emr', 'billing'],
      profile: {
        legalName: 'QA Family Clinic LLP',
        addressLine1: '9, Quality Lane',
        addressLine2: 'Prahlad Nagar',
        city: 'Ahmedabad',
        state: 'Gujarat',
        postalCode: '380015',
        country: 'India',
        phone: '07944440000',
        email: 'qa.clinic@qaclinic.example',
        registrationNumber: 'QA-REG-CLIN-0002',
        gstin: '24AAQCQ0002Q1ZZ',
      },
      branding: { brandColor: '#B45309', secondaryColor: '#0F766E' },
      // Off here on purpose: the Patient registrations screen needs an empty state somewhere,
      // and a hospital with the feature switched off is where it comes from.
      selfRegistration: false,
      onlineBooking: true,
      branches: [{ code: 'QC-MAIN', name: 'QA Clinic Main' }],
      departments: [
        { code: 'QC-GEN', name: 'General Medicine', specialty: 'general_medicine' },
        { code: 'QC-PAED', name: 'Paediatrics', specialty: 'pediatrics' },
      ],
      users: [
        { email: 'qc.admin@qaclinic.example', fullName: 'QC Org Admin', role: 'org_admin' },
        { email: 'qc.doctor@qaclinic.example', fullName: 'QC Doctor', role: 'doctor' },
        { email: 'qc.reception@qaclinic.example', fullName: 'QC Receptionist', role: 'receptionist' },
        { email: 'qc.cashier@qaclinic.example', fullName: 'QC Cashier', role: 'cashier' },
      ],
      providers: [
        { fullName: 'Dr QC Physician', qualification: 'MBBS, MD', registrationNumber: 'QC-REG-0001', specialty: 'general_medicine', userEmail: 'qc.doctor@qaclinic.example', consultationFeePaise: 40000, schedule: QA_ROSTER },
        { fullName: 'Dr QC Paediatrician', qualification: 'MBBS, DCH', registrationNumber: 'QC-REG-0002', specialty: 'pediatrics', consultationFeePaise: 35000 },
      ],
      services: [
        { code: 'QC-FOLLOWUP', name: 'Follow-up consultation', pricePaise: 20000, department: 'QC-GEN' },
        { code: 'QC-DRESS', name: 'Dressing (small)', pricePaise: 15000, department: 'QC-GEN' },
        { code: 'QC-VACC', name: 'Vaccination visit', pricePaise: 25000, department: 'QC-PAED' },
      ],
      patients: [
        { firstName: 'Nilesh', lastName: 'Chavda', gender: 'male', dateOfBirth: '1982-04-06', phone: '+919000000401', bloodGroup: 'B+', addressLine: 'Prahlad Nagar', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
        { firstName: 'Asmita', lastName: 'Raval', gender: 'female', dateOfBirth: '1990-09-21', phone: '+919000000402', email: 'asmita.raval@example.com', bloodGroup: 'O+', addressLine: 'Satellite', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
        { firstName: 'Tejas', lastName: 'Bhatt', gender: 'male', dateOfBirth: '1975-01-13', phone: '+919000000403', bloodGroup: 'A+', addressLine: 'Vastrapur', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
        { firstName: 'Krupa', lastName: 'Shah', gender: 'female', dateOfBirth: '2018-07-30', phone: '+919000000404', bloodGroup: 'AB+', addressLine: 'Bodakdev', city: 'Ahmedabad', state: 'Gujarat', pincode: '380054', immunizations: [
          { vaccineCode: 'BCG', vaccineName: 'BCG', dateGiven: '2018-08-01', doseLabel: 'Birth' },
          { vaccineCode: 'PENTA', vaccineName: 'Pentavalent', dateGiven: '2018-09-15', doseLabel: 'Dose 1' },
        ] },
        { firstName: 'Rajendra', lastName: 'Mehta', gender: 'male', dateOfBirth: '1961-03-02', phone: '+919000000405', bloodGroup: 'O-', addressLine: 'Ambawadi', city: 'Ahmedabad', state: 'Gujarat', pincode: '380006' },
        { firstName: 'Dhara', lastName: 'Patel', gender: 'female', dateOfBirth: '1996-12-25', phone: '+919000000406', bloodGroup: 'B-', addressLine: 'Thaltej', city: 'Ahmedabad', state: 'Gujarat', pincode: '380059' },
        { firstName: 'Sanjay', lastName: 'Desai', gender: 'male', dateOfBirth: '1979-05-17', phone: '+919000000407', bloodGroup: 'A-', addressLine: 'Gota', city: 'Ahmedabad', state: 'Gujarat', pincode: '382481' },
        { firstName: 'Poonam', lastName: 'Joshi', gender: 'female', dateOfBirth: '1987-08-09', phone: '+919000000408', bloodGroup: 'O+', addressLine: 'Paldi', city: 'Ahmedabad', state: 'Gujarat', pincode: '380007' },
        // Activity-free, for the same reason as QAHOSP's last two.
        { firstName: 'Bhargav', lastName: 'Oza', gender: 'male', dateOfBirth: '1993-02-14', phone: '+919000000409', bloodGroup: 'A+', addressLine: 'Navrangpura', city: 'Ahmedabad', state: 'Gujarat', pincode: '380009' },
        { firstName: 'Shital', lastName: 'Panchal', gender: 'female', dateOfBirth: '1999-06-06', phone: '+919000000410', bloodGroup: 'B+', addressLine: 'Maninagar', city: 'Ahmedabad', state: 'Gujarat', pincode: '380008' },
      ],
      registrationRequests: [],
      bookingRequests: [
        { firstName: 'QC Booking', lastName: 'Pending One', phone: '+919000002101', decision: 'pending' },
        { firstName: 'QC Booking', lastName: 'Pending Two', phone: '+919000002102', note: 'Paediatric review', decision: 'pending' },
        { firstName: 'QC Booking', lastName: 'Approved One', phone: '+919000002103', decision: 'approved' },
        { firstName: 'QC Booking', lastName: 'Rejected One', phone: '+919000002104', decision: 'rejected', rejectionReason: 'The clinic does not offer that service' },
      ],
      story: { historyDays: 21, visitsPerDay: 2, futureDays: 10, futureAppointments: 6 },
    },

    // ---------------------------------------------------------------------------------------
    // A suspended hospital. Configured, then switched off: the Admin console's status filter
    // needs a row on the other side, and a suspended hospital must still render everywhere it
    // appears rather than breaking a screen.
    // ---------------------------------------------------------------------------------------
    {
      code: 'QACLOSED',
      name: 'QA Retired Hospital',
      kind: 'hospital',
      status: 'suspended',
      modules: ['patient', 'appointment', 'opd', 'emr'],
      branches: [{ code: 'QR-MAIN', name: 'QA Retired Main' }],
      departments: [{ code: 'QR-GEN', name: 'General Medicine', specialty: 'general_medicine' }],
      users: [
        { email: 'qr.admin@qaretired.example', fullName: 'QR Org Admin', role: 'org_admin' },
        { email: 'qr.reception@qaretired.example', fullName: 'QR Receptionist', role: 'receptionist' },
      ],
      providers: [
        { fullName: 'Dr QR Physician', qualification: 'MBBS', registrationNumber: 'QR-REG-0001', specialty: 'general_medicine', userEmail: 'qr.admin@qaretired.example', consultationFeePaise: 30000 },
      ],
      patients: [
        { firstName: 'QA Retired', lastName: 'Patient One', gender: 'male', dateOfBirth: '1985-01-01', phone: '+919000000501', bloodGroup: 'B+', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
        { firstName: 'QA Retired', lastName: 'Patient Two', gender: 'female', dateOfBirth: '1978-02-02', phone: '+919000000502', bloodGroup: 'O+', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
      ],
      // Suspended before it ever ran a clinic — configuration only, no clinical history.
      story: false,
    },
  ],
};

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  requireEnvironment('staging');
  // eslint-disable-next-line no-console
  console.log(describeTarget('staging'));

  if (process.argv.includes('--reset')) {
    // Staging is shared. Someone else's regression run is the thing a careless reset destroys,
    // so the flag alone is not enough here — unlike development, where the database is yours.
    if (process.env.CONFIRM_SEED_RESET !== 'yes') {
      throw new SeedRefused(
        'Resetting staging empties every tenant table, including whatever QA is part-way through. ' +
          'Re-run with CONFIRM_SEED_RESET=yes once you have told the people using it.',
      );
    }
    const tables = await resetSeedData();
    // eslint-disable-next-line no-console
    console.log(`  reset: emptied ${tables.length} tenant-scoped tables (catalogues kept)`);
  }

  const reports = await runSeed(STAGING_DATASET);
  printReport(reports);

  /* eslint-disable no-console */
  console.log('\nDeterministic staging dataset ready.');
  console.log('  Portal  QAHOSP   / qa.admin@qahospital.example   (every role has a qa.* account)');
  console.log('  Portal  QACLINIC / qc.admin@qaclinic.example     (no pharmacy, no laboratory)');
  console.log('  Portal  QACLOSED / qr.admin@qaretired.example    (suspended hospital)');
  console.log('  Admin   NIROGIX  / the operator accounts — their real staging passwords are not in this repo.');
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
    if (err instanceof SeedRefused) {
      // eslint-disable-next-line no-console
      console.error(`\nseed refused: ${err.message}\n`);
      process.exit(2);
    }
    // eslint-disable-next-line no-console
    console.error('staging seed failed:', err);
    process.exit(1);
  });
}
