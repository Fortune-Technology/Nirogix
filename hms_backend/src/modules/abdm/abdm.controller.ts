import type { Request, Response } from 'express';
import * as svc from './abdm.service';
import { toPatientDto } from '../patient/patient.dto';
import { logger } from '../../config/logger';
import { AppError } from '../../http/error';
import { storeLinkToken } from './linkToken.service';
import * as userLink from './userLinking.service';
import * as transfer from './dataTransfer.service';
import * as hiu from './hiuConsent.service';
import * as hiuTransfer from './hiuDataTransfer.service';
import * as timeline from './hiuTimeline.service';
import * as hfr from './hfr.service';
import * as hpr from './hpr.service';
import * as bulk from './registryBulk.service';
import * as consent from './consent.service';
import { recordLinkCallback } from './linking.service';
import type { AbdmProfile } from './providers/types';

/**
 * HTTP layer for ABDM Milestone 1 (ADR-084). Thin by design — every rule is in the service, so
 * the callback route and the authenticated routes cannot drift apart on consent or matching.
 */

export async function capabilities(req: Request, res: Response): Promise<void> {
  res.json(await svc.getCapabilities(req.auth!.tenantId, (req.query.branchId as string) ?? null));
}

// --- Flow 1: create an ABHA with Aadhaar OTP --------------------------------------------------

