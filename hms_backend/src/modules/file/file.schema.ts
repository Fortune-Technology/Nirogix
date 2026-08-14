import { z } from '../../openapi/registry';

export const FileMetadataResponseSchema = z
  .object({
    id: z.string().uuid(),
    filename: z.string(),
    contentType: z.string(),
    size: z.number().int(),
    checksum: z.string(),
    version: z.number().int(),
    status: z.string(),
    createdAt: z.string(),
  })
  .openapi('FileMetadata');

export const DownloadUrlResponseSchema = z
  .object({
    downloadUrl: z.string(),
    expiresInSeconds: z.number().int(),
  })
  .openapi('DownloadUrlResponse');

export const FileUploadBodySchema = z
  .object({
    file: z
      .string()
      .openapi({ type: 'string', format: 'binary', description: 'The file to upload' }),
  })
  .openapi('FileUploadRequest');
