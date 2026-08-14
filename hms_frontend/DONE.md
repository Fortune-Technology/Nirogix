# hms_frontend — DONE.md

Append-only implementation log. Newest at the bottom.

---

## 2026-08-14 — HMS Portal foundation (Phase 0 / Task #12)

**What:** The Portal foundation on Next.js 16 (App Router, Turbopack, React 19): a design system, client-side authentication, an RBAC-driven shell, the Standard DataTable, and Light/Dark + tenant branding — the base every role's screens build on.

**Added — `@hms/ui` (design system):**
- `src/styles.css` — the single design-token layer (`--hms-*`: colour, radius, type, shadow) with **Light default (`:root`) + Dark (`[data-theme="dark"]`)** and overridable brand tokens, plus canonical component classes.
- Primitives (token-only, no hardcoded values): `Button`, `Field` (labelled input), **`PasswordField`** (labelled input with a built-in show/hide **eye toggle** — the required control for every password input across the platform), `Card`, `Badge`, `Alert`, `Spinner`, and the **Standard `DataTable`** (columns + rows + rowKey; built-in loading/error/empty + horizontal overflow). `cn` helper. Barrel `index.ts`; `./styles.css` + `.` exports; React 19 peer dep.

**Added — `@hms/types`:** shared API contracts mirroring the backend controllers (`ApiError`, `Paginated<T>`, `AuthUser`, `LoginResponse`, `MyPermissionsResponse`, `Provider`, `Specialty`, `AuditEntry`, …).

**Added — `hms_frontend`:**
- Root `layout.tsx` (fonts, `@hms/ui/styles.css`, no-flash theme script, `<Providers>`), `providers.tsx` (Theme + Auth), `globals.css` (Tailwind + maps `--hms-*` into `@theme`). `next.config.ts` `transpilePackages`.
- `lib/api.ts` — typed fetch client: `credentials:'include'`, `Bearer`, **silent refresh-on-401 + retry**, canonical `{error}` unwrap into `ApiRequestError`.
- `lib/auth.tsx` — `AuthProvider` + `useAuth` + `useCan`: cookie-based session bootstrap (`/auth/refresh` → `/auth/me` → `/rbac/permissions`), login/logout, effective-permission capabilities.
- `lib/theme.tsx` — `ThemeProvider` + `useTheme`: Light/Dark (`data-theme`, persisted) + `setBrand()` per-tenant accent override.
- `lib/nav.ts` — permission-tagged nav. `components/`: `AppShell` (permission-filtered sidebar + topbar), `Can` / `RequirePermission`, `Forbidden`, `PageHeader`, `ThemeToggle`.
- Routes: `(auth)/login`, `(app)/{dashboard,providers,audit,settings}`, `/forbidden`, `/` → `/dashboard`. Providers + Audit are live-API views through the Standard DataTable.

**API/DB/frontend/integration:** Frontend only. Consumes existing backend endpoints (`/auth/*`, `/rbac/permissions`, `/providers`, `/audit`). **No backend change needed** — existing CORS (`origin:true, credentials:true`) + `SameSite=Lax` refresh cookie work cross-port.

**Testing status:** `typecheck` green (ui, types, frontend). `next build` green — all 8 routes prerender static. **Live-verified in-browser (CITYCARE demo):** admin login → dashboard; sidebar shows all areas; Providers DataTable lists the seeded Dr. Ananya Sharma (cardiology) + Dr. Rohit Mehta (orthopedics) from the live API; Audit shows the real paginated trail (Page 1 of 4). Sign out → login. **RBAC negative path:** receptionist sees only Dashboard/Settings; direct hit to `/providers` renders the 403 panel with **no `/providers` API call fired**. Silent refresh confirmed on reload (`/auth/refresh`→`/auth/me`→`/rbac/permissions` all 200). **Light + Dark** both verified (dark tokens applied, persisted); tenant brand override re-skins live. No unexpected console errors (the one boot 401 is the expected anonymous refresh probe).

