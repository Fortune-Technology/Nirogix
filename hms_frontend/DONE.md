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
