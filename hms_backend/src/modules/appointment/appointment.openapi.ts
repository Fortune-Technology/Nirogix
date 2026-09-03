import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  BookAppointmentBody,
  CancelAppointmentBody,
  AppointmentsPageSchema,
} from './appointment.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const notEntitled = {
  description: 'Tenant not entitled to the appointment module',
  ...json(ErrorResponseSchema),
};
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };
const AckSchema = z.object({ id: z.string().uuid(), status: z.string() }).openapi('AppointmentAck');

registry.registerPath({
  method: 'get',
  path: '/api/v1/appointments',
  operationId: 'listAppointments',
  tags: ['Appointments'],
  summary: 'List appointments (filter by date range / provider / patient / status)',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().optional(),
      pageSize: z.coerce.number().int().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      providerId: z.string().uuid().optional(),
      patientId: z.string().uuid().optional(),
      status: z.string().optional().openapi({
        description: 'Comma-separated statuses (multi-select): booked,cancelled,completed,no_show',
      }),
    }),
  },
  responses: {
    200: { description: 'Appointments', ...json(AppointmentsPageSchema) },
    401: notAuthed,
    403: notEntitled,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/appointments',
  operationId: 'bookAppointment',
  tags: ['Appointments'],
  summary: 'Book an appointment (rejects a double-booked provider slot)',
  security: [{ bearerAuth: [] }],
  request: { body: json(BookAppointmentBody) },
  responses: {
    201: { description: 'Booked', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Patient or provider not found', ...json(ErrorResponseSchema) },
    409: { description: 'Slot conflict (double-booking)', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/appointments/{id}/cancel',
  operationId: 'cancelAppointment',
  tags: ['Appointments'],
  summary: 'Cancel an appointment (frees the slot)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(CancelAppointmentBody) },
  responses: {
    200: { description: 'Cancelled', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    409: { description: 'Already cancelled', ...json(ErrorResponseSchema) },
  },
});
