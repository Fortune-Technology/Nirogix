import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './document';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Mounts the OpenAPI JSON and (optionally) the Swagger UI. Environment-aware: the served
// document's `servers` come from config, and the interactive UI can be disabled per
// environment via OPENAPI_UI_ENABLED (the raw JSON spec is always served).
export function mountApiDocs(app: Express): void {
  // Raw spec — for frontend/mobile/third-party codegen and CI consumption. Rebuilt per
  // request (cheap); always reflects the live route definitions.
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  if (env.OPENAPI_UI_ENABLED) {
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
  } else {
    logger.info('Swagger UI disabled (OPENAPI_UI_ENABLED=false); spec still at /api/v1/openapi.json');
  }
}
