import { z } from '../../openapi/registry';

// ---- Public ------------------------------------------------------------------

export const SubmitBookingBody = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).nullable().optional(),
    phone: z.string().min(8).max(20),
    email: z.string().email().nullable().optional(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    providerId: z.string().uuid().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .openapi('SubmitBookingBody');

export const PublicBookingContextSchema = z
  .object({
    hospitalName: z.string(),
    city: z.string().nullable(),
    enabled: z.boolean(),
    departments: z.array(z.object({ id: z.string(), name: z.string() })),
    providers: z.array(z.object({ id: z.string(), fullName: z.string() })),
  })
  .openapi('PublicBookingContext');

// ---- Hospital side -----------------------------------------------------------

export const BookingRequestSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    phone: z.string(),
    email: z.string().nullable(),
    preferredDate: z.string().nullable(),
    preferredTime: z.string().nullable(),
    departmentId: z.string().nullable(),
    departmentName: z.string().nullable(),
    providerId: z.string().nullable(),
    providerName: z.string().nullable(),
    note: z.string().nullable(),
    status: z.string(),
    appointmentId: z.string().nullable(),
    patientId: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('BookingRequest');
export const BookingRequestListSchema = z.object({ requests: z.array(BookingRequestSchema) }).openapi('BookingRequestList');

export const ApproveBookingBody = z
  .object({
    scheduledAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
    providerId: z.string().uuid(),
    durationMinutes: z.number().int().min(5).max(240).optional(),
    existingPatientId: z.string().uuid().optional(),
    allowDuplicate: z.boolean().optional(),
  })
  .openapi('ApproveBookingBody');

export const RejectBookingBody = z
  .object({ reason: z.string().trim().max(300).optional() })
  .openapi('RejectBookingBody');

export const SetOnlineBookingBody = z.object({ enabled: z.boolean() }).openapi('SetOnlineBookingBody');

export const BookingSettingsSchema = z
  .object({ enabled: z.boolean(), token: z.string().nullable(), pendingCount: z.number() })
  .openapi('BookingSettings');
