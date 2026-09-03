import { z } from '../../openapi/registry';

export const SpecialtySchema = z
  .object({ code: z.string(), name: z.string(), snomedCode: z.string().nullable() })
  .openapi('Specialty');
export const SpecialtiesResponseSchema = z
  .object({ specialties: z.array(SpecialtySchema) })
  .openapi('SpecialtiesResponse');

export const CreateProviderBody = z
  .object({
    fullName: z.string().min(1).openapi({ example: 'Dr. Ananya Sharma' }),
    gender: z.string().optional(),
    registrationNumber: z.string().optional().openapi({ example: 'MCI-12345' }),
    qualification: z.string().optional().openapi({ example: 'MBBS, MD (Cardiology)' }),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    /** Link to a login user — gives the doctor a personal queue (`GET /visits?mine=true`). */
    userId: z.string().uuid().optional(),
    /** Default OPD consultation fee in paise; check-in uses it when no override is supplied. */
    consultationFeePaise: z.number().int().min(0).nullable().optional(),
  })
  .openapi('CreateProviderRequest');

export const UpdateProviderBody = z
  .object({
    fullName: z.string().min(1).optional(),
    gender: z.string().nullable().optional(),
    registrationNumber: z.string().nullable().optional(),
    qualification: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    userId: z.string().uuid().nullable().optional(),
    consultationFeePaise: z.number().int().min(0).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateProviderRequest');

export const ProviderSchema = z
  .object({
    id: z.string().uuid(),
    fullName: z.string(),
    gender: z.string().nullable(),
    registrationNumber: z.string().nullable(),
    qualification: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    userId: z.string().nullable(),
    consultationFeePaise: z.number().nullable(),
    isActive: z.boolean(),
    specialties: z.array(z.string()).openapi({ example: ['cardiology'] }),
  })
  .openapi('Provider');
export const ProvidersResponseSchema = z
  .object({ providers: z.array(ProviderSchema) })
  .openapi('ProvidersResponse');

export const AssignSpecialtyBody = z
  .object({
    specialtyCode: z.string().openapi({ example: 'cardiology' }),
    branchId: z.string().uuid().optional(),
    /** The department this provider works in (ADR-050). Must be one of this hospital's own. */
    departmentId: z.string().uuid().optional(),
    role: z.string().optional().openapi({ example: 'consultant' }),
    isPrimary: z.boolean().optional(),
  })
  .openapi('AssignSpecialtyRequest');

export const AssignedRoleSchema = z
  .object({
    id: z.string().uuid(),
    providerId: z.string().uuid(),
    specialtyCode: z.string(),
    role: z.string(),
    isPrimary: z.boolean(),
  })
  .openapi('PractitionerRole');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ScheduleWindowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6).openapi({ description: '0 = Sunday … 6 = Saturday' }),
    startTime: z.string().regex(HHMM),
    endTime: z.string().regex(HHMM),
    slotMinutes: z.number().int().min(5).max(120).optional(),
    branchId: z.string().uuid().nullable().optional(),
  })
  .openapi('ScheduleWindow');

export const SetSchedulesBody = z
  .object({ windows: z.array(ScheduleWindowSchema).max(50) })
  .openapi('SetSchedulesBody');

export const ScheduleListSchema = z
  .object({
    windows: z.array(ScheduleWindowSchema.extend({ id: z.string() })),
  })
  .openapi('ScheduleList');

export const FreeSlotsSchema = z
  .object({
    hasRoster: z.boolean(),
    slots: z.array(z.object({ startsAt: z.string(), label: z.string() })),
  })
  .openapi('FreeSlots');

export const CreateFormTemplateBody = z
  .object({
    specialtyCode: z.string().optional(),
    key: z.string().min(1).openapi({ example: 'dental_charting' }),
    name: z.string().min(1).openapi({ example: 'Dental Charting' }),
    schema: z.record(z.unknown()).openapi({ description: 'Form field definitions (JSON)' }),
  })
  .openapi('CreateFormTemplateRequest');

export const FormTemplateSchema = z
  .object({
    id: z.string().uuid(),
    specialtyCode: z.string().nullable(),
    key: z.string(),
    name: z.string(),
    version: z.number().int(),
    isActive: z.boolean(),
  })
  .openapi('FormTemplate');
export const FormTemplatesResponseSchema = z
  .object({ templates: z.array(FormTemplateSchema) })
  .openapi('FormTemplatesResponse');
