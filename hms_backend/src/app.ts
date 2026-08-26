import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { logger } from './config/logger';
import { apiV1 } from './api/v1';
import { abdmGatewayRouter } from './modules/abdm/abdm.gatewayRoutes';
import { mountApiDocs } from './openapi/swagger';
import { auditMiddleware } from './http/auditMiddleware';
import { requestContext } from './http/requestContext';
import { errorHandler } from './http/errorHandler';
import { globalLimiter } from './http/rateLimit';
import { corsOptions } from './config/cors';
import { Errors } from './http/error';

// Builds the Express app. Kept separate from server.ts so tests can import the app
// without binding a port.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // CORS is an allowlist in production (credentials: true means a reflected origin
  // would let any site call the API with the user's cookie). See config/cors.ts.
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  // One correlation id per request, before the logger so every log line for the request
  // carries it — and before the audit middleware, which stores it on each row (ADR-082).
  app.use(requestContext);
  app.use(pinoHttp({ logger, genReqId: (req) => req.requestId ?? randomUUID() }));
  app.use(auditMiddleware);

  // Baseline limit for the whole API; credential and expensive routes add tighter
  // limits of their own (http/rateLimit.ts).
  app.use('/api/v1', globalLimiter, apiV1);

  // ABDM calls us on a path IT chooses, appended to the bridge URL we register with NHA — so it
  // cannot live under /api/v1 (ADR-084). The single documented exception to the versioning rule,
  // and it carries only routes ABDM originates.
  app.use(globalLimiter, abdmGatewayRouter);

  // OpenAPI JSON + Swagger UI (environment-aware; see src/openapi/). Mounted after the API
  // router so module routes take precedence, before the 404 handler.
  mountApiDocs(app);

  // Unknown route → canonical 404 (never a blank body).
  app.use((_req, _res, next) => next(Errors.notFound('Route not found')));

  // Terminal error handler — must be last.
  app.use(errorHandler);

  return app;
}
