import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { getFacilityConfig, upsertFacilityConfig } from '../abdm.service';
import * as hfr from '../hfr.service';

/**
 * Listing the hospital in the Health Facility Registry (ADR-096).
 *
 * M4 moves no patient data, so this suite is not about disclosure — it is about **not lying to an
 * administrator**. The two things that would actually hurt are showing a facility as approved when a
 * verifier has not looked at it, and silently swapping the `hipId` that M1–M3 are already running
 * on. Both are pinned below.
 *
 * `submitRegistration` is not exercised here: it makes four live calls to a government sandbox, and
 * a test that registered a fictional hospital in a national registry on every `npm test` would be a
 * genuinely bad idea. What is asserted is everything around it — the draft, the status machine, the
 * refusals and the hipId adoption — which is the half that is ours to get wrong.
 */

const CODE = 'ABDMHFR';

let ready = false;
let tenantId = '';

const draft = (over: Partial<hfr.FacilityDraft> = {}): hfr.FacilityDraft => ({
  facilityName: 'Nirogix Test Hospital',
  ownershipCode: 'O2',
  facilityTypeCode: 'FT1',
  systemOfMedicineCode: 'M1',
  address: {
    stateLGDCode: '27',
    districtLGDCode: '520',
    addressLine1: '7 Park Street',
    pincode: '440001',
  },
  contact: { facilityEmailId: 'facility@nirogix.test', facilityContactNumber: '9822011122' },
  ...over,
});

const statusOf = async (): Promise<string | null> =>
  (await hfr.findRegistration(tenantId, null))?.status ?? null;

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'abdm');
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
});

describe('the draft', () => {
  test('saves without contacting HFR', async ({ skip }) => {
    if (!ready) return skip();
    const saved = await hfr.saveDraft(tenantId, null, draft());

    expect(saved.status).toBe('draft');
    // Nothing has been sent, so there is nothing HFR could have named it.
    expect(saved.trackingId).toBeNull();
    expect(saved.facilityId).toBeNull();
  });

  test('re-saving updates rather than duplicating', async ({ skip }) => {
    if (!ready) return skip();
    await hfr.saveDraft(tenantId, null, draft({ facilityName: 'Renamed Hospital' }));
    const rows = await pool.query(
      'SELECT facility_name FROM abdm_facility_registry WHERE tenant_id = $1',
      [tenantId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].facility_name).toBe('Renamed Hospital');
  });

  test('the whole form is kept, not just the columns', async ({ skip }) => {
    if (!ready) return skip();
    // An administrator returning to fix a rejection weeks later needs the form repopulated;
    // re-deriving forty fields from six columns would lose most of it.
    const saved = await hfr.saveDraft(tenantId, null, draft());
    const payload = saved.payload as hfr.FacilityDraft;
    expect(payload.contact.facilityEmailId).toBe('facility@nirogix.test');
    expect(payload.address.addressLine1).toBe('7 Park Street');
  });

  test('a branch is a separate facility', async ({ skip }) => {
    if (!ready) return skip();
    const branch = await pool.query(
      `INSERT INTO branches (tenant_id, name, code, is_active) VALUES ($1,'North Wing','NW', true) RETURNING id`,
      [tenantId],
    );
    await hfr.saveDraft(
      tenantId,
      null,
      draft({ branchId: branch.rows[0].id, facilityName: 'North Wing' }),
    );

    // A group registers each branch in its own right — the brief assumed one hospital, which would
    // have collapsed every tenant onto a single row.
    expect(await hfr.listRegistrations(tenantId)).toHaveLength(2);
    expect((await hfr.findRegistration(tenantId, branch.rows[0].id))?.facilityName).toBe(
      'North Wing',
    );
  });
});

