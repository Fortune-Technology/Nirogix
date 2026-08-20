import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../components/Can";
import { ReportsView } from "../../../components/reports/ReportsView";

// The OPD register lives at the section root; Collections and Pending labs are its
// siblings (`/reports/collections`, `/reports/pending-labs`). Each register is its own
// route so the URL, refresh and back/forward all agree on which one is open.
export default function ReportsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.REPORTS_VIEW}>
      <ReportsView view="opd" />
    </RequirePermission>
  );
}
