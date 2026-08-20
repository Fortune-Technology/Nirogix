import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../../components/Can";
import { ReportsView } from "../../../../components/reports/ReportsView";

export default function PendingLabsReportPage() {
  return (
    <RequirePermission perm={PERMISSIONS.REPORTS_VIEW}>
      <ReportsView view="pending" />
    </RequirePermission>
  );
}
