import { Router } from 'express';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { authLimiter } from '../../http/rateLimit';
import {
  HIP_CALLBACK_PATHS,
  HIP_DATA_REQUEST_PATH,
  HIP_DISCOVERY_CALLBACK_PATHS,
  HIP_PROFILE_SHARE_PATH,
} from './abdm.constants';
import {
  DiscoverBody,
  HealthInformationRequestBody,
  HipProfileShareBody,
  LinkConfirmBody,
  LinkInitBody,
  OnGenerateTokenBody,
  OnLinkCareContextBody,
} from './abdm.schema';
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

// Milestone 2 callbacks (ADR-089). Same posture as the share callback above: the hospital is
// resolved server-side from `X-HIP-ID`, and the answer is an identical 202 regardless, so neither
// can be used to probe which facilities or ABHA addresses exist.
abdmGatewayRouter.post(
  HIP_CALLBACK_PATHS.onGenerateToken,
  authLimiter,
  validate({ body: OnGenerateTokenBody }),
  asyncHandler(c.onGenerateToken),
);

abdmGatewayRouter.post(
  HIP_CALLBACK_PATHS.onLinkCareContext,
  authLimiter,
  validate({ body: OnLinkCareContextBody }),
  asyncHandler(c.onLinkCareContext),
);

// Discovery and user-initiated linking (ADR-090) — the patient finding and linking their own
// records. All three answer 202 immediately and reply properly on the gateway's `on-*` endpoints,
// because that is the shape of the protocol: the gateway is waiting for a callback, not for this
// connection. **These three inbound paths are unverified against an official collection** — see
// `abdm.constants.ts` and `BACKLOG.md`.
abdmGatewayRouter.post(
  HIP_DISCOVERY_CALLBACK_PATHS.discover,
  authLimiter,
  validate({ body: DiscoverBody }),
  asyncHandler(c.discoverCareContexts),
);

abdmGatewayRouter.post(
  HIP_DISCOVERY_CALLBACK_PATHS.linkInit,
  authLimiter,
  validate({ body: LinkInitBody }),
  asyncHandler(c.initCareContextLink),
);

abdmGatewayRouter.post(
  HIP_DISCOVERY_CALLBACK_PATHS.linkConfirm,
  authLimiter,
  validate({ body: LinkConfirmBody }),
  asyncHandler(c.confirmCareContextLink),
);

// A consented request for health records (ADR-091). Acknowledged immediately; the build, encrypt
// and push run on the queue inside NHA's twenty-minute allowance.
abdmGatewayRouter.post(
  HIP_DATA_REQUEST_PATH,
  authLimiter,
  validate({ body: HealthInformationRequestBody }),
  asyncHandler(c.requestHealthInformation),
);