describe('the status machine', () => {
  test('submitted is NOT verified', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query(
      "UPDATE abdm_facility_registry SET status = 'submitted' WHERE tenant_id = $1 AND branch_id IS NULL",
      [tenantId],
    );
    // HFR routes every registration to a human verifier. A green tick on submission would have an
    // administrator believe they hold a Facility ID they do not.
    expect(await statusOf()).toBe('submitted');
    expect((await hfr.findRegistration(tenantId, null))?.facilityId).toBeNull();
  });

  test('a verified registration cannot be re-registered', async ({ skip }) => {
    if (!ready) return skip();
    await hfr.recordVerification(tenantId, { status: 'verified', facilityId: 'IN0710-HFR-TEST' });
    await expect(hfr.saveDraft(tenantId, null, draft())).rejects.toThrow(/already registered/i);
  });

  test('approval without a facility id is refused', async ({ skip }) => {
    if (!ready) return skip();
    const other = await makeTenant(`${CODE}2`);
    await grantModule(other.tenantId, 'abdm');
    await hfr.saveDraft(other.tenantId, null, draft());
    await pool.query(
      "UPDATE abdm_facility_registry SET status = 'submitted' WHERE tenant_id = $1",
      [other.tenantId],
    );

    // "Verified" with nothing to show for it is the state that makes the whole record useless.
    await expect(hfr.recordVerification(other.tenantId, { status: 'verified' })).rejects.toThrow(
      /facility id/i,
    );
    await cleanupTenant(`${CODE}2`);
  });

  test('an illegal transition is named, not silently applied', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      hfr.recordVerification(tenantId, { status: 'rejected', message: 'no' }),
    ).rejects.toThrow(/cannot become/i);
  });
});

describe('adopting the facility id', () => {
  test('an approved id becomes the hipId M1–M3 use', async ({ skip }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}3`);
    await grantModule(fresh.tenantId, 'abdm');
    await hfr.saveDraft(fresh.tenantId, null, draft());
    await pool.query(
      "UPDATE abdm_facility_registry SET status = 'submitted' WHERE tenant_id = $1",
      [fresh.tenantId],
    );

    await hfr.recordVerification(fresh.tenantId, {
      status: 'verified',
      facilityId: 'IN0710-ADOPTED',
    });

    // The one place M4 reaches back into the earlier milestones: leaving an administrator to copy
    // this across by hand is how two sources of truth start disagreeing.
    expect((await getFacilityConfig(fresh.tenantId))?.hipId).toBe('IN0710-ADOPTED');
    await cleanupTenant(`${CODE}3`);
  });

  test('a DIFFERENT configured hipId is left alone', async ({ skip }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}4`);
    await grantModule(fresh.tenantId, 'abdm');
    // Registered by hand on ABDM's portal months ago, and live on that id.
    await upsertFacilityConfig(fresh.tenantId, {
      hipId: 'IN0710-ALREADY-LIVE',
      facilityName: 'Existing',
    });
    await hfr.saveDraft(fresh.tenantId, null, draft());
    await pool.query(
      "UPDATE abdm_facility_registry SET status = 'submitted' WHERE tenant_id = $1",
      [fresh.tenantId],
    );

    await hfr.recordVerification(fresh.tenantId, {
      status: 'verified',
      facilityId: 'IN0710-NEWLY-ISSUED',
    });

    // Swapping it underneath a working integration would break every callback silently.
    expect((await getFacilityConfig(fresh.tenantId))?.hipId).toBe('IN0710-ALREADY-LIVE');
    const row = await pool.query(
      'SELECT facility_id FROM abdm_facility_registry WHERE tenant_id = $1',
      [fresh.tenantId],
    );
    // The issued id is still recorded — the conflict is surfaced, not discarded.
    expect(row.rows[0].facility_id).toBe('IN0710-NEWLY-ISSUED');
    await cleanupTenant(`${CODE}4`);
  });
});

/**
 * Searching before registering (HFR-064…072).
 *
 * The whole point of this endpoint is preventing one building from holding two Facility IDs — and
 * because the Facility ID is the `hipId` M1–M3 identify us by, the wrong half of that pair breaks
 * linking and discovery for real patients, weeks later, with no obvious cause.
 *
 * Only the refusals are exercised. Actually searching means a live call to a government sandbox,
 * and the half that is ours to get wrong is the shape of the request: HFR accepts a Facility ID
 * alone, or ownership + state + name TOGETHER, and rejects everything else outright. That was
 * inferred wrongly the first time this was written — "at least one filter" — and NHA's own
 * documentation says otherwise. These tests pin their rule, not our reading of it.
 */
