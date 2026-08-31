
# ABDM certification evidence pack

**Applicant type:** private · **Scope:** mandatory and conditional only

Requirements are derived from NHA’s published workbooks in `docs/testcasesofficial/`; regenerate with `npm run abdm:audit`. Evidence is asserted in `abdm-evidence-map.ts` and reviewed as a diff. A case with no entry is reported as **NOT EVIDENCED** rather than assumed to pass.

> This states what can be **demonstrated**. It does not claim a pass — that is NHA’s to decide during functional testing.

## Summary

| Status | Cases |
|---|---|
| NOT EVIDENCED | 81 |
| NOT BUILT | 6 |
| UNVERIFIED | 16 |
| PARTIAL | 2 |
| BUILT | 25 |
| **Total** | **130** |

**87 case(s) cannot be demonstrated today.** They are listed first below. Everything marked UNVERIFIED is built but has never run against the real registry.

## M1

| Case | Requirement | What NHA asks | Status | Where it is demonstrated |
|---|---|---|---|---|
| `CRT_ABHA_209` | mandatory | View and Download ABHA details. (If integrators is generating ABHA card) | **NOT EVIDENCED** | — |
| `CRT_ABHA_114` | mandatory | View and Download ABHA details. (If integrators is generating ABHA card) | **PARTIAL** | AbhaVerificationPanel.tsx — ABHA card download <br>_Streamed from ABDM during verification and never stored, so it cannot be re-downloaded from the chart afterwards._ |
| `CRT_ABHA_101` | mandatory | Create ABHA Option | **BUILT** | Portal → Patients → Register → ABHA panel (components/abdm/AbhaVerificationPanel.tsx) <br>_Create-ABHA is offered as one of the panel’s modes at the registration desk._ |
| `CRT_ABHA_102` | mandatory | Consent collection | **BUILT** | AbhaVerificationPanel.tsx — consent block shown before any Aadhaar is accepted <br>_ABDM’s published consent text, with an explicit agreement before the field unlocks._ |
| `CRT_ABHA_104` | mandatory | Aadhaar collection and Error Message | **BUILT** | AbhaVerificationPanel.tsx (12-digit input) + abdm.schema.ts <br>_Non-digits never enter the field; the API re-checks, because the form is not the boundary._ |
| `CRT_ABHA_105` | mandatory | Aadhaar OTP Collection | **BUILT** | AbhaVerificationPanel.tsx — OTP step |
| `CRT_ABHA_106` | mandatory | Resend OTP | **BUILT** | abdm.service.ts resendOtp + __tests__/certificationGaps.test.ts <br>_Throttle is on the transaction, not the browser: a reloaded page cannot spend a patient’s daily UIDAI allowance._ |
| `CRT_ABHA_107` | mandatory | OTP based Aadhaar Authentication | **BUILT** | POST /api/v1/abdm/abha/verify-otp |
| `CRT_ABHA_109` | mandatory | Communication Mobile Number verification-II | **BUILT** | AbhaVerificationPanel.tsx — communication-mobile step <br>_A mobile that differs from the Aadhaar-linked one gets its own OTP round trip._ |
| `CRT_ABHA_112` | mandatory | Suggested ABHA Address | **BUILT** | AbhaVerificationPanel.tsx (address step) + AbhaAddressValue in abdm.schema.ts <br>_Suggestions from ABDM plus free entry. Policy enforced at the API and printed beside the field; 6 tests in certificationGaps.test.ts._ |
| `CRT_ABHA_113` | mandatory | Display of ABHA Number | **BUILT** | AbhaVerificationPanel.tsx — created ABHA number is displayed |
| `TAGGING_UNIQUEPATIENTID_UNIQUEABHANUMBER` | mandatory | Verify one ABHA Number is linked to the unique patient ID in HIMS | **BUILT** | migration 0041_abha_number_unique.sql + certificationGaps.test.ts <br>_One ABHA, one active chart, per tenant — on number and address, normalised so formatting is not a loophole._ |

