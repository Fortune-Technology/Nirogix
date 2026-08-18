import { z } from './registry';

// Canonical error envelope — matches src/http/error.ts `ErrorShape`. Every operation's
// error responses reference this so the documented contract equals what errorHandler emits.
export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string().openapi({ example: 'Validation failed' }),
      details: z.unknown().optional(),
    }),
  })
  .openapi('ErrorResponse');

// Standard pagination envelope — matches src/http/respond.ts `Paginated<T>`. Modules build
// their list responses as `{ data: [Item], page: PageMeta }`.
export const PageMetaSchema = z
  .object({
    number: z.number().int().openapi({ example: 1 }),
    size: z.number().int().openapi({ example: 20 }),
    total: z.number().int().openapi({ example: 137 }),
    totalPages: z.number().int().openapi({ example: 7 }),
  })
  .openapi('PageMeta');

// Common query params for list endpoints (documented once, reused by module list ops).
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
  sort: z.string().optional().openapi({ example: 'createdAt:desc' }),
  q: z.string().optional().openapi({ description: 'Free-text search', example: 'sharma' }),
});
