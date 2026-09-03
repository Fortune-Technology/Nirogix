import { defineConfig } from 'vitest/config';

// Component tests for the shared kit. jsdom because DataTable, Toaster and the
// dialogs are interactive: their behaviour (sorting, de-duplication, focus
// trapping) is the thing worth protecting, not their markup.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
