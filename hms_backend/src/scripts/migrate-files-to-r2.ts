import 'dotenv/config';
import { pool } from '../db/client';
import { env } from '../config/env';
import { LocalFileStorageProvider } from '../modules/file/providers/localProvider';
import { R2FileStorageProvider } from '../modules/file/providers/r2Provider';

/**
 * One-off: copy every stored object from the local-disk provider into Cloudflare R2 (ADR-007,
 * ADR-065).
 *
 * Files uploaded while `FILE_STORAGE_PROVIDER=local` live under `FILE_STORAGE_LOCAL_DIR` and are
 * pointed at by `file_metadata.storage_key`. Switching the provider to `r2` does NOT move them —
 * the metadata rows still resolve to keys that only exist on disk, so logos, letterhead images and
 * documents would 404 until re-uploaded. This copies each object to R2 **under the same key**, so
 * every existing `file_metadata` id keeps resolving with no data change.
 *
 * Idempotent: re-running overwrites the same keys. Deleted files (whose objects were already
 * removed) are skipped. Run it BEFORE flipping the API to `FILE_STORAGE_PROVIDER=r2` in production;
 * in a dev box either order works because both providers are constructed directly here.
 *
 *   npm run files:migrate-r2   (from hms_backend)
 */
async function main(): Promise<void> {
  if (!env.R2_ENDPOINT || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    // eslint-disable-next-line no-console
    console.error(
      'R2 is not configured. Set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY before running.',
    );
    process.exit(1);
  }

  const local = new LocalFileStorageProvider();
  const r2 = new R2FileStorageProvider();

  // Read on the base pool (ops task, all tenants). `storage_key` is the same on both providers.
  const { rows } = await pool.query<{ storage_key: string; content_type: string | null }>(
    "SELECT storage_key, content_type FROM file_metadata WHERE status <> 'deleted' ORDER BY created_at",
  );

  // eslint-disable-next-line no-console
  console.log(
    `Copying ${rows.length} file(s) from "${env.FILE_STORAGE_LOCAL_DIR}" to R2 bucket "${env.R2_BUCKET}"...`,
  );

  let copied = 0;
  let missing = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const body = await local.getObject(row.storage_key);
      await r2.putObject(row.storage_key, body, row.content_type ?? 'application/octet-stream');
      copied++;
      // eslint-disable-next-line no-console
      console.log(`  ✓ ${row.storage_key}`);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        missing++;
        // eslint-disable-next-line no-console
        console.warn(`  · not on local disk, skipped: ${row.storage_key}`);
      } else {
        failed++;
        // eslint-disable-next-line no-console
        console.error(`  ✗ ${row.storage_key}: ${(err as Error).message}`);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nDone. ${copied} copied, ${missing} missing (skipped), ${failed} failed.`);
  if (failed > 0) {
    await pool.end();
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('Now set FILE_STORAGE_PROVIDER=r2 and restart the API — existing ids resolve from R2.');
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
