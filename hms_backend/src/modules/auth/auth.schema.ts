import { z } from '../../openapi/registry';

// Zod schemas = single source of truth for request validation AND OpenAPI docs.

export const LoginBody = z
  .object({
    orgCode: z.string().min(1).openapi({ example: 'CITYCARE', description: 'Organization / tenant code' }),
    email: z.string().email().openapi({ example: 'admin@citycare.example' }),
    password: z.string().min(1).openapi({ example: 'ChangeMe#123' }),
  })
  .openapi('LoginRequest');
export type LoginInput = z.infer<typeof LoginBody>;

export const PublicUserSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
    mfaEnabled: z.boolean(),
    status: z.string(),
    lastLoginAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    /** Role keys held in this tenant; present on /auth/me, omitted elsewhere. */
    roles: z.array(z.string()).optional(),
  })
  .openapi('User');
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const LoginResponseSchema = z
  .object({
    accessToken: z.string().openapi({ description: 'Short-lived JWT for the Authorization header' }),
    user: PublicUserSchema,
  })
  .openapi('LoginResponse');

export const MfaRequiredResponseSchema = z
  .object({ mfaRequired: z.literal(true) })
  .openapi('MfaRequiredResponse');

export const RefreshResponseSchema = z
  .object({ accessToken: z.string() })
  .openapi('RefreshResponse');

export const MessageResponseSchema = z
  .object({ message: z.string() })
  .openapi('MessageResponse');

export const MeResponseSchema = z.object({ user: PublicUserSchema }).openapi('MeResponse');
