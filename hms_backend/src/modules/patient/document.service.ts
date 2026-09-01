import { and, desc, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  patientDocuments,
  fileMetadata,
  patients,
  visits,
  patientCases,
  users,
  type PatientDocumentRow,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';

/**
 * Documents attached to a patient (ADR-119).
 *
 * The upload itself still goes through the ordinary `POST /files` — one file store, one set of type
 * and size checks, one optimizer. This module only records **what a file is about**, which is the
 * thing `file_metadata` deliberately does not know.
 */

export const DOCUMENT_TYPES = [
  'referral_letter',
  'prior_report',
  'insurance',
  'id_proof',
  'consent_form',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface PatientDocumentDto {
  id: string;
  patientId: string;
  visitId: string | null;
  caseId: string | null;
  caseNumber: string | null;
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
  documentType: string;
  title: string;
  note: string | null;
  status: string;
  archiveReason: string | null;
  uploadedByName: string | null;
  createdAt: string;
  version: number;
}

type Flat = {
  d: PatientDocumentRow;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  caseNumber: string | null;
  uploaderName: string | null;
};

function toDto(row: Flat): PatientDocumentDto {
  const d = row.d;
  return {
    id: d.id,
    patientId: d.patientId,
    visitId: d.visitId,
    caseId: d.caseId,
    caseNumber: row.caseNumber,
    fileId: d.fileId,
    // A file that has since been deleted leaves the attachment behind, saying so rather than
    // pretending the row is broken — that it was once attached is part of the record.
    filename: row.filename ?? '(file removed)',
    contentType: row.contentType ?? 'application/octet-stream',
    size: row.size ?? 0,
    documentType: d.documentType,
    title: d.title,
    note: d.note,
    status: d.status,
    archiveReason: d.archiveReason,
    uploadedByName: row.uploaderName,
    createdAt: d.createdAt.toISOString(),
    version: d.version,
  };
}

export interface ListDocumentsOptions {
  patientId: string;
  caseId?: string;
  includeArchived?: boolean;
}

export async function listDocuments(tenantId: string, opts: ListDocumentsOptions): Promise<PatientDocumentDto[]> {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(patientDocuments.tenantId, tenantId), eq(patientDocuments.patientId, opts.patientId)];
    if (opts.caseId) conds.push(eq(patientDocuments.caseId, opts.caseId));
    if (!opts.includeArchived) conds.push(eq(patientDocuments.status, 'active'));

    const rows = await tx
      .select({
        d: patientDocuments,
        filename: fileMetadata.filename,
        contentType: fileMetadata.contentType,
        size: fileMetadata.size,
        caseNumber: patientCases.caseNumber,
        uploaderName: users.fullName,
      })
      .from(patientDocuments)
      .leftJoin(fileMetadata, eq(fileMetadata.id, patientDocuments.fileId))
      .leftJoin(patientCases, eq(patientCases.id, patientDocuments.caseId))
      .leftJoin(users, eq(users.id, patientDocuments.uploadedBy))
      .where(and(...conds))
      .orderBy(desc(patientDocuments.createdAt));
    return rows.map(toDto);
  });
}

export interface AttachDocumentInput {
  patientId: string;
  fileId: string;
  title?: string | null;
  documentType?: DocumentType | null;
  note?: string | null;
  visitId?: string | null;
  caseId?: string | null;
}

