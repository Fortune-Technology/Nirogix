# @hms/utils — KNOWLEDGE.md

Shared, framework-agnostic utilities used across `hms_backend` and `hms_frontend`. Read after root `CLAUDE.md`.

## What's here

`src/index.ts` — the barrel. **Currently a stub** (`export {}`). This package is the home for small, pure, dependency-free helpers so no module reimplements them:

- Formatting (dates/time in IST, currency in ₹/INR, number formatting)
- Identifier helpers (UHID/MRN formatting, slug/code generation)
- Small validation helpers (phone/PIN/email shapes for the Indian context)

## Rules

- **Framework-agnostic + pure.** No React, no Express, no Node-only APIs unless clearly server-only and documented — helpers must be usable from both the API and the Portal. No side effects.
- Add a utility here only when it is genuinely shared by 2+ apps/packages; app-specific helpers stay in the app.
- Prefer the platform (Intl, Temporal-when-stable) over new dependencies.

## Verify

- `npm run typecheck -w @hms/utils`.

## Status

Intentionally empty in Phase 0 — helpers are added as the first modules that need them land (Stage 1+). Listed here so the package's purpose and rules are set before the first helper arrives.
