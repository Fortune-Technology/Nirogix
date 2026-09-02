import { z } from '../../openapi/registry';

export const MyPermissionsResponseSchema = z
  .object({
    wildcard: z.boolean().openapi({ description: 'True if the user holds all permissions' }),
    permissions: z.array(z.string()).openapi({ example: ['patient.record.view', 'appointment.booking.view'] }),
  })
  .openapi('MyPermissionsResponse');

export const RoleSchema = z
  .object({
    id: z.string().uuid(),
    key: z.string().openapi({ example: 'doctor' }),
    name: z.string().openapi({ example: 'Doctor' }),
    description: z.string().nullable(),
    isSystem: z.boolean(),
  })
  .openapi('Role');

export const RolesResponseSchema = z
  .object({ roles: z.array(RoleSchema) })
  .openapi('RolesResponse');

export const AccessExplainQuerySchema = z.object({
  permission: z
    .string()
    .min(1)
    .max(100)
    .openapi({ description: 'The permission key the caller was refused', example: 'patient.record.create' }),
});

/**
 * Why a caller cannot do something, in the terms they need to act on it (ADR-126).
 *
 * `reason` is the distinction that matters: `module_not_enabled` is the hospital's subscription
 * and its administrator cannot fix it by granting anything, while `permission_missing` is a role
 * question their administrator CAN answer. A screen that conflated the two sent people to argue
 * with the wrong person.
 */
export const AccessExplainResponseSchema = z
  .object({
    permission: z.object({
      key: z.string().openapi({ example: 'patient.record.create' }),
      label: z.string().openapi({ example: 'Register patients' }),
    }),
    module: z
      .object({
        key: z.string().openapi({ example: 'patient' }),
        name: z.string().openapi({ example: 'Patient Management' }),
        enabled: z.boolean(),
      })
      .nullable()
      .openapi({ description: 'Null for Platform Core, which every hospital always has' }),
    granted: z
      .boolean()
      .openapi({ description: 'Effective access: the caller holds the permission AND the hospital has the module' }),
    reason: z.enum(['granted', 'module_not_enabled', 'permission_missing']),
    /** Roles in THIS hospital that grant the permission — system and custom alike. */
    grantedByRoles: z.array(z.object({ key: z.string(), name: z.string(), isSystem: z.boolean() })),
  })
  .openapi('AccessExplainResponse');
