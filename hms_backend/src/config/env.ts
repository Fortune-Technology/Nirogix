import 'dotenv/config';
import { z } from 'zod';

// Environment is validated once at boot. A missing/invalid var fails fast with a
// clear message rather than surfacing as a confusing runtime error later.
const EnvSchema = z
  .object({
    // The environment this instance runs as. The application has exactly THREE environments —
    // development | staging | production (ADR-071). `test` is NOT a deployment environment: it is
    // the value the test runner (Vitest / CI) sets, kept in the enum only so importing this config
    // during a test run validates instead of `process.exit(1)`. Application behaviour treats `test`
    // as non-production (see `isProd` below and seedGuard's normalisation); it never deploys.
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    // Comma-separated browser origins allowed to call the API with credentials.
    // Required in production (see config/cors.ts).
    CORS_ORIGINS: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    // Per-connection safety valves on the pool (SECURITY-AUDIT.md M-2). A single query may not
    // run longer than DB_STATEMENT_TIMEOUT_MS, and a transaction may not sit idle longer than
    // DB_IDLE_TX_TIMEOUT_MS — a runaway scan or a transaction left open across a round trip
    // releases its connection instead of draining the pool. Tune per environment; the migration
    // runner opts out for its own session (db/migrate.ts), where slow DDL is expected.
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DB_IDLE_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
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
    OPENAPI_TITLE: z.string().default('Nirogix API'),
    API_VERSION: z.string().default('1.0.0'),
    // Base URL of THIS running instance's API host. Falls back to http://localhost:${PORT}.
    API_PUBLIC_URL: z.string().url().optional(),
    // Optional additional servers surfaced in the Swagger UI server dropdown.
    API_STAGING_URL: z.string().url().optional(),
    API_PRODUCTION_URL: z.string().url().optional(),
    // Whether to serve the API documentation (Swagger UI *and* the raw spec) in this
    // environment. The default is environment-aware and closed in production (ADR-082,
    // SECURITY-AUDIT.md L-2): a public spec of every route, parameter and error code is a
    // free map of the attack surface, and nobody outside the team consumes the production
    // one. Set OPENAPI_UI_ENABLED=true in production only for a deliberate, temporary reason.
    // Left unset elsewhere it stays on, which is what developers and CI need.
    OPENAPI_UI_ENABLED: z.enum(['true', 'false']).optional(),

    // Frontend origins the backend needs when IT composes a link into an app (today: the
    // password-reset email). Hosts come from resources/domains.md per environment — staging/
    // production MUST set these; the defaults cover a developer's machine only. Never used for
    // CORS (that is CORS_ORIGINS) and never derived from a request header — a Host/Origin header
    // is client input, and a link built from it would let a request steer where the email points.
    PORTAL_URL: z.string().url().default('http://localhost:3001'),
    ADMIN_URL: z.string().url().default('http://localhost:3003'),
    // Patient-portal origin, used to add a "view in portal" link to patient-facing emails
    // (appointment/payment/lab/welcome). Blank ⇒ those emails simply omit the button.
    PATIENT_URL: z.string().url().default('http://localhost:3002'),

    // Notifications — MSG91 for SMS/WhatsApp AND email (ADR-016). All optional: when unset, the
    // dev "log" provider is used (messages are logged, not sent). No module calls MSG91 directly.
    MSG91_API_KEY: z.string().optional(),
    MSG91_SMS_SENDER_ID: z.string().optional(),
    MSG91_EMAIL_FROM: z.string().optional(),
    MSG91_EMAIL_DOMAIN: z.string().optional(),
    // The MSG91 flow/template id of the DLT-registered OTP SMS. `sendOtp` attaches it on the SMS
    // channel; Indian SMS is rejected without a registered template id. Unset = OTP-by-SMS still
    // just logs (dev) / fails cleanly (prod) until DLT registration provides one.
    MSG91_OTP_TEMPLATE_ID: z.string().optional(),
    // The variable name inside that MSG91 flow -- MSG91 assigns it when the DLT template is added
    // to the panel, so it is configuration, not a constant. Blank falls back to `var1`, which is
    // what MSG91 names a single-variable flow by default.
    MSG91_OTP_TEMPLATE_VAR: z.string().optional(),

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

    // AI prescription drafting (ADR-070). Absent key = the feature does not exist: the
    // capabilities endpoint reports it off and the Portal renders no AI control. Never a stub.
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_DRAFT_MODEL: z.string().default('claude-sonnet-5'),

    // Application-level encryption at rest (security/encryption.ts). 32 bytes, base64 or hex.
    // Generate with: node -p "require('node:crypto').randomBytes(32).toString('base64')"
    // Required in production once any feature that stores a bearer credential is enabled
    // (today: ABDM linking tokens). Rotating it invalidates existing ciphertext, so treat it
    // like a database credential, not like a toggle.
    ENCRYPTION_KEY: z.string().optional(),

    // ---------------------------------------------------------------------------------------
    // ABDM / ABHA — Milestone 1 only (ADR-084).
    //
    // NHA issues ONE client id/secret to the registered APPLICATION (Nirogix). The per-hospital
    // HFR facility id is NOT here: it is tenant data, held in `abdm_facility_config`, because
    // each hospital registers its own facility. Never put a facility id in server config.
    //
    // `mock` is a first-class provider, not a fallback: the sandbox rate-limits OTPs to a
    // handful per number per day, so local development and CI would otherwise be unrunnable.
    ABDM_PROVIDER: z.enum(['mock', 'gateway']).default('mock'),
    ABDM_CLIENT_ID: z.string().optional(),
    ABDM_CLIENT_SECRET: z.string().optional(),
    // Gateway host (sessions + HIP routing). Sandbox: https://dev.abdm.gov.in
    ABDM_GATEWAY_BASE_URL: z.string().url().default('https://dev.abdm.gov.in'),
    // ABHA enrolment/profile host. Sandbox: https://abhasbx.abdm.gov.in/abha/api
    ABDM_ABHA_BASE_URL: z.string().url().default('https://abhasbx.abdm.gov.in/abha/api'),
    // Consent Manager id — 'sbx' in sandbox, 'abdm' (or as issued) in production.
    ABDM_CM_ID: z.string().default('sbx'),
    // How inbound ABDM callbacks are authenticated (audit 31/08/2026). `enforce` verifies the bearer
    // JWT against NHA's published JWKS and refuses anything else; `log` allows the request through
    // and records what arrived, for observing ONE real callback before enforcing; `off` disables the
    // check entirely. Defaults to `enforce` — without it these routes accept forged consent
    // notifications from anyone who knows a facility id, which is public.
    ABDM_CALLBACK_AUTH: z.enum(['enforce', 'log', 'off']).default('enforce'),
    // Version stamp written onto every stored consent record, so a later change to the consent
    // wording is distinguishable from consent taken under the old wording.
    ABDM_CONSENT_VERSION: z.string().default('m1-v1'),
    // How long a verification transaction stays usable before the operator must restart it.
    ABDM_TXN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    // Path to NHA's Fidelius CLI jar, used to encrypt health records for a requesting HIU (ADR-091).
    // Requires a JRE on the host. Unset means health records CANNOT be shared: the transfer refuses
    // rather than falling back to anything weaker, so leaving this blank disables M2 data transfer
    // and nothing else.
    /**
     * The public base URL a HIP pushes our requested records to (ADR-092) — the same host registered
     * as the bridge URL. Blank means M3 cannot ask for records: a data request naming an unreachable
     * push URL is accepted by ABDM and then silently delivers nothing.
     */
    ABDM_HIU_PUSH_BASE_URL: z.string().url().optional(),
    /**
     * The national-registry host (HFR + HPR, Milestone 4) — a third ABDM base URL, neither the ABHA
     * host nor the HIE-CM gateway. It accepts the same session token; only the URL differs.
     */
    ABDM_HFR_BASE_URL: z.string().url().default('https://apihspsbx.abdm.gov.in/v4/int'),
    FIDELIUS_CLI_PATH: z.string().optional(),
    // NHA's ceiling for completing a data transfer after the request arrives. Kept configurable so a
    // stricter internal target can be set, never a looser one than NHA allows.
    ABDM_TRANSFER_SLA_SECONDS: z.coerce.number().int().positive().default(1200),
  })
  .superRefine((val, ctx) => {
    // Selecting the real ABDM gateway without credentials is a misconfiguration that would only
    // show up as a 401 from NHA at the registration counter. Catch it at boot instead.
    if (val.ABDM_PROVIDER === 'gateway') {
      for (const key of ['ABDM_CLIENT_ID', 'ABDM_CLIENT_SECRET'] as const) {
        if (!val[key] || String(val[key]).trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when ABDM_PROVIDER=gateway`,
          });
        }
      }
      if (!val.ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message:
            'ENCRYPTION_KEY is required when ABDM_PROVIDER=gateway — ABDM linking tokens are stored encrypted',
        });
      }
    }
    // The production gateway must never be pointed at from a non-production instance, and a
    // production instance must never talk to the sandbox: the first leaks real Aadhaar traffic
    // into a test system, the second makes production quietly non-functional. Sandbox hosts are
    // recognisable by their `sbx`/`dev` markers (same heuristic as the R2 bucket guard).
    const abdmHosts = `${val.ABDM_GATEWAY_BASE_URL} ${val.ABDM_ABHA_BASE_URL}`.toLowerCase();
    const sandboxMarker = /(sbx|dev\.abdm)/.test(abdmHosts);
    if (val.ABDM_PROVIDER === 'gateway') {
      if (val.NODE_ENV === 'production' && sandboxMarker) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ABDM_GATEWAY_BASE_URL'],
          message:
            'Production must not call the ABDM sandbox — point ABDM_GATEWAY_BASE_URL/ABDM_ABHA_BASE_URL at the production hosts issued by NHA',
        });
      }
      if (val.NODE_ENV !== 'production' && !sandboxMarker) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ABDM_GATEWAY_BASE_URL'],
          message: `Non-production (${val.NODE_ENV}) must call the ABDM sandbox, not production ABDM`,
        });
      }
    }
    // When R2 is the chosen provider, its connection details stop being optional. Catch a
    // half-configured bucket at boot with a precise message, not at the first upload with a
    // cryptic storage/auth error.
    if (val.FILE_STORAGE_PROVIDER === 'r2') {
      for (const key of [
        'R2_ENDPOINT',
        'R2_BUCKET',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
      ] as const) {
        if (!val[key] || String(val[key]).trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when FILE_STORAGE_PROVIDER=r2`,
          });
        }
      }

      // One bucket per side of the production boundary (resources/domains.md §8). Every
      // non-production environment — development and staging (and the test runner) — shares a bucket
      // whose name is marked non-prod (e.g. `-staging`); production uses a SEPARATE bucket with no
      // such marker. Enforced at boot, in the spirit of the seeder environment guard (ADR-058), so
      // a mis-set R2_BUCKET fails loudly instead of a staging test writing into — or deleting
      // from — the production PHI bucket (or production writing into the shared non-prod one).
      const bucket = String(val.R2_BUCKET ?? '').toLowerCase();
      // Deliberately broad: this matches common non-production NAME fragments a bucket might carry.
      // It is an infrastructure-name heuristic (like seedGuard's DATABASE_URL check), separate from
      // the three-value application environment above — hence it still tolerates legacy `dev`/`local`.
      const nonProdMarker = /(^|-)(staging|testing|test|dev|development|local)(-|$)/.test(bucket);
      if (bucket) {
        if (val.NODE_ENV === 'production' && nonProdMarker) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['R2_BUCKET'],
            message: `Production must not use a non-production bucket — R2_BUCKET="${val.R2_BUCKET}" is marked non-prod. Point production at its dedicated bucket (e.g. nirogix-documents).`,
          });
        }
        if (val.NODE_ENV !== 'production' && !nonProdMarker) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['R2_BUCKET'],
            message: `Non-production (${val.NODE_ENV}) must use the shared non-production bucket, whose name marks it non-prod (e.g. nirogix-documents-staging). R2_BUCKET="${val.R2_BUCKET}" looks like the production bucket.`,
          });
        }
      }
    }
  });

// `OPENAPI_UI_ENABLED` is parsed as an optional string and resolved below, because its
// default depends on another variable (NODE_ENV) — so the exported type carries the
// resolved boolean rather than the raw value.
export type Env = Omit<z.infer<typeof EnvSchema>, 'OPENAPI_UI_ENABLED'> & {
  OPENAPI_UI_ENABLED: boolean;
};

// Every `.env` carries every key the app knows about, so unconfigured ones are present but
// blank (`SENTRY_DSN=`). A blank value means "not configured" and must behave exactly like an
// absent one — otherwise an empty optional URL or number would fail validation and stop the
// API from booting. Strip blanks first so defaults and `.optional()` apply as intended.
const presentEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value.trim() !== ''),
);

const parsed = EnvSchema.safeParse(presentEnv);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = {
  ...parsed.data,
  OPENAPI_UI_ENABLED:
    parsed.data.OPENAPI_UI_ENABLED === undefined
      ? parsed.data.NODE_ENV !== 'production'
      : parsed.data.OPENAPI_UI_ENABLED === 'true',
};
export const isProd = env.NODE_ENV === 'production';
