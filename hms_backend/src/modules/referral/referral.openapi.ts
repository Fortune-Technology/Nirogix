import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { CreateReferralBody, ReferralSchema, ReferralListSchema } from './referral.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission / module', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/referrals',
  operationId: 'listReferrals',
  tags: ['OPD'],
  summary: 'Referral worklist (filter by status / receiving department / patient)',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      status: z.enum(['pending', 'completed', 'cancelled']).optional(),
      toDepartmentId: z.string().uuid().optional(),
      patientId: z.string().uuid().optional(),
    }),
  },
  responses: { 200: { description: 'Referrals', ...json(ReferralListSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/referrals',
  operationId: 'createReferral',
  tags: ['OPD'],
  summary: 'Refer the patient of a visit to another department (ADR-068)',
  description:
    'A referral is a pointer, not a copy: the receiving department opens the same chart. Check-in against the referral is what completes it.',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateReferralBody) },
  responses: {
    201: { description: 'Created referral', ...json(ReferralSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Visit / department / provider not found', ...json(ErrorResponseSchema) },
    409: { description: 'Cancelled visit', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/referrals/{id}/cancel',
  operationId: 'cancelReferral',
  tags: ['OPD'],
  summary: 'Cancel a pending referral',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Cancelled referral', ...json(ReferralSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    409: { description: 'Only a pending referral can be cancelled', ...json(ErrorResponseSchema) },
  },
});
