import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // `react-hooks/set-state-in-effect` (a React Compiler rule pulled in by eslint-config-next)
    // flags patterns this codebase uses intentionally and pervasively: SSR-safe theme initialisation
    // from localStorage on mount, and load-on-mount data fetching that first sets a loading flag.
    // Kept as a warning (not an error) so it stays visible for a future cleanup without failing CI.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      // Other React Compiler advisories from the same bump — advisory, not correctness.
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