export async function startAadhaar(req: Request, res: Response): Promise<void> {
  res.status(202).json(await svc.startAadhaarEnrolment(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function verifyAadhaar(req: Request, res: Response): Promise<void> {
  res.json(await svc.verifyAadhaarOtp(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function requestMobileOtp(req: Request, res: Response): Promise<void> {
  res.status(202).json(await svc.requestMobileOtp(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function verifyMobileOtp(req: Request, res: Response): Promise<void> {
  res.json(await svc.verifyMobileOtp(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function suggestAddresses(req: Request, res: Response): Promise<void> {
  res.json({ suggestions: await svc.suggestAbhaAddresses(req.auth!.tenantId, req.params.transactionId!) });
}

export async function createAddress(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.createAbhaAddress(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function downloadCard(req: Request, res: Response): Promise<void> {
  const card = await svc.downloadAbhaCard(req.auth!.tenantId, req.params.transactionId!);
  // Inline, not an attachment: the operator shows it to the patient far more often than they
  // save it, and nothing on our side keeps a copy.
  res.setHeader('Content-Type', card.contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.send(card.data);
}

// --- Flow 3: verify an existing ABHA ----------------------------------------------------------

export async function startVerification(req: Request, res: Response): Promise<void> {
  res.status(202).json(await svc.startVerification(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function verifyIdentifier(req: Request, res: Response): Promise<void> {
  res.json(await svc.verifyIdentifierOtp(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function selectAccount(req: Request, res: Response): Promise<void> {
  res.json(await svc.selectAbhaAccount(req.auth!.tenantId, req.body, req.auth!.userId));
}

// --- Flow 2: Scan and Share -------------------------------------------------------------------

export async function pendingShares(req: Request, res: Response): Promise<void> {
  res.json(await svc.listPendingShares(req.auth!.tenantId));
}

/**
 * The one unauthenticated route (ADR-056) — the gateway pushing a scanned profile.
 *
 * The response is always 202 with the same body — accepted or dropped, known facility or not —
 * because a caller with no session must not be able to tell one from the other, which is what
 * would turn this into a facility-enumeration oracle. The acknowledgement the *patient* sees goes
 * back separately, on the gateway's own `on-share` endpoint.
 */
export async function profileShareCallback(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    metaData?: { hipId?: string; context?: string };
    profile: { patient: Record<string, unknown> & { name?: string } };
  };
  const hipId = body.metaData?.hipId ?? req.header('X-HIP-ID') ?? '';
  if (hipId) {
    await svc.handleProfileShare({
      hipId,
      profile: normaliseSharedProfile(body.profile.patient),
      context: body.metaData?.context,
      requestId: req.header('REQUEST-ID') ?? undefined,
    });
  }
  res.status(202).json({ accepted: true });
}

/**
 * Turns the gateway's patient block into the profile shape the rest of the module speaks.
 *
 * Two things it has to cope with. The name arrives as one string, so it is split on the first
 * space — the remainder stays with the surname, which is right far more often than not for Indian
 * naming. And the date of birth arrives as three separate fields that a PHR app may **mask**
 * (`"1*"`, `"19**"` in NHA's own example), so a part that is not fully numeric is treated as
 * absent rather than parsed into a wrong date.
 */
function normaliseSharedProfile(raw: Record<string, unknown> & { name?: string }): AbdmProfile {
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  const num = (v: unknown): string | undefined => {
    const t = typeof v === 'number' ? String(v) : str(v);
    return t && /^\d+$/.test(t) ? t : undefined;
  };
  const address = (raw.address ?? {}) as Record<string, unknown>;

  const year = num(raw.yearOfBirth);
  const month = num(raw.monthOfBirth);
  const day = num(raw.dayOfBirth);
  // A year alone is enough to be useful (it drives the demographic match); a masked day or month
  // falls back to the first, and the operator sees and corrects it in the review step.
  const dateOfBirth = year ? `${year}-${(month ?? '1').padStart(2, '0')}-${(day ?? '1').padStart(2, '0')}` : undefined;

  const profile: AbdmProfile = {
    abhaNumber: typeof raw.abhaNumber === 'number' ? String(raw.abhaNumber) : str(raw.abhaNumber),
    abhaAddress: str(raw.abhaAddress),
    gender: str(raw.gender),
    dateOfBirth,
    mobile: str(raw.phoneNumber),
    address: str(address.line),
    districtName: str(address.district),
    stateName: str(address.state),
    pincode: typeof address.pinCode === 'number' ? String(address.pinCode) : str(address.pinCode),
  };

  const name = str(raw.name);
  if (name) {
    const [first, ...rest] = name.split(/\s+/);
    profile.firstName = first;
    profile.lastName = rest.join(' ') || undefined;
  }
  return profile;
}

/**
 * ABDM delivering a link token after a demographic-auth request (ADR-089).
 *
 * Unauthenticated by necessity — the caller is the gateway — so it follows the same posture as the
 * other callbacks: the hospital is resolved server-side from `X-HIP-ID`, and the answer is an
 * identical 202 whatever we decide to do with the payload, so it cannot be used to probe which
 * facilities or ABHA addresses exist.
 */
export async function onGenerateToken(req: Request, res: Response): Promise<void> {
  const body = req.body as { abhaAddress: string; linkToken: string };
  const hipId = req.header('X-HIP-ID') ?? '';
  if (hipId) {
    await storeLinkToken({ abhaAddress: body.abhaAddress, token: body.linkToken, hipId });
  }
  res.status(202).json({ accepted: true });
}

/**
 * ABDM's verdict on a care-context link.
 *
 * We optimistically mark contexts linked when the request is accepted, so this callback exists to
 * *correct* that when the gateway disagrees — which is the only way a hospital would otherwise
 * discover that records the desk believes are shared never actually reached the patient's app.
 */
export async function onLinkCareContext(req: Request, res: Response): Promise<void> {
  const body = req.body as { abhaAddress?: string; status?: string; error?: { message?: string } };
  const hipId = req.header('X-HIP-ID') ?? '';
  if (hipId && body.abhaAddress) {
    await recordLinkCallback({ hipId, abhaAddress: body.abhaAddress, status: body.status, error: body.error?.message });
  }
  res.status(202).json({ accepted: true });
}

/**
 * Discovery, init and confirm — the patient-driven half of linking (ADR-090).
 *
 * All three answer 202 immediately and do their real work against the gateway's `on-*` endpoints,
 * because that is how the protocol is shaped: the gateway is not waiting for our answer on this
 * connection, it is waiting for a callback. They also answer identically whatever happens, so none
 * of them can be used to test whether a patient exists.
 */
export async function discoverCareContexts(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    transactionId?: string;
    requestId?: string;
    patient: {
      id?: string;
      name?: string;
      gender?: string;
      yearOfBirth?: string | number;
      verifiedIdentifiers?: Array<{ type: string; value: string | number }>;
      unverifiedIdentifiers?: Array<{ type: string; value: string | number }>;
    };
  };
  const hipId = req.header('X-HIP-ID') ?? '';
  res.status(202).json({ accepted: true });

  if (!hipId) return;
  const pick = (list: Array<{ type: string; value: string | number }> | undefined, type: string) =>
    list?.find((i) => i.type.toUpperCase() === type)?.value;

  // Verified and unverified identifiers are read from their own lists and never merged: the whole
  // matching rule depends on knowing which is which (ADR-090).
  await userLink
    .respondToDiscovery({
      hipId,
      transactionId: body.transactionId,
      requestId: body.requestId,
      request: {
        abhaAddress: body.patient.id,
        mobile: String(pick(body.patient.verifiedIdentifiers, 'MOBILE') ?? ''),
        name: body.patient.name,
        gender: body.patient.gender,
        yearOfBirth: body.patient.yearOfBirth ? Number(body.patient.yearOfBirth) : undefined,
        medicalRecordNumber: String(pick(body.patient.unverifiedIdentifiers, 'MR') ?? '') || undefined,
      },
    })
    .catch((err: unknown) => logger.error({ err }, 'ABDM discovery response failed'));
}

export async function initCareContextLink(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    transactionId: string;
    requestId?: string;
    patient: { referenceNumber: string; careContexts: Array<{ referenceNumber: string }> };
  };
  const hipId = req.header('X-HIP-ID') ?? '';
  res.status(202).json({ accepted: true });

  if (!hipId) return;
  await userLink
    .initUserLink({
      hipId,
      transactionId: body.transactionId,
      requestId: body.requestId,
      patientReference: body.patient.referenceNumber,
      careContextRefs: body.patient.careContexts.map((c) => c.referenceNumber),
    })
    .catch((err: unknown) => logger.error({ err }, 'ABDM link init failed'));
}

export async function confirmCareContextLink(req: Request, res: Response): Promise<void> {
  const body = req.body as { requestId?: string; confirmation: { linkRefNumber: string; token: string } };
  const hipId = req.header('X-HIP-ID') ?? '';
  res.status(202).json({ accepted: true });

  if (!hipId) return;
  await userLink
    .confirmUserLink({
      hipId,
      referenceNumber: body.confirmation.linkRefNumber,
      token: body.confirmation.token,
      requestId: body.requestId,
    })
    .catch((err: unknown) => logger.error({ err }, 'ABDM link confirm failed'));
}

/**
 * A consented HIU asking for records (ADR-091).
 *
 * Answers 202 at once and does the work on the queue: NHA allows twenty minutes, and a gateway held
 * open while we build FHIR for a year of records would time out on a transfer that was going to
 * succeed.
 */
export async function requestHealthInformation(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    transactionId: string;
    requestId?: string;
    hiRequest: {
      consent: { id: string };
      dataPushUrl: string;
      keyMaterial?: { dhPublicKey?: { keyValue?: string }; nonce?: string };
      dateRange?: { from?: string; to?: string };
      careContexts?: Array<{ careContextReference: string }>;
    };
  };
  const hipId = req.header('X-HIP-ID') ?? '';
  res.status(202).json({ accepted: true });

  if (!hipId) return;
  await transfer
    .receiveHealthInformationRequest({
      hipId,
      transactionId: body.transactionId,
      requestId: body.requestId,
      consentId: body.hiRequest.consent.id,
      dataPushUrl: body.hiRequest.dataPushUrl,
      hiuPublicKey: body.hiRequest.keyMaterial?.dhPublicKey?.keyValue,
      hiuNonce: body.hiRequest.keyMaterial?.nonce,
      careContextRefs: (body.hiRequest.careContexts ?? []).map((c) => c.careContextReference),
      from: body.hiRequest.dateRange?.from,
      to: body.hiRequest.dateRange?.to,
    })
    .catch((err: unknown) => logger.error({ err }, 'ABDM health information request failed'));
}

// --- Linking ----------------------------------------------------------------------------------

export async function linkPatient(req: Request, res: Response): Promise<void> {
  // Through the shared patient DTO: the row carries the encrypted linking token, and an endpoint
  // that returned the raw record would publish a bearer credential to the browser.
  res.json(toPatientDto(await svc.linkToPatient(req.auth!.tenantId, req.body, req.auth!.userId)));
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { transactionId, ...patch } = req.body as { transactionId: string } & Record<string, unknown>;
  res.json(await svc.updateAbhaProfile(req.auth!.tenantId, { transactionId, patch }, req.auth!.userId));
}

export async function getVerification(req: Request, res: Response): Promise<void> {
  res.json(await svc.getVerification(req.auth!.tenantId, req.params.transactionId!));
}

export async function dismiss(req: Request, res: Response): Promise<void> {
  await svc.dismissTransaction(req.auth!.tenantId, req.params.transactionId!, req.auth!.userId);
  res.status(204).send();
}

// --- Facility configuration -------------------------------------------------------------------

/** Only the documented fields — the row also carries tenancy bookkeeping no screen consumes. */
function toFacility(row: Awaited<ReturnType<typeof svc.getFacilityConfig>>) {
  if (!row) return null;
  return {
    id: row.id,
    hipId: row.hipId,
    facilityName: row.facilityName,
    qrContent: row.qrContent,
    scanShareEnabled: row.scanShareEnabled,
    branchId: row.branchId,
  };
}

export async function getFacility(req: Request, res: Response): Promise<void> {
  res.json(toFacility(await svc.getFacilityConfig(req.auth!.tenantId, (req.query.branchId as string) ?? null)));
}

export async function putFacility(req: Request, res: Response): Promise<void> {
  res.json(toFacility(await svc.upsertFacilityConfig(req.auth!.tenantId, req.body, req.auth!.userId)));
}

// --- Milestone 3: reading a patient's history from other hospitals (ADR-092) -----------------

/** A doctor asking the patient for permission to read their history elsewhere. */
export async function requestHistory(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    patientId: string;
    providerId: string;
    hiTypes?: string[];
    from?: string;
    to?: string;
    dataEraseAt?: string;
  };
  const saved = await hiu.requestPatientHistory(req.auth!.tenantId, req.auth!.userId ?? null, {
    patientId: body.patientId,
    providerId: body.providerId,
    hiTypes: body.hiTypes,
    from: body.from ? new Date(body.from) : undefined,
    to: body.to ? new Date(body.to) : undefined,
    dataEraseAt: body.dataEraseAt ? new Date(body.dataEraseAt) : undefined,
  });
  res.status(202).json(saved);
}

/** What the chart panel polls: every history request for this patient, newest first. */
export async function listHistoryRequests(req: Request, res: Response): Promise<void> {
  const requests = await hiu.listHistoryRequests(req.auth!.tenantId, req.params.patientId!);
  res.json({ requests });
}

/** Asks ABDM where one request got to — the fallback for a callback that never arrived. */
export async function refreshHistoryRequest(req: Request, res: Response): Promise<void> {
  const updated = await hiu.pollConsentRequest(req.auth!.tenantId, req.params.requestId!);
  if (!updated) throw new AppError(404, 'ABDM_REQUEST_NOT_FOUND', 'No such history request');
  res.json(updated);
}

// --- Inbound HIU callbacks ---------------------------------------------------------------------

/** ABDM naming our consent request. Answered 202 at once; the work is trivial. */
export async function hiuOnInit(req: Request, res: Response): Promise<void> {
  const body = req.body as { consentRequest: { id: string }; response?: { requestId?: string } };
  res.status(202).json({ accepted: true });
  await hiu
    .recordConsentRequestId({ requestId: body.response?.requestId, consentRequestId: body.consentRequest.id })
    .catch((err: unknown) => logger.error({ err }, 'Could not record an ABDM consent request id'));
}

/** A granted artefact arriving. */
export async function hiuOnFetch(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    consent: {
      consentDetail: {
        consentId: string;
        consentManager?: { id?: string };
        patient: { id: string };
        hip?: { id?: string };
        hiu?: { id?: string };
        purpose?: { code?: string; text?: string };
        hiTypes?: string[];
        careContexts?: unknown[];
        permission?: {
          accessMode?: string;
          dateRange?: { from?: string; to?: string };
          dataEraseAt?: string;
          frequency?: { unit?: string; value?: number; repeats?: number };
        };
        createdAt?: string;
      };
      signature?: string;
    };
    response?: { requestId?: string };
  };
  res.status(202).json({ accepted: true });

  const detail = body.consent.consentDetail;
  const permission = detail.permission ?? {};
  await hiu
    .storeConsentArtefact({
      consentId: detail.consentId,
      consentRequestId: body.response?.requestId,
      hipId: detail.hip?.id,
      hiuId: detail.hiu?.id,
      consentManagerId: detail.consentManager?.id,
      abhaAddress: detail.patient.id,
      purposeCode: detail.purpose?.code,
      purposeText: detail.purpose?.text,
      hiTypes: detail.hiTypes ?? [],
      careContexts: detail.careContexts,
      accessMode: permission.accessMode,
      dateRangeFrom: permission.dateRange?.from,
      dateRangeTo: permission.dateRange?.to,
      dataEraseAt: permission.dataEraseAt,
      frequencyUnit: permission.frequency?.unit,
      frequencyValue: permission.frequency?.value,
      frequencyRepeats: permission.frequency?.repeats,
      signature: body.consent.signature,
      grantedAt: detail.createdAt,
    })
    .catch((err: unknown) => logger.error({ err }, 'Could not store an ABDM consent artefact'));
}

/**
 * ABDM telling us a consent is revoked or expired.
 *
 * Answered 202 immediately, then the purge runs. The **acknowledgement to ABDM** is sent by the
 * service only after the records are actually gone — that acknowledgement is our assertion that we
 * complied, and sending it before the delete would make it a lie whenever the delete then failed.
 */
/**
 * ABDM telling us, as the HIP, that a consent was granted, revoked or expired (ADR-101).
 *
 * Answered `202` before any work happens, because that is what the gateway is waiting on — it is
 * not waiting for us to finish deleting rows. The acknowledgement that we *acted* is a separate
 * outbound call on `on-notify`, sent only once the artefact has actually been stored or purged.
 *
 * The ordering matters and is the whole point of the endpoint: acknowledge after acting, never
 * before. A revocation acknowledged but not performed leaves the patient believing they withdrew
 * access that we are in fact still honouring.
 */
export async function hipConsentNotify(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    notification: {
      status: string;
      consentId?: string;
      signature?: string;
      consentDetail?: Parameters<typeof consent.applyHipConsentNotification>[0]['detail'];
    };
  };
  const hipId = req.header('X-HIP-ID') ?? '';
  // The correlation id for the acknowledgement is the inbound header, not a body field.
  const requestId = req.header('REQUEST-ID') ?? '';

  res.status(202).json({ accepted: true });

  const consentId = body.notification.consentId ?? body.notification.consentDetail?.consentId;

  try {
    const outcome = await consent.applyHipConsentNotification({
      hipId,
      status: body.notification.status,
      consentId: body.notification.consentId,
      detail: body.notification.consentDetail,
      signature: body.notification.signature,
    });

    // Nothing to acknowledge when we could not tell which consent, or which hospital, it concerned:
    // an ack naming an empty consent id is noise the gateway cannot correlate either.
    if (!consentId || outcome === 'unknown_facility') return;

    await consent.acknowledgeHipConsentNotification({
      requestId,
      consentId,
      hipId,
      ok: outcome !== 'ignored',
      errorMessage: outcome === 'ignored' ? 'Notification could not be applied' : undefined,
    });
  } catch (err) {
    logger.error({ err, hipId, consentId }, 'Could not apply an ABDM consent notification');
    if (consentId) {
      await consent.acknowledgeHipConsentNotification({
        requestId,
        consentId,
        hipId,
        ok: false,
        errorMessage: 'Could not apply the consent notification',
      });
    }
  }
}

export async function hiuConsentNotify(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    notification: {
      status: string;
      consentId?: string;
      consentDetail?: { consentId?: string };
      consentArtefacts?: Array<{ id: string }>;
    };
  };
  res.status(202).json({ accepted: true });

  // A revocation can name one consent or a list of artefacts; both shapes appear in the wild.
  const ids = [
    body.notification.consentId,
    body.notification.consentDetail?.consentId,
    ...(body.notification.consentArtefacts ?? []).map((a) => a.id),
  ].filter((id): id is string => Boolean(id));

  for (const consentId of ids) {
    await hiu
      .handleConsentNotification({ consentId, status: body.notification.status })
      .catch((err: unknown) => logger.error({ err, consentId }, 'Could not act on an ABDM consent notification'));
  }
}

/** A doctor pulling the records every granted consent for this patient unlocks. */
export async function fetchExternalRecords(req: Request, res: Response): Promise<void> {
  const results = await hiuTransfer.requestAllRecords(req.auth!.tenantId, req.params.patientId!);
  // 202: the records arrive later, on a push. Saying 200 would imply they are already here.
  res.status(202).json({ requested: results.length, transfers: results });
}

/**
 * A hospital delivering records we asked for (ADR-093).
 *
 * Answered 202 immediately: decrypting and verifying a year of records is real work, and the
 * pushing HIP should not hold a connection open through it.
 */
export async function hiuDataPush(req: Request, res: Response): Promise<void> {
  const body = req.body as hiuTransfer.PushedPage;
  res.status(202).json({ accepted: true });
  await hiuTransfer
    .receivePushedRecords(body)
    .catch((err: unknown) => logger.error({ err }, 'Could not process pushed health records'));
}

/**
 * The patient's history from every other hospital, merged into one chronological feed.
 *
 * The consent check is in the query, not here — a record is returned only while a granted,
 * unexpired consent still covers it, measured against the clock rather than a status column.
 */
export async function externalHistoryTimeline(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId;
  const patientId = req.params.patientId!;
  const hiTypes = typeof req.query.hiTypes === 'string' ? req.query.hiTypes.split(',').filter(Boolean) : undefined;
  const sourceHipId = typeof req.query.sourceHipId === 'string' ? req.query.sourceHipId : undefined;

  const [entries, summary] = await Promise.all([
    timeline.patientTimeline(tenantId, patientId, { hiTypes, sourceHipId }),
    timeline.timelineSummary(tenantId, patientId, { hiTypes, sourceHipId }),
  ]);
  res.json({ summary, entries });
}

// --- Milestone 4: the Health Facility Registry (ADR-096) --------------------------------------

/** Every facility this organisation has registered, or begun to. */
export async function listFacilityRegistrations(req: Request, res: Response): Promise<void> {
  res.json({ registrations: await hfr.listRegistrations(req.auth!.tenantId) });
}

/** Saves the form without sending anything to HFR — registration is a long, resumable process. */
export async function saveFacilityRegistration(req: Request, res: Response): Promise<void> {
  const saved = await hfr.saveDraft(req.auth!.tenantId, req.auth!.userId ?? null, req.body as hfr.FacilityDraft);
  res.json(saved);
}

/** Sends it. Answers with `submitted`, never `verified` — a human verifier decides that. */
export async function submitFacilityRegistration(req: Request, res: Response): Promise<void> {
  const body = req.body as { branchId?: string | null };
  const submitted = await hfr.submitRegistration(req.auth!.tenantId, req.auth!.userId ?? null, body.branchId ?? null);
  res.status(202).json(submitted);
}

/** Records the verifier's decision, and adopts the issued facility id as our hipId. */
export async function recordFacilityVerification(req: Request, res: Response): Promise<void> {
  const body = req.body as { branchId?: string | null; status: 'under_review' | 'verified' | 'rejected'; facilityId?: string; message?: string };
  res.json(await hfr.recordVerification(req.auth!.tenantId, body));
}

/** The registry's own reference data, cached — never a hard-coded copy that can drift. */
export async function facilityRegistryMasterData(req: Request, res: Response): Promise<void> {
  const allowed: hfr.FacilityMasterKind[] = [
    'states',
    'districts',
    'subDistricts',
    'facilityType',
    'facilitySubType',
    'ownerSubtype',
    'specialities',
    'masterData',
    'masterTypes',
  ];
  const kind = req.params.kind as hfr.FacilityMasterKind;
  // An allowlist rather than a passthrough: `kind` indexes a path table, so an unchecked value is a
  // way to aim our authenticated registry client at any path in it.
  if (!allowed.includes(kind)) throw new AppError(404, 'ABDM_MASTER_UNKNOWN', 'No such reference list');

  // `code` scopes an LGD list to its parent and `type` selects which list `get-master-data`
  // returns; the rest are the named filters HFR's POST lists require in their body. Allowlisted
  // by name rather than forwarding `req.query` wholesale, so a caller cannot inject a field into
  // a request we make with our own registry credentials.
  const query: Record<string, string> = {};
  for (const key of ['code', 'type', 'ownershipCode', 'systemOfMedicineCode', 'facilityTypeCode', 'ownerSubtypeCode']) {
    const v = req.query[key];
    if (typeof v === 'string' && v !== '') query[key] = v;
  }
  res.json(await hfr.facilityMasterData(kind, Object.keys(query).length ? query : undefined));
}

// --- Milestone 4: the Healthcare Professional Registry (ADR-097) ------------------------------

export async function listHprEnrolments(req: Request, res: Response): Promise<void> {
  res.json({ enrolments: await hpr.listEnrolments(req.auth!.tenantId) });
}

/**
 * Starts an enrolment: encrypts the Aadhaar, sends the OTP, and checks whether this person already
 * holds an HPR id. The Aadhaar is never echoed back and never stored.
 */
export async function startHprEnrolment(req: Request, res: Response): Promise<void> {
  const body = req.body as { providerId: string; aadhaar: string; category: hpr.ProfessionalCategory };
  const started = await hpr.startEnrolment(req.auth!.tenantId, req.auth!.userId ?? null, body);
  // The transaction id is ABDM's, not a secret, but nothing derived from the Aadhaar goes back.
  res.status(202).json({ status: started.status, alreadyRegistered: started.alreadyRegistered ?? false });
}

export async function verifyHprAadhaarOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as { providerId: string; otp: string };
  res.json(await hpr.verifyAadhaarOtp(req.auth!.tenantId, body));
}

export async function sendHprMobileOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as { providerId: string; mobile: string };
  await hpr.sendMobileOtp(req.auth!.tenantId, body.providerId, body.mobile);
  res.status(202).json({ sent: true });
}

export async function verifyHprMobileOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as { providerId: string; otp: string };
  res.json(await hpr.verifyMobileOtp(req.auth!.tenantId, body.providerId, body.otp));
}

/** Mints the HPR id and registers the professional profile — two calls that belong together. */
export async function completeHprEnrolment(req: Request, res: Response): Promise<void> {
  const body = req.body as Parameters<typeof hpr.completeEnrolment>[2];
  res.json(await hpr.completeEnrolment(req.auth!.tenantId, req.auth!.userId ?? null, body));
}

export async function hprMasterData(req: Request, res: Response): Promise<void> {
  const allowed = ['states', 'districts', 'subDistricts', 'countries', 'languages', 'systemsOfMedicine', 'medicalCouncils', 'nurseCouncils', 'universities', 'courses'];
  const kind = req.params.kind as string;
  if (!allowed.includes(kind)) throw new AppError(404, 'ABDM_MASTER_UNKNOWN', 'No such reference list');
  res.json(await hpr.hprMasterData(kind as never));
}

// --- Milestone 4: bulk onboarding via ABDM's portal (ADR-098) ---------------------------------
//
// There is no bulk API — the export feeds ABDM's own spreadsheet upload, and the import reads its
// results back. The client turns these rows into a CSV with the shared `downloadCsv`.

export async function exportBulkProfessionals(req: Request, res: Response): Promise<void> {
  const rows = await bulk.exportProfessionals(req.auth!.tenantId);
  res.json({ columns: Object.values(bulk.PROFESSIONAL_COLUMNS), rows });
}

export async function exportBulkFacilities(req: Request, res: Response): Promise<void> {
  const rows = await bulk.exportFacilities(req.auth!.tenantId);
  res.json({ columns: Object.values(bulk.FACILITY_COLUMNS), rows });
}

/** Attaches issued HPR ids to the right clinicians; ambiguity is reported, never guessed. */
export async function importBulkProfessionals(req: Request, res: Response): Promise<void> {
  const body = req.body as { rows: Record<string, string>[] };
  res.json(await bulk.importProfessionalResults(req.auth!.tenantId, req.auth!.userId ?? null, body.rows));
}

export async function importBulkFacilities(req: Request, res: Response): Promise<void> {
  const body = req.body as { rows: Record<string, string>[] };
  res.json(await bulk.importFacilityResults(req.auth!.tenantId, req.auth!.userId ?? null, body.rows));
}

// --- Consents this hospital holds (ADR-100) ---------------------------------------------------
//
// Certification requires all three consent cases to be "seen in HMIS". The live list is the
// permissions we currently hold; the history beside it is the record that one existed and ended,
// which is what makes a revocation watchable rather than merely correct.
export async function listHeldConsents(req: Request, res: Response): Promise<void> {
  const tenantId = req.auth!.tenantId;
  const abhaAddress = typeof req.query.abhaAddress === 'string' ? req.query.abhaAddress : undefined;
  const [held, history] = await Promise.all([
    consent.listConsents(tenantId, abhaAddress),
    consent.consentHistory(tenantId),
  ]);
  res.json({
    consents: held.map((c) => ({
      consentId: c.consentId,
      abhaAddress: c.abhaAddress,
      hiuId: c.hiuId,
      hipId: c.hipId,
      purposeCode: c.purposeCode,
      hiTypes: c.hiTypes,
      accessMode: c.accessMode,
      dateRangeFrom: c.dateRangeFrom,
      dateRangeTo: c.dateRangeTo,
      dataEraseAt: c.dataEraseAt,
      grantedAt: c.grantedAt,
    })),
    history,
  });
}

/** Resends the OTP for a verification in flight, throttled server-side (ADR-100). */
export async function resendOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as { transactionId: string; aadhaar?: string; mobile?: string };
  res.status(202).json(await svc.resendOtp(req.auth!.tenantId, body, req.auth!.userId));
}

/**
 * Finds the patient an ABHA identifier belongs to (HIU_FLOW_101, ADR-100).
 *
 * Answers with the match and the honest next step rather than a bare boolean, because "not found"
 * and "found but never verified" need different actions from the person at the desk.
 */
export async function lookupAbha(req: Request, res: Response): Promise<void> {
  const identifier = String(req.query.identifier ?? '').trim();
  if (identifier.length < 3) throw new AppError(422, 'ABDM_IDENTIFIER_REQUIRED', 'Enter an ABHA number or address');
  res.json(await hiu.findPatientByAbha(req.auth!.tenantId, identifier));
}
