import type { Request, Response } from 'express';
import {
  PATIENT_REFRESH_COOKIE,
  clearPatientRefreshCookie,
  setPatientRefreshCookie,
} from '../auth/auth.cookie';
import * as identity from './patientIdentity.service';
import * as portal from './patientPortal.service';

export async function requestCode(req: Request, res: Response): Promise<void> {
  await identity.requestPatientCode(req.body);
  // Always 202, always the same shape. Whether a code was actually sent is not the
  // caller's business — otherwise this endpoint answers "is this person a patient?"
  res.status(202).json({ message: 'If that contact is registered, a code has been sent.' });
}

export async function verifyCode(req: Request, res: Response): Promise<void> {
  const { code, ...contact } = req.body as { code: string; mobile?: string; email?: string };
  const meta = { userAgent: req.headers['user-agent'], ip: req.ip };
  const { accessToken, refreshToken, identity: who } = await identity.verifyPatientCode(contact, code, meta);
  // The refresh token never reaches JavaScript — httpOnly, path-scoped to the patient
  // auth routes, so it is not even sent to a staff endpoint (F-8).
  setPatientRefreshCookie(res, refreshToken);
  res.json({ accessToken, identity: who });
}

export async function refreshSession(req: Request, res: Response): Promise<void> {
  const token = (req.cookies as Record<string, string> | undefined)?.[PATIENT_REFRESH_COOKIE];
  const meta = { userAgent: req.headers['user-agent'], ip: req.ip };
  const { accessToken, refreshToken, identity: who } = await identity.refreshPatientSession(token ?? '', meta);
  setPatientRefreshCookie(res, refreshToken);
  res.json({ accessToken, identity: who });
}

export async function signOut(req: Request, res: Response): Promise<void> {
  await identity.endPatientSession((req.cookies as Record<string, string> | undefined)?.[PATIENT_REFRESH_COOKIE]);
  clearPatientRefreshCookie(res);
  res.status(204).end();
}

export async function myHospitals(req: Request, res: Response): Promise<void> {
  res.json({ hospitals: await identity.listMyHospitals(req.auth!.userId) });
}

export async function profile(req: Request, res: Response): Promise<void> {
  res.json(await portal.patientProfile(req.auth!.userId, req.params.tenantId!));
}

export async function appointments(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = req.query as { page?: number; pageSize?: number };
  res.json(await portal.patientAppointments(req.auth!.userId, req.params.tenantId!, page, pageSize));
}

export async function invoices(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = req.query as { page?: number; pageSize?: number };
  res.json(await portal.patientInvoices(req.auth!.userId, req.params.tenantId!, page, pageSize));
}

export async function labReports(req: Request, res: Response): Promise<void> {
  res.json({ reports: await portal.patientLabReports(req.auth!.userId, req.params.tenantId!) });
}

// ---- Hospital-side (staff) --------------------------------------------------

export async function grantPortalAccess(req: Request, res: Response): Promise<void> {
  const result = await identity.linkPatientToIdentity(
    req.auth!.tenantId,
    req.params.id!,
    req.body,
    req.auth!.userId,
  );
  res.status(201).json(result);
}

export async function revokePortalAccess(req: Request, res: Response): Promise<void> {
  await identity.revokePatientAccess(req.auth!.tenantId, req.params.id!, req.auth!.userId);
  res.status(204).end();
}
