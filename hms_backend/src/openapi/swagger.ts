import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './document';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Mounts the OpenAPI JSON and the Swagger UI. Environment-aware: the served document's
// `servers` come from config, and BOTH surfaces are governed by OPENAPI_UI_ENABLED, which
// defaults off in production (ADR-082, SECURITY-AUDIT.md L-2). The spec used to be served
// unconditionally; a complete, machine-readable description of every production route is
// reconnaissance nobody outside the team needs. CI and the codegen path build the document
// from source (`npm run openapi:generate|validate`), never from a deployed host, so closing
// this costs no workflow.
export function mountApiDocs(app: Express): void {
  if (!env.OPENAPI_UI_ENABLED) {
    logger.info(`API docs disabled in ${env.NODE_ENV} (OPENAPI_UI_ENABLED)`);
    return;
  }

  // Raw spec — for frontend/mobile/third-party codegen and CI consumption. Rebuilt per
  // request (cheap); always reflects the live route definitions.
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  const document = buildOpenApiDocument();
  app.use(
    '/api/v1/docs',
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: `${env.OPENAPI_TITLE} — ${env.NODE_ENV}`,
      swaggerOptions: { persistAuthorization: true },
    }),
  );
  logger.info(`Swagger UI at /api/v1/docs · spec at /api/v1/openapi.json (${env.NODE_ENV})`);
}
