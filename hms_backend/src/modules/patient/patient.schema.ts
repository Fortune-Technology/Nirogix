import { z } from '../../openapi/registry';

const gender = z.enum(['male', 'female', 'other']);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const nn = (s: z.ZodTypeAny) => s.nullable().optional(); // nullable + optional

export const CreatePatientBody = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: nn(z.string().max(100)),
    gender: nn(gender),
    dateOfBirth: nn(dateStr),
    phone: nn(z.string().max(20)),
    email: nn(z.string().email()),
    bloodGroup: nn(z.string().max(8)),
    addressLine: nn(z.string().max(300)),
    city: nn(z.string().max(100)),
    state: nn(z.string().max(100)),
    pincode: nn(z.string().regex(/^\d{6}$/, 'Indian PIN is 6 digits')),
    abhaNumber: nn(z.string().max(20)),
    emergencyContactName: nn(z.string().max(150)),
    emergencyContactPhone: nn(z.string().max(20)),
    branchId: nn(z.string().uuid()),
  })
  .openapi('CreatePatientBody');

export const UpdatePatientBody = CreatePatientBody.partial()
  .extend({ status: z.enum(['active', 'archived']).optional() })
  .openapi('UpdatePatientBody');

export const ListPatientsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
});

export const PatientSchema = z
  .object({
    id: z.string().uuid(),
    uhid: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    gender: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    bloodGroup: z.string().nullable(),
    addressLine: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
    abhaNumber: z.string().nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    branchId: z.string().nullable(),
    status: z.string(),
    createdAt: z.string(),
  })
  .openapi('Patient');

export const PatientsPageSchema = z
  .object({
    data: z.array(PatientSchema),
    page: z.object({ number: z.number(), size: z.number(), total: z.number(), totalPages: z.number() }),
  })
  .openapi('PatientsPage');
