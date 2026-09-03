import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = {
  description: "Missing the module's own permission",
  ...json(ErrorResponseSchema),
};

const ImportFieldSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    required: z.boolean(),
    hint: z.string().optional(),
    example: z.string(),
  })
  .openapi('ImportField');

const ImportModuleSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    permission: z.string(),
    duplicateKey: z.object({ field: z.string(), label: z.string() }),
    supportsUpdate: z.boolean(),
    fields: z.array(ImportFieldSchema),
  })
  .openapi('ImportModule');

const ImportOptionsSchema = z
  .object({
    modules: z.array(ImportModuleSchema),
    duplicateStrategies: z.array(
      z.object({
        value: z.enum(['skip', 'update', 'create_only']),
        label: z.string(),
        description: z.string(),
      }),
    ),
  })
  .openapi('ImportOptions');

const PreviewRowSchema = z
  .object({
    line: z.number().int(),
    values: z.record(z.string(), z.unknown()),
    keyValue: z.string().nullable(),
    status: z.enum(['ready', 'duplicate', 'error']),
    matched: z.object({ id: z.string(), label: z.string() }).optional(),
    errors: z.array(z.object({ field: z.string().nullable(), message: z.string() })),
  })
  .openapi('ImportPreviewRow');

const PreviewSchema = z
  .object({
    module: ImportModuleSchema,
    columns: z.array(z.string()),
    mapping: z.record(z.string(), z.string().nullable()),
    missingRequired: z.array(z.object({ key: z.string(), label: z.string() })),
    totals: z.object({
      rows: z.number().int(),
      ready: z.number().int(),
      duplicates: z.number().int(),
      errors: z.number().int(),
    }),
    rows: z.array(PreviewRowSchema),
  })
  .openapi('ImportPreview');

const CommitResultSchema = z
  .object({
    runId: z.string(),
    totals: z.object({
      rows: z.number().int(),
      created: z.number().int(),
      updated: z.number().int(),
      skipped: z.number().int(),
      failed: z.number().int(),
    }),
    errors: z.array(z.object({ line: z.number().int(), message: z.string() })),
  })
  .openapi('ImportCommitResult');

const ImportRunSchema = z
  .object({
    id: z.string(),
    module: z.string(),
    moduleLabel: z.string(),
    filename: z.string(),
    duplicateStrategy: z.string(),
    totalRows: z.number().int(),
    created: z.number().int(),
    updated: z.number().int(),
    skipped: z.number().int(),
    failed: z.number().int(),
    errors: z.array(z.object({ line: z.number().int(), message: z.string() })),
    importedByName: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('ImportRun');

const moduleParam = z.object({ module: z.string() });

const PERMISSION_NOTE =
  "Authorised by the **imported module's own** permission — importing medicines needs the same " +
  'key as adding one by hand, because it is the same act at a different scale (ADR-138).';

const multipart = {
  content: {
    'multipart/form-data': {
      schema: z.object({
        file: z.string().openapi({ type: 'string', format: 'binary' }),
        mapping: z.string().optional().openapi({
          description:
            'JSON object: CSV column header → system field key, or null to ignore the column.',
        }),
        duplicateStrategy: z.enum(['skip', 'update', 'create_only']).optional(),
      }),
    },
  },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/imports',
  operationId: 'listImportModules',
  tags: ['Import'],
  summary: 'What this user can bulk-import, and the duplicate strategies on offer',
  description:
    'Filtered to what the caller may actually do: a module they cannot create records in is ' +
    'absent rather than present-and-refusing (ADR-126).',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Available imports', ...json(ImportOptionsSchema) },
    401: notAuthed,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/imports/history',
  operationId: 'listImportRuns',
  tags: ['Import'],
  summary: 'What has been imported into this hospital, newest first',
  description:
    'Who ran it, over what file, and what it changed — created, updated, skipped, failed. The ' +
    'uploaded file itself is never stored.',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ module: z.string().optional() }) },
  responses: {
    200: { description: 'Import runs', ...json(z.array(ImportRunSchema)) },
    401: notAuthed,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/imports/{module}/template',
  operationId: 'getImportTemplate',
  tags: ['Import'],
  summary: 'Download a sample CSV with the right columns and two example rows',
  description: `${PERMISSION_NOTE}\n\nRequired columns are marked with \`*\` in the header. UTF-8 with a BOM and CRLF, so Excel opens it correctly.`,
  security: [{ bearerAuth: [] }],
  request: { params: moduleParam },
  responses: {
    200: { description: 'CSV template', content: { 'text/csv': { schema: z.string() } } },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No such import', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/imports/{module}/preview',
  operationId: 'previewImport',
  tags: ['Import'],
  summary: 'Say what the file would do, without changing anything',
  description:
    `${PERMISSION_NOTE}\n\nDetects the column mapping, validates every row, and reports which are ` +
    'ready, which already exist and which have errors. **Describes the file, not a reservation:** ' +
    'if a matching record appears between preview and commit, the commit sees it and applies the ' +
    'chosen duplicate strategy.',
  security: [{ bearerAuth: [] }],
  request: { params: moduleParam, body: multipart },
  responses: {
    200: { description: 'What would happen', ...json(PreviewSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No such import', ...json(ErrorResponseSchema) },
    422: { description: 'Not a CSV, empty, or too many rows', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/imports/{module}/commit',
  operationId: 'commitImport',
  tags: ['Import'],
  summary: 'Import the file, and record what it did',
  description:
    `${PERMISSION_NOTE}\n\nRow by row, not one transaction: a file with one bad row imports the ` +
    'rest and reports that row, because rolling everything back would mean re-uploading ' +
    'everything to fix one cell. The exception is `create_only`, which refuses before writing ' +
    'anything if any row already exists — that is what choosing it means.',
  security: [{ bearerAuth: [] }],
  request: { params: moduleParam, body: multipart },
  responses: {
    200: { description: 'What was imported', ...json(CommitResultSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No such import', ...json(ErrorResponseSchema) },
    409: {
      description: '`create_only` and the file contains duplicates — nothing was imported',
      ...json(ErrorResponseSchema),
    },
    422: {
      description: 'Not a CSV, or a required column is unmapped',
      ...json(ErrorResponseSchema),
    },
  },
});