## M2

| Case | Requirement | What NHA asks | Status | Where it is demonstrated |
|---|---|---|---|---|
| `HIP_INIT_SHARE_CARECONTEXT` | mandatory | HIP must share health records associated with care context on request | **UNVERIFIED** | dataTransfer.service.ts + POST /api/v3/hip/health-information/request <br>_Consent re-checked at send time; encrypted through Fidelius. Fidelius itself has never executed._ |
| `HIP_INTI_LINK_506` | mandatory | Pull Records | **UNVERIFIED** | dataTransfer.service.ts <br>_Pull works end to end in mock mode. Never exercised from a real PHR app, because that needs the bridge URL registered._ |
| `HIP_INIT_EXPIRE_CONSENT` | conditional | HIP must delete consents for a ABHA address in their system when it is expired | **BUILT** | consent.service.ts + abdm:m2check step 9 |
| `HIP_INIT_GRANT_CONSENT_` | conditional | HIP must save consent (s)granted for a ABHA address in their system | **BUILT** | consent.service.ts + POST /api/v3/consent/request/hip/notify <br>_Visible to an operator on the Consents card; the artefact is stored against the resolved facility._ |
| `HIP_INIT_NOTIFY_HIECM` | mandatory | sending notification to the patient on their mobile with deep link | **BUILT** | linking.service.ts SMS/deep-link notify + abdm:m2check <br>_Sent. The acknowledgement callback is not served — we do not learn whether it landed._ |
| `HIP_INIT_REVOKE_CONSENT` | conditional | HIP must delete consents for a ABHA address in their system when it is revoked | **BUILT** | consent.service.ts revokeConsent + abdm:m2check step 9 <br>_The artefact is DELETED, not flagged. The audit entry survives and holds metadata only._ |
| `HIP_INTI_LINK_501` | mandatory | Link record via Demographic Auth | **BUILT** | linking.service.ts — HIP-initiated linking |
| `HIP_INTI_LINK_502` | mandatory | Sharing demographic details | **BUILT** | linking.service.ts toPatientBlocks |
| `HIP_INTI_LINK_503` | mandatory | Validate the demographic details | **BUILT** | discovery.service.ts — the matcher; __tests__/discovery.test.ts |
| `HIP_INTI_LINK_504` | mandatory | Creation of Linking Token | **BUILT** | linkToken.service.ts + abdm:m2check step 5 <br>_The token is encrypted at rest — it is standing permission to write to a national record._ |
| `HIP_INTI_LINK_505` | mandatory | Linking of Health Records | **BUILT** | careContext.service.ts + abdm:m2check step 5 |

## M3

| Case | Requirement | What NHA asks | Status | Where it is demonstrated |
|---|---|---|---|---|
| `HIU_FLOW_103` | mandatory | Notification to PHR | **PARTIAL** | hiuConsent.service.ts — request raised to the consent manager <br>_The notification lands in the patient’s PHR app, which is ABDM’s surface, not ours. We can show the request leaving._ |
| `HIU_FLOW_101` | mandatory | Patient Discovery | **BUILT** | hiuConsent.service.ts findPatientByAbha + certificationGaps.test.ts <br>_A walk-in whose ABHA was never verified here can still be looked up._ |
| `HIU_FLOW_102` | mandatory | Consent Request Initiation | **BUILT** | hiuConsent.service.ts requestConsent + abdm:m3check |
| `HIU_FLOW_104` | mandatory | Listing of Consent Requests | **BUILT** | Portal → patient chart → External history card (ADR-095) |
| `HIU_FLOW_105` | mandatory | Consent Request is Denied | **BUILT** | hiuConsent.service.ts — denied status; abdm:m3check |
| `HIU_FLOW_201` | mandatory | Revoke Consent | **BUILT** | hiuDataTransfer.service.ts + abdm:m3check step 6 |
| `HIU_FLOW_202` | mandatory | Revoke Consent | **BUILT** | hiuSweeper.ts + abdm:m3check step 7 <br>_Revoke deletes records, artefact and decryption keys; the audit survives. Asserted from the database, not a return value._ |

