// Imports every module's OpenAPI registration for its side effects (each file calls
// registry.registerPath(...)). When you add a module, create a `<module>.openapi.ts` next
// to its routes and import it here — otherwise the coverage validator will flag its routes
// as undocumented and fail the build.
import '../modules/health/health.openapi';
import '../modules/auth/auth.openapi';
import '../modules/admin/admin.openapi';
import '../modules/user/user.openapi';
import '../modules/branch/branch.openapi';
import '../modules/rbac/rbac.openapi';
import '../modules/entitlement/entitlement.openapi';
import '../modules/audit/audit.openapi';
import '../modules/notification/notification.openapi';
import '../modules/file/file.openapi';
import '../modules/provider/provider.openapi';
import '../modules/branding/branding.openapi';
import '../modules/organization/organization.openapi';
import '../modules/department/department.openapi';
import '../modules/patient-identity/patientIdentity.openapi';
import '../modules/ai-portal/aiPortal.openapi';
import '../modules/setup/setup.openapi';
import '../modules/platform-branding/platformBranding.openapi';
import '../modules/opd/opd.openapi';
import '../modules/billing/billing.openapi';
import '../modules/emr/emr.openapi';
import '../modules/pharmacy/pharmacy.openapi';
import '../modules/laboratory/laboratory.openapi';
import '../modules/reports/reports.openapi';
import '../modules/dashboard/dashboard.openapi';
import '../modules/patient/patient.openapi';
import '../modules/appointment/appointment.openapi';
import '../modules/referral/referral.openapi';
import '../modules/catalog/catalog.openapi';
import '../modules/immunization/immunization.openapi';
