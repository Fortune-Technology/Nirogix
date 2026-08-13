import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpenApiDocument } from '../openapi/document';

// Writes the generated OpenAPI spec to disk for CI artifacts and frontend/mobile codegen.
// Output is gitignored (generated/) — the live spec is always at /api/v1/openapi.json.
const doc = buildOpenApiDocument();
const outDir = join(process.cwd(), 'generated');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'openapi.json');
writeFileSync(outFile, JSON.stringify(doc, null, 2));

// eslint-disable-next-line no-console
console.log(`OpenAPI spec written to ${outFile} (${Object.keys(doc.paths ?? {}).length} paths).`);
