import { Router } from 'express';
import { healthRouter } from '../../modules/health/health.routes';
import { authRouter } from '../../modules/auth/auth.routes';
import { adminRouter } from '../../modules/admin/admin.routes';
import { userRouter } from '../../modules/user/user.routes';
import { branchRouter } from '../../modules/branch/branch.routes';
import { rbacRouter } from '../../modules/rbac/rbac.routes';
import { entitlementRouter } from '../../modules/entitlement/entitlement.routes';
import { auditRouter } from '../../modules/audit/audit.routes';
import { notificationRouter } from '../../modules/notification/notification.routes';
import { fileRouter } from '../../modules/file/file.routes';
import { providerRouter } from '../../modules/provider/provider.routes';
import { brandingRouter } from '../../modules/branding/branding.routes';
import { organizationRouter } from '../../modules/organization/organization.routes';
import { departmentRouter } from '../../modules/department/department.routes';
import { patientIdentityRouter } from '../../modules/patient-identity/patientIdentity.routes';
import { aiPortalRouter } from '../../modules/ai-portal/aiPortal.routes';
import { setupRouter } from '../../modules/setup/setup.routes';
import { platformBrandingRouter } from '../../modules/platform-branding/platformBranding.routes';
import { dashboardRouter } from '../../modules/dashboard/dashboard.routes';
import { patientRouter } from '../../modules/patient/patient.routes';
import { appointmentRouter } from '../../modules/appointment/appointment.routes';
import { opdRouter } from '../../modules/opd/opd.routes';
import { billingRouter } from '../../modules/billing/billing.routes';
import { emrRouter } from '../../modules/emr/emr.routes';
import { pharmacyRouter } from '../../modules/pharmacy/pharmacy.routes';
import { laboratoryRouter } from '../../modules/laboratory/laboratory.routes';
import { reportsRouter } from '../../modules/reports/reports.routes';

// The /api/v1 router. Every business-module router mounts here as it is built —
// each gated by requireModule() then requirePermission() (added with the authz core).
export const apiV1 = Router();

apiV1.use(healthRouter);
apiV1.use(authRouter);
apiV1.use(adminRouter);
apiV1.use(userRouter);
apiV1.use(branchRouter);
apiV1.use(rbacRouter);
apiV1.use(entitlementRouter);
apiV1.use(auditRouter);
apiV1.use(notificationRouter);
apiV1.use(fileRouter);
apiV1.use(providerRouter);
apiV1.use(brandingRouter);
apiV1.use(organizationRouter);
apiV1.use(departmentRouter);
apiV1.use(patientIdentityRouter);
apiV1.use(aiPortalRouter);
apiV1.use(setupRouter);
apiV1.use(platformBrandingRouter);
apiV1.use(dashboardRouter);
apiV1.use(patientRouter);
apiV1.use(appointmentRouter);
apiV1.use(opdRouter);
apiV1.use(billingRouter);
apiV1.use(emrRouter);
apiV1.use(pharmacyRouter);
apiV1.use(laboratoryRouter);
apiV1.use(reportsRouter);

// Mounted as modules land:
// apiV1.use('/auth', authRouter);
// apiV1.use('/patients', requireModule('patient'), patientRouter);
// ...
