# @hms/config — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-13 — Shared TypeScript base config (Phase 0 / Task #1)

**What:** Established `tsconfig.base.json` as the single base every workspace extends (ES2022, Bundler resolution, strict + `noUncheckedIndexedAccess`, declaration/isolatedModules).

**Decisions:** One base config so strictness and module settings stay uniform across apps and packages; each package overrides only the minimum it needs. Config-only package (no runtime code).

**Testing status:** Verified transitively — the whole monorepo typechecks green against it.
