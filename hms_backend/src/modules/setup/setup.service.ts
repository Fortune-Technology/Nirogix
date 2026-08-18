import { and, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { PERMISSIONS } from '@hms/permissions';
import { runWithTenant } from '../../db/tenantContext';
import { branches, departments, drugs, labTests, providers, roles, tenantBranding, userRoles, users } from '../../db/schema';
import { listEntitledModules } from '../entitlement/entitlement.service';
import { getOrganizationProfile } from '../organization/organization.service';

/**
 * Hospital Setup status (ADR-049).
 *
 * The console reports on the configuration areas the product ACTUALLY has. Departments joined
 * the list when they became a real entity (ADR-050). There is still no step for sub-departments,
 * procedures, services, packages, treatment plans, wards, rooms or beds — none of those exist in
 * the data model or in the current phase, and a setup step for an unbuilt area would be a promise
 * the product cannot keep. They are recorded in BACKLOG.md instead.
 *
 * Every count is read inside `runWithTenant`, so RLS scopes the whole status to the caller's
 * own hospital. A step tied to a module is only reported when the tenant is entitled to that
 * module — a clinic without Laboratory is not told its setup is incomplete because it has no
 * test master.
 */

export type SetupStepKey =
  | 'profile'
  | 'branding'
  | 'branches'
  | 'departments'
  | 'providers'
  | 'staff'
  | 'roles'
  | 'lab_tests'
  | 'drugs'
  | 'modules';

export type SetupStep = {
  key: SetupStepKey;
  label: string;
  description: string;
  /** Portal route that completes this step. */
  href: string;
  /** Permission the caller needs to act on it; null = any authenticated user. */
  permission: string | null;
  /** Module entitlement this step belongs to; null = platform core, always present. */
  module: string | null;
  /** Counted toward the progress figure. Informational steps are not. */
  required: boolean;
  complete: boolean;
  /** What was actually found, so the console can say "3 branches" rather than just a tick. */
  count: number;
  /** Steps that must be complete first. The console explains the order rather than hiding it. */
  dependsOn: SetupStepKey[];
};

export type SetupStatus = {
  organization: { name: string; code: string };
  steps: SetupStep[];
  completedRequired: number;
  totalRequired: number;
  /** True when every required step is complete. */
  ready: boolean;
};

/**
 * Defence in depth (ADR-015): the explicit `tenant_id` predicate is written even though RLS
 * already scopes the statement. RLS is the guarantee; the predicate is what keeps the count
 * correct if the application ever connects as a role that bypasses RLS — which is exactly the
 * failure mode a local superuser connection produces.
 */
async function countRows(
  tenantId: string,
  table: typeof branches | typeof departments | typeof providers | typeof users | typeof labTests | typeof drugs,
): Promise<number> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx.select({ n: count() }).from(table).where(eq(table.tenantId, tenantId)),
  );
  return Number(rows[0]?.n ?? 0);
}

/** Users holding a role other than org_admin — i.e. the team has actually been given access. */
async function countStaffWithOperationalRole(tenantId: string): Promise<number> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ n: count() })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.tenantId, tenantId), ne(roles.key, 'org_admin'), ne(roles.key, 'super_admin'))),
  );
  return Number(rows[0]?.n ?? 0);
}

