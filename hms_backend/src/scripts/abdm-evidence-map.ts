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
  CRT_ABHA_113: { status: 'built', where: 'AbhaVerificationPanel.tsx — created ABHA number is displayed' },
  CRT_ABHA_114: {
    status: 'partial',
    where: 'AbhaVerificationPanel.tsx — ABHA card download',
    note: 'Streamed from ABDM during verification and never stored, so it cannot be re-downloaded from the chart afterwards.',
  },
  TAGGING_UNIQUEPATIENTID_UNIQUEABHANUMBER: {
    status: 'built',
    where: 'migration 0041_abha_number_unique.sql + certificationGaps.test.ts',
    note: 'One ABHA, one active chart, per tenant — on number and address, normalised so formatting is not a loophole.',
  },

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
  HIP_INTI_LINK_503: { status: 'built', where: 'discovery.service.ts — the matcher; __tests__/discovery.test.ts' },
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
  HIU_FLOW_104: { status: 'built', where: 'Portal → patient chart → External history card (ADR-095)' },
  HIU_FLOW_105: { status: 'built', where: 'hiuConsent.service.ts — denied status; abdm:m3check' },
  HIU_FLOW_106: { status: 'built', where: 'hiuConsent.service.ts — approved status; abdm:m3check' },
  HIU_FLOW_201: { status: 'built', where: 'hiuDataTransfer.service.ts + abdm:m3check step 6' },
  HIU_FLOW_202: {
    status: 'built',
    where: 'hiuSweeper.ts + abdm:m3check step 7',
    note: 'Revoke deletes records, artefact and decryption keys; the audit survives. Asserted from the database, not a return value.',
  },

  // ── M4 · HFR — facility search (built 30/08/2026, ADR-103/104) ────────────
  'HFR-001': { status: 'unverified', where: 'Portal → Hospital configuration → ABDM registries → Search HFR' },
  'HFR-002': { status: 'unverified', where: 'registry/facility/search — facility name (required with ownership + state)' },
  'HFR-003': { status: 'unverified', where: 'registry/facility/search — ownership' },
  'HFR-004': { status: 'unverified', where: 'registry/facility/search — state' },
  'HFR-005': { status: 'unverified', where: 'registry/facility/search — district' },
  'HFR-006': { status: 'unverified', where: 'registry/facility/search — sub-district' },
  'HFR-007': { status: 'unverified', where: 'registry/facility/search — PIN code, six digits enforced' },
  'HFR-008': { status: 'unverified', where: 'hfr.service.ts searchFacilities — page defaults to 1' },
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
  'HPR-002': { status: 'unverified', where: 'Portal → Hospital configuration → ABDM registries → Enrol a clinician' },
  'HPR-003': { status: 'unverified', where: 'registry/professional — consent step' },
  'HPR-005': { status: 'unverified', where: 'registry/professional — Aadhaar step, 12 digits enforced' },
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
