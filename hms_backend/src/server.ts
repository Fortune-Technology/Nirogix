import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './db/client';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`hms_backend listening on :${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown — stop accepting connections, drain the DB pool, then exit.
function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
