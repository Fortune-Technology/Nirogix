import { defineConfig } from 'vitest/config';

// `.mts`, not `.ts`, on purpose. This package is CommonJS (no `"type": "module"`), so Node ≥22
// loads a `.ts` config through its own type stripping *as CommonJS* and warns
// `ESM syntax in a file loaded as CommonJS`. The extension is the declaration that this one file
// is ESM; nothing else here changes, and Vitest resolves `vitest.config.mts` the same way.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Prepares the schema (migrations + RLS + audit trigger) once before any test file, so the
    // integration tests have tables to run against on a fresh CI database. Idempotent locally.
    globalSetup: ['./src/test-globalSetup.ts'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 40000,
    // Integration tests hit a real PostgreSQL, so only one test file may seed and query it at a
    // time. Under Vitest 4 this single line is the whole knob: `fileParallelism: false` forces
    // `maxWorkers` to 1, and a project with `maxWorkers: 1` and the default `isolate: true`
    // gives every file its own group — one file per forked process, strictly sequential.
    //
    // `poolOptions: { forks: { singleFork: true } }` sat here until 01/09/2026. `poolOptions` was
    // removed in Vitest 4 (top-level `maxWorkers: 1` is its only equivalent, and the line below
    // already implies it), so it was ignored from the day it was added — it never changed how a
    // single run was scheduled. See BACKLOG.md, "Full-suite gate before manual QA".
    fileParallelism: false,
  },
});
