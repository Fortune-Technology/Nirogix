import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createPatient } from '../../patient/patient.service';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../../auth/tokens';
import {
  linkPatientToIdentity,
  listMyHospitals,
  resolvePatientAccess,
  revokePatientAccess,
  normaliseMobile,
  normaliseEmail,
} from '../patientIdentity.service';

// Patient identity (ADR-052). The security-relevant half: the hospital creates the
// link, a patient reaches only their own hospitals, tenant is resolved from an ACTIVE
// link per request, and a patient token is not a staff token.

const CODE_A = 'PIDTESTA';
const CODE_B = 'PIDTESTB';
let ready = false;
let tenantA = '';
let tenantB = '';
let adminA = '';
let adminB = '';
let patientA = '';
let patientB = '';

const MOBILE = '+919820011234';

async function cleanupOne(code: string): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [code])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM patient_identity_link WHERE tenant_id = $1', [t.id]);
  for (const table of [
    'visits',
    'appointments',
    'patients',
    'organization_profile',
    'tenant_branding',
    'user_permission_overrides',
    'user_roles',
    'role_permissions',
    'roles',
    'tenant_entitlements',
    'departments',
    'branches',
    'users',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [t.id]);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

/**
 * Remove this fixture's identity and everything that references it.
 *
 * Deliberately deletes links by IDENTITY rather than by tenant: the same contact can be
 * linked from a seeded hospital by manual testing, and `patient_identity` is FK-restricted,
 * so a tenant-scoped cleanup leaves a row that silently makes the whole suite skip. Found
 * exactly that way.
 */
async function cleanupIdentities(): Promise<void> {
  const ids = (await pool.query('SELECT id FROM patient_identity WHERE mobile = ANY($1)', [[MOBILE, '+919000000000', '+919111111111']])).rows.map((r) => r.id);
  if (ids.length === 0) return;
  await pool.query('DELETE FROM patient_verification WHERE identity_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM patient_identity_link WHERE identity_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM patient_identity WHERE id = ANY($1)', [ids]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanupOne(CODE_A);
    await cleanupOne(CODE_B);
    await cleanupIdentities();
    const a = await onboardTenant({
      code: CODE_A,
      name: 'Identity Test Hospital',
      admin: { email: 'admin@pidtesta.example', fullName: 'Admin A' },
    });
    const b = await onboardTenant({
      code: CODE_B,
      name: 'Second Identity Hospital',
      admin: { email: 'admin@pidtestb.example', fullName: 'Admin B' },
    });
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;
    adminA = (await pool.query('SELECT id FROM users WHERE email = $1', ['admin@pidtesta.example'])).rows[0].id;
    adminB = (await pool.query('SELECT id FROM users WHERE email = $1', ['admin@pidtestb.example'])).rows[0].id;
    patientA = (
      await createPatient(tenantA, { firstName: 'Asha', lastName: 'Rao', gender: 'female', phone: '9820011234' }, adminA)
    ).id;
    patientB = (
      await createPatient(tenantB, { firstName: 'Asha', lastName: 'Rao', gender: 'female', phone: '9820011234' }, adminB)
    ).id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[patient-identity] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) {
    await cleanupOne(CODE_A);
    await cleanupOne(CODE_B);
    await cleanupIdentities();
  }
});

describe('contact normalisation', () => {
  test('two spellings of one number cannot become two people', () => {
    expect(normaliseMobile('+91 98200 11234')).toBe('+919820011234');
    expect(normaliseMobile('+91-98200-11234')).toBe('+919820011234');
    expect(normaliseEmail('  Asha@Example.COM ')).toBe('asha@example.com');
  });
});

