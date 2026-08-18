import { z } from '../../openapi/registry';

export const SetupStepSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    href: z.string(),
    permission: z.string().nullable(),
    module: z.string().nullable(),
    required: z.boolean(),
    complete: z.boolean(),
    count: z.number(),
    dependsOn: z.array(z.string()),
  })
  .openapi('SetupStep');

export const SetupStatusSchema = z
  .object({
    organization: z.object({ name: z.string(), code: z.string() }),
    steps: z.array(SetupStepSchema),
    completedRequired: z.number(),
    totalRequired: z.number(),
    ready: z.boolean(),
  })
  .openapi('SetupStatus');
