import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Prepares the schema (migrations + RLS + audit trigger) once before any test file, so the
    // integration tests have tables to run against on a fresh CI database. Idempotent locally.
    globalSetup: ['./src/test-globalSetup.ts'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 40000,
    // Integration tests hit a real PostgreSQL; run serially to avoid cross-test interference.
    fileParallelism: false,
  },
});
