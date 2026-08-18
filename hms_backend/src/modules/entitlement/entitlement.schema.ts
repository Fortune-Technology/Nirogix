import { z } from '../../openapi/registry';

export const EntitlementsResponseSchema = z
  .object({
    modules: z.array(z.string()).openapi({ example: ['patient', 'appointment', 'billing'] }),
  })
  .openapi('EntitlementsResponse');

export const ModuleStubResponseSchema = z
  .object({
    ok: z.boolean(),
    module: z.string(),
    note: z.string(),
  })
  .openapi('ModuleStubResponse');
