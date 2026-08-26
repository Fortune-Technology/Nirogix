import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createPatient } from '../../patient/patient.service';
import { createProvider } from '../../provider/provider.service';
import { bookAppointment, listAppointments, cancelAppointment } from '../appointment.service';

// Appointments: booking, double-booking prevention, cancellation frees the slot. Skips if no DB.

const CODE = 'APPTEST';
let ready = false;
let tenantId = '';
let patientId = '';
let providerId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of ['appointments', 'patients', 'practitioner_roles', 'providers', 'user_roles', 'role_permissions', 'roles', 'tenant_entitlements', 'branches', 'users']) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [t.id]);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanup();
    const r = await onboardTenant({ code: CODE, name: 'Appt Test Hospital', admin: { email: 'admin@apptest.example', fullName: 'Appt Admin' } });
    tenantId = r.tenant.id;
    patientId = (await createPatient(tenantId, { firstName: 'Test', lastName: 'Patient' })).id;
    providerId = (await createProvider(tenantId, { fullName: 'Dr. Test', registrationNumber: 'T-1' })).id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[appointment] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

const T10 = '2026-09-01T10:00:00.000Z';
const T1010 = '2026-09-01T10:10:00.000Z';
const T11 = '2026-09-01T11:00:00.000Z';

describe('appointments', () => {
  test('book, then reject a double-booked slot, then allow a free slot', async ({ skip }) => {
    if (!ready) return skip();
    const a = await bookAppointment(tenantId, { patientId, providerId, scheduledAt: T10 });
    expect(a.status).toBe('booked');

    // Overlaps 10:00–10:15 → conflict.
    await expect(
      bookAppointment(tenantId, { patientId, providerId, scheduledAt: T1010 }),
    ).rejects.toThrow(/time slot/);

    // 11:00 is free.
    const b = await bookAppointment(tenantId, { patientId, providerId, scheduledAt: T11 });
    expect(b.status).toBe('booked');
  });

  test('cancelling frees the slot (a new booking then succeeds)', async ({ skip }) => {
    if (!ready) return skip();
    const list = await listAppointments(tenantId, { page: 1, pageSize: 20, status: ['booked'] });
    const at10 = list.rows.find((r) => r.scheduledAt === new Date(T10).toISOString());
    expect(at10).toBeTruthy();
    await cancelAppointment(tenantId, at10!.id, 'patient rescheduled');

    // The 10:00 slot is now free → re-booking succeeds.
    const again = await bookAppointment(tenantId, { patientId, providerId, scheduledAt: T10 });
    expect(again.status).toBe('booked');

    // Multi-value status filter (ADR-063): asking for booked OR cancelled returns
    // only those, and never fewer than the single-status query.
    const multi = await listAppointments(tenantId, { page: 1, pageSize: 50, status: ['booked', 'cancelled'] });
    for (const r of multi.rows) expect(['booked', 'cancelled']).toContain(r.status);
    const bookedOnly = await listAppointments(tenantId, { page: 1, pageSize: 50, status: ['booked'] });
    expect(multi.total).toBeGreaterThanOrEqual(bookedOnly.total);
  });

  test('list is enriched with patient + provider names', async ({ skip }) => {
    if (!ready) return skip();
    const list = await listAppointments(tenantId, { page: 1, pageSize: 20 });
    expect(list.rows[0]?.patientName).toContain('Test');
    expect(list.rows[0]?.providerName).toBe('Dr. Test');
  });
});
