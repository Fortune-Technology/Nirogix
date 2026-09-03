import { z } from '../../openapi/registry';

// System master-data catalogue API (ADR-072).

export const CatalogCategoryEnum = z.enum(['lab_test', 'drug', 'service', 'vaccine', 'department']);

export const CatalogItemSchema = z
  .object({
    source: z.enum(['system', 'custom']),
    code: z.string(),
    name: z.string(),
    attributes: z.record(z.any()),
  })
  .openapi('CatalogItem');

export const CatalogListSchema = z.array(CatalogItemSchema).openapi('CatalogList');

export const CreateCustomItemBody = z
  .object({
    name: z.string().min(2).max(200),
    // Optional pre-fill hints (e.g. { schedule: "Annual" } for a vaccine). String values only.
    attributes: z.record(z.string()).optional(),
  })
  .openapi('CreateCustomItemBody');

// Per-hospital availability overlay (ADR-073). Departments are excluded — they are natively
// branch-scoped (they carry their own branch_id), so they need no overlay.
export const AvailabilityItemTypeEnum = z.enum(['drug', 'lab_test', 'service', 'vaccine']);

export const SetAvailabilityBody = z
  .object({
    branchId: z.string().uuid(),
    itemType: AvailabilityItemTypeEnum,
    itemRef: z.string().min(1).max(64),
    isAvailable: z.boolean(),
    // Optional per-hospital price in integer paise (priced items only); null clears the override.
    priceOverridePaise: z.number().int().nonnegative().nullable().optional(),
  })
  .openapi('SetAvailabilityBody');

export const AvailabilityOverrideSchema = z
  .object({
    branchId: z.string(),
    itemType: AvailabilityItemTypeEnum,
    itemRef: z.string(),
    isAvailable: z.boolean(),
    priceOverridePaise: z.number().nullable(),
  })
  .openapi('AvailabilityOverride');

export const AvailabilityOverrideListSchema = z
  .array(AvailabilityOverrideSchema)
  .openapi('AvailabilityOverrideList');

export const AvailabilityItemSchema = z
  .object({
    ref: z.string(),
    name: z.string(),
    detail: z.string(),
    isAvailable: z.boolean(),
    priceOverridePaise: z.number().nullable(),
  })
  .openapi('AvailabilityItem');

export const AvailabilityItemListSchema = z
  .array(AvailabilityItemSchema)
  .openapi('AvailabilityItemList');
