import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { OpdRegisterSchema, CollectionsReportSchema, PendingLabsSchema } from './reports.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing reports.view permission', ...json(ErrorResponseSchema) };
const dateRange = z.object({ from: z.string().optional(), to: z.string().optional() });

registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/opd-register',
  operationId: 'reportOpdRegister',
  tags: ['Reports'],
  summary: 'OPD register — visits in a date range',
  security: [{ bearerAuth: [] }],
  request: { query: dateRange },
  responses: { 200: { description: 'OPD register rows', ...json(OpdRegisterSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/collections',
  operationId: 'reportCollections',
  tags: ['Reports'],
  summary: 'Daily collections / revenue — payments in a date range, by method and day',
  security: [{ bearerAuth: [] }],
  request: { query: dateRange },
  responses: { 200: { description: 'Collections report', ...json(CollectionsReportSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/reports/pending-labs',
  operationId: 'reportPendingLabs',
  tags: ['Reports'],
  summary: 'Pending lab results — orders not yet resulted',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Pending lab orders', ...json(PendingLabsSchema) }, 401: notAuthed, 403: forbidden },
});
