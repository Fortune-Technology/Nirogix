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
