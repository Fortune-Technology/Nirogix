import { z } from '../../openapi/registry';

/**
 * Deliberately one field. Everything else the desk needs — who the patient is, which doctor, which
 * department — is already on the appointment the hospital booked. Asking a patient at a kiosk to
 * retype it would add typing, add error, and add nothing: none of it would be trusted anyway.
 */
export const AnnounceArrivalBody = z
  .object({
    phone: z.string().min(6).max(32),
  })
  .openapi('AnnounceArrivalBody');

export const ConfirmArrivalBody = z
  .object({ version: z.number().int().min(1) })
  .openapi('ConfirmArrivalBody');

export const DismissArrivalBody = z
  .object({
    version: z.number().int().min(1),
    /** Required — an arrival that vanished from the board with no note is a mystery later. */
    reason: z.string().min(2).max(300),
  })
  .openapi('DismissArrivalBody');

export const SetSelfCheckinBody = z.object({ enabled: z.boolean() }).openapi('SetSelfCheckinBody');

export const PublicCheckinContextSchema = z
  .object({
    hospitalName: z.string(),
    city: z.string().nullable(),
    enabled: z.boolean(),
  })
  .openapi('PublicCheckinContext');

export const SelfCheckinRequestSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
    claimedPhone: z.string(),
    announcedAt: z.string(),
    patientId: z.string().uuid().nullable(),
    patientName: z.string().nullable(),
    patientUhid: z.string().nullable(),
    appointmentId: z.string().uuid().nullable(),
    scheduledAt: z.string().nullable(),
    providerName: z.string().nullable(),
    departmentName: z.string().nullable(),
    resultingVisitId: z.string().uuid().nullable(),
    confirmedAt: z.string().nullable(),
    dismissReason: z.string().nullable(),
    version: z.number().int(),
    alreadyCheckedIn: z.boolean(),
  })
  .openapi('SelfCheckinRequest');

export const SelfCheckinRequestListSchema = z
  .array(SelfCheckinRequestSchema)
  .openapi('SelfCheckinRequestList');

export const SelfCheckinSettingsSchema = z
  .object({ enabled: z.boolean(), token: z.string().nullable(), pendingCount: z.number().int() })
  .openapi('SelfCheckinSettings');
