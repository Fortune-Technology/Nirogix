import { z } from '../../openapi/registry';
import { PasswordSchema } from '../auth/passwordPolicy';

// ---- Requests --------------------------------------------------------------

export const CreateUserBody = z
  .object({
    email: z.string().email(),
    fullName: z.string().min(2).max(200),
    roleKey: z.string().optional(),
    // Optional: when omitted, a one-time temp password is generated and returned once.
    // When supplied, it meets the SAME policy a user's own password does (ADR-082) — an
    // administrator-created account was the way around it before.
    password: PasswordSchema.optional(),
  })
  .openapi('CreateUserBody');

export const UpdateUserBody = z
  .object({
    status: z.enum(['active', 'suspended']).optional(),
    fullName: z.string().min(2).max(200).optional(),
  })
  .openapi('UpdateUserBody');

export const AssignRoleBody = z.object({ roleKey: z.string().min(1) }).openapi('AssignRoleBody');

export const SetOverrideBody = z
  .object({
    permission: z.string().min(1),
    effect: z.enum(['GRANT', 'DENY']),
    validUntil: z.string().datetime().optional(),
    reason: z.string().max(500).optional(),
  })
  .openapi('SetOverrideBody');

// ---- Responses -------------------------------------------------------------

export const UserListItemSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string(),
    fullName: z.string(),
    status: z.string(),
    mfaEnabled: z.boolean(),
    roles: z.array(z.string()),
  })
  .openapi('UserListItem');

export const UsersResponseSchema = z
  .object({ users: z.array(UserListItemSchema) })
  .openapi('UsersResponse');

export const CreateUserResponseSchema = z
  .object({ id: z.string().uuid(), tempPassword: z.string().nullable() })
  .openapi('CreateUserResponse');

export const UserDetailSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string(),
    fullName: z.string(),
    status: z.string(),
    mfaEnabled: z.boolean(),
    roles: z.array(z.object({ key: z.string(), name: z.string() })),
    wildcard: z.boolean(),
    permissions: z.array(z.string()),
    overrides: z.array(
      z.object({
        id: z.string().uuid(),
        permission: z.string(),
        effect: z.string(),
        validUntil: z.string().nullable(),
      }),
    ),
  })
  .openapi('UserDetail');

export const AckSchema = z.object({ ok: z.boolean() }).openapi('Ack');
