import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import * as bulk from '../registryBulk.service';

/**
 * Bulk onboarding through ABDM's portal (ADR-098).
 *
 * The export is bookkeeping. **The import is where somebody gets hurt**, and it is the mirror of
 * M3's disclosure risk: an HPR id attached to the wrong clinician gives one real person's national
 * identity to another, and nothing downstream would ever flag it.
 *
 * So most of this suite is about matching *refusing* — two people with the same name, an id for
 * somebody who does not work here, a blank result cell. A row a human has to look at is a nuisance;
 * a wrongly-matched row is a defect nobody notices.
 */

const CODE = 'ABDMBULK';
const C = bulk.PROFESSIONAL_COLUMNS;

let ready = false;
let tenantId = '';
let anitaId = '';

const row = (over: Partial<Record<string, string>> = {}): bulk.BulkRow => ({
  [C.fullName]: 'Anita Desai',
  [C.category]: 'doctor',
  [C.registrationCouncil]: 'Maharashtra Medical Council',
  [C.registrationNumber]: 'MMC-111',
  [C.systemOfMedicine]: 'Modern Medicine',
  [C.email]: 'anita@nirogix.test',
  [C.mobile]: '9822011122',
  [C.hprId]: '71-1111-2222-3333',
  ...over,
});

const addDoctor = async (name: string, regNo: string | null, active = true): Promise<string> => {
  const r = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, registration_number, is_active)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [tenantId, name, regNo, active],
  );
  return r.rows[0].id as string;
};

const hprIdOf = async (providerId: string): Promise<string | null> =>
  (await pool.query('SELECT hpr_id FROM abdm_staff_hpr WHERE provider_id = $1', [providerId])).rows[0]?.hpr_id ?? null;

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'abdm');
  anitaId = await addDoctor('Anita Desai', 'MMC-111');
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
});

describe('the export', () => {
  test('carries the roster with the id column left blank', async ({ skip }) => {
    if (!ready) return skip();
    const rows = await bulk.exportProfessionals(tenantId);
    const anita = rows.find((r) => r[C.fullName] === 'Anita Desai')!;

    expect(anita[C.registrationNumber]).toBe('MMC-111');
    // The portal fills this; we read it back on import.
    expect(anita[C.hprId]).toBe('');
  });

  test('excludes anyone who already holds an HPR id', async ({ skip }) => {
    if (!ready) return skip();
    const done = await addDoctor('Already Registered', 'MMC-999');
    await pool.query(
      `INSERT INTO abdm_staff_hpr (tenant_id, provider_id, hpr_id, status) VALUES ($1,$2,'71-0000-0000-0000','registered')`,
      [tenantId, done],
    );

    const rows = await bulk.exportProfessionals(tenantId);
    // Submitting them again invites the portal to mint a second national identity.
    expect(rows.some((r) => r[C.fullName] === 'Already Registered')).toBe(false);
  });

  test('excludes inactive staff', async ({ skip }) => {
    if (!ready) return skip();
    await addDoctor('Left The Hospital', 'MMC-888', false);
    const rows = await bulk.exportProfessionals(tenantId);
    expect(rows.some((r) => r[C.fullName] === 'Left The Hospital')).toBe(false);
  });
});

