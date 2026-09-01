import { z } from '../../openapi/registry';
import { DOCUMENT_TYPES } from './document.service';

const documentType = z.enum(DOCUMENT_TYPES as unknown as [string, ...string[]]);

/**
 * The file is uploaded first through the ordinary `POST /files`, and its id sent here. One file
 * store, one set of type and size checks — this endpoint records what the file is *about*.
 */
export const AttachDocumentBody = z
  .object({
    fileId: z.string().uuid(),
    title: z.string().max(200).nullable().optional(),
    documentType: documentType.optional(),
    note: z.string().max(500).nullable().optional(),
    /** Both optional. A document with neither is simply the patient's. */
    visitId: z.string().uuid().nullable().optional(),
    caseId: z.string().uuid().nullable().optional(),
  })
  .openapi('AttachDocumentBody');

export const ArchiveDocumentBody = z
  .object({
    version: z.number().int().min(1),
    /** Required — an attachment that vanished with no note is unexplainable later. */
    reason: z.string().min(2).max(300),
  })
  .openapi('ArchiveDocumentBody');

export const ListDocumentsQuery = z.object({
  caseId: z.string().uuid().optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const PatientDocumentSchema = z
  .object({
    id: z.string().uuid(),
    patientId: z.string().uuid(),
    visitId: z.string().uuid().nullable(),
    caseId: z.string().uuid().nullable(),
    caseNumber: z.string().nullable(),
    fileId: z.string().uuid(),
    filename: z.string(),
    contentType: z.string(),
    size: z.number().int(),
    documentType: z.string(),
    title: z.string(),
    note: z.string().nullable(),
    status: z.string(),
    archiveReason: z.string().nullable(),
    uploadedByName: z.string().nullable(),
    createdAt: z.string(),
    version: z.number().int(),
  })
  .openapi('PatientDocument');

export const PatientDocumentListSchema = z.array(PatientDocumentSchema).openapi('PatientDocumentList');
