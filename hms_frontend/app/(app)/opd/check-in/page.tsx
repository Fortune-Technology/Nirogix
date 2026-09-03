'use client';

import { Suspense } from 'react';
import { PERMISSIONS } from '@hms/permissions';
import { RequirePermission } from '../../../../components/Can';
import { VisitWorkflow } from '../../../../components/visit/VisitWorkflow';

/**
 * Check-in — the "right now" half of the one visit workflow (ADR-115).
 *
 * The route stays because the navigation, the OPD queue, the patient chart, the referral worklist
 * and everyone's bookmarks link to it, and because its permission differs from booking's. What it
 * does not have is a form of its own: the same component serves `/appointments/new`, so the two
 * cannot drift apart the way they had.
 */
export default function CheckInPage() {
  return (
    <RequirePermission perm={PERMISSIONS.OPD_CHECKIN}>
      <Suspense fallback={null}>
        <VisitWorkflow defaultTiming="now" />
      </Suspense>
    </RequirePermission>
  );
}
