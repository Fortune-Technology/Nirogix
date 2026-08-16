import { z } from '../../openapi/registry';

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB hex colour')
  .nullable();

export const UpdateBrandingBody = z
  .object({
    brandColor: hex.optional(),
    secondaryColor: hex.optional(),
    typography: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .openapi('UpdateBrandingBody');

export const BrandingSchema = z
  .object({
    brandColor: z.string().nullable(),
    secondaryColor: z.string().nullable(),
    logoUrl: z.string().nullable(),
    faviconUrl: z.string().nullable(),
    typography: z.unknown().nullable(),
    // The hospital's own identity — printed documents put it in their header (ADR-047).
    organization: z.object({ name: z.string(), code: z.string() }).nullable(),
  })
  .openapi('Branding');

// multipart/form-data body for the logo / favicon upload.
export const BrandingUploadBody = z
  .object({ file: z.any().openapi({ type: 'string', format: 'binary' }) })
  .openapi('BrandingUploadBody');
