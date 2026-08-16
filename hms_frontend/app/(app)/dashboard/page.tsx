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
 * A platform operator has no dashboard here at all: theirs is the admin console on
 * its own origin (ADR-051). If one reaches this page outside a support session they
 * see the staff view their permissions actually reach, which is almost nothing —
 * there is nothing to redirect to, and nothing to hide.
 */
export default function DashboardPage() {
  const { user, can } = useAuth();
  const router = useRouter();
  // Administering the hospital (users, branches, roles) rather than working in it.
  const isHospitalAdmin = useCan(PERMISSIONS.USERS_MANAGE) || useCan(PERMISSIONS.BRANCHES_MANAGE);

  if (isHospitalAdmin) return <HospitalAdminDashboard fullName={user?.fullName} />;

  const clinicalRole = clinicalRoleFor(can);
  if (clinicalRole) return <ClinicalDashboard role={clinicalRole} fullName={user?.fullName} />;

  // Everyone else — a cashier, a records clerk, a read-only auditor. Same layout,
  // only what their permissions actually reach.
  return <StaffDashboard fullName={user?.fullName} />;
}
