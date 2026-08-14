import { z } from '../../openapi/registry';

export const CreateBranchBody = z
  .object({
    code: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
  })
  .openapi('CreateBranchBody');

export const UpdateBranchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateBranchBody');

export const BranchSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    isActive: z.boolean(),
  })
  .openapi('Branch');

export const BranchesResponseSchema = z
  .object({ branches: z.array(BranchSchema) })
  .openapi('BranchesResponse');
