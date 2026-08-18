import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  OpenEncounterBody,
  SaveEncounterBody,
  EncounterSchema,
  EncounterSummaryListSchema,
  Icd10ListSchema,
  AiDraftBody,
  AiDraftResponseSchema,
  AiCapabilitiesSchema,
} from './emr.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const notEntitled = { description: 'Tenant not entitled to the EMR module', ...json(ErrorResponseSchema) };
const forbidden = { description: "Missing permission / not this clinician's note", ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/icd10',
  operationId: 'searchIcd10',
  tags: ['EMR'],
  summary: 'Search the ICD-10 diagnosis lookup',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ q: z.string().optional() }) },
  responses: { 200: { description: 'Matching codes', ...json(Icd10ListSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/encounters/{id}',
  operationId: 'getEncounter',
  tags: ['EMR'],
  summary: 'Read one encounter (read-only — never creates a draft)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Encounter', ...json(EncounterSchema) },
    401: notAuthed,
    403: notEntitled,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/patients/{id}/encounters',
  operationId: 'listPatientEncounters',
  tags: ['EMR'],
  summary: "A patient's clinical history — signed encounters, newest first",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Signed encounters', ...json(EncounterSummaryListSchema) },
    401: notAuthed,
    403: notEntitled,
    404: { description: 'Patient not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/encounters/open',
  operationId: 'openEncounter',
  tags: ['EMR'],
  summary: 'Open (or resume) the consultation for a visit — creates a draft encounter if none exists',
  security: [{ bearerAuth: [] }],
  request: { body: json(OpenEncounterBody) },
  responses: {
    200: { description: 'Encounter', ...json(EncounterSchema) },
    401: notAuthed,
    403: notEntitled,
    404: { description: 'Visit not found', ...json(ErrorResponseSchema) },
    409: { description: 'Visit not live, or the consultation fee is still unpaid', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/encounters/{id}',
  operationId: 'saveEncounter',
  tags: ['EMR'],
  summary: 'Save the encounter (notes, vitals, diagnoses, prescriptions, lab orders) — draft only, author only',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(SaveEncounterBody) },
  responses: {
    200: { description: 'Saved encounter', ...json(EncounterSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    409: { description: 'Signed / version conflict', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/encounters/{id}/sign',
  operationId: 'signEncounter',
  tags: ['EMR'],
  summary: 'Sign the encounter (locks it and completes the visit)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Signed encounter', ...json(EncounterSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    409: { description: 'Already signed', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/ai/capabilities',
  operationId: 'aiCapabilities',
  tags: ['EMR'],
  summary: 'Which AI assists this deployment has (absent key = feature absent, never stubbed)',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Capability flags', ...json(AiCapabilitiesSchema) }, 401: notAuthed },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/ai/prescription-draft',
  operationId: 'aiPrescriptionDraft',
  tags: ['EMR'],
  summary: 'Draft prescription rows from the clinical context — a suggestion the doctor edits, never an order',
  description:
    'Formulary-aware (prefers the drug master, returns drugId when matched). Sends the clinical minimum and no patient identifiers. 502 when the AI service is unavailable.',
  security: [{ bearerAuth: [] }],
  request: { body: json(AiDraftBody) },
  responses: {
    200: { description: 'Draft rows + optional caution note', ...json(AiDraftResponseSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'AI drafting not enabled on this deployment', ...json(ErrorResponseSchema) },
    422: { description: 'No clinical context yet', ...json(ErrorResponseSchema) },
    502: { description: 'AI service unavailable', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/visits/{id}/encounter',
  operationId: 'getVisitEncounter',
  tags: ['EMR'],
  summary: "Read the visit's encounter without creating one (what the printed prescription reads)",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Encounter', ...json(EncounterSchema) },
    401: notAuthed,
    403: notEntitled,
    404: { description: 'No consultation exists for this visit yet', ...json(ErrorResponseSchema) },
  },
});
