import { registry } from '../../openapi/registry';
import {
  AnnounceArrivalBody,
  ConfirmArrivalBody,
  DismissArrivalBody,
  SetSelfCheckinBody,
  PublicCheckinContextSchema,
  SelfCheckinRequestSchema,
  SelfCheckinRequestListSchema,
  SelfCheckinSettingsSchema,
} from './selfCheckin.schema';
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
  ApproveRegistrationBody,
} from './registration.schema';
import {
  SubmitBookingBody,
  PublicBookingContextSchema,
  BookingRequestListSchema,
  ApproveBookingBody,
  RejectBookingBody,
  SetOnlineBookingBody,
  BookingSettingsSchema,
} from './booking.schema';

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
  responses: {
    200: { description: 'Organization profile', ...json(OrganizationProfileSchema) },
    401: notAuthed,
  },
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
    200: {
      description: 'Requests',
      ...json(z.object({ requests: z.array(RegistrationRequestSchema) })),
    },
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
  request: { params: idParam, body: json(ApproveRegistrationBody) },
  responses: {
    200: {
      description: 'Created (or linked) patient',
      ...json(z.object({ patientId: z.string() })),
    },
    401: notAuthed,
    403: { description: 'Missing patient.record.create', ...json(ErrorResponseSchema) },
    404: { description: 'Request not found', ...json(ErrorResponseSchema) },
    409: {
      description: 'Already reviewed, or DUPLICATE_PATIENT with matching charts',
      ...json(ErrorResponseSchema),
    },
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
  responses: {
    204: { description: 'Rejected' },
    401: notAuthed,
    403: { description: 'Missing patient.record.create', ...json(ErrorResponseSchema) },
  },
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

// ---- Public appointment requests (ADR-069) -----------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/booking/{token}',
  operationId: 'getPublicBookingContext',
  tags: ['Appointments'],
  summary: 'Public: what the booking form may show for this token',
  description:
    'Unauthenticated, sign-in-tier rate limit. Unknown, retired and disabled tokens fail identically so the endpoint cannot enumerate hospitals.',
  request: { params: z.object({ token: z.string() }) },
  responses: {
    200: {
      description: 'Hospital name, departments and doctors for the form',
      ...json(PublicBookingContextSchema),
    },
    404: { description: 'Not a valid booking link', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/public/booking/{token}',
  operationId: 'submitBookingRequest',
  tags: ['Appointments'],
  summary: 'Public: submit an appointment REQUEST (never an appointment)',
  request: { params: z.object({ token: z.string() }), body: json(SubmitBookingBody) },
  responses: {
    202: {
      description: 'Received — the desk confirms the slot',
      ...json(z.object({ message: z.string() })),
    },
    404: { description: 'Not a valid booking link', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/booking-requests',
  operationId: 'listBookingRequests',
  tags: ['Appointments'],
  summary: 'The online-booking review queue',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }) },
  responses: {
    200: { description: 'Requests', ...json(BookingRequestListSchema) },
    401: notAuthed,
    403: { description: 'Missing appointment.booking.view', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/booking-requests/{id}/approve',
  operationId: 'approveBookingRequest',
  tags: ['Appointments'],
  summary: 'Convert a request into a patient (dedupe-guarded or linked) + a real appointment',
  description:
    'Books through the same path as staff booking, so roster windows and double-booking rules apply identically. 409 DUPLICATE_PATIENT carries candidate charts; resend with existingPatientId or allowDuplicate.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(ApproveBookingBody) },
  responses: {
    200: {
      description: 'Appointment + patient ids',
      ...json(z.object({ appointmentId: z.string(), patientId: z.string() })),
    },
    401: notAuthed,
    403: { description: 'Missing appointment.booking.create', ...json(ErrorResponseSchema) },
    404: { description: 'Request not found', ...json(ErrorResponseSchema) },
    409: {
      description: 'Already reviewed / DUPLICATE_PATIENT / slot taken / outside the roster',
      ...json(ErrorResponseSchema),
    },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/booking-requests/{id}/reject',
  operationId: 'rejectBookingRequest',
  tags: ['Appointments'],
  summary: 'Reject an online-booking request',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(RejectBookingBody) },
  responses: {
    204: { description: 'Rejected' },
    401: notAuthed,
    403: { description: 'Missing appointment.booking.create', ...json(ErrorResponseSchema) },
    404: { description: 'Request not found', ...json(ErrorResponseSchema) },
    409: { description: 'Already reviewed', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/organization/booking',
  operationId: 'getBookingSettings',
  tags: ['Config'],
  summary: 'Online-booking settings (toggle, token, pending count)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Settings', ...json(BookingSettingsSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/organization/booking',
  operationId: 'setOnlineBooking',
  tags: ['Config'],
  summary: 'Turn online booking on or off (first enable mints the token)',
  security: [{ bearerAuth: [] }],
  request: { body: json(SetOnlineBookingBody) },
  responses: {
    200: { description: 'Settings', ...json(BookingSettingsSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/organization/booking/regenerate',
  operationId: 'regenerateBookingToken',
  tags: ['Config'],
  summary: 'Issue a new booking token — printed posters with the old one stop working',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Settings with the new token', ...json(BookingSettingsSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
  },
});

// ---- Patient self check-in (ADR-118) ---------------------------------------

const checkinTags = ['Self check-in'];

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/check-in/{token}',
  operationId: 'publicCheckinContext',
  tags: checkinTags,
  summary: 'The hospital behind a self check-in QR code',
  description:
    'Unauthenticated. The tenant is resolved from the opaque token in the path — never from a body, ' +
    'header, query parameter or subdomain (ADR-056). A typo, a retired token and a suspended ' +
    'hospital are indistinguishable: all three answer 404 with the same message.',
  request: { params: z.object({ token: z.string() }) },
  responses: {
    200: {
      description: 'Hospital name and whether self check-in is on',
      ...json(PublicCheckinContextSchema),
    },
    404: { description: 'Not a valid link', ...json(ErrorResponseSchema) },
    429: { description: 'Rate limited at the sign-in tier', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/public/check-in/{token}',
  operationId: 'publicAnnounceArrival',
  tags: checkinTags,
  summary: 'A patient says they have arrived',
  description:
    '**Creates an announcement, never a visit.** A visit carries a queue token, opens an invoice ' +
    'and is what a consultation hangs off; ADR-056 forbids any public path from writing a clinical ' +
    'record, so the front desk confirms — which is also the identity check, because they are ' +
    'looking at the person. **The reply is identical in every case** — matched, unmatched, or a ' +
    'hospital with self check-in switched off. A response that varied would answer "is this mobile ' +
    'number a patient here, and are they due in today?" for anyone holding the QR code. For the ' +
    'same reason an announcement that matched nothing is still recorded: an endpoint that only ' +
    'wrote rows on a match would leak the same fact through its side effects.',
  request: { params: z.object({ token: z.string() }), body: json(AnnounceArrivalBody) },
  responses: {
    202: { description: 'Always this, whatever happened' },
    404: { description: 'Not a valid link', ...json(ErrorResponseSchema) },
    429: { description: 'Rate limited at the sign-in tier', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/self-check-ins',
  operationId: 'listSelfCheckins',
  tags: checkinTags,
  summary: "Today's arrivals board",
  description:
    'Everything on a row except the hospital is a claim until the desk confirms it. ' +
    '`alreadyCheckedIn` flags an appointment a colleague checked in by hand while the patient was ' +
    'queuing at the kiosk.',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({ status: z.enum(['pending', 'confirmed', 'dismissed']).optional() }),
  },
  responses: {
    200: { description: 'Arrivals', ...json(SelfCheckinRequestListSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing permission', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/self-check-ins/{id}/confirm',
  operationId: 'confirmSelfCheckin',
  tags: checkinTags,
  summary: 'Confirm an arrival, which checks the patient in',
  description:
    'Runs the ordinary check-in — same fee schedule, same case rules, same invoice, same audit. ' +
    'There is deliberately no second check-in implementation for this path.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(ConfirmArrivalBody) },
  responses: {
    200: { description: 'Confirmed', ...json(SelfCheckinRequestSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing permission', ...json(ErrorResponseSchema) },
    409: { description: 'Already dealt with, or changed elsewhere', ...json(ErrorResponseSchema) },
    422: { description: 'Not matched to an appointment', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/self-check-ins/{id}/dismiss',
  operationId: 'dismissSelfCheckin',
  tags: checkinTags,
  summary: 'Clear an arrival nobody could match, with a reason',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(DismissArrivalBody) },
  responses: {
    200: { description: 'Dismissed', ...json(SelfCheckinRequestSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing permission', ...json(ErrorResponseSchema) },
    409: { description: 'Already dealt with', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/self-check-in-settings',
  operationId: 'getSelfCheckinSettings',
  tags: checkinTags,
  summary: 'Whether self check-in is on, and the token behind the poster',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Settings', ...json(SelfCheckinSettingsSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing permission', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/self-check-in-settings',
  operationId: 'setSelfCheckinEnabled',
  tags: checkinTags,
  summary: 'Turn self check-in on or off',
  description:
    'Turning it on mints a token if there is none — a switch with no link behind it does nothing.',
  security: [{ bearerAuth: [] }],
  request: { body: json(SetSelfCheckinBody) },
  responses: {
    200: { description: 'Settings', ...json(SelfCheckinSettingsSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing permission', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/self-check-in-settings/regenerate',
  operationId: 'regenerateSelfCheckinToken',
  tags: checkinTags,
  summary: 'Retire the current link and mint a new one',
  description:
    'The only way to retire a poster that has been photographed, altered, or put up somewhere it ' +
    'should not be. The old link stops working immediately.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Settings with the new token', ...json(SelfCheckinSettingsSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing permission', ...json(ErrorResponseSchema) },
    429: { description: 'Rate limited', ...json(ErrorResponseSchema) },
  },
});
