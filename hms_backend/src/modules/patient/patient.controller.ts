import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import { paginate } from '../../http/respond';
import { ListPatientsQuery } from './patient.schema';
import * as svc from './patient.service';
import * as docSvc from './document.service';
import { ListDocumentsQuery } from './document.schema';
import { toPatientDto } from './patient.dto';
import type { Patient } from '../../db/schema';

/** The API presentation of a patient lives in `patient.dto.ts`, shared with ABDM linking. */
const toPatient = toPatientDto;

export async function listPatients(req: Request, res: Response): Promise<void> {
  const { page, pageSize, search, gender, status, city, registeredFrom, registeredTo } =
    ListPatientsQuery.parse(req.query);
  const { rows, total } = await svc.listPatients(req.auth!.tenantId, {
    page,
    pageSize,
    search,
    gender,
    status,
    city,
    registeredFrom,
    registeredTo,
  });
  res.json(paginate(rows.map(toPatient), total, page, pageSize));
}

export async function createPatient(req: Request, res: Response): Promise<void> {
  const p = await svc.createPatient(req.auth!.tenantId, req.body, req.auth!.userId);
  res.status(201).json(toPatient(p));
}

export async function getPatient(req: Request, res: Response): Promise<void> {
  const p = await svc.getPatient(req.auth!.tenantId, req.params.id!);
  if (!p) throw Errors.notFound('Patient not found');
  res.json(toPatient(p));
}

export async function updatePatient(req: Request, res: Response): Promise<void> {
  const p = await svc.updatePatient(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId);
  res.json(toPatient(p));
}

// ---- Documents attached to a patient (ADR-119) -----------------------------

export async function listDocuments(req: Request, res: Response): Promise<void> {
  const q = ListDocumentsQuery.parse(req.query);
  res.json(
    await docSvc.listDocuments(req.auth!.tenantId, {
      patientId: req.params.id!,
      caseId: q.caseId,
      includeArchived: q.includeArchived,
    }),
  );
}

export async function attachDocument(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(
      await docSvc.attachDocument(
        req.auth!.tenantId,
        { patientId: req.params.id!, ...req.body },
        req.auth!.userId,
      ),
    );
}

export async function archiveDocument(req: Request, res: Response): Promise<void> {
  res.json(
    await docSvc.archiveDocument(req.auth!.tenantId, req.params.docId!, req.body, req.auth!.userId),
  );
}
