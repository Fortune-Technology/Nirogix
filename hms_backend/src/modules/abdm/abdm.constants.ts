/**
 * Every ABDM endpoint path, header name and scope string, in one file (ADR-084).
 *
 * **This is the file to check against the official V3 Postman collection.** It follows the same
 * containment idea as `notification/providers/msg91Provider.ts`: an external contract we do not
 * control is pinned in one place, so verifying it against NHA's published collection — and
 * correcting it when NHA changes something — is a diff to a single file rather than an audit of
 * the whole module. Nothing else in the codebase may hard-code an ABDM path.
 *
 * Hosts are NOT here: they come from `ABDM_GATEWAY_BASE_URL` / `ABDM_ABHA_BASE_URL` so sandbox
 * and production differ by configuration only (the whole point of exiting sandbox cleanly).
 *
 * **Reconciled 25/08/2026 against the official "Milestone 1 Postman Collection-18-08-2025"** (143
 * requests). Every path below is copied from it. Four deviations it exposed are recorded in the
 * comments where they matter: the login-verify scope is a two-element array, `verify/user` is
 * authenticated with `T-token` rather than `X-token`, ABHA-address verification is a different API
 * family entirely (`/v3/phr/web/...`), and Scan and Share is a two-way exchange on a path NHA
 * dictates. Re-check this file against the collection whenever NHA publishes a new one.
 *
 * V3 ONLY. V1/V2 paths are rejected at NHA's sandbox-exit review, so a V1 path appearing here
 * is a defect even if it works.
 */

/** Gateway host — session issuance and HIP-facing routing. */
export const GATEWAY_PATHS = {
  /** POST — client credentials in, bearer access token out. Cached; never called per request. */
  sessions: '/api/hiecm/gateway/v3/sessions',
} as const;

/** ABHA host — enrolment (create) and profile (verify) APIs. */
export const ABHA_PATHS = {
  /** GET — RSA public certificate. Aadhaar numbers, mobile numbers and OTPs encrypt with it. */
  publicCertificate: '/v3/profile/public/certificate',

  // --- A. Creation (a patient who does not yet have an ABHA) -------------------------------
  /** POST — send the OTP to the Aadhaar-linked mobile. Returns txnId. */
  enrolRequestOtp: '/v3/enrollment/request/otp',
  /** POST — encrypted OTP + txnId in, ABHA profile + tokens out. Creates the ABHA number. */
  enrolByAadhaar: '/v3/enrollment/enrol/byAadhaar',
  /**
   * POST — the secondary mobile check, used when the patient wants a mobile number that is not
   * the one Aadhaar has. Skipping it is not a shortcut: it changes which linking token comes
   * back, and the wrong token fails later at M2 linking.
   */
  enrolAuthByAbdm: '/v3/enrollment/auth/byAbdm',
  /** GET — candidate ABHA addresses for the patient to choose from. */
  abhaAddressSuggestion: '/v3/enrollment/enrol/suggestion',
  /** POST — claim the chosen ABHA address. */
  abhaAddressCreate: '/v3/enrollment/enrol/abha-address',
  /** GET — the ABHA card, PNG/PDF, authenticated by the profile X-token. */
  abhaCard: '/v3/profile/account/abha-card',

  // --- B. Verification (a patient who already has an ABHA) --------------------------------
  /** POST — OTP to the identifier being verified (ABHA number / address / mobile / Aadhaar). */
  loginRequestOtp: '/v3/profile/login/request/otp',
  /** POST — encrypted OTP in; a token plus the list of ABHA accounts on that identifier out. */
  loginVerify: '/v3/profile/login/verify',
  /** POST — pick one ABHA when the identifier resolves to several (a shared family mobile). */
  loginVerifyUser: '/v3/profile/login/verify/user',
  /** GET — the full profile for a verified session. */
  profileAccount: '/v3/profile/account',

  // --- B2. ABHA ADDRESS verification — a DIFFERENT API family ------------------------------
  //
  // Verifying someone by their ABHA *address* does not go through `/v3/profile/login/*` at all.
  // The collection routes it through the PHR web login endpoints, with its own scope pair
  // (`abha-address-login` + `mobile-verify`) and its own profile and card paths. Sending an
  // ABHA address to the profile-login endpoints looks reasonable and simply does not work.
  phrLoginSearch: '/v3/phr/web/login/abha/search',
  phrLoginRequestOtp: '/v3/phr/web/login/abha/request/otp',
  phrLoginVerify: '/v3/phr/web/login/abha/verify',
  phrProfile: '/v3/phr/web/login/profile/abha-profile',
  phrCard: '/v3/phr/web/login/profile/abha/phr-card',
} as const;

/**
 * Headers NHA requires on V3 calls.
 *
 * `X-HIP-ID` is the hospital's HFR facility id and is therefore **per tenant**, read from
 * `abdm_facility_config` — never from server configuration, or every hospital on the platform
 * would transact as whichever one was configured last.
 */
