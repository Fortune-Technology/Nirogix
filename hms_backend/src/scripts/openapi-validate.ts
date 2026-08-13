import { createApp } from '../app';
import { validateOpenApiDocument } from '../openapi/validate';

// CI/pre-merge gate: builds the app, then validates the generated OpenAPI spec AND enforces
// that every registered /api/v1 route is documented. Exits non-zero on any problem so a PR
// introducing an undocumented or invalid API fails the pipeline.
async function main(): Promise<void> {
  const app = createApp();
  const { ok, problems } = await validateOpenApiDocument(app);

  if (ok) {
    // eslint-disable-next-line no-console
    console.log('✓ OpenAPI specification is valid and every /api/v1 route is documented.');
    process.exit(0);
  }

  // eslint-disable-next-line no-console
  console.error(`✗ OpenAPI validation failed — ${problems.length} problem(s):`);
  for (const p of problems) {
    // eslint-disable-next-line no-console
    console.error(`  - ${p}`);
  }
  process.exit(1);
}

void main();
