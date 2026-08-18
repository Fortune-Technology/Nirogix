import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  FileMetadataResponseSchema,
  DownloadUrlResponseSchema,
  FileUploadBodySchema,
} from './file.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'post',
  path: '/api/v1/files',
  operationId: 'uploadFile',
  tags: ['Files'],
  summary: 'Upload a document (multipart/form-data, field "file")',
  description:
    'Server-side validation enforces type + size (default max 25 MB). Stores only metadata in the ' +
    'DB; content goes to object storage (default-private). Requires `files.document.upload`.',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'multipart/form-data': { schema: FileUploadBodySchema } } } },
  responses: {
    201: { description: 'File metadata', ...json(FileMetadataResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing files.document.upload', ...json(ErrorResponseSchema) },
    413: { description: 'File too large', ...json(ErrorResponseSchema) },
    422: { description: 'Unsupported file type / validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/files/{id}',
  operationId: 'getFileDownloadUrl',
  tags: ['Files'],
  summary: 'Get a short-lived download URL for a file',
  description: 'Requires `files.document.view`. Returns a signed URL valid for ~10 minutes.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Signed download URL', ...json(DownloadUrlResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing files.document.view', ...json(ErrorResponseSchema) },
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/files/content/{id}',
  operationId: 'getFileContent',
  tags: ['Files'],
  summary: 'Stream file content (authorized by a signed `token` query param)',
  description:
    'Authorized by the short-lived token from the download URL, not a session — do not call ' +
    'directly. Used by the local storage provider; S3 serves content from a presigned S3 URL.',
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ token: z.string() }),
  },
  responses: {
    200: { description: 'File bytes' },
    401: { description: 'Invalid/expired token', ...json(ErrorResponseSchema) },
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/files/{id}',
  operationId: 'deleteFile',
  tags: ['Files'],
  summary: 'Delete a file (removes the object; metadata retained + audited)',
  description: 'Requires `files.document.delete`.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: 'Deleted' },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing files.document.delete', ...json(ErrorResponseSchema) },
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});
