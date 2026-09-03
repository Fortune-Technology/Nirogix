import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createUser } from '../../user/user.service';
import {
  getActiveSignature,
  listMySignatures,
  removeMySignature,
  resolveSignaturesForDocument,
  uploadSignature,
} from '../signature.service';

/**
 * Signature versions, and the one rule that makes them worth having (ADR-137): **a document
 * shows the signature that signed it**, not the signer's current one.
 *
 * The decisive test is `preserves what a document was signed with` — everything else here is
 * scaffolding for it. If that one ever passes by accident, the feature is a lie: a clinician
 * would update their signature and silently change what every past prescription shows.
 *
 * Skips cleanly when no database is reachable.
 */

const CODE = 'SIGTEST';
let ready = false;
let tenantId = '';
let doctorId = '';
let otherId = '';

/** A 1×1 transparent PNG — real bytes, so the image pipeline is exercised, not stubbed. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function upload(userId: string, name: string) {
  return uploadSignature(tenantId, userId, {
    filename: name,
    contentType: 'image/png',
    size: PNG.length,
    buffer: PNG,
  });
}

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    // Signatures before files: `user_signatures.file_id` is ON DELETE RESTRICT, which is the
    // point — a signature's image cannot be removed out from under a document that used it.
    'user_signatures',
    'file_metadata',
    'password_reset_tokens',
    'sessions',
    'user_permission_overrides',
    'user_roles',
    'role_permissions',
    'roles',
    'tenant_capability_entitlements',
    'tenant_entitlements',
    'branches',
    'users',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [t.id]);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanup();
    const r = await onboardTenant({
      code: CODE,
      name: 'Signature Test Hospital',
      admin: { email: 'admin@sigtest.example', fullName: 'Sig Admin' },
    });
    tenantId = r.tenant.id;
    doctorId = (
      await createUser(tenantId, {
        email: 'doctor@sigtest.example',
        fullName: 'Dr. Sig',
        roleKey: 'doctor',
        password: 'TestPass#12345',
      })
    ).userId;
    otherId = (
      await createUser(tenantId, {
        email: 'lab@sigtest.example',
        fullName: 'Tech Sig',
        roleKey: 'lab_technician',
        password: 'TestPass#12345',
      })
    ).userId;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[signature] skipping — ${(err as Error).message}`);
  }
}, 120_000);

afterAll(async () => {
  if (ready) await cleanup();
});

describe('uploading', () => {
  test('the first upload is version 1 and becomes the active signature', async ({ skip }) => {
    if (!ready) return skip();
    const created = await upload(doctorId, 'sig-v1.png');
    expect(created.version).toBe(1);
    expect(created.status).toBe('active');

    const active = await getActiveSignature(tenantId, doctorId);
    expect(active?.id).toBe(created.id);
  });

  test('refuses anything that is not one of the three image types', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      uploadSignature(tenantId, doctorId, {
        filename: 'sig.pdf',
        contentType: 'application/pdf',
        size: PNG.length,
        buffer: PNG,
      }),
    ).rejects.toThrow(/PNG, JPEG or WebP/);
  });

  test('refuses an image too large to be a signature', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      uploadSignature(tenantId, doctorId, {
        filename: 'huge.png',
        contentType: 'image/png',
        size: 2 * 1024 * 1024,
        buffer: PNG,
      }),
    ).rejects.toThrow(/512 KB/);
  });

  test('uploading again retires the previous version rather than replacing it', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const v2 = await upload(doctorId, 'sig-v2.png');
    expect(v2.version).toBe(2);

    const versions = await listMySignatures(tenantId, doctorId);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions.find((v) => v.version === 1)?.status).toBe('superseded');
    expect(versions.find((v) => v.version === 1)?.retiredAt).toBeTruthy();
    // Two versions, two DIFFERENT files: a row's image is never repointed.
    expect(versions[0]!.fileId).not.toBe(versions[1]!.fileId);

    expect((await getActiveSignature(tenantId, doctorId))?.id).toBe(v2.id);
  });
});

describe('the rule the feature exists for', () => {
  test('preserves what a document was signed with, after the signer changes theirs', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const versions = await listMySignatures(tenantId, doctorId);
    const v1 = versions.find((v) => v.version === 1)!;
    const v2 = versions.find((v) => v.version === 2)!;

    // A document signed under v1 pinned v1's id. Resolve it the way a print route does.
    const rendered = await resolveSignaturesForDocument(tenantId, [v1.id]);
    const pinned = rendered.get(v1.id);

    expect(pinned).toBeTruthy();
    expect(pinned!.version).toBe(1);
    expect(pinned!.signedByName).toBe('Dr. Sig');
    expect(pinned!.imageUrl).toBeTruthy();
    // The point: a retired version still resolves. The document is asking for the signature that
    // signed it, and the answer is not "whatever they use now".
    expect(pinned!.signatureId).not.toBe(v2.id);
  });

  test('a removed signature still renders on the documents it already signed', async ({ skip }) => {
    if (!ready) return skip();
    const before = await getActiveSignature(tenantId, doctorId);
    await removeMySignature(tenantId, doctorId);

    // Nothing signs new documents…
    expect(await getActiveSignature(tenantId, doctorId)).toBeNull();
    // …and the row is kept, marked, not deleted.
    const versions = await listMySignatures(tenantId, doctorId);
    expect(versions.find((v) => v.id === before!.id)?.status).toBe('removed');
    // …and a document that pinned it still resolves it.
    const rendered = await resolveSignaturesForDocument(tenantId, [before!.id]);
    expect(rendered.get(before!.id)?.version).toBe(2);
  });

  test('removing when there is nothing to remove says so', async ({ skip }) => {
    if (!ready) return skip();
    await expect(removeMySignature(tenantId, doctorId)).rejects.toThrow(/no signature/i);
  });
});

describe('whose signature it is', () => {
  test('two people keep independent version series', async ({ skip }) => {
    if (!ready) return skip();
    const theirs = await upload(otherId, 'tech-v1.png');
    // The doctor is already on version 2; a second person starts at 1 regardless.
    expect(theirs.version).toBe(1);

    const mine = await listMySignatures(tenantId, doctorId);
    const others = await listMySignatures(tenantId, otherId);
    expect(mine.length).toBe(2);
    expect(others.length).toBe(1);
    expect(mine.some((v) => v.id === theirs.id)).toBe(false);
  });

  test('a document resolves several signers at once, each to its own pinned version', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const mine = await listMySignatures(tenantId, doctorId);
    const others = await listMySignatures(tenantId, otherId);
    const rendered = await resolveSignaturesForDocument(tenantId, [mine[1]!.id, others[0]!.id]);

    expect(rendered.size).toBe(2);
    expect(rendered.get(mine[1]!.id)?.signedByName).toBe('Dr. Sig');
    expect(rendered.get(others[0]!.id)?.signedByName).toBe('Tech Sig');
  });

  test('an unknown or absent pin resolves to nothing, and a document prints a blank line', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const rendered = await resolveSignaturesForDocument(tenantId, [
      null,
      undefined,
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(rendered.size).toBe(0);
  });
});
