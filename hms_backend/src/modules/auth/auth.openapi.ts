import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  LoginBody,
  LoginResponseSchema,
  RefreshResponseSchema,
  MessageResponseSchema,
  MeResponseSchema,
  PublicUserSchema,
} from './auth.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  operationId: 'login',
  tags: ['Auth'],
  summary: 'Log in with organization code, email and password',
  description:
    'Returns a short-lived access token and sets an httpOnly refresh cookie. If the user has ' +
    'MFA enabled, returns `{ "mfaRequired": true }` instead of tokens (MFA verification is a ' +
    'later phase).',
  request: { body: json(LoginBody) },
  responses: {
    200: { description: 'Authenticated (or an MFA challenge)', ...json(LoginResponseSchema) },
    401: { description: 'Invalid credentials', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  operationId: 'refresh',
  tags: ['Auth'],
  summary: 'Exchange the refresh cookie for a new access token',
  description: 'Reads the httpOnly refresh cookie, rotates it, and returns a new access token.',
  responses: {
    200: { description: 'New access token', ...json(RefreshResponseSchema) },
    401: { description: 'Missing, invalid or expired session', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  operationId: 'logout',
  tags: ['Auth'],
  summary: 'Revoke the current session and clear the refresh cookie',
  responses: {
    200: { description: 'Logged out', ...json(MessageResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  operationId: 'getMe',
  tags: ['Auth'],
  summary: 'Get the authenticated user',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'The current user', ...json(MeResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/auth/profile',
  operationId: 'updateOwnProfile',
  tags: ['Auth'],
  summary: "Update the signed-in user's own profile",
  description:
    'Self-service. Acts only on the caller (the user id comes from the access token, never the body).',
  security: [{ bearerAuth: [] }],
  request: { body: json(z.object({ fullName: z.string().min(2).max(200) })) },
  responses: {
    200: { description: 'Updated profile', ...json(z.object({ user: PublicUserSchema, message: z.string() })) },
    400: { description: 'Validation failed', ...json(ErrorResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/change-password',
  operationId: 'changeOwnPassword',
  tags: ['Auth'],
  summary: "Change the signed-in user's own password",
  description:
    'Requires the current password, so a stolen access token alone cannot take over the account. On success every session for this user is revoked, so the client must sign in again.',
  security: [{ bearerAuth: [] }],
  request: {
    body: json(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(10).max(200),
      }),
    ),
  },
  responses: {
    200: { description: 'Password changed', ...json(z.object({ message: z.string() })) },
    400: { description: 'Current password incorrect, or the new password is invalid', ...json(ErrorResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});
