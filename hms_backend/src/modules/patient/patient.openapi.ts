import { registry, z } from '../../openapi/registry';
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
