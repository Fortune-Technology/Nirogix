import { count, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { users, providers, branches, patients, appointments } from '../../db/schema';
import { listEntitledModules } from '../entitlement/entitlement.service';

export type OrgSummary = {
  users: number;
  doctors: number;
  branches: { total: number; active: number };
  modules: string[];
  // Present once the clinical modules land (Stage 1); null until then.
  patients: number | null;
  appointments: number | null;
};

// The Org-Admin dashboard roll-up — scoped to the caller's OWN tenant via RLS (never another
// tenant's data). Same shape as the platform stats, one hospital's worth.
export async function getOrgSummary(tenantId: string): Promise<OrgSummary> {
  const { userCount, doctorCount, patientCount, apptCount, branchRows } = await runWithTenant(tenantId, async (tx) => {
    const u = (await tx.select({ c: count() }).from(users).where(eq(users.tenantId, tenantId)))[0];
    const p = (await tx.select({ c: count() }).from(providers).where(eq(providers.tenantId, tenantId)))[0];
    const pt = (await tx.select({ c: count() }).from(patients).where(eq(patients.tenantId, tenantId)))[0];
    const ap = (await tx.select({ c: count() }).from(appointments).where(eq(appointments.tenantId, tenantId)))[0];
    const branchRows = await tx.select().from(branches).where(eq(branches.tenantId, tenantId));
    return { userCount: Number(u?.c ?? 0), doctorCount: Number(p?.c ?? 0), patientCount: Number(pt?.c ?? 0), apptCount: Number(ap?.c ?? 0), branchRows };
  });
  const modules = Array.from(await listEntitledModules(tenantId)).sort();
  return {
    users: userCount,
    doctors: doctorCount,
    branches: { total: branchRows.length, active: branchRows.filter((b) => b.isActive).length },
    modules,
    patients: patientCount,
    appointments: apptCount,
  };
}
