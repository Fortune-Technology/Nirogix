import 'dotenv/config';
import { z } from 'zod';

// Environment is validated once at boot. A missing/invalid var fails fast with a
// clear message rather than surfacing as a confusing runtime error later.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Error tracking (Sentry/GlitchTip). Optional: when unset, unexpected errors are captured
  // to the structured log as `error.captured` events. See observability/errorTracker.ts.
  SENTRY_DSN: z.string().url().optional(),

  // OpenAPI / Swagger — environment-aware, never hard-coded (see resources/rules.md
  // API Documentation Rules). Server URLs come from config per environment.
  OPENAPI_TITLE: z.string().default('Enterprise HMS API'),
  API_VERSION: z.string().default('1.0.0'),
  // Base URL of THIS running instance's API host. Falls back to http://localhost:${PORT}.
  API_PUBLIC_URL: z.string().url().optional(),
  // Optional additional servers surfaced in the Swagger UI server dropdown.
  API_STAGING_URL: z.string().url().optional(),
  API_PRODUCTION_URL: z.string().url().optional(),
  // Whether to serve the Swagger UI in this environment (JSON is always served).
  OPENAPI_UI_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Notifications — MSG91 for SMS/WhatsApp AND email (ADR-016). All optional: when unset, the
  // dev "log" provider is used (messages are logged, not sent). No module calls MSG91 directly.
  MSG91_API_KEY: z.string().optional(),
  MSG91_SMS_SENDER_ID: z.string().optional(),
  MSG91_EMAIL_FROM: z.string().optional(),
  MSG91_EMAIL_DOMAIN: z.string().optional(),

  // File storage — 'local' (disk, dev default) or 'r2' (Cloudflare R2, S3-compatible object
  // storage). PHI-bearing files use default-private buckets + short-lived signed URLs. For PHI,
  // pin the R2 bucket's jurisdiction to India (architecture.md → File Storage). No AWS.
  FILE_STORAGE_PROVIDER: z.enum(['local', 'r2']).default('local'),
  FILE_STORAGE_LOCAL_DIR: z.string().default('./storage'),
  FILE_MAX_SIZE_MB: z.coerce.number().int().positive().default(25),
  R2_ENDPOINT: z.string().optional(), // e.g. <accountid>.r2.cloudflarestorage.com
  R2_REGION: z.string().default('auto'),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),

  // Background jobs — Redis + BullMQ. When unset, jobs run inline in-process (dev/CI) instead of
  // on a queue; the same call sites work either way. No module creates its own cron/scheduler.
  REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
