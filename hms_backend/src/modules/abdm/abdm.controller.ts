import type { Request, Response } from 'express';
import * as svc from './abdm.service';
import { toPatientDto } from '../patient/patient.dto';
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

// --- Linking ----------------------------------------------------------------------------------

export async function linkPatient(req: Request, res: Response): Promise<void> {
  // Through the shared patient DTO: the row carries the encrypted linking token, and an endpoint
  // that returned the raw record would publish a bearer credential to the browser.
  res.json(toPatientDto(await svc.linkToPatient(req.auth!.tenantId, req.body, req.auth!.userId)));
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
