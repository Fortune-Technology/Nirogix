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
      story: { historyDays: 21, visitsPerDay: 2, futureDays: 10, futureAppointments: 8 },
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
  console.log('  Portal  QAHOSP / qa.admin@qahospital.example  (and the qa.* account for every role)');
  console.log('  Admin   NIROGIX / the operator accounts — their real staging passwords are not in this repo.');
  /* eslint-enable no-console */

  await pool.end();
  process.exit(0);
}

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
