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
    //
    // `singleFork` is load-bearing, not belt-and-braces. From Vitest 4 the default pool is `forks`,
    // where `fileParallelism: false` no longer guarantees one worker — files still overlap across
    // forks. Two `onboardTenant` calls then interleave on the shared pg pool, `runWithTenant` sets
    // the RLS tenant for one on the connection the other reads from, and onboarding dies with
    // `Cannot activate "appointment": hard dependency "patient" is not entitled` — a different pair
    // of test files each run. One fork, one file at a time, is what the line above always meant.
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
  },
});
