import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { runWithTenant } from '../db/tenantContext';
import { tenants, users } from '../db/schema';
import { hashPassword } from '../modules/auth/password';

// Minimal demo seed so login can be exercised end-to-end. Idempotent. Indian healthcare
// context per resources/rules.md (seed data). Expand into the full multi-tenant demo set in
// the Ops/seed task (#14). NOT production data — the password here is a known default.
const DEMO = {
  tenant: { code: 'CITYCARE', name: 'CityCare Multispeciality Hospital' },
  admin: { email: 'admin@citycare.example', password: 'ChangeMe#123', fullName: 'Dr. Ananya Sharma' },
};

async function main(): Promise<void> {
  let tenant = (await db.select().from(tenants).where(eq(tenants.code, DEMO.tenant.code)).limit(1))[0];
  if (!tenant) {
    tenant = (await db.insert(tenants).values(DEMO.tenant).returning())[0]!;
    // eslint-disable-next-line no-console
    console.log(`Created tenant "${tenant.name}" (code ${DEMO.tenant.code})`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Tenant "${DEMO.tenant.code}" already exists`);
  }

  await runWithTenant(tenant.id, async (tx) => {
    const existing = (
      await tx.select().from(users).where(eq(users.email, DEMO.admin.email)).limit(1)
    )[0];
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`User ${DEMO.admin.email} already exists`);
      return;
    }
    const passwordHash = await hashPassword(DEMO.admin.password);
    await tx.insert(users).values({
      tenantId: tenant!.id,
      email: DEMO.admin.email,
      passwordHash,
      fullName: DEMO.admin.fullName,
      status: 'active',
    });
    // eslint-disable-next-line no-console
    console.log(
      `Created user ${DEMO.admin.email} (org ${DEMO.tenant.code}, password ${DEMO.admin.password})`,
    );
  });

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed failed:', err);
  process.exit(1);
});