describe('patient identity links', () => {
  test('the hospital creates the link, and it is audited', async ({ skip }) => {
    if (!ready) return skip();
    const { identityId } = await linkPatientToIdentity(tenantA, patientA, { mobile: MOBILE }, adminA);
    expect(identityId).toBeTruthy();
    const { rows } = await pool.query(
      "SELECT severity FROM audit_log WHERE tenant_id = $1 AND action = 'patient.portal.link' LIMIT 1",
      [tenantA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('notice');
  });

  test('linking is idempotent for the same person', async ({ skip }) => {
    if (!ready) return skip();
    const first = await linkPatientToIdentity(tenantA, patientA, { mobile: MOBILE }, adminA);
    const again = await linkPatientToIdentity(tenantA, patientA, { mobile: MOBILE }, adminA);
    expect(again.linkId).toBe(first.linkId);
  });

  test('one person, many hospitals — one identity', async ({ skip }) => {
    if (!ready) return skip();
    const a = await linkPatientToIdentity(tenantA, patientA, { mobile: MOBILE }, adminA);
    const b = await linkPatientToIdentity(tenantB, patientB, { mobile: MOBILE }, adminB);
    // The whole point of ADR-052: the same contact is the same principal across hospitals.
    expect(b.identityId).toBe(a.identityId);
  });

  test('a second person cannot claim a chart that is already linked', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      linkPatientToIdentity(tenantA, patientA, { mobile: '+919000000000' }, adminA),
    ).rejects.toThrow(/already linked/i);
  });

  test('an unverified identity is offered no hospitals', async ({ skip }) => {
    if (!ready) return skip();
    const { identityId } = await linkPatientToIdentity(tenantA, patientA, { mobile: MOBILE }, adminA);
    // Links exist, but the contact has never been proven — access must not follow.
    expect(await listMyHospitals(identityId)).toEqual([]);
  });

  test('a verified identity sees exactly its own hospitals', async ({ skip }) => {
    if (!ready) return skip();
    const { identityId } = await linkPatientToIdentity(tenantA, patientA, { mobile: MOBILE }, adminA);
    await pool.query('UPDATE patient_identity SET verified_at = now(), activated_at = now() WHERE id = $1', [
      identityId,
    ]);
    const hospitals = await listMyHospitals(identityId);
    expect(hospitals.map((h) => h.tenantId).sort()).toEqual([tenantA, tenantB].sort());
  });

  test('tenant access is resolved from the link, and revocation takes effect at once', async ({ skip }) => {
    if (!ready) return skip();
    const { identityId } = await linkPatientToIdentity(tenantA, patientA, { mobile: MOBILE }, adminA);
    await pool.query('UPDATE patient_identity SET verified_at = now() WHERE id = $1', [identityId]);

    const access = await resolvePatientAccess(identityId, tenantA);
    expect(access.patientId).toBe(patientA);

    await revokePatientAccess(tenantA, patientA, adminA);
    // Re-checked per request, not baked into a token — so this is immediate.
    await expect(resolvePatientAccess(identityId, tenantA)).rejects.toThrow(/do not have access/i);
    // The other hospital is unaffected.
    expect(await resolvePatientAccess(identityId, tenantB)).toBeTruthy();
  });

  test('an identity has no access to a hospital it was never linked to', async ({ skip }) => {
    if (!ready) return skip();
    const orphan = (
      await pool.query("INSERT INTO patient_identity (mobile, verified_at) VALUES ('+919111111111', now()) RETURNING id")
    ).rows[0].id;
    await expect(resolvePatientAccess(orphan, tenantA)).rejects.toThrow(/do not have access/i);
    await pool.query('DELETE FROM patient_identity WHERE id = $1', [orphan]);
  });
});

describe('refresh-token rotation', () => {
  // Regression for a real defect found by testing the live route: the payload was
  // {sub, tid, sid} plus a second-resolution `iat`, so two tokens minted in the same
  // second were byte-identical. Rotation replaced the stored hash with the SAME value,
  // which meant a stolen refresh token stayed valid for its whole lifetime and could
  // not be invalidated by the legitimate user continuing their session. Affected staff
  // sessions too, not only patients.
  test('two refresh tokens issued back to back are different', () => {
    const a = signRefreshToken({ sub: 'identity-1', tid: '', sid: 'session-1', pt: 'patient' });
    const b = signRefreshToken({ sub: 'identity-1', tid: '', sid: 'session-1', pt: 'patient' });
    expect(a).not.toBe(b);
  });

  test('the same is true for a staff refresh token', () => {
    const a = signRefreshToken({ sub: 'user-1', tid: 'tenant-1', sid: 'session-1' });
    const b = signRefreshToken({ sub: 'user-1', tid: 'tenant-1', sid: 'session-1' });
    expect(a).not.toBe(b);
  });

  test('a patient refresh token is marked as one', () => {
    const claims = verifyRefreshToken(signRefreshToken({ sub: 'i', tid: '', sid: 's', pt: 'patient' }));
    expect(claims.pt).toBe('patient');
    // A staff refresh token carries no marker, and the patient refresh route refuses it.
    expect(verifyRefreshToken(signRefreshToken({ sub: 'u', tid: 't', sid: 's' })).pt).toBeUndefined();
  });
});

describe('patient principal', () => {
  test('a patient token is not a staff token', () => {
    // `pt: 'patient'` is what `requireAuth` refuses on — by type, so a future permission
    // grant cannot open a staff route to a patient.
    const token = signAccessToken({ sub: 'id-1', tid: '', roles: [], pt: 'patient' });
    const claims = verifyAccessToken(token);
    expect(claims.pt).toBe('patient');
    expect(claims.roles).toEqual([]);
  });

  test('a staff token carries no patient marker', () => {
    const claims = verifyAccessToken(signAccessToken({ sub: 'u-1', tid: 't-1', roles: ['doctor'] }));
    expect(claims.pt).toBeUndefined();
  });
});