## M4-HFR

| Case | Requirement | What NHA asks | Status | Where it is demonstrated |
|---|---|---|---|---|
| `HFR-010` | mandatory | To Save the facilty basic details | **NOT EVIDENCED** | — |
| `HFR-011` | mandatory | Fill the geographic location | **NOT EVIDENCED** | — |
| `HFR-012` | mandatory | Longitude* | **NOT EVIDENCED** | — |
| `HFR-014` | mandatory | To select the State | **NOT EVIDENCED** | — |
| `HFR-015` | mandatory | To select the District | **NOT EVIDENCED** | — |
| `HFR-016` | mandatory | To select the Sub-district | **NOT EVIDENCED** | — |
| `HFR-017` | mandatory | To fill the facility address | **NOT EVIDENCED** | — |
| `HFR-019` | mandatory | To enter the facility pincode | **NOT EVIDENCED** | — |
| `HFR-020` | conditional | To select the facility working days | **NOT EVIDENCED** | — |
| `HFR-021` | mandatory | To fill the opening hours of the facility | **NOT EVIDENCED** | — |
| `HFR-022` | mandatory | To select the facility operational status | **NOT EVIDENCED** | — |
| `HFR-030` | conditional | Address Proof | **NOT EVIDENCED** | — |
| `HFR-031` | mandatory | To provide the ownership details | **NOT EVIDENCED** | — |
| `HFR-032` | conditional | Facility Ownership Subtype* | **NOT EVIDENCED** | — |
| `HFR-033` | conditional | Facility Ownership Subtype 2* | **NOT EVIDENCED** | — |
| `HFR-034` | mandatory | To provide the details of system of medicine | **NOT EVIDENCED** | — |
| `HFR-035` | mandatory | To enter the type of facility | **NOT EVIDENCED** | — |
| `HFR-036` | mandatory | Facility Sub Type* | **NOT EVIDENCED** | — |
| `HFR-037` | mandatory | To enter the type of services provided | **NOT EVIDENCED** | — |
| `HFR-038` | mandatory | To enter the Specialization | **NOT EVIDENCED** | — |
| `HFR-047` | mandatory | systemOfMedicineCode | **NOT EVIDENCED** | — |
| `HFR-048` | mandatory | isSpecializationAvalaible | **NOT EVIDENCED** | — |
| `HFR-049` | conditional | specialities | **NOT EVIDENCED** | — |
| `HFR-057` | mandatory | totalNumberOfVentilators | **NOT EVIDENCED** | — |
| `HFR-060` | mandatory | totalNumberOfBeds | **NOT EVIDENCED** | — |
| `HFR-064` | mandatory | To edit the facilty basic details | **NOT EVIDENCED** | — |
| `HFR-065` | mandatory | Change the geographic location | **NOT EVIDENCED** | — |
| `HFR-066` | mandatory | Longitude* | **NOT EVIDENCED** | — |
| `HFR-068` | mandatory | To edit the State | **NOT EVIDENCED** | — |
| `HFR-069` | mandatory | To edit the District | **NOT EVIDENCED** | — |
| `HFR-070` | mandatory | To edit the Sub-district | **NOT EVIDENCED** | — |
| `HFR-071` | mandatory | To edit the facility address | **NOT EVIDENCED** | — |
| `HFR-073` | mandatory | To edit the facility pincode | **NOT EVIDENCED** | — |
| `HFR-074` | conditional | To edit the facility working days | **NOT EVIDENCED** | — |
| `HFR-075` | mandatory | To edit the opening hours of the facility | **NOT EVIDENCED** | — |
| `HFR-076` | mandatory | To edit the facility operational status | **NOT EVIDENCED** | — |
| `HFR-084` | conditional | Address Proof | **NOT EVIDENCED** | — |
| `HFR-085` | mandatory | To edit the ownership details | **NOT EVIDENCED** | — |
| `HFR-086` | conditional | Facility Ownership Subtype* | **NOT EVIDENCED** | — |
| `HFR-087` | conditional | Facility Ownership Subtype 2* | **NOT EVIDENCED** | — |
| `HFR-088` | mandatory | To edit the details of system of medicine | **NOT EVIDENCED** | — |
| `HFR-089` | mandatory | To edit the type of facility | **NOT EVIDENCED** | — |
| `HFR-090` | mandatory | Facility Sub Type* | **NOT EVIDENCED** | — |
| `HFR-091` | mandatory | To edit the type of services provided | **NOT EVIDENCED** | — |
| `HFR-092` | mandatory | To edit the Specialization | **NOT EVIDENCED** | — |
| `HFR-101` | mandatory | To edit systemOfMedicine | **NOT EVIDENCED** | — |
| `HFR-102` | mandatory | to edit if Specialization is Avalaible | **NOT EVIDENCED** | — |
| `HFR-103` | conditional | To edit specialities | **NOT EVIDENCED** | — |
| `HFR-111` | mandatory | To edit totalNumberOfVentilators | **NOT EVIDENCED** | — |
| `HFR-114` | mandatory | To edit totalNumberOfBeds | **NOT EVIDENCED** | — |
| `HFR-118` | mandatory | Fill the facility Id | **NOT BUILT** | CLI only — npm run abdm:bridge <br>_Reachable only through the abdm:bridge CLI. There is no screen, so it cannot be demonstrated in the product._ |
| `HFR-119` | mandatory | Fill the facility Name | **NOT BUILT** | CLI only — npm run abdm:bridge <br>_Reachable only through the abdm:bridge CLI. There is no screen, so it cannot be demonstrated in the product._ |
| `HFR-120` | mandatory | Fill the bridge Id | **NOT BUILT** | CLI only — npm run abdm:bridge <br>_Reachable only through the abdm:bridge CLI. There is no screen, so it cannot be demonstrated in the product._ |
| `HFR-121` | mandatory | Fill the hip Name | **NOT BUILT** | CLI only — npm run abdm:bridge <br>_Reachable only through the abdm:bridge CLI. There is no screen, so it cannot be demonstrated in the product._ |
| `HFR-122` | mandatory | Fill the HIP type | **NOT BUILT** | CLI only — npm run abdm:bridge <br>_Reachable only through the abdm:bridge CLI. There is no screen, so it cannot be demonstrated in the product._ |
| `HFR-123` | mandatory | Provide details if the bridge is Active or not | **NOT BUILT** | CLI only — npm run abdm:bridge <br>_Reachable only through the abdm:bridge CLI. There is no screen, so it cannot be demonstrated in the product._ |
| `HFR-002` | conditional | search through facility name | **UNVERIFIED** | registry/facility/search — facility name (required with ownership + state) |
| `HFR-003` | conditional | To fill the facility ownership | **UNVERIFIED** | registry/facility/search — ownership |
| `HFR-004` | conditional | To fill the facility state | **UNVERIFIED** | registry/facility/search — state |
| `HFR-008` | mandatory | To show number of pages | **UNVERIFIED** | hfr.service.ts searchFacilities — page defaults to 1 |
| `HFR-009` | mandatory | To show number of facilities per page | **UNVERIFIED** | hfr.service.ts searchFacilities — resultsPerPage floors at 10 <br>_NHA’s documented minimum; the service will not send below it._ |

