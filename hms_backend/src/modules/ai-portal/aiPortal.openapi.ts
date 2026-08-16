import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { AiPortalSessionSchema } from './aiPortal.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'post',
  path: '/api/v1/ai/portal/session',
  operationId: 'enterAiPortal',
  tags: ['Config'],
  summary: 'Enter the AI Portal (authorization boundary; no AI capability behind it)',
  description:
    'Requires `ai.portal.access`, which **no role holds by default** — an operator grants it deliberately. A patient principal is refused by type before the permission is read (ADR-052). Entry is audited at notice level. `capabilities` is an empty list, and will stay empty until an AI capability is actually scoped and built; anything touching diagnosis or treatment needs a CDSCO classification check first (ADR-053).',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Session; capabilities is empty', ...json(AiPortalSessionSchema) },
    401: { description: 'Not authenticated, or a patient principal', ...json(ErrorResponseSchema) },
    403: { description: 'Missing ai.portal.access', ...json(ErrorResponseSchema) },
  },
});
