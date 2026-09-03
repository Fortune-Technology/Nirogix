import { z } from '../../openapi/registry';

// One contact, not both — the code goes to exactly one place, and requiring the caller
// to choose removes any ambiguity about which one was proven (ADR-052).
const Contact = z
  .object({
    mobile: z.string().trim().min(6).max(20).optional(),
    email: z.string().trim().email().max(255).optional(),
  })
  .refine((c) => Boolean(c.mobile) !== Boolean(c.email), {
    message: 'Provide either a mobile number or an email address, not both',
  });

export const RequestCodeBody = Contact.openapi('PatientRequestCodeBody');

export const VerifyCodeBody = z
  .object({
    mobile: z.string().trim().min(6).max(20).optional(),
    email: z.string().trim().email().max(255).optional(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter the 6-digit code'),
  })
  .refine((c) => Boolean(c.mobile) !== Boolean(c.email), {
    message: 'Provide either a mobile number or an email address, not both',
  })
  .openapi('PatientVerifyCodeBody');

export const GrantPortalAccessBody = Contact.openapi('GrantPortalAccessBody');

export const PatientSessionSchema = z
  .object({
    accessToken: z.string(),
    identity: z.object({ id: z.string(), fullName: z.string().nullable() }),
  })
  .openapi('PatientSession');

export const PatientHospitalSchema = z
  .object({ tenantId: z.string(), name: z.string(), patientId: z.string() })
  .openapi('PatientHospital');

export const PatientProfileSchema = z
  .object({
    uhid: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    gender: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    bloodGroup: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
  })
  .openapi('PatientProfile');

export const PatientLabReportSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    orderedAt: z.string(),
    testName: z.string(),
    value: z.string().nullable(),
    unit: z.string().nullable(),
    refLow: z.string().nullable(),
    refHigh: z.string().nullable(),
    flag: z.string().nullable(),
    resultedAt: z.string().nullable(),
  })
  .openapi('PatientLabReport');

export const TenantParam = z.object({ tenantId: z.string().uuid() });
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
