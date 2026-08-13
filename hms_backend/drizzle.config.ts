import { defineConfig } from 'drizzle-kit';

// Drizzle Kit config (ADR-012). Generated DDL lands in ./drizzle; RLS policies are
// authored as SQL alongside the generated migrations (see resources/rules.md Tenancy Rules).
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
