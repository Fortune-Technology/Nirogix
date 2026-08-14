# @hms/ui — KNOWLEDGE.md

The shared design system for the HMS monorepo. Consumed by `hms_frontend` (Portal) and `marketing`. Read after root `CLAUDE.md`.

## What's here

- **`src/styles.css`** — the **single design-token layer** (`--hms-*`: colour, radius, type, shadow) with **Light default (`:root`) + Dark (`[data-theme="dark"]`)**, plus overridable brand tokens (`--hms-brand*`) and the canonical CSS for every primitive. Imported once by the app: `import '@hms/ui/styles.css'`.
- **Primitives** (`src/components/`, all token-only — no hardcoded colour/spacing/radius/type): `Button`, `Field`, `PasswordField`, `Card`, `Badge`, `Alert`, `Spinner`.
- **`PasswordField`** is the **required** control for every password input across the platform (login, reset, change-password, admin user forms) — it carries a built-in show/hide (eye) toggle. Never use a bare `<input type="password">`; always reach for `PasswordField` so the reveal affordance is consistent everywhere.
- **`DataTable`** — the **Standard DataTable**: `columns` + `rows` + `rowKey`, with built-in loading / error / empty states and horizontal overflow. Every tabular view in the Portal renders through it.
- **`cn`** — tiny classname joiner (no clsx dependency).

## Rules

- No component hardcodes a raw visual value — everything derives from `--hms-*` (resources/rules.md → Design System). Theme switches by toggling `data-theme` on `<html>`; tenant branding overrides `--hms-brand` at runtime.
- Consumed from **source** via the app's `transpilePackages` (no build step). React 19 is a peer dependency.
- Adding a token → add it to `styles.css`; the consuming app maps it into Tailwind's `@theme` if it needs a utility for it.

## Verify / build

- `npm run typecheck -w @hms/ui`. Visual verification happens in the consuming app in **Light + Dark** and under a non-default brand.
