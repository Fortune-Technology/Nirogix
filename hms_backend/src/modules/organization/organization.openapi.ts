import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { z } from '../../openapi/registry';
import { UpdateOrganizationProfileBody, OrganizationProfileSchema } from './organization.schema';
import {
  SubmitRegistrationBody,
  PublicRegistrationContextSchema,
  RegistrationRequestSchema,
  RegistrationSettingsSchema,
  SetSelfRegistrationBody,
  RejectRegistrationBody,
} from './registration.schema';

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

registry.registerPath({
  method: 'post',
  path: '/api/v1/organization/profile/letterhead-image',
  operationId: 'uploadLetterheadImage',
  tags: ['Config'],
  summary: 'Upload the letterhead image printed at the top of documents',
  description:
    'Multipart form field `file`, an image only (`image/*`). Stored through the FileStorageService; the id is kept on the profile and resolved to a short-lived URL on read. Replacing simply uploads again. Audited.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }) }),
        },
      },
    },
  },
  responses: {
    201: { description: 'Updated profile', ...json(OrganizationProfileSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
    422: { description: 'Not an image', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/organization/profile/letterhead-image',
  operationId: 'removeLetterheadImage',
  tags: ['Config'],
  summary: 'Remove the configured letterhead image',
  description:
    'Drops the image from the profile so documents fall back to the constructed text header. The file soft-deletes and is retained for audit.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Updated profile', ...json(OrganizationProfileSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
  },
});

// ---- Patient self-registration (ADR-056) -----------------------------------

const idParam = z.object({ id: z.string().uuid() });
const tokenParam = z.object({ token: z.string() });

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/registration/{token}',
  operationId: 'getPublicRegistrationContext',
  tags: ['Patients'],
  summary: 'Resolve the hospital a registration QR belongs to (public)',
  description:
    'The tenant is resolved **from the token**, server-side — never from a body, header or query parameter, which is what makes a QR for one hospital unable to register a patient at another. Returns only what a public form may display: the hospital name and city. An unknown token, a retired token and an inactive hospital fail identically, so the endpoint never reveals which hospitals exist.',
  request: { params: tokenParam },
  responses: {
    200: { description: 'Public context', ...json(PublicRegistrationContextSchema) },
    404: { description: 'Not a valid registration link', ...json(ErrorResponseSchema) },
    429: { description: 'Too many requests', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/public/registration/{token}',
  operationId: 'submitRegistrationRequest',
  tags: ['Patients'],
  summary: 'Submit a self-registration request (public)',
  description:
    'Creates a **registration request, not a patient**. ADR-052 stands: the hospital still decides who becomes a patient record, and the front desk converts a request after verifying the person and checking for a duplicate. Rate-limited at the sign-in tier. Refused when the hospital has self-registration switched off.',
  request: { params: tokenParam, body: json(SubmitRegistrationBody) },
  responses: {
    202: { description: 'Received' },
    404: { description: 'Not a valid registration link', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
    429: { description: 'Too many requests', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/registration-requests',
  operationId: 'listRegistrationRequests',
  tags: ['Patients'],
  summary: 'The self-registration review queue',
  description:
    'A read, so it needs only `patient.record.view` — the administrator who switched registration on can see what arrived without also being able to create charts. Approving and rejecting need `patient.record.create`.',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ status: z.string().optional() }) },
  responses: {
    200: { description: 'Requests', ...json(z.object({ requests: z.array(RegistrationRequestSchema) })) },
    401: notAuthed,
    403: { description: 'Missing patient.record.view', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/registration-requests/{id}/approve',
  operationId: 'approveRegistrationRequest',
  tags: ['Patients'],
  summary: 'Convert a request into a patient record',
  description:
    'The moment the hospital takes responsibility for the record, so it needs the same permission as creating a patient by hand and is audited at notice. The request row is kept and marked approved — it is the provenance of a chart nobody on staff typed.',
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: 'Created patient', ...json(z.object({ patientId: z.string() })) },
    401: notAuthed,
    403: { description: 'Missing patient.record.create', ...json(ErrorResponseSchema) },
    404: { description: 'Request not found', ...json(ErrorResponseSchema) },
    409: { description: 'Already reviewed', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/registration-requests/{id}/reject',
  operationId: 'rejectRegistrationRequest',
  tags: ['Patients'],
  summary: 'Reject a self-registration request',
  security: [{ bearerAuth: [] }],
  request: { params: idParam, body: json(RejectRegistrationBody) },
  responses: { 204: { description: 'Rejected' }, 401: notAuthed, 403: { description: 'Missing patient.record.create', ...json(ErrorResponseSchema) } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/organization/registration',
  operationId: 'getRegistrationSettings',
  tags: ['Config'],
  summary: 'Self-registration status, token and pending count',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Settings', ...json(RegistrationSettingsSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/organization/registration',
  operationId: 'setSelfRegistration',
  tags: ['Config'],
  summary: 'Enable or disable patient self-registration',
  description:
    'Off by default; a hospital opts in. Disabling keeps the token, so pausing over a holiday does not require reprinting posters — retiring a printed QR is the separate regenerate action.',
  security: [{ bearerAuth: [] }],
  request: { body: json(SetSelfRegistrationBody) },
  responses: {
    200: { description: 'Settings', ...json(RegistrationSettingsSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/organization/registration/regenerate',
  operationId: 'regenerateRegistrationToken',
  tags: ['Config'],
  summary: 'Retire the printed QR and issue a new one',
  description: 'Every existing poster stops working immediately. Audited at notice.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Settings with the new token', ...json(RegistrationSettingsSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
  },
});
