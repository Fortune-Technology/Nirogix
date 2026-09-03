import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  RequestCodeBody,
  VerifyCodeBody,
  GrantPortalAccessBody,
  PatientSessionSchema,
  PatientHospitalSchema,
  PatientProfileSchema,
  PatientLabReportSchema,
} from './patientIdentity.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated as a patient', ...json(ErrorResponseSchema) };
const noAccess = { description: 'No active link to that hospital', ...json(ErrorResponseSchema) };
const tenantParam = z.object({ tenantId: z.string().uuid() });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patient/auth/request-code',
  operationId: 'requestPatientCode',
  tags: ['Patients'],
  summary: 'Send a one-time code to a registered patient contact',
  description:
    'Always answers 202 with the same message, whether or not the contact is registered — otherwise the endpoint would answer "is this person a patient somewhere?". Rate-limited at the sign-in tier. There is no public patient signup: access is granted by the hospital (ADR-052).',
  request: { body: json(RequestCodeBody) },
  responses: {
    202: { description: 'Accepted (uniform, regardless of whether a code was sent)' },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
    429: { description: 'Too many requests', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patient/auth/verify',
  operationId: 'verifyPatientCode',
  tags: ['Patients'],
  summary: 'Verify a one-time code and start a patient session',
  description:
    'Returns an access token carrying the `patient` principal type. The token has no tenant: the patient chooses a hospital afterwards, and the tenant is resolved from an active link on every request. A wrong code and an unknown contact fail identically.',
  request: { body: json(VerifyCodeBody) },
  responses: {
    200: { description: 'Patient session', ...json(PatientSessionSchema) },
    401: { description: 'Invalid or expired code', ...json(ErrorResponseSchema) },
    429: { description: 'Too many requests', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patient/auth/refresh',
  operationId: 'refreshPatientSession',
  tags: ['Patients'],
  summary: 'Exchange the patient refresh cookie for a new access token',
  description:
    'Rotates on every use: the stored hash is replaced, so a token presented twice fails the second time. A revoked, expired or unknown session fails identically — the caller is never told which, because that would reveal whether the session existed. A suspended or unverified identity cannot refresh however valid the token is. A **staff** refresh token is refused here.',
  responses: {
    200: { description: 'New patient session', ...json(PatientSessionSchema) },
    401: { description: 'Invalid or expired session', ...json(ErrorResponseSchema) },
    429: { description: 'Too many requests', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patient/auth/logout',
  operationId: 'patientSignOut',
  tags: ['Patients'],
  summary: 'Sign out of the patient portal',
  description:
    'Revokes the session row, so the refresh token is dead server-side rather than merely dropped by the browser, and clears the cookie. Always succeeds — signing out must never fail.',
  responses: { 204: { description: 'Signed out' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/patient/hospitals',
  operationId: 'listMyHospitals',
  tags: ['Patients'],
  summary: 'The hospitals this patient may view',
  description:
    'Active links only, and only for a verified identity. This is the one query that legitimately spans tenants, and it returns nothing but the caller’s own links.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Hospitals',
      ...json(z.object({ hospitals: z.array(PatientHospitalSchema) })),
    },
    401: notAuthed,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/patient/hospitals/{tenantId}/profile',
  operationId: 'getPatientPortalProfile',
  tags: ['Patients'],
  summary: 'The patient’s own record at one hospital',
  security: [{ bearerAuth: [] }],
  request: { params: tenantParam },
  responses: {
    200: { description: 'Profile', ...json(PatientProfileSchema) },
    401: notAuthed,
    403: noAccess,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/patient/hospitals/{tenantId}/appointments',
  operationId: 'listPatientPortalAppointments',
  tags: ['Patients'],
  summary: 'The patient’s own appointments at one hospital',
  security: [{ bearerAuth: [] }],
  request: { params: tenantParam, query: pageQuery },
  responses: { 200: { description: 'Appointments' }, 401: notAuthed, 403: noAccess },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/patient/hospitals/{tenantId}/invoices',
  operationId: 'listPatientPortalInvoices',
  tags: ['Patients'],
  summary: 'The patient’s own invoices at one hospital',
  security: [{ bearerAuth: [] }],
  request: { params: tenantParam, query: pageQuery },
  responses: { 200: { description: 'Invoices' }, 401: notAuthed, 403: noAccess },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/patient/hospitals/{tenantId}/lab-reports',
  operationId: 'listPatientPortalLabReports',
  tags: ['Patients'],
  summary: 'The patient’s own laboratory reports at one hospital',
  description:
    'Resulted orders only — an in-progress sample is not a report, and showing one would invite a patient to read a half-entered value as a finding.',
  security: [{ bearerAuth: [] }],
  request: { params: tenantParam },
  responses: {
    200: {
      description: 'Reports',
      ...json(z.object({ reports: z.array(PatientLabReportSchema) })),
    },
    401: notAuthed,
    403: noAccess,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/patients/{id}/portal-access',
  operationId: 'grantPatientPortalAccess',
  tags: ['Patients'],
  summary: 'Grant a patient access to the patient portal (hospital-side)',
  description:
    'Links this patient record to a portal identity keyed by a mobile number or email. **This is the only way portal access is ever created** — there is no self-service path. Granting does not verify the contact: the patient still has to prove they hold it. Audited at notice level.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(GrantPortalAccessBody) },
  responses: {
    201: {
      description: 'Linked',
      ...json(z.object({ identityId: z.string(), linkId: z.string() })),
    },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing patient.record.create', ...json(ErrorResponseSchema) },
    404: { description: 'Patient not found', ...json(ErrorResponseSchema) },
    409: {
      description: 'That record is already linked to a different portal account',
      ...json(ErrorResponseSchema),
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/patients/{id}/portal-access',
  operationId: 'revokePatientPortalAccess',
  tags: ['Patients'],
  summary: 'Withdraw portal access for a patient (hospital-side)',
  description:
    'Deactivates the link. The clinical record is untouched, and the effect is immediate because access is re-checked per request rather than baked into the token. Requires the same permission as granting — withdrawing access must never be harder than granting it. Audited at notice level.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: 'Revoked' },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing patient.record.create', ...json(ErrorResponseSchema) },
  },
});
