import { z } from '../../openapi/registry';

export const AiPortalSessionSchema = z
  .object({
    /** Empty until an AI capability is actually built and approved (ADR-053). */
    capabilities: z.array(z.string()),
    notice: z.string(),
  })
  .openapi('AiPortalSession');
