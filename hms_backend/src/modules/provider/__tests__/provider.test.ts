import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import {
  seedSpecialtyCatalog,
  createProvider,
  assignSpecialty,
  listProvidersWithRoles,
  createFormTemplate,
  listFormTemplates,
} from '../provider.service';
import type { Provider } from '../../../db/schema';

// FHIR-aligned provider/specialty core: create a Practitioner, attach a specialty (PractitionerRole
// = a data change), and configure a specialty form template. Skips if no DB.

const CODE = 'PROVTEST';
let ready = false;
let tenantId = '';
let provider: Provider;

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM practitioner_roles WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM specialty_form_templates WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM providers WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedSpecialtyCatalog();
    await cleanup();
    tenantId = (
      await pool.query('INSERT INTO tenants (name, code) VALUES ($1,$2) RETURNING id', [
        'Prov Test',
        CODE,
      ])
    ).rows[0].id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[provider] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('provider / specialty core', () => {
  test('create a provider (Practitioner)', async ({ skip }) => {
    if (!ready) return skip();
    provider = await createProvider(tenantId, { fullName: 'Dr. Test', qualification: 'MBBS' });
    expect(provider.fullName).toBe('Dr. Test');
    expect(provider.isActive).toBe(true);
  });

  test('assigning a specialty is a data change (PractitionerRole)', async ({ skip }) => {
    if (!ready) return skip();
    const role = await assignSpecialty(tenantId, provider.id, {
      specialtyCode: 'cardiology',
      isPrimary: true,
    });
    expect(role?.specialtyCode).toBe('cardiology');
    const list = await listProvidersWithRoles(tenantId);
    const p = list.find((x) => x.id === provider.id);
    expect(p?.specialties).toContain('cardiology');
  });

  test('an unknown specialty is rejected', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      assignSpecialty(tenantId, provider.id, { specialtyCode: 'not_a_specialty' }),
    ).rejects.toThrow(/Unknown specialty/);
  });

  test('a specialty form template can be configured (no EAV)', async ({ skip }) => {
    if (!ready) return skip();
    await createFormTemplate(tenantId, {
      specialtyCode: 'dental',
      key: 'dental_charting',
      name: 'Dental Charting',
      schema: { fields: [{ name: 'tooth', type: 'string' }] },
    });
    const templates = await listFormTemplates(tenantId);
    expect(templates.some((t) => t.key === 'dental_charting')).toBe(true);
  });
});
