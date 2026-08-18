import { z } from '../../openapi/registry';

export const RecordImmunizationBody = z
  .object({
    vaccineCode: z.string().min(1).max(64),
    vaccineName: z.string().min(1).max(200),
    source: z.enum(['system', 'custom']).optional(),
    dateGiven: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO date (YYYY-MM-DD)'),
    doseLabel: z.string().max(60).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .openapi('RecordImmunizationBody');

export const ImmunizationSchema = z
  .object({
    id: z.string(),
    vaccineCode: z.string(),
    vaccineName: z.string(),
    source: z.string(),
    dateGiven: z.string(),
    doseLabel: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Immunization');

export const ImmunizationListSchema = z.array(ImmunizationSchema).openapi('ImmunizationList');
