import { Router } from 'express';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { authLimiter } from '../../http/rateLimit';
import {
  HIP_CALLBACK_PATHS,
  HIP_CONSENT_NOTIFY_PATH,
  HIP_DATA_REQUEST_PATH,
  HIP_DISCOVERY_CALLBACK_PATHS,
  HIP_PROFILE_SHARE_PATH,
  HIU_CALLBACK_PATHS,
} from './abdm.constants';
import {
  DiscoverBody,
  GatewayAcknowledgementBody,
  HealthInformationRequestBody,
  HipConsentNotifyBody,
  HipProfileShareBody,
  HiuConsentNotifyBody,
  HiuDataPushBody,
  HiuOnFetchBody,
  HiuOnConsentStatusBody,
  HiuOnDataRequestBody,
  HiuOnInitBody,
  LinkConfirmBody,
  LinkInitBody,
  OnGenerateTokenBody,
  OnLinkCareContextBody,
} from './abdm.schema';
import * as c from './abdm.controller';
import { requireAbdmGateway } from './gatewayAuth';

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
 *
 * **And, since 31/08/2026, authenticated.** Every route below carries `requireAbdmGateway`, which
 * verifies the caller's bearer JWT against NHA's published JWKS. ADR-056's protections are about
 * *enumeration*; they say nothing about *forgery*, and an audit against NHA's own collections found
 * that gap was a complete path to patient data: a facility id is public, so anyone could plant a
 * GRANTED consent here and then request the records against it, nominating their own push URL and
 * their own encryption key. The guard is the thing that makes "the caller is ABDM" true rather than
 * assumed. See `gatewayAuth.ts`.
 */
export const abdmGatewayRouter = Router();

abdmGatewayRouter.post(
  HIP_PROFILE_SHARE_PATH,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HipProfileShareBody }),
  asyncHandler(c.profileShareCallback),
);

// Milestone 2 callbacks (ADR-089). Same posture as the share callback above: the hospital is
// resolved server-side from `X-HIP-ID`, and the answer is an identical 202 regardless, so neither
// can be used to probe which facilities or ABHA addresses exist.
abdmGatewayRouter.post(
  HIP_CALLBACK_PATHS.onGenerateToken,
  authLimiter,
  requireAbdmGateway,
  validate({ body: OnGenerateTokenBody }),
  asyncHandler(c.onGenerateToken),
);

abdmGatewayRouter.post(
  HIP_CALLBACK_PATHS.onLinkCareContext,
  authLimiter,
  requireAbdmGateway,
  validate({ body: OnLinkCareContextBody }),
  asyncHandler(c.onLinkCareContext),
);

// Discovery and user-initiated linking (ADR-090) — the patient finding and linking their own
// records. All three answer 202 immediately and reply properly on the gateway's `on-*` endpoints,
// because that is the shape of the protocol: the gateway is waiting for a callback, not for this
// connection. All three paths are **confirmed** against NHA's own M2 document (ADR-140); the
// warning that used to sit here is gone because the document, not a convention, now says so.
abdmGatewayRouter.post(
  HIP_DISCOVERY_CALLBACK_PATHS.discover,
  authLimiter,
  requireAbdmGateway,
  validate({ body: DiscoverBody }),
  asyncHandler(c.discoverCareContexts),
);

abdmGatewayRouter.post(
  HIP_DISCOVERY_CALLBACK_PATHS.linkInit,
  authLimiter,
  requireAbdmGateway,
  validate({ body: LinkInitBody }),
  asyncHandler(c.initCareContextLink),
);

abdmGatewayRouter.post(
  HIP_DISCOVERY_CALLBACK_PATHS.linkConfirm,
  authLimiter,
  requireAbdmGateway,
  validate({ body: LinkConfirmBody }),
  asyncHandler(c.confirmCareContextLink),
);

// How a consent reaches a HIP at all — granted, revoked or expired (ADR-101). Without this route
// `revokeConsent` is unreachable and a withdrawn consent keeps authorising transfers, which is the
// one consent defect with a real clinical consequence rather than a retryable one.
abdmGatewayRouter.post(
  HIP_CONSENT_NOTIFY_PATH,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HipConsentNotifyBody }),
  asyncHandler(c.hipConsentNotify),
);

// A consented request for health records (ADR-091). Acknowledged immediately; the build, encrypt
// and push run on the queue inside NHA's twenty-minute allowance.
abdmGatewayRouter.post(
  HIP_DATA_REQUEST_PATH,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HealthInformationRequestBody }),
  asyncHandler(c.requestHealthInformation),
);

// --- Milestone 3, inbound (ADR-092, ADR-140) --------------------------------------------------
// Every path below is confirmed against NHA's own M3 document. Reading it also found two callbacks
// that were missing outright — `on-status` and `on-request` — which is why the last two routes in
// this file exist: the protocol answers on callbacks, so an unserved callback is an answer we never
// receive rather than an error anyone reports.

abdmGatewayRouter.post(
  HIU_CALLBACK_PATHS.onInit,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HiuOnInitBody }),
  asyncHandler(c.hiuOnInit),
);

abdmGatewayRouter.post(
  HIU_CALLBACK_PATHS.onFetch,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HiuOnFetchBody }),
  asyncHandler(c.hiuOnFetch),
);

// The one that obliges us to destroy records. Answered 202; ABDM is acknowledged only after the
// purge has actually happened.
abdmGatewayRouter.post(
  HIU_CALLBACK_PATHS.onNotify,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HiuConsentNotifyBody }),
  asyncHandler(c.hiuConsentNotify),
);

// Where a HIP delivers the records we asked for. Our own dataPushUrl, so the path is ours to
// choose; it is sent to ABDM on every request rather than assumed.
abdmGatewayRouter.post(
  HIU_CALLBACK_PATHS.dataPush,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HiuDataPushBody }),
  asyncHandler(c.hiuDataPush),
);

// The two callbacks that were missing outright until 03/09/2026 (ADR-140). Both are read from
// NHA's own M3 document, and both are the ANSWER to a call we were already making — which is why
// their absence produced no error anywhere: an unserved callback is silence, not a failure.
abdmGatewayRouter.post(
  HIU_CALLBACK_PATHS.onConsentStatus,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HiuOnConsentStatusBody }),
  asyncHandler(c.hiuOnConsentStatus),
);

// The transaction id lives here and nowhere else. Without this route a real HIP's delivery has no
// row to attach to and is discarded unread.
abdmGatewayRouter.post(
  HIU_CALLBACK_PATHS.onDataRequest,
  authLimiter,
  requireAbdmGateway,
  validate({ body: HiuOnDataRequestBody }),
  asyncHandler(c.hiuOnDataRequest),
);

// --- Milestone 2, the acknowledgements (M2 document §4.3.7 and §4.3.9, ADR-140) ---------------
// Every outbound call in this protocol is answered on a callback rather than on its own connection,
// so a notify with no acknowledgement route is a notify whose outcome we can never state.
abdmGatewayRouter.post(
  HIP_CALLBACK_PATHS.contextOnNotify,
  authLimiter,
  requireAbdmGateway,
  validate({ body: GatewayAcknowledgementBody }),
  asyncHandler(c.careContextOnNotify),
);

abdmGatewayRouter.post(
  HIP_CALLBACK_PATHS.smsOnNotify,
  authLimiter,
  requireAbdmGateway,
  validate({ body: GatewayAcknowledgementBody }),
  asyncHandler(c.smsOnNotify),
);
