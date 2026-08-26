import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../../../db/client';
import { env } from '../../../config/env';
import { uploadFile, getFileContent, deleteFile, getFileMetadata } from '../file.service';
import type { FileMetadata } from '../../../db/schema';

// Exercises the local storage provider end-to-end: upload writes metadata + an object on disk with
// a checksum; content reads it back; delete removes the object and soft-deletes metadata. Skips if
// no DB. Assumes FILE_STORAGE_PROVIDER=local (the default).

const CODE = 'FILETEST';
let ready = false;
let tenantId = '';
let uploaded: FileMetadata;

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM file_metadata WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
  await fs.rm(join(env.FILE_STORAGE_LOCAL_DIR, t.id), { recursive: true, force: true });
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await cleanup();
    tenantId = (
      await pool.query('INSERT INTO tenants (name, code) VALUES ($1,$2) RETURNING id', ['File Test', CODE])
    ).rows[0].id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[file] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('file storage (local provider)', () => {
  test('upload stores metadata + an object on disk with a checksum', async ({ skip }) => {
    if (!ready) return skip();
    const buf = Buffer.from('%PDF-1.4 fake report body');
    uploaded = await uploadFile({
      tenantId,
      filename: 'report.pdf',
      contentType: 'application/pdf',
      size: buf.length,
      buffer: buf,
    });
    expect(uploaded.filename).toBe('report.pdf');
    expect(uploaded.size).toBe(buf.length);
    expect(uploaded.checksum).toMatch(/^[0-9a-f]{64}$/);
    const onDisk = await fs.readFile(join(env.FILE_STORAGE_LOCAL_DIR, uploaded.storageKey));
    expect(onDisk.equals(buf)).toBe(true);
  });

  test('content reads the object back', async ({ skip }) => {
    if (!ready) return skip();
    const result = await getFileContent(tenantId, uploaded.id);
    expect(result?.body.toString()).toContain('fake report body');
  });

  test('delete removes the object and soft-deletes metadata', async ({ skip }) => {
    if (!ready) return skip();
    expect(await deleteFile(tenantId, uploaded.id)).toBe(true);
    expect(await getFileMetadata(tenantId, uploaded.id)).toBeNull();
    await expect(
      fs.access(join(env.FILE_STORAGE_LOCAL_DIR, uploaded.storageKey)),
    ).rejects.toThrow();
  });
});
