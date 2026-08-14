# @hms/ui — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-14 — Design system foundation (Phase 0 / Task #12)

**What:** Built the shared design system — the single design-token layer, the core primitives, and the Standard DataTable — consumed by `hms_frontend` and `marketing`.

**Added:**
- `src/styles.css` — the `--hms-*` design-token layer (colour, radius, type, shadow) with **Light default (`:root`) + Dark (`[data-theme="dark"]`)** and overridable brand tokens, plus the canonical component CSS.
- Primitives (token-only, no hardcoded values): `Button`, `Field`, **`PasswordField`** (labelled input with a built-in show/hide eye toggle — the required control for every password field platform-wide), `Card`, `Badge`, `Alert`, `Spinner`.
- **`DataTable`** — the Standard DataTable (columns + rows + rowKey, built-in loading/error/empty + horizontal overflow).
- `cn` helper; barrel `index.ts`; `./styles.css` + `.` exports; React 19 peer dependency.

**Decisions:** Everything visual derives from `--hms-*` tokens — no component hardcodes colour/spacing/radius/type. Light default; Dark via `data-theme`; tenant branding overrides `--hms-brand` at runtime. Self-contained CSS (semantic classes) so the system works identically in the Portal and marketing without depending on the consumer's Tailwind config; the apps additionally map the tokens into Tailwind's `@theme`. `PasswordField` standardises the password-reveal affordance.

**Testing status:** `typecheck` green. Verified live in the Portal in **Light + Dark** and under a **non-default tenant brand**; the DataTable renders the Providers and Audit views; the `PasswordField` toggle works both directions.
