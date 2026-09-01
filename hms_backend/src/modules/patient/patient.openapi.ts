import { registry, z } from '../../openapi/registry';
import {
  ArchiveDocumentBody,
  AttachDocumentBody,
  PatientDocumentSchema,
  PatientDocumentListSchema,
} from './document.schema';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { CreatePatientBody, UpdatePatientBody, PatientSchema, PatientsPageSchema } from './patient.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const idParam = { params: z.object({ id: z.string().uuid() }) };
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const notEntitled = { description: 'Tenant not entitled to the patient module', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };
const invalid = { description: 'Validation error', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/patients',
  operationId: 'listPatients',
  tags: ['Patients'],
  summary: 'List / search patients (paginated)',
  description:
    'Search matches UHID, name, or phone. `gender`, `status` and `city` are comma-separated multi-select filters (e.g. `gender=male,female`) applied server-side. Requires the patient module + `patient.record.view`.',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
      search: z.string().optional(),
      gender: z.string().optional().openapi({ description: 'Comma-separated: male,female,other' }),
      status: z.string().optional().openapi({ description: 'Comma-separated patient status values' }),
      city: z.string().optional().openapi({ description: 'Comma-separated city names' }),
      registeredFrom: z.string().optional().openapi({ description: 'Registration date lower bound (YYYY-MM-DD)' }),
      registeredTo: z.string().optional().openapi({ description: 'Registration date upper bound (YYYY-MM-DD)' }),
    }),
  },
  responses: { 200: { description: 'Patients', ...json(PatientsPageSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patients',
  operationId: 'createPatient',
  tags: ['Patients'],
  summary: 'Register a patient (auto-assigns a per-tenant UHID)',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreatePatientBody) },
  responses: {
    201: { description: 'Created', ...json(PatientSchema) },
    401: notAuthed,
    403: forbidden,
    409: {
      description: 'DUPLICATE_PATIENT — matching charts in error.details.candidates; review, then link or resend with allowDuplicate',
      ...json(ErrorResponseSchema),
    },
    422: invalid,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/patients/{id}',
  operationId: 'getPatient',
  tags: ['Patients'],
  summary: 'Get a patient',
  security: [{ bearerAuth: [] }],
  request: idParam,
  responses: {
    200: { description: 'Patient', ...json(PatientSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/patients/{id}',
  operationId: 'updatePatient',
  tags: ['Patients'],
  summary: 'Update a patient',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(UpdatePatientBody) },
  responses: {
    200: { description: 'Updated', ...json(PatientSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    422: invalid,
  },
});

// ---- Documents attached to a patient (ADR-119) -----------------------------

const docTags = ['Patient documents'];

registry.registerPath({
  method: 'get',
  path: '/api/v1/patients/{id}/documents',
  operationId: 'listPatientDocuments',
  tags: docTags,
  summary: "A patient's attached documents",
  description:
    'Referral letters, prior reports, insurance and identity documents. `file_metadata` is a ' +
    'generic store that knows nothing about who a file is about; this is the link that gives it ' +
    'a subject. Filter by `caseId` for one episode. Archived attachments are hidden unless asked ' +
    'for — they are kept, never deleted.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      caseId: z.string().uuid().optional(),
      includeArchived: z.enum(['true', 'false']).optional(),
    }),
  },
  responses: {
    200: { description: 'Documents', ...json(PatientDocumentListSchema) },
    401: notAuthed,
    403: notEntitled,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patients/{id}/documents',
  operationId: 'attachPatientDocument',
  tags: docTags,
  summary: 'Attach an already-uploaded file to a patient',
  description:
    'Upload the file through `POST /files` first and send its id here — one file store, one set ' +
    'of type and size checks. The file must belong to this tenant, and a visit or case named ' +
    'here must belong to this patient; both are checked server-side, because taking either on ' +
    'trust would file a document against the wrong chart.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(AttachDocumentBody) },
  responses: {
    201: { description: 'Attached', ...json(PatientDocumentSchema) },
    401: notAuthed,
    403: notEntitled,
    404: { description: 'Patient, file, visit or case not found', ...json(ErrorResponseSchema) },
    422: { description: 'The visit or case belongs to a different patient', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patients/{id}/documents/{docId}/archive',
  operationId: 'archivePatientDocument',
  tags: docTags,
  summary: 'Archive an attachment, with a reason',
  description:
    'A document attached to the wrong chart is corrected by archiving it — the fact that it was ' +
    'once attached, and who attached it, is part of the record. The underlying file is untouched; ' +
    'removing that is `DELETE /files/{id}`, a separate permission.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid(), docId: z.string().uuid() }),
    body: json(ArchiveDocumentBody),
  },
  responses: {
    200: { description: 'Archived', ...json(PatientDocumentSchema) },
    401: notAuthed,
    403: notEntitled,
    409: { description: 'Already archived, or changed elsewhere', ...json(ErrorResponseSchema) },
  },
});
