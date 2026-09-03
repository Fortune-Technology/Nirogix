import { z } from '../../openapi/registry';
import { PasswordSchema } from './passwordPolicy';

// Zod schemas = single source of truth for request validation AND OpenAPI docs.

export const LoginBody = z
  .object({
    orgCode: z
      .string()
      .min(1)
      .openapi({ example: 'CITYCARE', description: 'Organization / tenant code' }),
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
    impersonatedBy: z.string().nullable().optional(),
  })
  .openapi('User');
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const LoginResponseSchema = z
  .object({
    accessToken: z
      .string()
      .openapi({ description: 'Short-lived JWT for the Authorization header' }),
    user: PublicUserSchema,
  })
  .openapi('LoginResponse');

export const MfaRequiredResponseSchema = z
  .object({ mfaRequired: z.literal(true) })
  .openapi('MfaRequiredResponse');

export const RefreshResponseSchema = z
  .object({ accessToken: z.string() })
  .openapi('RefreshResponse');

export const MessageResponseSchema = z.object({ message: z.string() }).openapi('MessageResponse');

// The platform's one password policy — shared by change-password, the reset flow, user
// creation and their OpenAPI docs, so the bound can never drift between copies. It lives in
// `passwordPolicy.ts` (ADR-082) because "length only, on the two self-service endpoints"
// was not a policy; re-exported here so existing importers keep their import path.
export { PasswordSchema };

export const ForgotPasswordBody = z
  .object({
    orgCode: z
      .string()
      .min(1)
      .openapi({ example: 'CITYCARE', description: 'Organization / tenant code' }),
    email: z.string().email().openapi({ example: 'admin@citycare.example' }),
    // Which frontend's reset page the emailed link should open. The server maps this to a
    // configured origin (PORTAL_URL / ADMIN_URL) — the client never supplies a URL.
    client: z.enum(['portal', 'admin']).default('portal').openapi({
      description: "Which app requested the reset; decides the link's configured origin.",
    }),
  })
  .openapi('ForgotPasswordRequest');
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordBody>;

export const ResetPasswordBody = z
  .object({
    token: z.string().min(16).openapi({ description: 'The reset token from the emailed link.' }),
    newPassword: PasswordSchema,
  })
  .openapi('ResetPasswordRequest');
export type ResetPasswordInput = z.infer<typeof ResetPasswordBody>;

export const MeResponseSchema = z.object({ user: PublicUserSchema }).openapi('MeResponse');