export const ABDM_HEADERS = {
  requestId: 'REQUEST-ID',
  timestamp: 'TIMESTAMP',
  cmId: 'X-CM-ID',
  hipId: 'X-HIP-ID',
  /** Profile-scoped bearer for a specific ABHA holder, distinct from the client Authorization. */
  xToken: 'X-token',
  /**
   * The token `profile/login/verify` hands back, used ONLY to pick one ABHA out of several at
   * `verify/user`. It is a different header from `X-token`, and sending the wrong one is a 401
   * that reads like a credential problem — the collection is explicit about this.
   */
  tToken: 'T-token',
  /** Carries the transaction on the ABHA-address suggestion GET, which has no body. */
  transactionId: 'Transaction_Id',
  authorization: 'Authorization',
} as const;

/** `scope` values on the login/enrolment calls. NHA is strict about these strings. */
export const ABDM_SCOPES = {
  abhaLogin: 'abha-login',
  abhaAddressLogin: 'abha-address-login',
  mobileVerify: 'mobile-verify',
  aadhaarVerify: 'aadhaar-verify',
  searchAbha: 'search-abha',
  verifyEnrolment: 'abha-enrol',
} as const;

/** Which identifier a verify flow is keyed on — maps to `loginHint` on the login OTP call. */
export const LOGIN_HINTS = {
  abhaNumber: 'abha-number',
  abhaAddress: 'abha-address',
  mobile: 'mobile',
  aadhaar: 'aadhaar',
} as const;

/** Where the OTP is delivered from: UIDAI sends it for Aadhaar, ABDM for everything else. */
export const OTP_SYSTEMS = {
  aadhaar: 'aadhaar',
  abdm: 'abdm',
} as const;

/**
 * Scan and Share, as NHA actually operates it — a two-way exchange, not a one-way push.
 *
 * 1. The patient scans the facility QR in their PHR app.
 * 2. The gateway POSTs the profile to **our** bridge URL with this path appended. The path is
 *    NHA's, not ours: a participant registers one base URL and the gateway concatenates
 *    `/api/v3/hip/patient/share`. That is why it is mounted outside `/api/v1` (see
 *    `abdm.gatewayRoutes.ts`) — the versioning of an externally dictated webhook is not ours
 *    to choose.
 * 3. We answer back on the gateway with `on-share`, carrying the token number the patient sees
 *    at the desk. Without step 3 the patient's app shows nothing and the flow is incomplete,
 *    which is the part a one-way implementation silently gets wrong.
 */
export const HIP_PROFILE_SHARE_PATH = '/api/v3/hip/patient/share';
export const GATEWAY_ON_SHARE_PATH = '/api/hiecm/patient-share/v3/on-share';

/**
 * Milestone 2 — the HIP calls, all on the **gateway** host rather than the ABHA one (ADR-089).
 *
 * Two different hosts serve M1 and M2, which is easy to get wrong and produces a 404 that reads
 * like a missing feature: identity lives on `ABDM_ABHA_BASE_URL`, everything a Health Information
 * Provider does lives on `ABDM_GATEWAY_BASE_URL`.
 */
export const HIP_GATEWAY_PATHS = {
  /**
   * POST — asks for a link token by demographic auth. The token does **not** come back in the
   * response; NHA delivers it to our webhook, which is why acquisition is a two-step flow.
   */
  generateLinkToken: '/api/hiecm/v3/token/generate-token',
  /** POST — links care contexts to an ABHA address. Authenticated by `X-LINK-TOKEN`. */
  linkCareContext: '/api/hiecm/hip/v3/link/carecontext',
  /** POST — tells subscribed PHR apps that an already-linked context has new records. */
  notifyCareContext: '/api/hiecm/hip/v3/link/context/notify',
  /** POST — the fallback when we hold no ABHA: ABDM texts the patient a deep link. */
  smsNotify: '/api/hiecm/hip/v3/link/patient/links/sms/notify2',
} as const;

/**
 * The paths ABDM calls back on, appended to our registered bridge URL.
 *
 * Ours to serve, not to choose — same as the Scan-and-Share callback, and mounted alongside it
 * outside `/api/v1` for the same reason.
 */
export const HIP_CALLBACK_PATHS = {
  onGenerateToken: '/api/v3/hip/token/on-generate-token',
  onLinkCareContext: '/api/v3/link/on_carecontext',
} as const;

/**
 * Discovery and user-initiated linking — the patient finding their own records (ADR-090).
 *
 * The half ABDM calls US on. **These three inbound paths are the only ones in this file NOT
 * confirmed against an official collection**: the Milestone 1 collection does not contain them and
 * the M2 documentation shows only the gateway side. They follow the same convention as the
 * confirmed Scan-and-Share path (`/api/v3/hip/...` appended to the bridge URL), which is why they
 * are shaped this way — but **verify them against the M2 Postman collection before the exit demo**
 * (`BACKLOG.md`). A wrong inbound path fails silently: the gateway simply never reaches us.
 */