**Decisions:** Access token in memory only (never localStorage) — session re-established from the httpOnly refresh cookie on reload. Client-side route guards are UX only; the backend re-authorizes every call (invariant #2). The design system owns all tokens; Tailwind is mapped onto the same `--hms-*` values so nothing hardcodes colour/spacing/radius/type. One `DataTable` for all tabular data. Light is the default theme.

**Known limitations:** Read-only views (admin CRUD forms land with each module). No component/E2E tests yet. MFA challenge, forgot-password, and branch switching not built. `@hms/ui` and `@hms/types` KNOWLEDGE/DONE finalized under the docs task (#15).

---

## 2026-08-14 — Super-Admin Tenants area: list, onboarding wizard, detail (Milestone A / Task A3)

**What:** The Portal Super-Admin surface for operator-driven onboarding (development-plan §20A, ADR-020) — create and manage tenants from the UI instead of `seed.ts`.

**Added:**
- `app/(app)/admin/tenants/page.tsx` — Tenants list (Standard DataTable: code→detail link, name, status badge, created) + "Onboard tenant".
- `app/(app)/admin/tenants/new/page.tsx` — Create-Tenant wizard: org code/name, a **module checklist** loaded from `GET /admin/module-catalog` (7 MVP pre-selected, 16 total), first-admin email/name, optional initial branch. On success shows a **one-time temp-password reveal** card with links to the tenant / list.
- `app/(app)/admin/tenants/[id]/page.tsx` — tenant detail: account-status control, module list with per-module **revoke** + a **grant** dropdown (catalog minus entitled), branches, user count. Reloads after each mutation.
- All three wrapped in `<RequirePermission perm={TENANTS_MANAGE}>`; "Tenants" nav item added (visible only to super_admin). `lib/api.ts` admin/user/branch wrappers; `@hms/types` admin/user/branch contracts. Small backend addition: `GET /admin/module-catalog` (documented).

**Testing status:** typecheck green (backend, types, frontend) · openapi:validate green · `next build` green (11 routes incl. dynamic `/admin/tenants/[id]`). **Live-verified in-browser (super_admin Vikram Rao):** the Tenants nav shows; list renders CITYCARE + SUNRISE; the wizard onboarded "Riverside Health Center" end-to-end and revealed the temp password; the detail page showed 7 modules + 1 branch + 1 user, and a **live module grant** (radiology) updated 7→8. Demo tenant removed afterward.

**Decisions:** Module catalog served by a small Super-Admin endpoint (data-driven wizard, no drift). Temp password shown once in the success card (operator handoff). Dynamic route reads `id` via `useParams()` (client component), avoiding Next 16 async-params handling.

**Known limitations:** No edit-org-details or offboard (tenants aren't hard-deleted — status transitions only). Org-Admin user/role/branch screens are A4.

---

## 2026-08-14 — Org-Admin screens: Users, Roles/Permissions, Branches (Milestone A / Task A4)

**What:** The Portal Org-Admin surface — manage staff, roles, overrides, and branches inside the tenant (development-plan §20A).

**Added:**
- `app/(app)/users/page.tsx` — Users list (DataTable: email→detail, name, role badges, status) with an inline **New user** form (`<Can platform.users.manage>`) that shows the one-time temp password on create.
- `app/(app)/users/[id]/page.tsx` — user detail: account status control; **Roles** (assign from role list / remove); **Effective permissions** (wildcard note or the resolved list); **Permission overrides** (add GRANT/DENY from the `@hms/permissions` catalog, revoke) — role/override controls gated by `platform.rbac.manage`.
- `app/(app)/branches/page.tsx` — Branches list with inline **New branch** + per-row active toggle (`<Can platform.branches.manage>`).
- Nav items "Users"/"Branches" (shown by `platform.users.view`/`platform.branches.view`). `lib/api` `listRoles` wrapper (the rest existed from A3).

**Testing status:** typecheck green (7 workspaces) · `next build` green (13 routes incl. dynamic `/users/[id]`). **Live-verified in-browser (org_admin Dr. Ananya Sharma):** nav shows Users/Branches but **not Tenants** (org_admin lacks `platform.tenants.manage`); Users list rendered all 8 CITYCARE staff with roles/status; the doctor's detail page showed the Doctor role + assign dropdown, the 11 effective permissions, and the override permission-picker with DENY/GRANT. The override/role mutation controls call the same endpoints proven live in A2 (create user, DENY-removes-permission, branch create) and covered by `user.test.ts`.

**Decisions:** Role assign uses the tenant's role list (`GET /rbac/roles`); the override permission picker uses `ALL_PERMISSIONS` from the shared package (no endpoint needed). Inline create panels (users/branches) instead of separate pages — lighter for simple forms. `useParams()` for the dynamic route (client component).

**Known limitations:** No password reset / forced-change; no email invite (temp-password handoff). No per-branch user membership UI (branches are org structure only for now). Roles are viewed via the user detail; a dedicated roles-catalog editor (create custom roles, edit role→permission sets) is a later slice.

---

## 2026-08-14 — Settings → Branding admin, server-persisted (Milestone B / Task B2)

**What:** The real tenant-branding editor (development-plan §20A, ADR-021) — replaces the Phase-0 localStorage preset demo with server-persisted branding applied at session bootstrap.

**Added / changed:**
- `lib/theme.tsx` reworked: brand is now **server-driven**. `applyBranding(b)` sets `--hms-brand`/`--hms-brand-hover`, swaps the `<link rel=icon>`, tracks `logoUrl`, and caches the brand colour to `localStorage` (paint-cache for the no-flash script). `previewBrandColor(hex)` gives a live preview while editing. Removed the old `brand`/`setBrand` localStorage demo.
- `components/BrandingLoader` (mounted in `app/(app)/layout.tsx`) fetches `GET /branding/current` once authenticated and applies it. `AppShell` renders the uploaded logo when present.
- `app/(app)/settings/page.tsx` rewritten as the **Branding admin** (`<Can platform.branding.manage>`): colour picker + hex for primary/secondary, logo + favicon upload, **live preview**, **reset to default**. `lib/api` branding wrappers incl. a multipart upload helper; `@hms/types` `Branding`. No-flash script now also seeds `--hms-brand-hover`.

**Testing status:** typecheck green (7 workspaces) · `next build` green (13 routes). **Live-verified in-browser (org_admin Dr. Ananya Sharma):** the Branding editor rendered; typing a hex (`#d6336c`) live-updated `--hms-brand`; **Save persisted** — after a full page reload the colour was still applied (loaded from the server by `BrandingLoader`) and the editor re-populated with the saved value; **Reset to default** reverted `--hms-brand` to the token default and cleared the cache. Logo/favicon upload uses the endpoints proven live in B1.

**Decisions:** Server is the source of truth; `localStorage` is only a pre-hydration paint cache. Branding applied through the existing `--hms-*` seam (no component changes). The OS file-picker upload wasn't driven in the automated browser (can't script it); the upload endpoint + FormData path were verified via B1's curl flow.

**Known limitations:** `secondaryColor` + typography are stored/edited but not yet consumed by any component (reserved). Logo URLs are short-lived (re-fetched each bootstrap). Per-branch branding override not built.
