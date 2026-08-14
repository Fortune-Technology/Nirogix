import { z } from '../../openapi/registry';

// Platform branding (ADR-024). The scalable token set — all optional #RRGGBB — that maps
// to the --mk-* / --hms-* CSS variables (resources/DESIGN.md §7).
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB hex colour');

export const BrandingTokensSchema = z
  .object({
    primary: hex.optional(),
    secondary: hex.optional(),
    accent: hex.optional(),
    background: hex.optional(),
    surface: hex.optional(),
    foreground: hex.optional(),
    border: hex.optional(),
    buttonBg: hex.optional(),
    buttonFg: hex.optional(),
  })
  .openapi('BrandingTokens');

export const ScopeParam = z.enum(['marketing', 'hms']);

export const UpdatePlatformBrandingBody = z
  .object({ tokens: BrandingTokensSchema })
  .openapi('UpdatePlatformBrandingBody');

export const PlatformBrandingSchema = z
  .object({
    scope: ScopeParam,
    tokens: BrandingTokensSchema,
    logoUrl: z.string().nullable(),
    faviconUrl: z.string().nullable(),
    version: z.number(),
  })
  .openapi('PlatformBranding');

// multipart/form-data body for logo / favicon upload.
export const PlatformBrandingUploadBody = z
  .object({ file: z.any().openapi({ type: 'string', format: 'binary' }) })
  .openapi('PlatformBrandingUploadBody');