export const HIP_DISCOVERY_CALLBACK_PATHS = {
  discover: '/api/v3/hip/patient/care-context/discover',
  linkInit: '/api/v3/hip/link/care-context/init',
  linkConfirm: '/api/v3/hip/link/care-context/confirm',
} as const;

/** Our answers, posted back to the gateway. These ARE from the M2 documentation. */
export const USER_LINKING_PATHS = {
  onDiscover: '/api/hiecm/user-initiated-linking/v3/patient/care-context/on-discover',
  onInit: '/api/hiecm/user-initiated-linking/v3/link/care-context/on-init',
  onConfirm: '/api/hiecm/user-initiated-linking/v3/link/care-context/on-confirm',
} as const;

/**
 * Data flow — answering a consented request for health records (ADR-091).
 *
 * The outbound halves are from the M2 documentation. The **inbound** path carries the same caveat
 * as the discovery callbacks: it is not in the Milestone 1 collection, so it follows the confirmed
 * convention and must be verified against the M2 collection (`BACKLOG.md`).
 */
export const DATA_FLOW_PATHS = {
  /** POST — our prompt "ACKNOWLEDGED", so the gateway stops waiting on the request connection. */
  onRequest: '/api/hiecm/data-flow/v3/health-information/hip/on-request',
  /** POST — how the flow ended, per care context. */
  notify: '/api/hiecm/data-flow/v3/health-information/notify',
} as const;

/** Where the gateway asks us for records. **Unverified** — see the note above. */
export const HIP_DATA_REQUEST_PATH = '/api/v3/hip/health-information/request';

/**
 * Milestone 3 — being a Health Information USER (ADR-092).
 *
 * The mirror image of M2: instead of answering requests for our records, we ask a patient for
 * permission to read the history other hospitals hold. The outbound halves come from the M3
 * documentation; the **inbound** callbacks carry the same caveat as every other M2/M3 inbound path —
 * they are not in the Milestone 1 collection, so they follow the confirmed convention and must be
 * verified against the M3 collection (`BACKLOG.md`).
 *
 * HIU calls additionally carry `X-HIU-ID`, which HIP calls do not.
 */
export const HIU_CONSENT_PATHS = {
  /** POST — ask the patient, through their consent manager. Answers async on `on-init`. */
  requestInit: '/api/hiecm/consent/v3/request/init',
  /** POST — where has this request got to? The fallback for a callback that never arrived. */
  requestStatus: '/api/hiecm/consent/v3/request/status',
  /** POST — fetch one granted artefact. Answers async on `on-fetch`. */
  fetch: '/api/hiecm/consent/v3/fetch',
  /** POST — acknowledge a revoke/expire notification, so ABDM knows we acted on it. */
  onNotify: '/api/hiecm/consent/v3/request/hiu/on-notify',
} as const;

/** POST — ask a HIP to send the records. Answers by pushing to our `dataPushUrl`. */
export const HIU_DATA_REQUEST_PATH = '/api/hiecm/data-flow/v3/health-information/request';

/** Where ABDM calls US as an HIU. **Unverified** — see the note above. */
export const HIU_CALLBACK_PATHS = {
  onInit: '/api/v3/hiu/consent/request/on-init',
  onFetch: '/api/v3/hiu/consent/on-fetch',
  onNotify: '/api/v3/hiu/consent/request/notify',
  /** Our `dataPushUrl`: where a HIP delivers the encrypted records. */
  dataPush: '/api-hiu/data/notification',
} as const;

/**
 * Bridge administration, for reference only — these are run by hand once per environment, not
 * from application code. Recorded here because NHA's onboarding email quotes **outdated V1
 * paths** (`/gateway/v1/bridges`, `/gateway/v1/bridges/addUpdateServices`), and the V3 collection
 * supersedes them. Service registration is also on a different host (the facility registry) and
 * takes `type: "HIP"` — the email's `HEALTH_LOCKER` example is a different participant type.
 */
export const BRIDGE_ADMIN = {
  /** PATCH on the gateway host — sets the base URL the gateway calls us on. */
  updateBridgeUrl: '/api/hiecm/gateway/v3/bridge/url',
  /** GET on the gateway host — what this bridge currently has registered. */
  listBridgeServices: '/api/hiecm/gateway/v3/bridge-services',
  /** POST on `https://facilitysbx.abdm.gov.in` (sandbox facility registry), NOT the gateway. */
  registerServices: '/v1/bridges/MutipleHRPAddUpdateServices',
} as const;

export type AbdmScope = (typeof ABDM_SCOPES)[keyof typeof ABDM_SCOPES];
export type LoginHint = (typeof LOGIN_HINTS)[keyof typeof LOGIN_HINTS];