async function hasBranding(tenantId: string): Promise<boolean> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ n: count() })
      .from(tenantBranding)
      .where(
        and(
          eq(tenantBranding.tenantId, tenantId),
          isNull(tenantBranding.branchId),
          sql`(${tenantBranding.brandColor} is not null or ${tenantBranding.logoFileId} is not null)`,
        ),
      ),
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function getSetupStatus(tenantId: string): Promise<SetupStatus> {
  const [profile, branding, branchCount, departmentCount, providerCount, userCount, staffRoleCount, entitled] = await Promise.all([
    getOrganizationProfile(tenantId),
    hasBranding(tenantId),
    countRows(tenantId, branches),
    countRows(tenantId, departments),
    countRows(tenantId, providers),
    countRows(tenantId, users),
    countStaffWithOperationalRole(tenantId),
    listEntitledModules(tenantId),
  ]);

  const labEntitled = entitled.has('laboratory');
  const pharmacyEntitled = entitled.has('pharmacy');
  const [labTestCount, drugCount] = await Promise.all([
    labEntitled ? countRows(tenantId, labTests) : Promise.resolve(0),
    pharmacyEntitled ? countRows(tenantId, drugs) : Promise.resolve(0),
  ]);

  const steps: SetupStep[] = [
    {
      key: 'profile',
      label: 'Hospital information',
      description:
        'Registered address, contact details, registration number and GSTIN. These print in the header of every invoice and report.',
      href: '/settings/organization',
      permission: PERMISSIONS.ORG_PROFILE_MANAGE,
      module: null,
      required: true,
      complete: profile.isComplete,
      count: profile.contactLines.length,
      dependsOn: [],
    },
    {
      key: 'branding',
      label: 'Branding',
      description: 'Your logo, favicon and accent colour, applied across the Portal and your printed documents.',
      href: '/settings/branding',
      permission: PERMISSIONS.BRANDING_MANAGE,
      module: null,
      required: true,
      complete: branding,
      count: branding ? 1 : 0,
      dependsOn: [],
    },
    {
      key: 'branches',
      label: 'Branches',
      description: 'At least one branch. Staff, providers and clinical records are organised under branches.',
      href: '/branches',
      permission: PERMISSIONS.BRANCHES_MANAGE,
      module: null,
      required: true,
      complete: branchCount > 0,
      count: branchCount,
      dependsOn: [],
    },
    {
      key: 'departments',
      label: 'Departments',
      description:
        'The clinical departments patients are seen in. Doctors are assigned to them, check-in routes by them, and registers read by them.',
      href: '/departments',
      permission: PERMISSIONS.DEPARTMENT_MANAGE,
      module: null,
      required: true,
      complete: departmentCount > 0,
      count: departmentCount,
      dependsOn: ['branches'],
    },
    {
      key: 'providers',
      label: 'Doctors & specialties',
      description: 'The provider directory appointments are booked against, with each doctor’s specialties and branch.',
      href: '/providers',
      permission: PERMISSIONS.PROVIDER_MANAGE,
      module: null,
      required: true,
      complete: providerCount > 0,
      count: providerCount,
      dependsOn: ['branches', 'departments'],
    },
    {
      key: 'staff',
      label: 'Staff accounts',
      description: 'Accounts for the people who will run the hospital: front desk, pharmacy, laboratory and billing.',
      href: '/users',
      permission: PERMISSIONS.USERS_MANAGE,
      module: null,
      required: true,
      complete: userCount > 1,
      count: userCount,
      dependsOn: ['branches'],
    },
    {
      key: 'roles',
      label: 'Roles & access',
      description:
        'Give each account its role, and add or deny an individual permission where a person needs an exception.',
      href: '/users',
      permission: PERMISSIONS.RBAC_MANAGE,
      module: null,
      required: true,
      complete: staffRoleCount > 0,
      count: staffRoleCount,
      dependsOn: ['staff'],
    },
  ];

  if (labEntitled) {
    steps.push({
      key: 'lab_tests',
      label: 'Laboratory test master',
      description: 'The tests you offer, with price and reference ranges. Orders and results are raised against them.',
      href: '/laboratory/tests',
      permission: PERMISSIONS.LAB_MANAGE,
      module: 'laboratory',
      required: true,
      complete: labTestCount > 0,
      count: labTestCount,
      dependsOn: [],
    });
  }

  if (pharmacyEntitled) {
    steps.push({
      key: 'drugs',
      label: 'Pharmacy drug master',
      description: 'The medicines you stock, with unit price and reorder level. Stock is received in batches against them.',
      href: '/pharmacy/stock',
      permission: PERMISSIONS.PHARMACY_MANAGE,
      module: 'pharmacy',
      required: true,
      complete: drugCount > 0,
      count: drugCount,
      dependsOn: [],
    });
  }

  steps.push({
    key: 'modules',
    label: 'Enabled modules',
    description:
      'The modules your hospital is entitled to. These are provisioned by Nirogix. Talk to us to enable another one.',
    href: '/settings/modules',
    permission: null,
    module: null,
    required: false,
    complete: entitled.size > 0,
    count: entitled.size,
    dependsOn: [],
  });

  const required = steps.filter((s) => s.required);
  const completedRequired = required.filter((s) => s.complete).length;

  return {
    organization: { name: profile.name, code: profile.code },
    steps,
    completedRequired,
    totalRequired: required.length,
    ready: completedRequired === required.length,
  };
}
