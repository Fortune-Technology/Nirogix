import { z } from '../../openapi/registry';

// Every field is optional and nullable: a hospital fills in what it has, and a printed
// document renders only the lines that exist (ADR-049). Empty strings are normalised to
// null in the service so "cleared" and "never set" are the same state.

const text = (max: number) => z.string().trim().max(max).nullable().optional();

// GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', checksum. Stored uppercase.
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const UpdateOrganizationProfileBody = z
  .object({
    legalName: text(200),
    addressLine1: text(200),
    addressLine2: text(200),
    city: text(100),
    state: text(100),
    postalCode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit Indian PIN code')
      .nullable()
      .optional(),
    country: text(100),
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^[0-9+\-() ]{6,32}$/, 'Enter a valid phone number')
      .nullable()
      .optional(),
    email: z.string().trim().email('Enter a valid email address').max(255).nullable().optional(),
    website: z.string().trim().url('Enter a full URL, including https://').max(255).nullable().optional(),
    registrationNumber: text(100),
    displayName: text(200),
    secondaryPhone: z
      .string()
      .trim()
      .max(32)
      .regex(/^[0-9+\-() ]{6,32}$/, 'Enter a valid phone number')
      .nullable()
      .optional(),
    supportEmail: z.string().trim().email('Enter a valid email address').max(255).nullable().optional(),
    // Letterhead — reuses this record rather than a second identity store (ADR-056).
    letterheadHeader: text(300),
    letterheadFooter: text(500),
    signatoryName: text(200),
    signatoryDesignation: text(200),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(GSTIN, 'Enter a valid 15-character GSTIN')
      .nullable()
      .optional(),
  })
  .openapi('UpdateOrganizationProfileBody');

export const OrganizationProfileSchema = z
  .object({
    // From the tenant row — the trading name and code the platform provisioned.
    name: z.string(),
    code: z.string(),
    legalName: z.string().nullable(),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    postalCode: z.string().nullable(),
    country: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    website: z.string().nullable(),
    registrationNumber: z.string().nullable(),
    gstin: z.string().nullable(),
    displayName: z.string().nullable(),
    secondaryPhone: z.string().nullable(),
    supportEmail: z.string().nullable(),
    letterheadHeader: z.string().nullable(),
    letterheadFooter: z.string().nullable(),
    signatoryName: z.string().nullable(),
    signatoryDesignation: z.string().nullable(),
    /** Address / contact / registration lines, already ordered for a document header. */
    contactLines: z.array(z.string()),
    /** True when the fields a tax invoice header needs are all present. */
    isComplete: z.boolean(),
  })
  .openapi('OrganizationProfile');

export type UpdateOrganizationProfileInput = z.infer<typeof UpdateOrganizationProfileBody>;
