import { Router } from 'express';
import { healthRouter } from '../../modules/health/health.routes';

// The /api/v1 router. Every business-module router mounts here as it is built —
// each gated by requireModule() then requirePermission() (added with the authz core).
export const apiV1 = Router();

apiV1.use(healthRouter);

// Mounted as modules land:
// apiV1.use('/auth', authRouter);
// apiV1.use('/patients', requireModule('patient'), patientRouter);
// ...
