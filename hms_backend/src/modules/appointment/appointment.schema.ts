import { z } from '../../openapi/registry';

export const BookAppointmentBody = z
  .object({
    patientId: z.string().uuid(),
    providerId: z.string().uuid(),
    scheduledAt: z.string().datetime({ message: 'Use an ISO datetime' }),
    durationMinutes: z.coerce.number().int().min(5).max(240).optional(),
    reason: z.string().max(2000).nullable().optional(),
    /** Same field, same validation as check-in — one form must not mean two rules (ADR-115). */
    departmentId: z.string().uuid().nullable().optional(),
    /**
     * How the patient arrived (ADR-115). One workflow books and checks in; this is the variable
     * that distinguishes what it produced.
     */
    arrivalType: z.enum(['appointment', 'follow_up']).nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
  })
  .openapi('BookAppointmentBody');

export const CancelAppointmentBody = z
  .object({ reason: z.string().max(300).optional() })
  .openapi('CancelAppointmentBody');

const APPOINTMENT_STATUSES = ['booked', 'cancelled', 'completed', 'no_show'] as const;
type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * A single status or a comma-separated multi-select from the DataTable's faceted
 * filter (ADR-063): `status=booked,cancelled` becomes `['booked','cancelled']`.
 * Unknown values are dropped so a malformed query cannot reach the DB.
 */
const statusFilter = z
  .string()
  .optional()
  .transform((v): AppointmentStatus[] | undefined => {
    if (!v) return undefined;
    const vals = v
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is AppointmentStatus => (APPOINTMENT_STATUSES as readonly string[]).includes(s));
    return vals.length ? vals : undefined;
  });

export const ListAppointmentsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  providerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  status: statusFilter,
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
    departmentId: z.string().uuid().nullable(),
    departmentName: z.string().nullable(),
    arrivalType: z.string(),
  })
  .openapi('Appointment');

export const AppointmentsPageSchema = z
  .object({
    data: z.array(AppointmentViewSchema),
    page: z.object({ number: z.number(), size: z.number(), total: z.number(), totalPages: z.number() }),
  })
  .openapi('AppointmentsPage');
