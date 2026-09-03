import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  RecordImmunizationBody,
  ImmunizationSchema,
  ImmunizationListSchema,
} from './immunization.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const notEntitled = {
  description: 'Tenant not entitled to the patient module',
  ...json(ErrorResponseSchema),
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/patients/{patientId}/immunizations',
  operationId: 'listImmunizations',
  tags: ['Patients'],
  summary: "A patient's recorded immunisations (ADR-072)",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ patientId: z.string().uuid() }) },
  responses: {
    200: { description: 'Immunisations', ...json(ImmunizationListSchema) },
    401: notAuthed,
    403: notEntitled,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patients/{patientId}/immunizations',
  operationId: 'recordImmunization',
  tags: ['Patients'],
  summary: 'Record a vaccination (from the catalogue or a custom vaccine)',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ patientId: z.string().uuid() }),
    body: json(RecordImmunizationBody),
  },
  responses: {
    201: { description: 'Recorded immunisation', ...json(ImmunizationSchema) },
    401: notAuthed,
    403: { description: 'Missing permission', ...json(ErrorResponseSchema) },
    404: { description: 'Patient not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
