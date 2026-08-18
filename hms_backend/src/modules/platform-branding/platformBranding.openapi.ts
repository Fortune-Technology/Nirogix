import { z } from '../../openapi/registry';
import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  ScopeParam,
  PlatformBrandingSchema,
  UpdatePlatformBrandingBody,
  PlatformBrandingUploadBody,
} from './platformBranding.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing platform.branding.platform.manage (super-admin only)', ...json(ErrorResponseSchema) };
const multipart = { content: { 'multipart/form-data': { schema: PlatformBrandingUploadBody } } };
const params = z.object({ scope: ScopeParam });

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/branding/{scope}',
  operationId: 'getPublicBranding',
  tags: ['Config'],
  summary: 'Get platform branding for a surface (public — feeds the marketing site + Portal default)',
  description: 'Resolved tokens + logo/favicon URLs for the "marketing" or "hms" scope. No auth. Empty tokens mean "use the built-in defaults".',
  request: { params },
  responses: {
    200: { description: 'Platform branding', ...json(PlatformBrandingSchema) },
    422: { description: 'Invalid scope', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/platform-branding/{scope}',
  operationId: 'updatePlatformBranding',
  tags: ['Config'],
  summary: 'Update platform branding tokens for a scope (super-admin)',
  security: [{ bearerAuth: [] }],
  request: { params, body: json(UpdatePlatformBrandingBody) },
  responses: {
    200: { description: 'Updated platform branding', ...json(PlatformBrandingSchema) },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/platform-branding/{scope}',
  operationId: 'resetPlatformBranding',
  tags: ['Config'],
  summary: 'Reset a scope to the default token palette (super-admin)',
  security: [{ bearerAuth: [] }],
  request: { params },
  responses: { 200: { description: 'Reset platform branding', ...json(PlatformBrandingSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/platform-branding/{scope}/logo',
  operationId: 'uploadPlatformBrandingLogo',
  tags: ['Config'],
  summary: 'Upload the logo for a scope (multipart/form-data, field "file"; image only)',
  security: [{ bearerAuth: [] }],
  request: { params, body: multipart },
  responses: {
    201: { description: 'Platform branding with the new logo URL', ...json(PlatformBrandingSchema) },
    401: notAuthed,
    403: forbidden,
    413: { description: 'File too large', ...json(ErrorResponseSchema) },
    422: { description: 'Unsupported file type', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/platform-branding/{scope}/favicon',
  operationId: 'uploadPlatformBrandingFavicon',
  tags: ['Config'],
  summary: 'Upload the favicon for a scope (multipart/form-data, field "file"; image only)',
  security: [{ bearerAuth: [] }],
  request: { params, body: multipart },
  responses: {
    201: { description: 'Platform branding with the new favicon URL', ...json(PlatformBrandingSchema) },
    401: notAuthed,
    403: forbidden,
    413: { description: 'File too large', ...json(ErrorResponseSchema) },
    422: { description: 'Unsupported file type', ...json(ErrorResponseSchema) },
  },
});