export async function attachDocument(
  tenantId: string,
  input: AttachDocumentInput,
  actorUserId?: string,
): Promise<PatientDocumentDto> {
  const created = await runWithTenant(tenantId, async (tx) => {
    const patient = (
      await tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId)))
        .limit(1)
    )[0];
    if (!patient) throw Errors.notFound('Patient not found');

    // The file must belong to this tenant. RLS protects the row, but only if we actually go and
    // look for it — taking a file id on trust would let one hospital attach its document to
    // another hospital's chart.
    const file = (
      await tx
        .select({ id: fileMetadata.id, filename: fileMetadata.filename, status: fileMetadata.status })
        .from(fileMetadata)
        .where(and(eq(fileMetadata.tenantId, tenantId), eq(fileMetadata.id, input.fileId)))
        .limit(1)
    )[0];
    if (!file || file.status !== 'active') throw Errors.notFound('File not found');

    if (input.visitId) {
      const visit = (
        await tx
          .select({ patientId: visits.patientId })
          .from(visits)
          .where(and(eq(visits.tenantId, tenantId), eq(visits.id, input.visitId)))
          .limit(1)
      )[0];
      if (!visit) throw Errors.notFound('Visit not found');
      if (visit.patientId !== input.patientId) {
        throw Errors.validation(undefined, 'That visit belongs to a different patient');
      }
    }
    if (input.caseId) {
      const episode = (
        await tx
          .select({ patientId: patientCases.patientId })
          .from(patientCases)
          .where(and(eq(patientCases.tenantId, tenantId), eq(patientCases.id, input.caseId)))
          .limit(1)
      )[0];
      if (!episode) throw Errors.notFound('Case not found');
      if (episode.patientId !== input.patientId) {
        throw Errors.validation(undefined, 'That case belongs to a different patient');
      }
    }

    const rows = await tx
      .insert(patientDocuments)
      .values({
        tenantId,
        patientId: input.patientId,
        visitId: input.visitId ?? null,
        caseId: input.caseId ?? null,
        fileId: input.fileId,
        documentType: input.documentType ?? 'other',
        // Falling back to the filename beats an empty title: a list of untitled rows is unusable.
        title: (input.title?.trim() || file.filename).slice(0, 200),
        note: input.note ?? null,
        uploadedBy: actorUserId ?? null,
      })
      .returning();
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'patient.document.attached',
    resourceType: 'patient_document',
    resourceId: created.id,
    metadata: {
      patientId: input.patientId,
      fileId: input.fileId,
      documentType: created.documentType,
      visitId: input.visitId ?? null,
      caseId: input.caseId ?? null,
    },
  });

  const all = await listDocuments(tenantId, { patientId: input.patientId, includeArchived: true });
  return all.find((d) => d.id === created.id)!;
}

/**
 * Archives an attachment.
 *
 * Never deletes: a document attached to the wrong chart is corrected by archiving it with a reason,
 * because the fact that it was once attached — and who attached it — is itself part of the record.
 * The underlying file is untouched; removing that is `DELETE /files/:id`, a separate permission.
 */
export async function archiveDocument(
  tenantId: string,
  documentId: string,
  input: { version: number; reason: string },
  actorUserId?: string,
): Promise<PatientDocumentDto> {
  const patientId = await runWithTenant(tenantId, async (tx) => {
    const row = (
      await tx
        .select({ patientId: patientDocuments.patientId, status: patientDocuments.status })
        .from(patientDocuments)
        .where(and(eq(patientDocuments.tenantId, tenantId), eq(patientDocuments.id, documentId)))
        .limit(1)
    )[0];
    if (!row) throw Errors.notFound('Document not found');
    if (row.status !== 'active') throw Errors.conflict('That document is already archived');

    const bumped = await tx
      .update(patientDocuments)
      .set({
        status: 'archived',
        archiveReason: input.reason.trim(),
        archivedBy: actorUserId ?? null,
        archivedAt: new Date(),
        version: input.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(patientDocuments.tenantId, tenantId),
          eq(patientDocuments.id, documentId),
          eq(patientDocuments.version, input.version),
        ),
      )
      .returning({ id: patientDocuments.id });
    if (!bumped[0]) throw Errors.conflict('That document was changed by someone else. Reload and try again');
    return row.patientId;
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'patient.document.archived',
    resourceType: 'patient_document',
    resourceId: documentId,
    metadata: { reason: input.reason, patientId },
  });

  const all = await listDocuments(tenantId, { patientId, includeArchived: true });
  return all.find((d) => d.id === documentId)!;
}
