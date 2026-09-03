import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  SpecialtiesResponseSchema,
  CreateProviderBody,
  UpdateProviderBody,
  ProviderSchema,
  ProvidersResponseSchema,
  AssignSpecialtyBody,
  AssignedRoleSchema,
  CreateFormTemplateBody,
  FormTemplateSchema,
  FormTemplatesResponseSchema,
  SetSchedulesBody,
  ScheduleListSchema,
  FreeSlotsSchema,
} from './provider.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const idParam = { params: z.object({ id: z.string().uuid() }) };
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/specialties',
  operationId: 'listSpecialties',
  tags: ['Doctors'],
  summary: 'List the specialty catalog (reference data)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Specialties', ...json(SpecialtiesResponseSchema) },
    401: notAuthed,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/providers',
  operationId: 'listProviders',
  tags: ['Doctors'],
  summary: 'List providers (FHIR Practitioner) with their specialties',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Providers', ...json(ProvidersResponseSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/providers',
  operationId: 'createProvider',
  tags: ['Doctors'],
  summary: 'Create a provider (FHIR Practitioner)',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateProviderBody) },
  responses: {
    201: { description: 'Created', ...json(ProviderSchema) },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/providers/{id}',
  operationId: 'getProvider',
  tags: ['Doctors'],
  summary: 'Get a provider',
  security: [{ bearerAuth: [] }],
  request: idParam,
  responses: {
    200: { description: 'Provider', ...json(ProviderSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/providers/{id}',
  operationId: 'updateProvider',
  tags: ['Doctors'],
  summary: 'Update a provider (details, default consultation fee, active flag)',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(UpdateProviderBody) },
  responses: {
    200: { description: 'Updated provider', ...json(ProviderSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/providers/{id}/specialties',
  operationId: 'assignSpecialty',
  tags: ['Doctors'],
  summary: 'Assign a specialty to a provider (FHIR PractitionerRole)',
  description:
    'Adding a specialty is a data change (a new PractitionerRole), never a schema change.',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(AssignSpecialtyBody) },
  responses: {
    201: { description: 'Role assigned', ...json(AssignedRoleSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Provider not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/providers/{id}/schedules',
  operationId: 'listProviderSchedules',
  tags: ['Doctors'],
  summary: "The provider's weekly availability windows",
  security: [{ bearerAuth: [] }],
  request: idParam,
  responses: {
    200: { description: 'Roster', ...json(ScheduleListSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/providers/{id}/schedules',
  operationId: 'setProviderSchedules',
  tags: ['Doctors'],
  summary: 'Replace the weekly roster (empty list clears it — booking becomes free-form)',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(SetSchedulesBody) },
  responses: {
    200: { description: 'Saved roster', ...json(ScheduleListSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Provider not found', ...json(ErrorResponseSchema) },
    422: { description: 'Overlapping or malformed windows', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/providers/{id}/slots',
  operationId: 'listProviderFreeSlots',
  tags: ['Doctors'],
  summary: 'Free bookable slots for one day, derived from the roster minus booked appointments',
  security: [{ bearerAuth: [] }],
  request: {
    ...idParam,
    query: z.object({ date: z.string().openapi({ description: 'YYYY-MM-DD' }) }),
  },
  responses: {
    200: {
      description: 'Slots (hasRoster=false when the provider has no roster)',
      ...json(FreeSlotsSchema),
    },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Bad date', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/specialty-templates',
  operationId: 'listFormTemplates',
  tags: ['Config'],
  summary: 'List specialty form templates',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Templates', ...json(FormTemplatesResponseSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/specialty-templates',
  operationId: 'createFormTemplate',
  tags: ['Config'],
  summary: 'Create a specialty form template (configurable structured data — the no-EAV mechanism)',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateFormTemplateBody) },
  responses: {
    201: { description: 'Created', ...json(FormTemplateSchema) },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
