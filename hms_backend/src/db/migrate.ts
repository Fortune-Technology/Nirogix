import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';
import { applyRls } from './rls';
import { logger } from '../config/logger';

// Runs pending Drizzle migrations, then (re)applies the RLS policy template to every
// tenant-scoped table. RLS lives outside Drizzle's schema DSL, so it is applied here rather
// than in a generated migration file. Idempotent — safe to run on every deploy.
async function main(): Promise<void> {
  logger.info('Running database migrations...');
  await migrate(db, { migrationsFolder: 'drizzle' });

  logger.info('Applying Row-Level Security policies...');
  const applied = await applyRls(pool);
  logger.info(`RLS applied to: ${applied.join(', ') || '(no tenant-scoped tables yet)'}`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
