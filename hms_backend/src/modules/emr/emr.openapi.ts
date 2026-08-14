import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { OpenEncounterBody, SaveEncounterBody, EncounterSchema, Icd10ListSchema } from './emr.schema';

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
