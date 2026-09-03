# @hms/types — KNOWLEDGE.md

Shared TypeScript types and API contracts for the Nirogix monorepo. Consumed by `hms_backend` (API) and `hms_frontend` (Portal) so request/response shapes stay in sync across the wire. Read after root `CLAUDE.md`.

## What's here

`src/index.ts` mirrors the backend controllers (`hms_backend/src/modules/**`):

- **Envelopes:** `ApiError` (the canonical `{ error: { code, message, details? } }`) and `Paginated<T>` (`{ data, page: { number, size, total, totalPages } }`).
- **Auth:** `AuthUser`, `LoginRequest`, `LoginResponse` (tokens **or** `{ mfaRequired }`), `RefreshResponse`, `MeResponse`.
- **RBAC:** `MyPermissionsResponse` (`{ wildcard, permissions[] }`), `Role`.
- **Providers:** `Provider`, `Specialty`.
- **Audit:** `AuditEntry`.

## Rules

- These are hand-authored contracts, not generated — **when a backend controller's response shape changes, update the matching type here in the same change** (the Portal type-checks against it). Keep field names/nullability identical to the controller output.
- Types only — no runtime code, no dependencies. Permission _strings_ live in `@hms/permissions`, not here.
- **Compiles to `dist/`** (ADR-075): `tsconfig.build.json` emits CommonJS + declarations, and `main`/`types`/`exports` point at `dist/` so no plain-Node consumer ever resolves raw TypeScript. The package `dev` script (`tsc --watch`) keeps `dist/` fresh under root `npm run dev`. The plain `tsconfig.json` stays check-only.

## Verify

- `npm run typecheck -w @hms/types` · `npm run build -w @hms/types`. Cross-checked implicitly by `hms_frontend`'s typecheck/build.
