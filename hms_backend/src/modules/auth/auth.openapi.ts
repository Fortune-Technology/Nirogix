import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  LoginBody,
  LoginResponseSchema,
  RefreshResponseSchema,
  MessageResponseSchema,
  MeResponseSchema,
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
