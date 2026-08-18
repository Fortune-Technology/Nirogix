import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  CatalogCategoryEnum,
  CatalogListSchema,
  CatalogItemSchema,
  CreateCustomItemBody,
  AvailabilityItemTypeEnum,
  SetAvailabilityBody,
  AvailabilityOverrideSchema,
  AvailabilityOverrideListSchema,
  AvailabilityItemListSchema,
} from './catalog.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/catalog/{category}',
  operationId: 'listCatalog',
  tags: ['Catalog'],
  summary: 'System master data for a category, merged with this hospital\'s custom items (ADR-072)',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ category: CatalogCategoryEnum }),
    query: z.object({ q: z.string().optional() }),
  },
  responses: {
    200: { description: 'Catalogue items (system first, then custom)', ...json(CatalogListSchema) },
    401: notAuthed,
    422: { description: 'Unknown category', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/catalog/vaccine/custom',
  operationId: 'createCustomVaccine',
  tags: ['Catalog'],
  summary: 'Add a hospital-specific custom vaccine to the picker',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateCustomItemBody) },
  responses: {
    201: { description: 'Created custom item', ...json(CatalogItemSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'A custom item with that name already exists', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/branch-availability',
  operationId: 'listBranchAvailability',
  tags: ['Catalog'],
  summary: 'Per-hospital availability overrides for a branch (ADR-073)',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ branchId: z.string().uuid(), itemType: AvailabilityItemTypeEnum.optional() }) },
  responses: {
    200: { description: 'Override rows (only the items overridden for this branch)', ...json(AvailabilityOverrideListSchema) },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/branch-availability/items',
  operationId: 'listBranchAvailabilityItems',
  tags: ['Catalog'],
  summary: "The org's items of a type with their availability at a branch (config screen — ADR-073)",
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ branchId: z.string().uuid(), itemType: AvailabilityItemTypeEnum }) },
  responses: {
    200: { description: 'Items with per-branch availability', ...json(AvailabilityItemListSchema) },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/branch-availability',
  operationId: 'setBranchAvailability',
  tags: ['Catalog'],
  summary: 'Enable/disable a master item for one hospital (and optionally override its price)',
  security: [{ bearerAuth: [] }],
  request: { body: json(SetAvailabilityBody) },
  responses: {
    200: { description: 'The saved override', ...json(AvailabilityOverrideSchema) },
    401: notAuthed,
    403: forbidden,
    422: { description: 'Validation error / branch not in your organization', ...json(ErrorResponseSchema) },
  },
});