## M4-HPR

| Case | Requirement | What NHA asks | Status | Where it is demonstrated |
|---|---|---|---|---|
| `HPR-004` | mandatory | Suggestions:- Consent collection should be multilingual | **NOT EVIDENCED** | — |
| `HPR-006` | mandatory | Captcha | **NOT EVIDENCED** | — |
| `HPR-018` | mandatory | Basic | **NOT EVIDENCED** | — |
| `HPR-027` | mandatory | First Name * | **NOT EVIDENCED** | — |
| `HPR-028` | mandatory | Middle Name | **NOT EVIDENCED** | — |
| `HPR-029` | mandatory | Last Name | **NOT EVIDENCED** | — |
| `HPR-033` | mandatory | Nationality | **NOT EVIDENCED** | — |
| `HPR-036` | mandatory | Languages spoken * | **NOT EVIDENCED** | — |
| `HPR-037` | mandatory | Address as per KYC : | **NOT EVIDENCED** | — |
| `HPR-054` | mandatory | Registration | **NOT EVIDENCED** | — |
| `HPR-055` | mandatory | categoryId | **NOT EVIDENCED** | — |
| `HPR-056` | mandatory | registeredWithCouncil | **NOT EVIDENCED** | — |
| `HPR-057` | mandatory | registrationNumber | **NOT EVIDENCED** | — |
| `HPR-058` | mandatory | registrationDate | **NOT EVIDENCED** | — |
| `HPR-059` | mandatory | registrationCertificate | **NOT EVIDENCED** | — |
| `HPR-062` | mandatory | Qualifications | **NOT EVIDENCED** | — |
| `HPR-063` | mandatory | country | **NOT EVIDENCED** | — |
| `HPR-064` | mandatory | state | **NOT EVIDENCED** | — |
| `HPR-065` | mandatory | college | **NOT EVIDENCED** | — |
| `HPR-066` | mandatory | university | **NOT EVIDENCED** | — |
| `HPR-068` | mandatory | yearOfAwardingDegreeDiploma | **NOT EVIDENCED** | — |
| `HPR-069` | mandatory | degreeCertificate | **NOT EVIDENCED** | — |
| `HPR-070` | mandatory | isNameDifferentInCertificate | **NOT EVIDENCED** | — |
| `HPR-072` | mandatory | Work Detail | **NOT EVIDENCED** | — |
| `HPR-073` | mandatory | IF No, so please ask the reason for non working | **NOT EVIDENCED** | — |
| `HPR-074` | mandatory | If Yes, So radio button (Govt, Pvt or Both) | **NOT EVIDENCED** | — |
| `HPR-075` | mandatory | If Govt /Both, so document attachment is mandatory to upload upto 5 mb | **NOT EVIDENCED** | — |
| `HPR-076` | mandatory | If Govt/Both so facility decalartion is mandatory (Professinal can search the facility via name/Facility id) | **NOT EVIDENCED** | — |
| `HPR-077` | mandatory | Preview Profile & Submit | **NOT EVIDENCED** | — |
| `HPR-079` | mandatory | update-professional | **NOT EVIDENCED** | — |
| `HPR-002` | mandatory | Create HPRID | **UNVERIFIED** | Portal → Hospital configuration → ABDM registries → Enrol a clinician |
| `HPR-003` | mandatory | consent collection | **UNVERIFIED** | registry/professional — consent step |
| `HPR-005` | mandatory | Aadhaar collection and Error Message | **UNVERIFIED** | registry/professional — Aadhaar step, 12 digits enforced |
| `HPR-007` | mandatory | Aadhaar OTP Collection | **UNVERIFIED** | registry/professional — Aadhaar OTP step |
| `HPR-008` | mandatory | Resend OTP | **UNVERIFIED** | registry/professional — resend |
| `HPR-010` | mandatory | Communication Mobile Number verification-I | **UNVERIFIED** | registry/professional — mobile step |
| `HPR-011` | mandatory | Communication Mobile Number verification-II | **UNVERIFIED** | registry/professional — mobile OTP step |
| `HPR-020` | mandatory | Healthcare Professional ID | **UNVERIFIED** | hpr.service.ts completeEnrolment — HPR ID creation |
| `HPR-026` | mandatory | Personal info | **UNVERIFIED** | registry/professional — professional details step |

---

Generated by `npm run abdm:evidence -w hms_backend`. Regenerate after any change to the workbooks or the evidence map — do not edit this output by hand.