describe('the import matches strictly', () => {
  test('a registration number is the strong key', async ({ skip }) => {
    if (!ready) return skip();
    const outcome = await bulk.importProfessionalResults(tenantId, null, [row()]);

    expect(outcome.matched).toBe(1);
    expect(await hprIdOf(anitaId)).toBe('71-1111-2222-3333');
  });

  test('an exact name works when the number finds nobody', async ({ skip }) => {
    if (!ready) return skip();
    const solo = await addDoctor('Vikram Solo', null);
    const outcome = await bulk.importProfessionalResults(tenantId, null, [
      row({ [C.fullName]: 'Vikram Solo', [C.registrationNumber]: '', [C.hprId]: '71-4444-5555-6666' }),
    ]);

    expect(outcome.matched).toBe(1);
    expect(await hprIdOf(solo)).toBe('71-4444-5555-6666');
  });

  test('TWO people with the same name are refused, not guessed', async ({ skip }) => {
    if (!ready) return skip();
    const twinA = await addDoctor('Rahul Sharma', null);
    const twinB = await addDoctor('Rahul Sharma', null);

    const outcome = await bulk.importProfessionalResults(tenantId, null, [
      row({ [C.fullName]: 'Rahul Sharma', [C.registrationNumber]: '', [C.hprId]: '71-7777-8888-9999' }),
    ]);

    // Handing one real person's national identity to another is a defect nobody would notice.
    expect(outcome.matched).toBe(0);
    expect(outcome.ambiguous).toHaveLength(1);
    expect(outcome.ambiguous[0]!.candidates).toBe(2);
    expect(await hprIdOf(twinA)).toBeNull();
    expect(await hprIdOf(twinB)).toBeNull();
  });

  test('somebody who does not work here is reported, not created', async ({ skip }) => {
    if (!ready) return skip();
    const before = await pool.query('SELECT count(*)::int AS n FROM abdm_staff_hpr WHERE tenant_id = $1', [tenantId]);
    const outcome = await bulk.importProfessionalResults(tenantId, null, [
      row({ [C.fullName]: 'Somebody Else', [C.registrationNumber]: 'NOT-OURS', [C.hprId]: '71-0001-0002-0003' }),
    ]);

    expect(outcome.matched).toBe(0);
    expect(outcome.unmatched[0]!.reason).toMatch(/No active staff member/);
    const after = await pool.query('SELECT count(*)::int AS n FROM abdm_staff_hpr WHERE tenant_id = $1', [tenantId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  test('a row the portal did not issue an id for is skipped', async ({ skip }) => {
    if (!ready) return skip();
    const outcome = await bulk.importProfessionalResults(tenantId, null, [row({ [C.hprId]: '' })]);
    expect(outcome.matched).toBe(0);
    expect(outcome.unmatched[0]!.reason).toMatch(/no HPR id/i);
  });

  test('a partial name never matches', async ({ skip }) => {
    if (!ready) return skip();
    // "Close enough" is exactly the wrong standard when the payload is somebody's identity.
    const outcome = await bulk.importProfessionalResults(tenantId, null, [
      row({ [C.fullName]: 'Anita', [C.registrationNumber]: '', [C.hprId]: '71-9999-9999-9999' }),
    ]);
    expect(outcome.matched).toBe(0);
    expect(outcome.unmatched).toHaveLength(1);
  });

  test('the row number reported is the one the administrator sees', async ({ skip }) => {
    if (!ready) return skip();
    const outcome = await bulk.importProfessionalResults(tenantId, null, [
      row({ [C.hprId]: '' }),
      row({ [C.fullName]: 'Nobody At All', [C.registrationNumber]: 'X', [C.hprId]: '71-1-1-1' }),
    ]);
    // Header is line 1, so the first data row is line 2 — as it appears in their spreadsheet.
    expect(outcome.unmatched.map((u) => u.row)).toEqual([2, 3]);
  });

  test('the audit records counts, never the file', async ({ skip }) => {
    if (!ready) return skip();
    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.hpr.bulk_imported' ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );
    const metadata = JSON.stringify(audit.rows[0].metadata);
    expect(metadata).toContain('matched');
    // The spreadsheet holds identities; it does not belong in an audit row.
    expect(metadata).not.toContain('Anita');
    expect(metadata).not.toContain('71-');
  });
});

describe('facilities import the same way', () => {
  test('a name that matches one registration is filled in', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query(
      `INSERT INTO abdm_facility_registry (tenant_id, facility_name, status) VALUES ($1,'City Hospital','submitted')`,
      [tenantId],
    );
    const F = bulk.FACILITY_COLUMNS;
    const outcome = await bulk.importFacilityResults(tenantId, null, [
      { [F.facilityName]: 'City Hospital', [F.facilityId]: 'IN0710-BULK-1' },
    ]);

    expect(outcome.matched).toBe(1);
    const row = await pool.query('SELECT facility_id, status FROM abdm_facility_registry WHERE tenant_id = $1', [tenantId]);
    expect(row.rows[0].facility_id).toBe('IN0710-BULK-1');
    expect(row.rows[0].status).toBe('verified');
  });
});
