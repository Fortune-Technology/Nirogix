import { Router } from 'express';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { authLimiter } from '../../http/rateLimit';
import { HIP_PROFILE_SHARE_PATH } from './abdm.constants';
import { HipProfileShareBody } from './abdm.schema';
import * as c from './abdm.controller';

/**
 * The routes ABDM itself calls — mounted at the root, outside `/api/v1` (ADR-084).
 *
 * **Why this breaks the versioning convention, deliberately.** A participant registers ONE bridge
 * URL with NHA and the gateway appends a fixed path of its own choosing: `/api/v3/hip/patient/share`.
 * The path is not ours to version, rename or nest — it is dictated by the counterparty, exactly like
 * a payment provider's webhook. Serving it under `/api/v1` would simply mean the gateway calls a URL
 * that does not exist, and the failure would look like a configuration problem at the hospital.
 *
 * Everything else in the module stays under `/api/v1` where it belongs. This file is the single,
 * documented exception, and it holds only routes ABDM originates.
 *
 * Held to the public-endpoint rules (ADR-056): the tenant is resolved server-side from
 * `metaData.hipId`, it writes no clinical row, it answers identically whatever the facility turns
 * out to be, it is rate-limited at the sign-in tier, and it is audited with no actor.
 */
export const abdmGatewayRouter = Router();

abdmGatewayRouter.post(
  HIP_PROFILE_SHARE_PATH,
  authLimiter,
  validate({ body: HipProfileShareBody }),
  asyncHandler(c.profileShareCallback),
);
