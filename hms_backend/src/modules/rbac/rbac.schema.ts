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
