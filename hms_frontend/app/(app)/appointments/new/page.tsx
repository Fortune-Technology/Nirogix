"use client";

import { Suspense } from "react";
import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../../components/Can";
import { VisitWorkflow } from "../../../../components/visit/VisitWorkflow";

/**
 * Booking — the "future" half of the one visit workflow (ADR-115).
 *
 * Identical to check-in except for when the patient is seen, which is a control inside the
 * workflow rather than a choice of page. A user holding both permissions can switch without
 * losing what they have already typed.
 */
export default function NewAppointmentPage() {
  return (
    <RequirePermission perm={PERMISSIONS.APPOINTMENT_CREATE}>
      <Suspense fallback={null}>
        <VisitWorkflow defaultTiming="future" />
      </Suspense>
    </RequirePermission>
  );
}
