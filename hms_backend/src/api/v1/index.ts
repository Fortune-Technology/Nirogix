import { Router } from 'express';
import { healthRouter } from '../../modules/health/health.routes';
import { authRouter } from '../../modules/auth/auth.routes';

// The /api/v1 router. Every business-module router mounts here as it is built —
// each gated by requireModule() then requirePermission() (added with the authz core).
export const apiV1 = Router();

apiV1.use(healthRouter);
apiV1.use(authRouter);

// Mounted as modules land:
// apiV1.use('/auth', authRouter);
// apiV1.use('/patients', requireModule('patient'), patientRouter);
// ...
