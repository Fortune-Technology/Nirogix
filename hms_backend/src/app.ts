import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { logger } from './config/logger';
import { apiV1 } from './api/v1';
import { mountApiDocs } from './openapi/swagger';
import { auditMiddleware } from './http/auditMiddleware';
import { errorHandler } from './http/errorHandler';
import { Errors } from './http/error';

// Builds the Express app. Kept separate from server.ts so tests can import the app
// without binding a port.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));
  app.use(auditMiddleware);

  app.use('/api/v1', apiV1);

  // OpenAPI JSON + Swagger UI (environment-aware; see src/openapi/). Mounted after the API
  // router so module routes take precedence, before the 404 handler.
  mountApiDocs(app);

  // Unknown route → canonical 404 (never a blank body).
  app.use((_req, _res, next) => next(Errors.notFound('Route not found')));

  // Terminal error handler — must be last.
  app.use(errorHandler);

  return app;
}
