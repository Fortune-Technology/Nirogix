import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { UpdateOrganizationProfileBody, OrganizationProfileSchema } from './organization.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/organization/profile',
  operationId: 'getOrganizationProfile',
  tags: ['Config'],
  summary: "Get the hospital's own identity — address, contact details and statutory numbers",
  description:
    'RLS-scoped to the caller’s tenant. `contactLines` is the same data pre-formatted in the order a printed document header uses; `isComplete` is true once the fields an invoice header needs are present.',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Organization profile', ...json(OrganizationProfileSchema) }, 401: notAuthed },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/organization/profile',
  operationId: 'updateOrganizationProfile',
  tags: ['Config'],
  summary: "Update the hospital's identity (partial update; audited)",
  description:
    'Send only the fields being changed. An empty string clears a field; omitting it leaves it unchanged. Every change writes an audit entry.',
  security: [{ bearerAuth: [] }],
  request: { body: json(UpdateOrganizationProfileBody) },
  responses: {
    200: { description: 'Updated profile', ...json(OrganizationProfileSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
