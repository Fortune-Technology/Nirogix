import { z } from '../../openapi/registry';

export const BookAppointmentBody = z
  .object({
    patientId: z.string().uuid(),
    providerId: z.string().uuid(),
    scheduledAt: z.string().datetime({ message: 'Use an ISO datetime' }),
    durationMinutes: z.coerce.number().int().min(5).max(240).optional(),
    reason: z.string().max(300).nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
  })
  .openapi('BookAppointmentBody');

export const CancelAppointmentBody = z
  .object({ reason: z.string().max(300).optional() })
  .openapi('CancelAppointmentBody');

export const ListAppointmentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  providerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  status: z.enum(['booked', 'cancelled', 'completed', 'no_show']).optional(),
});

export const AppointmentViewSchema = z
  .object({
    id: z.string().uuid(),
    scheduledAt: z.string(),
    durationMinutes: z.number(),
    status: z.string(),
    reason: z.string().nullable(),
    patientId: z.string().uuid(),
    patientName: z.string(),
    patientUhid: z.string(),
    providerId: z.string().uuid(),
    providerName: z.string(),
  })
  .openapi('Appointment');

export const AppointmentsPageSchema = z
  .object({
    data: z.array(AppointmentViewSchema),
    page: z.object({ number: z.number(), size: z.number(), total: z.number(), totalPages: z.number() }),
  })
  .openapi('AppointmentsPage');
