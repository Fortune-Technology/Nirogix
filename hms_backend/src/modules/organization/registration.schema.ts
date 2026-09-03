import { z } from '../../openapi/registry';

/**
 * The public form's payload (ADR-056).
 *
 * Deliberately small. A stranger is filling this in, so it collects only what the front
 * desk needs to find the person at the counter and check for a duplicate — never anything
 * clinical, and nothing that would make the row worth stealing on its own.
 */
export const SubmitRegistrationBody = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100).nullable().optional(),
    gender: z.enum(['male', 'female', 'other']).nullable().optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .nullable()
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-() ]{6,32}$/, 'Enter a valid phone number'),
    email: z.string().trim().email().max(255).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .openapi('SubmitRegistrationBody');

export const PublicRegistrationContextSchema = z
  .object({
    hospitalName: z.string(),
    city: z.string().nullable(),
    enabled: z.boolean(),
  })
  .openapi('PublicRegistrationContext');

export const RegistrationRequestSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    gender: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    phone: z.string(),
    email: z.string().nullable(),
    city: z.string().nullable(),
    note: z.string().nullable(),
    status: z.string(),
    createdAt: z.string(),
  })
  .openapi('RegistrationRequest');

export const RegistrationSettingsSchema = z
  .object({
    enabled: z.boolean(),
    token: z.string().nullable(),
    pendingCount: z.number(),
  })
  .openapi('RegistrationSettings');

export const SetSelfRegistrationBody = z
  .object({ enabled: z.boolean() })
  .openapi('SetSelfRegistrationBody');
export const RejectRegistrationBody = z
  .object({ reason: z.string().trim().max(300).optional() })
  .openapi('RejectRegistrationBody');
/**
 * Approving after the duplicate warning: either link the request to the existing chart the
 * reviewer matched, or knowingly register a new one anyway. Empty body = plain approval.
 */
export const ApproveRegistrationBody = z
  .object({
    allowDuplicate: z.boolean().optional(),
    existingPatientId: z.string().uuid().optional(),
  })
  .openapi('ApproveRegistrationBody');
