import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';
import { OPENAPI_TAGS } from './tags';
import { env } from '../config/env';
import './register'; // side-effect: registers every module's operations into the registry

// Servers are built from configuration — never hard-coded (resources/rules.md). The running
// instance always advertises its own base URL; staging/production entries are added only when
// their env vars are set, giving the Swagger UI an environment dropdown.
function buildServers(): { url: string; description: string }[] {
  const servers: { url: string; description: string }[] = [];
  const current = env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`;
  servers.push({ url: current, description: `Current (${env.NODE_ENV})` });
  if (env.API_STAGING_URL && env.API_STAGING_URL !== current) {
    servers.push({ url: env.API_STAGING_URL, description: 'Testing / Staging' });
  }
  if (env.API_PRODUCTION_URL && env.API_PRODUCTION_URL !== current) {
    servers.push({ url: env.API_PRODUCTION_URL, description: 'Production' });
  }
  return servers;
}

// Generates the OpenAPI 3 document from the registry. Called by the /openapi.json route,
// the Swagger UI, the generate script, and the validator — always the same document.
export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: env.OPENAPI_TITLE,
      version: env.API_VERSION,
      description:
        'Nirogix REST API. This specification is generated from route definitions ' +
        '(Zod + zod-to-openapi) and is never hand-maintained. See resources/rules.md ' +
        '(API Documentation Rules) and resources/architecture.md (API Architecture).',
    },
    servers: buildServers(),
    tags: OPENAPI_TAGS.map((t) => ({ name: t.name, description: t.description })),
  });
}
