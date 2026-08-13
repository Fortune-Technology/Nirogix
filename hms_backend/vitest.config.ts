import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 40000,
    // Integration tests hit a real PostgreSQL; run serially to avoid cross-test interference.
    fileParallelism: false,
  },
});
