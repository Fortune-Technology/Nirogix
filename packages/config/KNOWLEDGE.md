# @hms/config — KNOWLEDGE.md

Shared build/TypeScript configuration for the HMS monorepo. Read after root `CLAUDE.md`.

## What's here

- **`tsconfig.base.json`** — the base TypeScript config every workspace extends: `target`/`module` ES2022, `moduleResolution: Bundler`, `strict`, `noUncheckedIndexedAccess`, `isolatedModules`, `declaration`, `esModuleInterop`, `skipLibCheck`. Packages extend it and layer on only what differs (e.g. `@hms/ui` adds `jsx` + DOM libs).

## Rules

- **One base config.** New packages `extends: "../config/tsconfig.base.json"` rather than redefining compiler options, so strictness and module settings stay uniform. Override only the minimum a package needs.
- Config only — no runtime code. (Shared ESLint/Prettier config may move here later; today Prettier is root-level and ESLint is per-app flat config.)

## Verify

- Consumed transitively — a green `npm run typecheck` across the monorepo confirms the base config resolves everywhere.
