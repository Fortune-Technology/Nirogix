import { Router } from 'express';
import { healthRouter } from '../../modules/health/health.routes';
import { authRouter } from '../../modules/auth/auth.routes';
import { rbacRouter } from '../../modules/rbac/rbac.routes';
import { entitlementRouter } from '../../modules/entitlement/entitlement.routes';
import { auditRouter } from '../../modules/audit/audit.routes';
import { notificationRouter } from '../../modules/notification/notification.routes';
import { fileRouter } from '../../modules/file/file.routes';

// The /api/v1 router. Every business-module router mounts here as it is built —
// each gated by requireModule() then requirePermission() (added with the authz core).
export const apiV1 = Router();

apiV1.use(healthRouter);
apiV1.use(authRouter);
apiV1.use(rbacRouter);
apiV1.use(entitlementRouter);
apiV1.use(auditRouter);
apiV1.use(notificationRouter);
apiV1.use(fileRouter);

// Mounted as modules land:
// apiV1.use('/auth', authRouter);
// apiV1.use('/patients', requireModule('patient'), patientRouter);
// ...
