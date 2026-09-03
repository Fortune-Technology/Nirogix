/**
 * Where each ABDM certification case is demonstrated.
 *
 * The requirements are **derived** from NHA's workbooks by `abdm-audit.ts` and are not editable
 * here. This file is the other half: a curated, reviewed statement of *where* each one is shown to
 * work. The two are joined by `abdm-evidence.ts`.
 *
 * The split is deliberate. Deriving requirements from a spreadsheet is safe; deriving *evidence*
 * from code is not — a grep that finds a function named `downloadAbhaCard` proves nothing about
 * whether an assessor can download an ABHA card. So evidence is asserted by a person, in writing,
 * and a case with no entry here is reported as **NOT EVIDENCED** rather than assumed to pass.
 * Silence is a gap, never a pass.
 *
 * `status` means:
 *   built        — implemented and demonstrable today
 *   partial      — implemented, with a stated limitation the assessor will see
 *   not-built    — no implementation; say so plainly rather than dressing it up
 *   unverified   — implemented, but never executed against the real registry
 *
 * Keep `where` concrete. "The ABDM module" helps nobody; a route, a screen path or a test name is
 * something a reviewer can open.
 */

export type EvidenceStatus = 'built' | 'partial' | 'not-built' | 'unverified';

export interface Evidence {
  status: EvidenceStatus;
  /** Screen path, API route, service function or test file — something openable. */
  where: string;
  /** Anything the assessor should know before they look. Kept short and honest. */
  note?: string;
}

/**
 * Cases are listed individually rather than by range, because a range hides the one case in the
 * middle that is not like its neighbours — which is how `CRT_ABHA_112` sat unenforced.
 */