describe('searching the registry', () => {
  const full = { ownershipCode: 'P', stateLGDCode: '27', facilityName: 'Nirogix' };

  test('refuses an empty search rather than walking the whole registry', async ({ skip }) => {
    if (!ready) return skip();
    await expect(hfr.searchFacilities({})).rejects.toMatchObject({
      code: 'SEARCH_FILTERS_REQUIRED',
    });
  });

  test('paging alone is not a search', async ({ skip }) => {
    if (!ready) return skip();
    await expect(hfr.searchFacilities({ page: 3, resultsPerPage: 50 })).rejects.toMatchObject({
      code: 'SEARCH_FILTERS_REQUIRED',
    });
  });

  test('two of the three required filters is still a refusal', async ({ skip }) => {
    if (!ready) return skip();
    // The bug this pins: "at least one filter" would have sent this and let HFR reject it, which
    // reads to an administrator as "the registry is down".
    await expect(
      hfr.searchFacilities({ ownershipCode: 'P', stateLGDCode: '27' }),
    ).rejects.toMatchObject({ code: 'SEARCH_FILTERS_REQUIRED' });
  });

  test('the refusal names which fields are missing', async ({ skip }) => {
    if (!ready) return skip();
    // So the form can mark them rather than making somebody guess.
    await expect(hfr.searchFacilities({ facilityName: 'Nirogix' })).rejects.toMatchObject({
      code: 'SEARCH_FILTERS_REQUIRED',
      details: { missing: ['ownershipCode', 'stateLGDCode'] },
    });
  });

  test('a blank value does not satisfy a required filter', async ({ skip }) => {
    if (!ready) return skip();
    await expect(hfr.searchFacilities({ ...full, facilityName: '   ' })).rejects.toMatchObject({
      code: 'SEARCH_FILTERS_REQUIRED',
      details: { missing: ['facilityName'] },
    });
  });

  // "A Facility ID alone is a legal search" is deliberately NOT tested here. Proving it means
  // getting past the guard, and past the guard is a live call to a government gateway — which this
  // suite avoids on principle, and which a first draft of this file did on every run. The guard is
  // ours and is pinned above; the call is NHA's and belongs in `abdm:check`, not in `npm test`.
});

/**
 * Amending a facility HFR has already verified.
 *
 * `saveDraft` refuses a verified registration so that nobody re-registers a building that already
 * holds a Facility ID and gives it a second national identity. This is the deliberate path that
 * refusal leaves room for — so what matters is that it cannot be reached by accident from any of
 * the states where re-registering would be the wrong thing.
 *
 * The successful path is not exercised: it makes four live calls to a government sandbox.
 */
describe('updating a verified facility', () => {
  test('a hospital that was never registered cannot be updated', async ({ skip }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}5`);
    await grantModule(fresh.tenantId, 'abdm');
    await expect(hfr.updateRegistration(fresh.tenantId, null, draft())).rejects.toMatchObject({
      code: 'ABDM_FACILITY_NOT_REGISTERED',
    });
    await cleanupTenant(`${CODE}5`);
  });

  test('a draft is edited and submitted, never "updated"', async ({ skip }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}6`);
    await grantModule(fresh.tenantId, 'abdm');
    await hfr.saveDraft(fresh.tenantId, null, draft());
    // Sending an amendment for something the registry has never seen would be a registration
    // wearing the wrong name.
    await expect(hfr.updateRegistration(fresh.tenantId, null, draft())).rejects.toMatchObject({
      code: 'ABDM_FACILITY_NOT_VERIFIED',
    });
    await cleanupTenant(`${CODE}6`);
  });

  test('a submission awaiting a verifier is not amendable either', async ({ skip }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}7`);
    await grantModule(fresh.tenantId, 'abdm');
    await hfr.saveDraft(fresh.tenantId, null, draft());
    await pool.query(
      "UPDATE abdm_facility_registry SET status = 'submitted' WHERE tenant_id = $1",
      [fresh.tenantId],
    );
    // Changing it underneath a verifier would mean they approve something nobody has read.
    await expect(hfr.updateRegistration(fresh.tenantId, null, draft())).rejects.toMatchObject({
      code: 'ABDM_FACILITY_NOT_VERIFIED',
    });
    await cleanupTenant(`${CODE}7`);
  });

  test('a verified facility with no tracking id says so instead of re-registering', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}8`);
    await grantModule(fresh.tenantId, 'abdm');
    await hfr.saveDraft(fresh.tenantId, null, draft());
    // Registered on ABDM's portal by hand, so we hold the issued id but never held a tracking id.
    await pool.query(
      "UPDATE abdm_facility_registry SET status = 'verified', facility_id = 'IN0710-PORTAL', tracking_id = NULL WHERE tenant_id = $1",
      [fresh.tenantId],
    );
    // The failure that matters is the silent one: starting a fresh registration here would mint a
    // SECOND Facility ID for a building that already has one.
    await expect(hfr.updateRegistration(fresh.tenantId, null, draft())).rejects.toMatchObject({
      code: 'ABDM_FACILITY_NO_TRACKING_ID',
    });
    await cleanupTenant(`${CODE}8`);
  });
});
