import { z } from '../../openapi/registry';

export const CreateDepartmentBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, 'Use letters, numbers, spaces, hyphens or underscores')
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(500).nullable().optional(),
    /** NULL = organization-wide; a branch id scopes the department to that branch. */
    branchId: z.string().uuid().nullable().optional(),
    specialtyCode: z.string().trim().max(50).nullable().optional(),
    headProviderId: z.string().uuid().nullable().optional(),
  })
  .openapi('CreateDepartmentBody');

export const UpdateDepartmentBody = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
    specialtyCode: z.string().trim().max(50).nullable().optional(),
    headProviderId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateDepartmentBody');

export const DepartmentQuery = z
  .object({
    /** `true` returns only active departments — what a booking or check-in screen wants. */
    activeOnly: z.coerce.boolean().optional(),
    branchId: z.string().uuid().optional(),
  })
  .openapi('DepartmentQuery');

export const DepartmentSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    branchId: z.string().nullable(),
    branchName: z.string().nullable(),
    specialtyCode: z.string().nullable(),
    headProviderId: z.string().nullable(),
    headProviderName: z.string().nullable(),
    /** How many providers are assigned. Shown before deactivating, so the effect is visible. */
    providerCount: z.number(),
    isActive: z.boolean(),
    createdAt: z.string(),
  })
  .openapi('Department');

export type CreateDepartmentInput = z.infer<typeof CreateDepartmentBody>;
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentBody>;