export const EVIDENCE: Record<string, Evidence> = {
  // ── M1 · ABHA creation through Aadhaar OTP ────────────────────────────────
  CRT_ABHA_101: {
    status: 'built',
    where: 'Portal → Patients → Register → ABHA panel (components/abdm/AbhaVerificationPanel.tsx)',
    note: 'Create-ABHA is offered as one of the panel’s modes at the registration desk.',
  },
  CRT_ABHA_102: {
    status: 'built',
    where: 'AbhaVerificationPanel.tsx — consent block shown before any Aadhaar is accepted',
    note: 'ABDM’s published consent text, with an explicit agreement before the field unlocks.',
  },
  CRT_ABHA_104: {
    status: 'built',
    where: 'AbhaVerificationPanel.tsx (12-digit input) + abdm.schema.ts',
    note: 'Non-digits never enter the field; the API re-checks, because the form is not the boundary.',
  },
  CRT_ABHA_105: { status: 'built', where: 'AbhaVerificationPanel.tsx — OTP step' },
  CRT_ABHA_106: {
    status: 'built',
    where: 'abdm.service.ts resendOtp + __tests__/certificationGaps.test.ts',
    note: 'Throttle is on the transaction, not the browser: a reloaded page cannot spend a patient’s daily UIDAI allowance.',
  },
  CRT_ABHA_107: { status: 'built', where: 'POST /api/v1/abdm/abha/verify-otp' },
  CRT_ABHA_109: {
    status: 'built',
    where: 'AbhaVerificationPanel.tsx — communication-mobile step',
    note: 'A mobile that differs from the Aadhaar-linked one gets its own OTP round trip.',
  },
  CRT_ABHA_112: {
    status: 'built',
    where: 'AbhaVerificationPanel.tsx (address step) + AbhaAddressValue in abdm.schema.ts',
    note: 'Suggestions from ABDM plus free entry. Policy enforced at the API and printed beside the field; 6 tests in certificationGaps.test.ts.',
  },
  CRT_ABHA_113: {
    status: 'built',
    where: 'AbhaVerificationPanel.tsx — created ABHA number is displayed',
  },
  CRT_ABHA_114: {
    status: 'partial',
    where: 'AbhaVerificationPanel.tsx — ABHA card download',
    note: 'Streamed from ABDM during verification and never stored, so it cannot be re-downloaded from the chart afterwards.',
  },
  CRT_ABHA_209: {
    status: 'partial',
    where: 'GET /api/v1/abdm/transactions/:transactionId/card — the same download as CRT_ABHA_114',
    note: 'The card itself is built and works for any completed transaction. What is not built is the route into it: this case sits under "ABHA Creation Through Aadhaar Biometric", whose own steps (CRT_ABHA_201-208) are Optional and not implemented, so there is no biometric enrolment to download a card from. Reachable the moment biometric creation is.',
  },
  TAGGING_UNIQUEPATIENTID_UNIQUEABHANUMBER: {
    status: 'built',
    where: 'migration 0041_abha_number_unique.sql + certificationGaps.test.ts',
    note: 'One ABHA, one active chart, per tenant — on number and address, normalised so formatting is not a loophole.',
  },

  // ── M1 · ABHA verification ────────────────────────────────────────────────
  //
  // The half of the M1 workbook `abdm-audit.ts` used to drop on the floor: its `CASE_ID` list had
  // no `VRFY_` prefix, so fourteen mandatory cases were never counted and therefore never
  // evidenced. Added 03/09/2026 alongside the parser fix (ADR-139).
  VRFY_ABHA_101: {
    status: 'unverified',
    where:
      'POST /api/v1/abdm/verification/otp with otpSystem: "aadhaar" — __tests__/verification.test.ts',
    note: 'The Aadhaar route for an ABHA number. Built and tested; never yet run against the real registry.',
  },
  VRFY_ABHA_102: {
    status: 'unverified',
    where: 'Portal → ABHA panel → Verify → ABHA address, "OTP on the Aadhaar-linked mobile"',
    note: 'Runs on the PHR web-login family (search → OTP → verify → abha-profile → phr-card). All three previously-unused paths were CONFIRMED against the sandbox on 03/09/2026 (npm run abdm:check -- --phr): the search read our ciphertext and judged the address, the profile and card paths answered 401 for the token we withheld. What is still unverified is a complete round trip, which needs a real ABHA address and a real OTP.',
  },
  VRFY_ABHA_201: {
    status: 'built',
    where:
      'Portal → ABHA panel → Verify → ABHA number (default route) + __tests__/verification.test.ts',
  },
  VRFY_ABHA_202: {
    status: 'unverified',
    where: 'Portal → ABHA panel → Verify → ABHA address (default route)',
    note: 'Same PHR family as VRFY_ABHA_102. The profile and the card come from that family’s own paths, not from /v3/profile/account.',
  },
  'VRFY_ABHA _301': {
    status: 'built',
    where:
      'abdm.service.ts startVerification — mobile shape checked at the API; verification.test.ts',
    note: 'An invalid mobile is refused here with the workbook’s own wording; nothing reaches ABDM.',
  },
  'VRFY_ABHA _302': {
    status: 'built',
    where:
      'abdm.service.ts — ABDM_NO_ABHA_FOUND (404); Create ABHA stays open as its own panel tab',
    note: 'No account against the mobile is an answer, not an upstream failure. It used to be a 502.',
  },
  'VRFY_ABHA _303': {
    status: 'built',
    where: 'abdm.service.ts selectAbhaAccount + AbhaVerificationPanel.tsx account list',
    note: 'A shared family mobile resolves to several ABHAs; the operator picks before anything is prefilled.',
  },
  'VRFY_ABHA _304': {
    status: 'built',
    where: 'verification.test.ts — an incorrect OTP fails and the transaction is marked failed',
  },
  'VRFY_ABHA _305': {
    status: 'built',
    where: 'AbhaVerificationPanel.tsx ResendOtpButton + POST /api/v1/abdm/otp/resend',
    note: 'A button, not only an endpoint: at most twice, sixty seconds apart, re-checked on the transaction.',
  },
  VRFY_ABHA_401: {
    status: 'built',
    where: 'Portal → ABHA panel → Verify → Aadhaar number; 12-digit rule enforced at the API',
  },
  VRFY_ABHA_402: {
    status: 'built',
    where: 'verification.test.ts — incorrect OTP on the Aadhaar route',
  },
  VRFY_ABHA_403: {
    status: 'built',
    where: 'abdm.service.ts — ABDM_NO_ABHA_FOUND names the Aadhaar case and points at creation',
  },
  VRFY_ABHA_404: {
    status: 'built',
    where:
      'AbhaVerificationPanel.tsx VerifiedProfile — profile shown, card downloadable, chart linked',
  },
  VRFY_ABHA_405: { status: 'built', where: 'ResendOtpButton on the Aadhaar route; same throttle' },

  // ── M2 · HIP ──────────────────────────────────────────────────────────────
  HIP_INIT_GRANT_CONSENT_: {
    status: 'built',
    where: 'consent.service.ts + POST /api/v3/consent/request/hip/notify',
    note: 'Visible to an operator on the Consents card; the artefact is stored against the resolved facility.',
  },
  HIP_INIT_REVOKE_CONSENT: {
    status: 'built',
    where: 'consent.service.ts revokeConsent + abdm:m2check step 9',
    note: 'The artefact is DELETED, not flagged. The audit entry survives and holds metadata only.',
  },
  HIP_INIT_EXPIRE_CONSENT: { status: 'built', where: 'consent.service.ts + abdm:m2check step 9' },
  HIP_INTI_LINK_501: { status: 'built', where: 'linking.service.ts — HIP-initiated linking' },
  HIP_INTI_LINK_502: { status: 'built', where: 'linking.service.ts toPatientBlocks' },
  HIP_INTI_LINK_503: {
    status: 'built',
    where: 'discovery.service.ts — the matcher; __tests__/discovery.test.ts',
  },
  HIP_INTI_LINK_504: {
    status: 'built',
    where: 'linkToken.service.ts + abdm:m2check step 5',
    note: 'The token is encrypted at rest — it is standing permission to write to a national record.',
  },
  HIP_INTI_LINK_505: { status: 'built', where: 'careContext.service.ts + abdm:m2check step 5' },
  HIP_INTI_LINK_506: {
    status: 'unverified',
    where: 'dataTransfer.service.ts',
    note: 'Pull works end to end in mock mode. Never exercised from a real PHR app, because that needs the bridge URL registered.',
  },
  HIP_INIT_NOTIFY_HIECM: {
    status: 'built',
    where: 'linking.service.ts SMS/deep-link notify + abdm:m2check',
    note: 'Sent. The acknowledgement callback is not served — we do not learn whether it landed.',
  },
  HIP_INIT_SHARE_CARECONTEXT: {
    status: 'unverified',
    where: 'dataTransfer.service.ts + POST /api/v3/hip/health-information/request',
    note: 'Consent re-checked at send time. Encryption is now PROVEN on staging (ADR-108, abdm:fidelius-check — 23k-character bundle round-tripped against Fidelius 1.2.0). What remains unverified is the transfer itself: no real HIU has received one.',
  },

  // ── M2 · health records and user-initiated linking ───────────────────────
  //
  // Also dropped by the old `CASE_ID` list: `Health_RECORD_` and `USER_INIT_` were not prefixes it
  // knew, so seven more mandatory cases went uncounted (ADR-139).
  Health_RECORD_CREATION_101: {
    status: 'built',
    where:
      'Portal → OPD consultation / prescription / lab report; careContext.service.ts records each as a care context',
    note: 'The records M2 shares have to exist first. Every clinical record made in the Portal becomes a linkable care context.',
  },
  USER_INIT_LINK_602: {
    status: 'unverified',
    where: 'HFR facility registration + bridge service registration (npm run abdm:bridge)',
    note: 'The PHR app does the searching; our part is being findable, which needs the facility listed and the bridge services registered. Registration is CLI-only today (see HFR-118).',
  },
  USER_INIT_LINK_603: {
    status: 'built',
    where:
      'POST /api/v3/hip/patient/care-context/discover + discovery.service.ts; __tests__/discovery.test.ts',
    note: 'Matched on ABHA address first, then mobile with a fuzzy name check — the order NHA states.',
  },
  USER_INIT_LINK_604: {
    status: 'built',
    where: 'discovery.service.ts → on-discover carries the patient’s care contexts',
  },
  USER_INIT_LINK_605: {
    status: 'built',
    where: 'userLinking.service.ts — POST /api/v3/hip/link/care-context/init then .../confirm',
    note: 'The OTP is issued and checked by the consent manager; we answer on-init and on-confirm.',
  },
  USER_INIT_LINK_606: {
    status: 'built',
    where:
      'gatewayAuth.ts — every inbound callback is verified against NHA’s JWKS before it is read',
    note: 'The consent manager validates its own request; our half is refusing one that did not come from it.',
  },
  USER_INIT_LINK_607: {
    status: 'unverified',
    where: 'dataTransfer.service.ts',
    note: 'Same limitation as HIP_INTI_LINK_506: the pull works in mock mode and has never been driven from a real PHR app.',
  },

  // ── M3 · HIU ──────────────────────────────────────────────────────────────
  HIU_FLOW_101: {
    status: 'built',
    where: 'hiuConsent.service.ts findPatientByAbha + certificationGaps.test.ts',
    note: 'A walk-in whose ABHA was never verified here can still be looked up.',
  },
  HIU_FLOW_102: { status: 'built', where: 'hiuConsent.service.ts requestConsent + abdm:m3check' },
  HIU_FLOW_103: {
    status: 'partial',
    where: 'hiuConsent.service.ts — request raised to the consent manager',
    note: 'The notification lands in the patient’s PHR app, which is ABDM’s surface, not ours. We can show the request leaving.',
  },
  HIU_FLOW_104: {
    status: 'built',
    where: 'Portal → patient chart → External history card (ADR-095)',
  },
  HIU_FLOW_105: { status: 'built', where: 'hiuConsent.service.ts — denied status; abdm:m3check' },
  HIU_FLOW_106: { status: 'built', where: 'hiuConsent.service.ts — approved status; abdm:m3check' },
  // `HIU_FLOW_107`–`113` are one requirement, not seven: NHA writes "Any one of them is mandatory"
  // over the group. All seven HI types are requestable and rendered, so any one can be chosen.
  // The transaction id all seven depend on comes from `/api/v3/hiu/health-information/on-request`,
  // which was not served until ADR-140 — so a real HIP's push matched no row and was discarded.
  HIU_FLOW_107: {
    status: 'unverified',
    where: 'HIU_HI_TYPES DiagnosticReport → hiuTimeline.service.ts',
  },
  HIU_FLOW_108: {
    status: 'unverified',
    where: 'HIU_HI_TYPES Prescription → hiuTimeline.service.ts',
  },
  HIU_FLOW_109: {
    status: 'unverified',
    where: 'HIU_HI_TYPES DischargeSummary → hiuTimeline.service.ts',
  },
  HIU_FLOW_110: {
    status: 'unverified',
    where: 'HIU_HI_TYPES OPConsultation → hiuTimeline.service.ts',
  },
  HIU_FLOW_111: {
    status: 'unverified',
    where: 'HIU_HI_TYPES ImmunizationRecord → hiuTimeline.service.ts',
  },
  HIU_FLOW_112: {
    status: 'unverified',
    where: 'HIU_HI_TYPES HealthDocumentRecord → hiuTimeline.service.ts',
  },
  HIU_FLOW_113: {
    status: 'unverified',
    where: 'HIU_HI_TYPES WellnessRecord → hiuTimeline.service.ts',
  },
  HIU_FLOW_201: { status: 'built', where: 'hiuDataTransfer.service.ts + abdm:m3check step 6' },
  HIU_FLOW_202: {
    status: 'built',
    where: 'hiuSweeper.ts + abdm:m3check step 7',
    note: 'Revoke deletes records, artefact and decryption keys; the audit survives. Asserted from the database, not a return value.',
  },

  HIU_FLOW_301: {
    status: 'built',
    where: 'hiuSweeper.ts + abdm:m3check step 7',
    note: 'Expiry is a date passing, not an event anyone sends, so a sweeper is the only thing that can enforce it. Asserted from the database.',
  },

  // ── M4 · HFR — facility search (built 30/08/2026, ADR-103/104) ────────────
  'HFR-001': {
    status: 'unverified',
    where: 'Portal → Hospital configuration → ABDM registries → Search HFR',
  },
  'HFR-002': {
    status: 'unverified',
    where: 'registry/facility/search — facility name (required with ownership + state)',
  },
  'HFR-003': { status: 'unverified', where: 'registry/facility/search — ownership' },
  'HFR-004': { status: 'unverified', where: 'registry/facility/search — state' },
  'HFR-005': { status: 'unverified', where: 'registry/facility/search — district' },
  'HFR-006': { status: 'unverified', where: 'registry/facility/search — sub-district' },
  'HFR-007': {
    status: 'unverified',
    where: 'registry/facility/search — PIN code, six digits enforced',
  },
  'HFR-008': {
    status: 'unverified',
    where: 'hfr.service.ts searchFacilities — page defaults to 1',
  },
  'HFR-009': {
    status: 'unverified',
    where: 'hfr.service.ts searchFacilities — resultsPerPage floors at 10',
    note: 'NHA’s documented minimum; the service will not send below it.',
  },

  // ── M4 · HFR — bridge linkage. The gap. ───────────────────────────────────
  'HFR-118': { status: 'not-built', where: 'CLI only — npm run abdm:bridge', note: BRIDGE_NOTE() },
  'HFR-119': { status: 'not-built', where: 'CLI only — npm run abdm:bridge', note: BRIDGE_NOTE() },
  'HFR-120': { status: 'not-built', where: 'CLI only — npm run abdm:bridge', note: BRIDGE_NOTE() },
  'HFR-121': { status: 'not-built', where: 'CLI only — npm run abdm:bridge', note: BRIDGE_NOTE() },
  'HFR-122': { status: 'not-built', where: 'CLI only — npm run abdm:bridge', note: BRIDGE_NOTE() },
  'HFR-123': { status: 'not-built', where: 'CLI only — npm run abdm:bridge', note: BRIDGE_NOTE() },

  // ── M4 · HPR — enrolment wizard (built 30/08/2026, ADR-103) ───────────────
  'HPR-002': {
    status: 'unverified',
    where: 'Portal → Hospital configuration → ABDM registries → Enrol a clinician',
  },
  'HPR-003': { status: 'unverified', where: 'registry/professional — consent step' },
  'HPR-005': {
    status: 'unverified',
    where: 'registry/professional — Aadhaar step, 12 digits enforced',
  },
  'HPR-007': { status: 'unverified', where: 'registry/professional — Aadhaar OTP step' },
  'HPR-008': { status: 'unverified', where: 'registry/professional — resend' },
  'HPR-010': { status: 'unverified', where: 'registry/professional — mobile step' },
  'HPR-011': { status: 'unverified', where: 'registry/professional — mobile OTP step' },
  'HPR-020': { status: 'unverified', where: 'hpr.service.ts completeEnrolment — HPR ID creation' },
  'HPR-026': { status: 'unverified', where: 'registry/professional — professional details step' },
};

/** One sentence, written once, for the six cases that share a cause. */
function BRIDGE_NOTE(): string {
  return 'Reachable only through the abdm:bridge CLI. There is no screen, so it cannot be demonstrated in the product.';
}
