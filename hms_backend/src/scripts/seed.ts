import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { runWithTenant } from '../db/tenantContext';
import { tenants, users } from '../db/schema';
import { hashPassword } from '../modules/auth/password';
import { seedPermissionCatalog, provisionTenantRbac, assignRoleByKey } from '../modules/rbac/rbac.service';

// Minimal demo seed so login + RBAC can be exercised end-to-end. Idempotent. Indian healthcare
// context per resources/rules.md. Expand into the full multi-tenant demo in the Ops task (#14).
// NOT production data — passwords here are known defaults.
const DEMO = {
  tenant: { code: 'CITYCARE', name: 'CityCare Multispeciality Hospital' },
  users: [
    { email: 'admin@citycare.example', password: 'ChangeMe#123', fullName: 'Dr. Ananya Sharma', role: 'org_admin' },
    { email: 'reception@citycare.example', password: 'ChangeMe#123', fullName: 'Rahul Verma', role: 'receptionist' },
  ],
};

async function upsertUser(
  tenantId: string,
  u: { email: string; password: string; fullName: string },
): Promise<string> {
  return runWithTenant(tenantId, async (tx) => {
    const existing = (await tx.select().from(users).where(eq(users.email, u.email)).limit(1))[0];
    if (existing) return existing.id;
    const passwordHash = await hashPassword(u.password);
    const inserted = (
      await tx
        .insert(users)
        .values({ tenantId, email: u.email, passwordHash, fullName: u.fullName, status: 'active' })
        .returning()
    )[0]!;
    return inserted.id;
  });
}

async function main(): Promise<void> {
  await seedPermissionCatalog();

  let tenant = (await db.select().from(tenants).where(eq(tenants.code, DEMO.tenant.code)).limit(1))[0];
  if (!tenant) {
    tenant = (await db.insert(tenants).values(DEMO.tenant).returning())[0]!;
    // eslint-disable-next-line no-console
    console.log(`Created tenant "${tenant.name}" (code ${DEMO.tenant.code})`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Tenant "${DEMO.tenant.code}" already exists`);
  }

  await provisionTenantRbac(tenant.id);
  // eslint-disable-next-line no-console
  console.log('Provisioned system roles + permissions');

  for (const u of DEMO.users) {
    const userId = await upsertUser(tenant.id, u);
    await assignRoleByKey(tenant.id, userId, u.role);
    // eslint-disable-next-line no-console
    console.log(`User ${u.email} (${u.role}) ready — org ${DEMO.tenant.code}, password ${u.password}`);
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed failed:', err);
  process.exit(1);
});
