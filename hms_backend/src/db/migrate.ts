import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client';
import { applyRls } from './rls';
import { applyAuditProtection } from './auditProtection';
import { reconcileSystemRoles } from '../modules/rbac/rbac.service';
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

  await applyAuditProtection(pool);
  logger.info('Applied audit_log append-only protection (blocks UPDATE/DELETE)');

  // A permission key added to @hms/permissions has to reach the tenants that already
  // exist, or the feature it guards 403s for every current customer and works only for
  // hospitals onboarded afterwards. Additive and idempotent.
  logger.info('Reconciling system roles with the permission catalog...');
  const { tenants: reconciled } = await reconcileSystemRoles();
  logger.info(`System roles reconciled for ${reconciled} tenant(s)`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
