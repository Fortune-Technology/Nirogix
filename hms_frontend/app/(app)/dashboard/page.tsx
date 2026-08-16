"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { useAuth, useCan } from "../../../lib/auth";
import { HospitalAdminDashboard } from "../../../components/dashboard/HospitalAdminDashboard";
import { ClinicalDashboard, clinicalRoleFor } from "../../../components/dashboard/ClinicalDashboard";
import { StaffDashboard } from "../../../components/dashboard/StaffDashboard";

/**
 * The hospital's dashboard, chosen by what the signed-in user is allowed to do
 * (ADR-044). Every variant is built on the same shared layout — context line,
 * title, KPI row, panel rows — so the product reads as one thing whichever seat
 * you are in.
 *
 * A platform operator does not belong here at all: their dashboard is `/platform`,
 * and this page's clinical content is exactly the duplicate-of-every-hospital's-
 * menu that ADR-037 rules out. They are redirected — unless they are inside a
 * support session, where the hospital's own view is the point.
 */
export default function DashboardPage() {
  const { user, can } = useAuth();
  const router = useRouter();
  const inTenantContext = Boolean(user?.impersonatedBy);
  const isPlatformOperator = useCan(PERMISSIONS.TENANTS_MANAGE) && !inTenantContext;
  // Administering the hospital (users, branches, roles) rather than working in it.
  const isHospitalAdmin = useCan(PERMISSIONS.USERS_MANAGE) || useCan(PERMISSIONS.BRANCHES_MANAGE);

  useEffect(() => {
    if (isPlatformOperator) router.replace("/platform");
  }, [isPlatformOperator, router]);

  if (isPlatformOperator) {
    return (
      <div className="flex items-center gap-2 text-fg-muted">
        <Spinner /> Opening the platform overview…
      </div>
    );
  }

  if (isHospitalAdmin) return <HospitalAdminDashboard fullName={user?.fullName} />;

  const clinicalRole = clinicalRoleFor(can);
  if (clinicalRole) return <ClinicalDashboard role={clinicalRole} fullName={user?.fullName} />;

  // Everyone else — a cashier, a records clerk, a read-only auditor. Same layout,
  // only what their permissions actually reach.
  return <StaffDashboard fullName={user?.fullName} />;
}
