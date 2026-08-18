import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { UpdateBrandingBody, BrandingSchema, BrandingUploadBody } from './branding.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing platform.branding.manage', ...json(ErrorResponseSchema) };
const multipart = { content: { 'multipart/form-data': { schema: BrandingUploadBody } } };

registry.registerPath({
  method: 'get',
  path: '/api/v1/branding/current',
  operationId: 'getCurrentBranding',
  tags: ['Config'],
  summary: 'Get the active tenant branding (feeds the Portal at session bootstrap)',
  description: 'Colours + resolved logo/favicon URLs + typography. Nulls mean "use the default tokens".',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Branding', ...json(BrandingSchema) }, 401: notAuthed },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/branding',
  operationId: 'updateBranding',
  tags: ['Config'],
  summary: 'Update tenant branding colours / typography',
  security: [{ bearerAuth: [] }],
  request: { body: json(UpdateBrandingBody) },
  responses: {
    200: { description: 'Updated branding', ...json(BrandingSchema) },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/branding',
  operationId: 'resetBranding',
  tags: ['Config'],
  summary: 'Reset branding to the default token palette',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Reset branding', ...json(BrandingSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/branding/logo',
  operationId: 'uploadBrandingLogo',
  tags: ['Config'],
  summary: 'Upload the tenant logo (multipart/form-data, field "file"; image only)',
  security: [{ bearerAuth: [] }],
  request: { body: multipart },
  responses: {
    201: { description: 'Branding with the new logo URL', ...json(BrandingSchema) },
    401: notAuthed,
    403: forbidden,
    413: { description: 'File too large', ...json(ErrorResponseSchema) },
    422: { description: 'Unsupported file type', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/branding/favicon',
  operationId: 'uploadBrandingFavicon',
  tags: ['Config'],
  summary: 'Upload the tenant favicon (multipart/form-data, field "file"; image only)',
  security: [{ bearerAuth: [] }],
  request: { body: multipart },
  responses: {
    201: { description: 'Branding with the new favicon URL', ...json(BrandingSchema) },
    401: notAuthed,
    403: forbidden,
    413: { description: 'File too large', ...json(ErrorResponseSchema) },
    422: { description: 'Unsupported file type', ...json(ErrorResponseSchema) },
  },
});
