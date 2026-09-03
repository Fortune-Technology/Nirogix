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

---

## 2026-08-14 — Role-aware dashboard: platform vs org metric tiles (§20B-2)

**What:** Replaced the placeholder dashboard with real metric tiles that adapt to the signed-in role (development-plan §20B, user-journeys.md §1.3/§2.5).

**Added / changed:**

- `app/(app)/dashboard/page.tsx`: if the user holds `platform.tenants.manage` → **platform roll-up** (`GET /admin/stats`: organizations/hospitals active-inactive, branches, doctors, staff, module adoption); otherwise → **org roll-up** (`GET /dashboard/summary`: the caller's own tenant). A small `StatTile` (Card-based, token-styled); Stage-1-only metrics (patients/appointments) render "— (Stage 1)" so tiles degrade gracefully. Quick-links row retained.
- `lib/api` `getPlatformStats`/`getOrgSummary`; `@hms/types` `PlatformStats`/`OrgSummary`.

**Testing status:** typecheck green (7 workspaces) · `next build` green. **Live-verified in-browser:** **Platform Owner** (`owner@takoriya.example`) → "Platform overview" with Orgs 3 / Hospitals 2 / Doctors 4 / Users 15 / Branches 4 + module-adoption tiles; **org_admin** (`admin@citycare.example`) → "Your organization at a glance" scoped to CityCare (7 users, 3 doctors, 2 branches, 7 modules) with **no** platform-only tiles and no Tenants link.

**Decisions:** One dashboard route, role-branched by permission (not two routes). Aggregate-only platform view (ADR-023); org view is RLS-scoped. Tiles built to tolerate not-yet-present modules (null → placeholder).

**Known limitations:** No charts/trends yet (single-value tiles); patient/appointment/revenue tiles fill in as the Stage 1 clinical modules land. No date-range or drill-down.

---

## 2026-08-14 — Patient Management screens: list, register, profile (Phase 1 / MVP 0 / Task P2)

**What:** The Portal side of the first clinical module — the patient directory, registration, and profile (development-plan §21). On branch `feat/phase-1-clinic-pilot`.

**Added:**

- `app/(app)/patients/page.tsx` — directory (Standard DataTable: UHID→detail, name, gender, **age computed from DOB**, phone, city, status) with **debounced server-side search** (UHID/name/phone) + pagination + "Register patient" (`<Can patient.record.create>`).
- `app/(app)/patients/new/page.tsx` — registration form (identity / contact / emergency; gender + blood-group selects, DOB picker, ABHA field); on save redirects to the new profile. `<RequirePermission patient.record.create>`.
- `app/(app)/patients/[id]/page.tsx` — profile (read cards) with an inline **Edit** mode (`<Can patient.record.update>`) that PATCHes; empty inputs are coerced to `null` so nullable fields validate.
- Nav "Patients" (`patient.record.view`); `lib/api` patient wrappers; `@hms/types` `Patient`/`CreatePatientRequest`. `PageHeader.description` widened to `ReactNode`.

**Testing status:** typecheck green (7 workspaces) · `next build` green (16 routes incl. dynamic `/patients/[id]`). **Live-verified in-browser:** org_admin sees the 3 seeded patients but **no Register button** (lacks `create`); a **doctor** registers a patient (UHID-000004 auto-assigned) → profile; the doctor edits (blood group + state) and **Save persists** (after the empty-string→null fix); the list/age/search/pagination render. Test walk-in removed afterward.

**Decisions:** Role-gated CRUD via `<Can>`/`<RequirePermission>` on the same shared permission keys the backend enforces — a receptionist can register but not edit, a doctor can do both (verified). Search is debounced (300ms) and server-side through the paginated list endpoint.

**Known limitations:** No document attachments / photo, no ABHA verify, no merge/dedup, no encounter/appointment history on the profile yet (arrive with those modules). Branch selection on registration is not surfaced (branch_id supported by the API).

---

## 2026-08-14 — Appointment screens: list, booking, cancel (Phase 1 / MVP 0 / Task AP2)

**What:** The Portal side of Appointments — the schedule list, a booking form, and cancellation — completing the clinic spine _register patient → book → cancel_ (development-plan §21).

**Added:**

- `app/(app)/appointments/page.tsx` — schedule (DataTable: when, patient→profile link, provider, duration, status) with a **status filter**, pagination, and a per-row **Cancel** (`<Can appointment.booking.cancel>`, booked rows only) + "Book appointment" (`<Can appointment.booking.create>`).
- `app/(app)/appointments/new/page.tsx` — booking form: **patient picker** (debounced search → pick), provider select, `datetime-local`, duration, reason; supports `?patientId=` prefill; surfaces the **double-booking 409** as an inline error. Wrapped in `<Suspense>` (uses `useSearchParams`).
- Nav "Appointments" (`appointment.booking.view`); `lib/api` + `@hms/types` appointment contracts. **`@hms/permissions`: receptionist granted `providers.view`** so the front desk can pick a provider when booking (re-seed applies it to existing tenants).

**Testing status:** typecheck green (7 workspaces) · `next build` green (18 routes). **Live-verified (receptionist):** the seeded appointment lists with patient+provider names; booking a **free slot** succeeds → appears in the list; booking the **already-booked provider slot** shows _"The provider already has an appointment in this time slot"_ (409); **Cancel** flips the row to `cancelled` and removes its Cancel action. Test appointment removed afterward.

**Decisions:** Reception needs provider visibility to book, so `providers.view` was added to the receptionist role (domain-correct front-desk capability) rather than exposing a parallel endpoint. Patient picker reuses the paginated patient search. Booking converts the local `datetime-local` to ISO before sending.

**Known limitations:** No calendar/day view (list only), no reschedule (cancel + re-book), no reminder send (staging), no provider working-hours constraint. Duration is a fixed set of options.

---

## 2026-08-14 — HMS Design System reskin + Lucide icon migration (frontend)

**What:** The Portal adopts the approved custom **HMS Design System** (`resources/DESIGN.md`) via the reskinned `@hms/ui` tokens, and completes the project-wide switch to **Lucide** icons.

**Changed:**

- Colour/theme come entirely from the reskinned `--hms-*` tokens (see `packages/ui` DONE) — no page markup changed for the palette; the whole Portal re-skins to cool-neutral + deep-teal in Light and Dark.
- `lib/nav.ts` + `components/AppShell.tsx` — every sidebar item now carries a Lucide icon.
- `components/ThemeToggle.tsx` — the ☀/☾ emoji replaced with Lucide `Sun` / `Moon`.
- Text-glyph icons migrated to Lucide across pages: back links `←` → `ArrowLeft` (patients/users/tenants detail), remove/revoke `✕` → `X` (users/tenants detail), action `+` → `Plus` (patients/appointments/users/branches/tenants lists).
- Deleted the unreferenced create-next-app demo SVGs from `public/`.

**Testing status:** `typecheck` green (7 ws) · `next build` green (18 routes). Live-verified in the running Portal (authenticated): all sidebar items show icons, the appointments DataTable and buttons render, no horizontal overflow, **no console errors**; Light + Dark token values confirmed.

---

## 2026-08-14 — Frontend rules: Lenis smooth scroll + back-to-top (Portal)

**What:** Applied the permanent frontend rules (`resources/DESIGN.md` §9) to the Portal.

**Changed:**

- `app/layout.tsx` — wrapped the app in the shared `SmoothScroll` (Lenis + route scroll-to-top) with a global `BackToTop`, both from `@hms/ui`.
- `app/(app)/users/[id]/page.tsx` — the scrollable effective-permissions list marked `data-lenis-prevent` so its wheel scroll is not hijacked by Lenis.

**Testing status:** `typecheck` green (7 ws) · `next build` green (18 routes). Live-verified in the running Portal: Lenis active, `BackToTop` in the DOM, DataTable intact, no console errors.

**Note (pre-existing):** `npm run lint` reports `react-hooks/set-state-in-effect` errors across the app's established `useEffect`+`setState` data-loading pattern (theme, auth, list pages) under Next 16's stricter rule. Not introduced by this work; `next build` + `typecheck` (the project gates) are green. Resolving the rule broadly is a separate cleanup.

---

## 2026-08-14 — Platform branding admin + layered BrandingLoader (ADR-024)

**Added:**

- `app/(app)/admin/branding/page.tsx` — Super-Admin screen (gated `PLATFORM_BRANDING_MANAGE`) with **two independent panels** (Marketing / HMS Portal default).
- `components/PlatformBrandingPanel.tsx` — per-scope editor: brand-family colour inputs (primary / secondary / accent / button bg + text), live preview, Save / Reset. (Neutral surfaces stay theme-managed for Light/Dark, so they are not exposed.)
- `lib/api.ts` — `getPlatformBranding` / `updatePlatformBranding` / `resetPlatformBranding` / `uploadPlatformBrandingAsset`.
- `components/BrandingLoader.tsx` — now **layers** branding: the platform `hms` default (injected as a `:root` rule) UNDER the per-tenant inline override, so a tenant still wins and, when it has none, falls back to the platform default.
- `lib/nav.ts` — super-admin-only "Branding" nav item (Palette icon).

**Testing status:** `typecheck` green (7 ws) · `next build` green (19 routes). Live-verified: the "Branding" nav item is absent and `/admin/branding` returns **403 Forbidden** for a non-super-admin session (RV); the full super-admin write/read/reset loop is verified at the API layer (see backend DONE). Super-admin panel render is best confirmed by logging in as the platform owner.

---

## 2026-08-14 — Global ambulance preloader

**Changed:**

- `public/animations/ambulance.json` — added (the shared preloader asset).
- `app/layout.tsx` — added the shared `@hms/ui` `LottiePreloader` (`src="/animations/ambulance.json"`) at the app root, replacing the plain initial loading state.

**Testing status:** `typecheck` green (7 ws) · `next build` green (19 routes). Live-verified in the Portal: the preloader shows on load then unmounts and restores scroll; the shell renders; no console errors.

---

## 2026-08-14 — MVP-0 slice 1.3 screens: OPD queue + Billing/receipt

**Added:**

- `app/(app)/opd/page.tsx` — front-desk **queue/token board**: today's visits in token order (patient, provider, status, checked-in time, invoice status + balance), per-row **Start consult / Complete** (OPD_UPDATE), **Check in** button.
- `app/(app)/opd/check-in/page.tsx` — check-in form (patient search-picker + provider + consultation fee ₹ + reason); pre-fillable from an appointment (`?appointmentId=&patientId=&providerId=`), Suspense-wrapped.
- `app/(app)/billing/page.tsx` — invoice list (invoice#, patient, total, balance, status) + status filter + pagination.
- `app/(app)/billing/[id]/page.tsx` — **receipt**: line-item table, totals (subtotal/tax/total/paid/balance), payments list, **Collect payment** (cash/UPI/…, generates an `idempotencyKey` per attempt), **Print** (`window.print`, `print:hidden` chrome).
- `lib/money.ts` (`formatPaise` / `rupeesToPaise`), `lib/api.ts` OPD + billing functions, `lib/nav.ts` OPD Queue + Billing items (permission-filtered), and an appointments-row **Check in** action.

**Testing status:** `typecheck` green (7 ws) · `next build` green (22 routes). **Live-verified in the Portal:** as the receptionist, the OPD queue renders the real visit (**#1 · Vivaan Patil · Dr. Ananya Sharma · Checked in · paid**), the sidebar shows OPD Queue but **not** Billing, and `/billing` returns **403** (receptionist lacks BILLING_VIEW). The cashier billing UI (list / receipt / collect) is API-verified (see backend DONE) and best eyeballed via a cashier login.

---

## 2026-08-14 — MVP-0 slice 1.4 screen: doctor consultation

**Added:**

- `app/(app)/opd/[id]/page.tsx` — the consultation screen: vitals grid, SOAP notes, **ICD-10 diagnosis picker** (debounced search + primary toggle + remove), prescription writer + lab-order rows (add/remove), **Save** + **Sign & complete** (optimistic `version`; the whole screen goes read-only once signed).
- OPD queue gains a clinician-only **Open / View** consultation link; `lib/api` EMR functions (open / save / sign / ICD-10 search).

**Testing status:** `typecheck` green (7 ws) · `next build` green. **Live-verified in the Portal:** after the doctor signed the encounter (via API), the OPD queue shows the visit as **Completed**, the **Open** link is hidden from the receptionist, and `/opd/[id]` → **403** for the receptionist (EMR_VIEW gate). The doctor consultation UI is API-verified (see backend DONE) + best eyeballed via a doctor login.

---

## 2026-08-15 — MVP-1 slice 1.5 screens: pharmacy dispensing + stock

**Added:**

- `app/(app)/pharmacy/page.tsx` — dispensing **worklist**: pending prescriptions, each with a drug picker (from the master, showing on-hand + price, out-of-stock disabled) + qty → **Dispense**.
- `app/(app)/pharmacy/stock/page.tsx` — drug list (on-hand + **low-stock** badge, price, reorder) + **Add drug** + per-row **Receive stock**.
- `lib/api` pharmacy functions; `lib/nav` Pharmacy item (permission-filtered).

**Testing status:** `typecheck` green (7 ws) · `next build` green (24 routes). **Live-verified in the Portal:** the receptionist has **no Pharmacy nav** and `/pharmacy` → **403** (lacks PHARMACY_STOCK_VIEW). The pharmacist UI is API-verified (see backend DONE) + best eyeballed via a pharmacist login.

---

## 2026-08-15 — MVP-1 slice 1.6 screens: lab worklist + result + report

**Added:**

- `app/(app)/laboratory/page.tsx` — lab **worklist**: orders by status (ordered → **Collect**; collected → inline **result entry** with a test picker; resulted → flag badge + **Report** link).
- `app/(app)/laboratory/tests/page.tsx` — **test master** (list + add: LOINC, reference range, price).
- `app/(app)/laboratory/[id]/page.tsx` — printable **lab report** (result + abnormal flag + reference range), shared with the doctor (LAB_ORDER_VIEW).
- `lib/api` lab functions; `lib/nav` Laboratory item (permission-filtered).

**Testing status:** `typecheck` green (7 ws) · `next build` green (26 routes). **Live-verified in the Portal:** the receptionist has **no Laboratory nav** and `/laboratory` → **403** (LAB_ORDER_VIEW gate). The lab-tech UI is API-verified (see backend DONE) + best eyeballed via a lab login.

---

## 2026-08-15 — MVP-1 slice 1.7 screens: reports + CSV export (Phase 1 complete)

**Added:**

- `app/(app)/reports/page.tsx` — reports hub: tabs (**OPD register / Collections / Pending labs**), date-range filter, tables, and **client-side CSV export**. Collections shows a total + by-method summary above the detail table.
- `lib/csv.ts` (client-side CSV download), `lib/api` report functions, `lib/nav` Reports item (permission-filtered).

**Testing status:** `typecheck` green (7 ws) · `next build` green (27 routes). **Live-verified in the Portal:** the receptionist has **no Reports nav** and `/reports` → **403** (REPORTS_VIEW gate). The reports UI is API-verified (see backend DONE) + best eyeballed via an admin / cashier login. **🎉 Phase 1 frontend complete.**

---

## 2026-08-15 — Centralized API feedback + Portal noindex (ADR-026, ADR-027)

**What:** Every API outcome now reaches the user through the one shared `@hms/ui` toast, raised inside the API client — and the Portal is explicitly uncrawlable.

**Added:**

- `lib/apiErrors.ts` — `ApiRequestError` (moved out of `api.ts`), plus `NetworkError` and `TimeoutError`. Separate module so `api.ts` and `feedback.ts` share them without a cycle; `api.ts` re-exports them, so the ~20 pages importing `ApiRequestError` from `@/lib/api` are unchanged.
- `lib/feedback.ts` — the single classifier. `describeError()` → user-safe title/description per failure mode (timeout, offline, 401, 403, 404, 409, 400/422, 429, 5xx, unknown), preferring the backend's message when usable and **always** using generic copy for 5xx. `notifyError()` / `notifySuccess()` raise the toast; `successMessage()` resolves API `message` → call-supplied copy or formatter → `Saved.`/`Removed.`.
- `app/robots.ts` — `disallow: "/"` for the whole origin.

**Changed:**

- `lib/api.ts` — `send()` wraps `fetch` with a 30s `AbortController` timeout (stalled → `TimeoutError`, dead connection → `NetworkError`); `request()` notifies on every failure and on every mutating success; new per-call `feedback` option (`false` / `{ success: false }` / `{ success: string | (payload) => string }` / `{ error: false }`). 32 call sites given intent-specific success copy (e.g. "Patient checked in.", "Payment recorded.", dispensing reports drug × qty + amount added to the bill). The two multipart uploads now route through `send()` + the same notifications. `login()` opts out entirely (the form renders failure inline).
- `lib/auth.tsx` — the login error string now comes from `describeError()`, so inline and toast copy can never drift.
- `app/layout.tsx` — mounts `<Toaster />`; metadata gains `robots: { index: false, follow: false, nocache: true, googleBot: { noimageindex } }` + `referrer: strict-origin-when-cross-origin`.
- Removed duplicate per-page feedback in `settings`, `pharmacy`, `pharmacy/stock`, `laboratory`, `laboratory/tests`, and `opd/[id]` — local "Saved."/"Result saved."/"Drug added." banners and API-failure re-reporting are gone; client-side **validation** messages and DataTable load-error states stay.
- `components/AppShell.tsx` + `settings/page.tsx` — tenant logo now renders through `next/image` (`unoptimized`, explicit 24/40px dimensions) instead of a raw `<img>`; dropped the two `no-img-element` eslint suppressions. Removed an unused `Badge` import in `pharmacy/page.tsx`.

**Testing status:** `typecheck` green · `next build` green · eslint clean on all changed files (only the repo's pre-existing `react-hooks/set-state-in-effect` findings remain). **Live-verified** against the local backend as CITYCARE org_admin: wrong password → inline "Invalid credentials" and **no** toast (no double message); dashboard GETs stay silent; `Save colours` → success toast "Branding saved."; `/users/<bogus-uuid>` → persistent error toast "Not found — User not found" with `role="alert"`; toast sits bottom-right clear of `BackToTop` and re-checked in Dark.

---

## 2026-08-15 — shadcn/ui installed as a CLI + reference layer (ADR-028)

**What:** `shadcn init` run against the Portal so `shadcn add` and the shadcn agent skill work here — without shadcn becoming a second component kit. `@hms/ui` stays canonical (ADR-026 unchanged).

**Added:** `components.json` (template `next`, base `base` = Base UI, preset `nova`, Lucide, CSS variables), `lib/utils.ts`, `components/ui/` as the add-target. Dependencies `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`; the `shadcn` CLI moved to **devDependencies** (init put it in `dependencies`).

**Changed — `app/globals.css`, reconciled by hand after init:**

- Init's regressions reverted: `--font-sans` restored to `var(--hms-font-sans)` (it had been repointed at itself), and the generated demo `components/ui/button.tsx` deleted rather than left unused.
- shadcn's neutral **OKLCH palette and its `.dark` block removed**; every semantic variable it needs is now a reference to `--hms-*` (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--sidebar-*`, `--chart-*`).
- `@custom-variant dark` redefined from `(&:is(.dark *))` to `[data-theme="dark"]` — the switch this app actually uses — so `dark:` utilities and the mapped variables track the real theme.
- Init's `@layer base` reset (`* { @apply border-border }`, `body { @apply bg-background }`) dropped; the existing body rules already do this and the wildcard border would have altered `@hms/ui` components.

**Result:** anything pulled in with `shadcn add` renders on the HMS palette in Light **and** Dark and follows a tenant's accent override, with no second palette to maintain.

**Testing status:** `npm install` + `typecheck` green (7 workspaces) · `next build` green. **Live-verified:** `--primary` resolves to `--hms-brand` (`#0e7490`), `--radius` to 12px, the existing `.hms-btn--primary` still paints `rgb(14,116,144)`, page ground unchanged. `shadcn info` reports Next.js 16.3.0 / Tailwind v4 / alias `@` correctly.

---

## 2026-08-15 — DataTable configurations + `DD/MM/YYYY` dates (ADR-029, ADR-030)

**Dates:** all ten locale-dependent renders (`toLocaleDateString` / `toLocaleString` / `toLocaleTimeString` in tenants, appointments, audit, billing ×2, opd ×2, reports ×2, user overrides) now go through `formatDate` / `formatDateTime` / `formatTime` from `@hms/utils`; `@hms/utils` added as a workspace dependency. No locale-dependent date formatting remains in the app.

**Tables:** the shared `DataTable` gained sorting/search/filters/column-visibility/pagination (ADR-029) with a backwards-compatible column API, so all 12 existing screens compiled untouched. Two were then upgraded to real configurations:

- **Patients** — server mode (`server` + `urlState`): the API owns paging and search, the toolbar's search is debounced into one request, `?q=`/`?page=` make a view linkable. Columns gained sortable UHID/Name/Registered, faceted Gender/City/Status filters, a default-hidden "Registered" column, and a right-aligned actions column using the shared `ActionMenu` (View record / Edit details, the latter permission-gated). The page's hand-rolled search box and Previous/Next buttons were deleted.
- **Providers** — client mode: sortable Name, faceted Specialties and Status filters, search placeholder, 20-row pages, and an empty-state description.

**Testing status:** `typecheck` green · `next build` green · eslint clean on changed files. **Live-verified** against the local backend (CITYCARE org_admin) — see `packages/ui/DONE.md` for the sorting / search / filter / column-visibility / pagination checks and the `14/08/2026` date render.

---

## 2026-08-15 — Every table converted to a full DataTable configuration

**Reported:** on the audit screen, choosing "100 rows per page" still showed 20; no column could be sorted; no search box; no filters.

**Cause:** those screens were still passing the _minimal_ column shape (`{ key, header, cell }`) the old table accepted. Without an `accessor` a column has no comparable value, so the table could not sort, search, or facet it — and their pages still owned paging themselves, so the table's rows-per-page control changed nothing the API was asked for.

**Fixed:**

- `@hms/ui` — a column with an `accessor` is now **sortable and searchable by default** (opt out with `sortable: false`), so configuring a table no longer means repeating flags. Server-mode sorting now computes the next sort state and emits _that_ (it previously read the pre-click state back through a `setTimeout`, so the API received the wrong sort). The toolbar no longer renders an empty bar for tables with no filters.
- **Converted every remaining table** with accessors, faceted filters, aligned numeric columns, sensible default-hidden columns, and shared row actions: audit, appointments, billing, opd, users, branches, admin/tenants, laboratory/tests, pharmacy/stock, and all three reports tables (OPD register, pending labs, collections).
- **Server mode** wired where the API paginates — **audit**, **appointments**, **billing** (joining patients) — so rows-per-page, page changes, search and filters all reach the API. Their hand-rolled Previous/Next blocks and stand-alone status `<select>`s were deleted; the status filters now live in the table toolbar.
- The audit table drives the new backend query surface (`search`, `severity`, `sortBy`/`sortDir` — see `hms_backend/DONE.md`).

**Testing status:** `typecheck` green · `next build` green · eslint clean (only the repo's pre-existing `set-state-in-effect` / `purity` findings). **Live-verified on /audit:** page size 100 returned 100 rows of 426; sorting Action asc→desc changed the data and the URL (`?sort=action:asc|desc`); search "branding" returned 33 of 33, every row matching; severity "notice" returned 1 of 1. **/users:** search, Roles + Status faceted filters, four sortable columns, pagination. **/opd:** search + six sortable columns (queue empty today, so the shared empty state renders instead of filters).

---

## 2026-08-15 — Dead-code sweep after the toast swap

The Base UI toast lives in `@hms/ui`, so the scaffolding `shadcn init` left in the apps had no consumer. Removed, per the strengthened clean-code rule:

- `hms_frontend/lib/utils.ts` and `marketing/lib/utils.ts` — nothing imported them, and their `cn` duplicated `@hms/ui`'s. `shadcn add` regenerates the file if a future component needs it.
- Empty `hms_frontend/components/ui/` directory (its generated `toast.tsx` / `button.tsx` were superseded by the shared version).
- Dependencies nothing imports, dropped from both apps' `package.json`: `@base-ui/react` (declared by `@hms/ui`, which owns the Toast), `class-variance-authority`, `clsx`, `tailwind-merge`. `tw-animate-css` stays — `globals.css` imports it — as does the `shadcn` devDependency, which provides `shadcn/tailwind.css` and the CLI.

Swept the whole repo for other orphans in the same pass — files nothing references, unused `public/` assets, and unused runtime dependencies across all four workspaces: **none found**.

**Testing status:** `typecheck` green (7 workspaces) · both apps `next build` green _after_ the removals — which is the proof the code was dead.

---

## 2026-08-15 — App-like mobile navigation (ADR-033)

- `lib/nav.ts` — `MOBILE_PRIMARY_ORDER` + `mobilePrimaryNav(can)`: ranks the permission-filtered nav by day-to-day use, so the bottom bar shows what _this_ user actually works with (receptionist → OPD/Appointments/Patients; pharmacist → Pharmacy; super-admin falls through to Tenants).
- `components/AppShell.tsx` — renders the shared `BottomNav` (five slots, mobile only) plus a top-right hamburger opening the shared `NavDrawer` with every permitted module. `main` carries `.hms-bottomnav-offset`. The desktop sidebar is untouched and the bar never renders above `md`.

**Testing status:** `typecheck` + `next build` green. **Live-verified at 375px** as CITYCARE org_admin: bar renders the permitted destinations with the active one marked, sidebar hidden, drawer lists all 11 permitted modules, `body` scroll locks while open and restores on close, `data-lenis-prevent` set, focus trapped inside, Esc closes.

---

## 2026-08-15 — Tests for the API feedback classifier

Vitest added (`npm run test -w hms_frontend`), with 12 tests over `lib/feedback.ts` — the layer every API failure passes through (ADR-026). They pin what the user is _told_, which is a security boundary as much as a UX one:

- A 5xx carrying `relation "users" does not exist…` never reaches the screen; generic copy is used instead.
- Stack-shaped messages and bare error codes are rejected as user-facing copy.
- Each status maps to its own title and dedupe key (401 session expired, 403 not permitted, 409 conflict, 429 throttled, 422 check the details).
- Offline and timeout read differently; a thrown non-Error still produces usable copy.
- `successMessage` prefers the API's own message, then the call's copy or formatter, then a verb-appropriate default.

**Testing status:** 12 passed. Root `npm run test` now runs all four workspaces: **106 tests green** (backend 49, `@hms/ui` 27, `@hms/utils` 18, Portal 12).

---

## 2026-08-16 — Every table gets the same Action column, and a tenant accent that survives hover (ADR-039, ADR-040)

**Migrated to the shared Action column** (`actionsColumn()` + `TableActions` from `@hms/ui`), replacing five different presentations of the same idea:

- **Patients** — the old `ActionMenu` became inline `ViewAction` + permission-gated `EditAction`.
- **Branches** — a secondary "Activate/Deactivate" button became a `ToggleAction`, which now **confirms before deactivating** and names the consequence.
- **Users** and **Tenants** — gained an Action column they never had: view, plus an active ↔ suspended `ToggleAction` (permission-gated on users, confirmed when suspending, since it signs the account out).
- **Appointments** — "Check in" and "Cancel" buttons became `TableAction`s; cancelling now confirms, naming the patient, time, and provider.
- **OPD queue** — "Open/View", "Start consult" and "Complete" became icon actions with tooltips, keeping the one-click clinical flow.
- **Pharmacy stock** — "Receive" became a `TableAction` toggling the receive panel.
- **Billing** — an invoice `ViewAction` on every row.
- **Tenant detail → Modules** and **User detail → Roles / Permission overrides** — chip lists whose bare `X` buttons revoked an entitlement, a role, or an override **on one click** are now real DataTables with the shared Action column, and every one of those actions confirms first, naming what the user loses.

**Fixed — tenant branding stopped at rest.** `applyBrandColor` (and the no-flash script) wrote the same hex into `--hms-brand` and `--hms-brand-hover`, so a tenant's accent flattened the moment a control was hovered and had no pressed state at all. Both now set the brand slot only; the token layer derives the rest (ADR-040).

**Testing status:** typecheck + build clean; `@hms/ui` suite 38 passed. Manual cases added to `testcases.md` (ACT-01…ACT-10, BRD-05…BRD-07).

---

## 2026-08-16 — The Portal is the Nirogix Portal (ADR-041, ADR-042)

**Renamed** every user-visible string: the document title, the app-shell wordmark and its "Nirogix Platform" / "Nirogix Portal" context label, the login heading, and the platform-branding screen's copy and panel title.

**Deliberately unchanged:** the `hms_frontend/` directory, the `@hms/*` imports, and the `--hms-*` / `.hms-*` tokens and classes. They are invisible outside the repository and renaming them would touch nearly every file for no user-visible gain (ADR-041).

**Environment URLs.** `.env.example` now spells out `NEXT_PUBLIC_API_BASE_URL` for all three environments (`api.nirogix.com` / `api-staging.nirogix.com` / localhost). The Portal reads its API base from configuration only, which is what lets `api.nirogix.com` move or gain an `id.` sibling later without a code change.

**Testing status:** typecheck + build clean; 12 tests pass.

---

## 2026-08-16 — The Nirogix mark replaces the placeholder squares

The login card and the app shell (desktop sidebar fallback and mobile header) were drawing plain teal squares where a logo belongs. All three now render the shared `BrandMark` from `@hms/ui` — 40px on the login card, 24px in the sidebar, 20px in the mobile header — so the product has an actual mark, drawn from `--hms-brand` and therefore following Dark mode and a tenant accent. A tenant's uploaded logo still wins wherever one exists.

`app/icon.svg` replaces the default Next.js `favicon.ico` (deleted), so a browser tab shows the Nirogix mark instead of the framework's. Tenant branding still swaps the favicon at runtime for that hospital's own.

---

## 2026-08-16 — The System Admin dashboard, rebuilt (ADR-043)

**What changed.** `/platform` went from a column of stat tiles to a dashboard an operator can actually run the platform from: a 6/12/24-month range control driving every series at once, four KPI tiles with sparklines and real month-over-month deltas, a cumulative growth chart (hospitals + staff accounts), monthly onboarding bars with added/suspended counts, module adoption as proportion bars, security activity per day by severity with the recent warning-level audit table beneath it, live API and database health, and a quick-action list.

**Every tile is a query.** Growth comes from the new `GET /admin/trends`, which derives monthly series from each record's own `created_at` and seeds the cumulative from everything created before the window. Adoption reads live entitlements, security reads the audit trail, health calls the API's own liveness and readiness probes. A period with no rows renders a zero — nothing is interpolated, and the metrics with no data source (revenue, subscriptions, storage, uptime history, support tickets) are still listed as pending on the screen rather than drawn.

**Navigation is grouped now** (`PLATFORM_NAV_GROUPS` / `TENANT_NAV_GROUPS`, rendered by the sidebar and the mobile drawer): Customers · Platform · Account for an operator, Clinical · Revenue · Organization · Account inside a hospital. A group whose every item is denied disappears rather than heading an empty list. Adding a platform capability is now adding a group member, not redesigning a flat menu.

**Fixed on the way:** `/dashboard` was rendering a second, weaker platform dashboard **plus** the clinical quick links ADR-037 exists to prevent. It is the hospital's dashboard only; a platform operator is redirected to `/platform`, except inside a support session where the tenant's view is the point.

**Testing status:** typecheck + build clean; verified against the running stack signed in as the platform owner — the range control re-queries, the growth series matches the seeded tenants, module adoption reads 2-of-2 hospitals, health probes report operational, and `/dashboard` redirects.

---

## 2026-08-16 — One dashboard layout for every role (ADR-044)

**Added a shared dashboard layout** (`components/dashboard/DashboardShell`) — context line, title, range chips, KPI grid, panel rows, panel rows and empty states — and rebuilt every hospital dashboard as a _configuration_ of it, matching the shape `/platform` already used.

- **Hospital admin** (`HospitalAdminDashboard`): revenue billed vs collected per day, today's OPD load by hour split scheduled/walk-in, doctors on duty with seen/booked, low stock, registrations per day, capacity bars, quick actions.
- **Clinical roles** (`ClinicalDashboard`): doctor, receptionist, pharmacist and lab technician from **one** component parameterised by role — same skeleton, different work. Each fetches only what its own panels show.
- **Everyone else** (`StaffDashboard`): degrades to what the user's permissions actually reach.
- **Which one you get is permission-derived, not role-name-derived** — a hospital can rename its roles; what someone may do is the truth.

The reference design's bed board, IPD admissions, theatre list, department table and approvals queue are deliberately absent: there is no in-patient, theatre, department or approval model in the product, and drawing them would be inventing data (ADR-043).

**Shell scrolling fixed.** The sidebar is now `sticky top-0 h-screen overflow-y-auto` with `data-lenis-prevent`, so a long menu scrolls **inside itself** rather than dragging with the page; the topbar sticks as well. Sidebar sections gained an "Overview" label and a hairline divider above each group, so Overview / Clinical / Revenue / Organization / Account read as separate blocks.

**Two defects found and fixed while verifying:**

1. **`tryRefresh()` was not de-duplicated.** A dashboard fires several requests at once, so one expired access token produced one `POST /auth/refresh` per request; each rotated the same `sessions` row in its own transaction, serialised on that row lock, and drained the connection pool until everything timed out. Refreshes now share one in-flight promise. The server-side half is logged in `BACKLOG.md`.
2. **The staff fallback listed routes the user could not open** — every tenant nav item rather than the permitted ones, so a cashier saw Pharmacy, Users and Branches links that would only 403.

**Testing status:** typecheck + build clean; verified against the running stack as four different users — hospital admin (Ananya), doctor (Rajesh), pharmacist (Meena) and cashier (Pooja) — each landing on the right dashboard with real seeded figures (₹820 billed / ₹500 collected / ₹320 outstanding over 14 days).

---

## 2026-08-16 — Print prints the document, and one date/time standard (ADR-046, ADR-047)

**Printing was printing the application.** The invoice and lab-report screens called `window.print()` on themselves, so the output carried the sidebar, topbar, page header, collect-payment form and the table's action buttons — a screenshot of an interface, not a document a hospital can hand to a patient.

**Added `app/(print)/`** — an authenticated route group with **no application shell**, so what you see on screen is exactly what prints. `/print/invoice/[id]` and `/print/lab-order/[id]` today; a new document is a template under the same group. Both screens' Print buttons now open the document instead of the browser dialog. Deliberately not a `@media print` rule on the app pages: the shell would stay in the DOM, screen styles would keep leaking, and nobody could see the real output until it printed.

Documents are built from the new `@hms/ui` kit (`PrintDocument` + sections, fields, tables, totals, signatures, notes) which owns A4 geometry, repeating table headers across pages, break-avoidance and the footer. Structure is per document type: the invoice has line items, totals, payments and a receipt note; the lab report has results with reference ranges, an interpretation note and a verifying signature.

`components/print/useDocumentBrand.ts` resolves the hospital's own name, logo and accent from `GET /branding/current` (RLS-scoped, so one tenant's identity can never reach another's paperwork), falling back to the Nirogix default when nothing is configured. Printing waits for it. The route carries the same `RequirePermission` and reads the same endpoint as the screen — a user cannot print what they could not open.

**Date and time have one standard now** (ADR-046, superseding the time half of ADR-030): `DD/MM/YYYY`, `hh:mm AM/PM`, and `DD/MM/YYYY, hh:mm AM/PM` together. `@hms/utils` still owns formatting; `DateDisplay` / `TimeDisplay` / `DateTimeDisplay` in `@hms/ui` own rendering and emit `<time datetime>` with the ISO value. The two chart-axis abbreviations moved into the same utility (`formatMonthLabel`, `formatDayLabel`) so no module hand-rolls a date format — the dashboard's long-form context line became `Sunday · 16/08/2026`.

**Testing status:** typecheck + build clean, 150 tests pass. Manual cases DOC-01…10 and FMT-01…06 added.

---

## 2026-08-16 — Every date and time input is now the shared field (ADR-048)

The six native controls are gone: date of birth on patient create and edit, batch expiry in pharmacy stock, the reports From/To range, and the appointment date-and-time. Each is now `DateField` or `DateTimeField` from `@hms/ui`, so the `DD/MM/YYYY` standard holds at the keyboard and not only on the screen — a native `<input type="date">` renders in the browser's locale, which is how the same field ends up reading `08/16/2026` on someone else's machine.

The migration also added the bounds each field always needed: a date of birth cannot be in the future, a batch cannot expire before today, and the reports range cannot invert.

The shadcn scaffolding the CLI generated in `components/ui/` (calendar, popover and its own Button) was deleted after the components were promoted into `@hms/ui` — regenerable, and a second Button next to the kit's is exactly what ADR-028 rules out. `react-day-picker` and `date-fns` moved out of this app's dependencies with it.

**Testing status:** typecheck + build clean.

## 2026-08-16 — Settings becomes the Hospital Configuration console (ADR-049)

**What:** `/settings` was a theme toggle sitting next to a colour picker. It is now the console a hospital's administrator sets the hospital up from: a tab layout (Setup overview · Hospital information · Branding · Enabled modules) over `/settings`, `/settings/organization`, `/settings/branding` and `/settings/modules`, gated on the new `platform.organization.manage`.

The overview shows derived progress and a checklist. Each step reports its real count ("Done · 2"), a step whose dependency is unmet says what it is waiting on instead of hiding, and a step the user is not permitted says so rather than offering a dead link. Below it, a grid links to the areas that already have their own screens — branches, providers, users, the lab test master, the drug master. **Nothing is reimplemented here**: the console is how those are found, not a second copy of them, and no tab exists for departments, services, packages, treatment plans or wards, because the product has none.

The same status feeds a dashboard card that names the next step and removes itself once setup is complete, so it never becomes permanent furniture.

Printed documents now carry the hospital's address, phone, registration number and GSTIN: `useDocumentBrand` fetches branding and the organization profile together and passes `contactLines` straight into `PrintDocument`, which already had the slot. Nothing is invented — an unconfigured hospital still prints name and logo only.

**Moved:** the theme switch to `/profile`. A theme is one person's preference, not the hospital's configuration, and leaving it in Settings is what made that page read as a drawer of unrelated switches.

**Found while building it:** `text-success` had never worked. `--hms-success` exists in `@hms/ui` but was never mapped into Tailwind's theme in `globals.css`, so the class generated nothing — the billing page's paid/outstanding total had been rendering in the default colour. Mapped `--color-success` and `--color-success-subtle`.

**Testing status:** typecheck clean; 12 frontend tests pass. Backend contract verified live against the seeded tenants (see `hms_backend/DONE.md`). Manual cases SETUP-01…SETUP-24 added to `testcases.md`.

## 2026-08-16 — Departments in the Portal (ADR-050)

**What:** `/departments` — the Standard DataTable with code, department, branch, head of department, doctor count and status; a create form whose branch and head pickers offer only this hospital's own records; and a single row action. That action is a **toggle, not a delete**: departments are never deleted because visits reference them, and the confirmation states how many doctors are attached so the effect is visible before it is accepted.

Joined the sidebar's _Organization_ group and the Hospital Configuration console's area grid. Check-in gained a department picker that offers **active departments only** — the server refuses a retired one regardless, so the form simply never presents an invalid choice.

**Testing status:** typecheck clean, `next build` clean (`/departments` prerendered), 12 frontend tests pass. Lint reports the repo-wide `react-hooks/set-state-in-effect` on the data-loading effect — the same shape every other Portal list page has, and tracked in `BACKLOG.md` as repo-wide debt rather than solved differently on one screen. Manual cases DEPT-01…DEPT-21 added to `testcases.md`.

## 2026-08-16 — The Portal is a hospital application again (ADR-051, BACKLOG F-1)

**What:** Every platform-operator surface left this app. Removed: `/platform`, `/admin/tenants/*`, `/admin/branding`, `PlatformBrandingPanel`, the platform half of `lib/nav.ts` (`PLATFORM_NAV_GROUPS`, `isPlatformOperator`, `navForContext`, `navGroupsForContext`), the platform-operator branch in `AppShell` and the `/platform` redirect on the dashboard, plus every platform-administration function in `lib/api.ts` — tenant onboarding, module provisioning, platform analytics, support-session minting and the platform-branding writes.

The point is not tidiness: while those lived here, a platform operator and a receptionist shared a JavaScript bundle, so operator code shipped to every hospital and a change to one could regress the other.

**`navGroupsForContext` became `navGroupsForUser`.** There is no context to switch between any more — the Portal always renders the hospital's navigation, including for an operator inside a support session, which is exactly right: they are working as a hospital user and the banner says so.

**What stayed, and why:**

- **`/support/enter`** — it _receives_ a support session the admin console mints. Its origin check is no longer `window.location.origin` (the sender is now a different origin); it accepts only `NEXT_PUBLIC_ADMIN_ORIGIN`, in the new `lib/adminOrigin.ts`.
- **`getPlatformBranding`** — a public GET the Portal uses at bootstrap to apply the platform default before tenant branding. Only the writes are operator-only. This was removed by mistake and restored when the typechecker caught `BrandingLoader`.
- **The support-session banner** in `AppShell` — an operator inside a hospital is in _this_ app, so the banner belongs here.

**Testing status:** typecheck clean, `next build` clean (31 routes, `/support/enter` present, no `/platform` or `/admin/*`), 12 tests pass.

## 2026-08-16 — Hospital identity, letterhead, and the patient-registration QR (ADR-056)

**What:** Three additions to the Hospital Configuration console plus the front desk's review queue.

**Hospital information** gained the public identity fields (display name, alternate phone, patient support email) alongside the registered ones. The form itself was extracted to `components/settings/ProfileForm.tsx`, because the letterhead screen edits the same record and a second copy of the load/dirty/save/partial-update logic would have been the drift the reusable-UI rule exists to prevent. Each screen declares the subset of fields it owns and sends only those, so saving a letterhead can never blank an address the administrator was not looking at.

**Letterhead** (`/settings/documents`) — header line, footer text, default signatory and designation, with a preview of where each lands on a page. Wired through `useDocumentBrand` into `PrintDocument`, which gained `headerLine`, `footerLine` and an **opt-in** `useDefaultSignatory` per signature line. Opt-in matters: an invoice has the patient's signature line beside the hospital's, and printing the Medical Superintendent's name over the patient's would be worse than printing nothing.

**Patient registration** (`/settings/registration`) — the QR rendered client-side from `qrcode` at 512px with high error correction and no centre logo, because this ends up photocopied onto a poster and a decorated QR that fails to scan is worse than a plain one that works. Copy link, download PNG, print a poster (its own minimal window, per ADR-047's principle — the document, not the app), preview, and a confirmed regenerate that says plainly that every printed poster stops working. The QR is held **with the URL it encodes**, so a regenerated token can never briefly show the retired code beside the new link.

The screen is emphatic about one thing: nothing is added to the patient list automatically. If it implied otherwise, a hospital would reasonably expect scanned strangers to appear in its records.

**Review queue** (`/patients/registrations`, Clinical → Registration requests) — a Standard DataTable configuration with approve/reject through `TableAction` and the shared confirmation. Approving routes straight to the new patient, because the desk almost always corrects something typed on a phone.

**A permission bug caught in review, not by a test.** The queue was gated on `patient.record.create` end to end. `org_admin` does not hold it — so the administrator who turns registration on, prints the QR and puts it on the wall got no nav item and no screen. Reading the queue is now `patient.record.view`; approving and rejecting stay `patient.record.create` and their buttons simply do not render without it. The lesson is the ordinary one: the person who _configures_ a feature and the person who _works_ it are often not the same, and gating the whole screen on the working permission hides it from the configurer.

**Also:** `Textarea` added to `@hms/ui` (there was no multi-line field), and `packages/client/tsconfig.json` gained the `jsx`/`DOM` settings it always needed — `npm run typecheck` had been failing there since the package was created.

**Testing status:** typecheck clean across the monorepo, `npm run build` clean (all six workspaces; `/settings/documents`, `/settings/registration` and `/patients/registrations` present). Verified live against a running API for `org_admin` and `receptionist` in two tenants.

## 2026-08-16 — Three fixes from a look at the running Portal

**Every table's heading was misaligned with its own column.** Reported against Patients → Age, but it was in the shared DataTable and therefore everywhere: the `align` class landed on the sort control inside the `th` rather than on the `th`, so cells moved and headings did not. Fixed in `@hms/ui` — one change, every table.

While there, the columns using `align: "right"` were audited against what right alignment is _for_ — magnitudes a reader compares down a column. Money and stock counts keep it. **Age**, **Duration**, the audit **Status** code and the printed lab **Result** value move to the default left: each is a label that happens to contain a digit, and reads better next to its heading. `resources/rules.md` now states the rule so the next column does not have to guess.

**Two nav items lit up at once.** `/patients/registrations` is a prefix match for both _Patients_ and _Registration requests_, and the active test was a plain `startsWith`. `activeNavHref` in `lib/nav.ts` now picks the **longest** matching href, so the specific destination wins while `/patients/{id}` — which has no item of its own — still highlights _Patients_. Sidebar, bottom bar and drawer all derive from it.

**The QR is the hospital's colour, and the poster is a real document.** The code is drawn in the tenant's accent through `ensureContrast` from `@hms/utils`, which darkens a pale accent until it scans while keeping its hue — a QR is read by a camera off a photocopy, so a colour that looks right and does not scan is worse than no colour at all. Light modules stay pure white; narrowing the reflectance difference would buy nothing anyone would notice.

The Print poster action now opens **`/print/registration-qr`**, a route under `(print)` built from the document kit, carrying the hospital's logo, name, address and accent from the same `useDocumentBrand` an invoice uses. It replaces a `window.open` with hand-written HTML that I should not have written — ADR-047 says print prints the _document_, and that popup was a printed screenshot with none of the hospital's identity on it. The route reads the registration settings itself under `platform.organization.manage`, so **no token travels in the URL**, and `useRegistrationQr` is shared by the screen and the poster so a preview cannot differ from the paper.

**Testing status:** typecheck and build clean (`/print/registration-qr` present); 31 `@hms/utils` tests (11 new), 68 `@hms/ui`, 119 backend. 12 new manual cases in `testcases.md` (QR-27…QR-32, TBL-01…TBL-04, NAV-01…NAV-03).

## 2026-08-16 — The dashboard setup reminder is dismissible

**What:** A close control on _Finish setting up your hospital_. The card already removed itself once setup was complete; what was missing was a way to say "not now" — and a nudge that cannot be dismissed stops being a nudge and becomes furniture.

Three decisions worth recording:

- **Keyed by user id, not by browser.** A shared reception machine is the normal case in a hospital, and one person hiding a reminder must not hide it from whoever signs in next.
- **`localStorage`, not the database.** This is a view preference on one device that changes nothing anyone else can see — the same reasoning the theme preference already uses. It does not deserve a column, a migration, or a call on every dashboard load.
- **`useSyncExternalStore`, not an effect.** Storage is genuinely an external store: reading it this way keeps the server render honest (it has none, and says so) rather than papering over a hydration mismatch, and it means dismissing in one tab hides the card in another — which is what someone with the dashboard open twice expects.

Dismissing hides the _reminder_, never the work: the full checklist stays under Hospital configuration, which is in the sidebar, and the close control's tooltip says so. An in-memory fallback covers a browser with storage disabled, so the click always does something visible — swallowing it silently would be worse than not offering the button.

**Testing status:** typecheck, lint and build clean. Six manual cases added (`SETUP-D1`…`SETUP-D6`), including the per-user and cross-tab behaviour. Not verified in a running browser — the card needs an authenticated org_admin session, and I do not sign in on the user's behalf.

## 2026-08-16 — Local ports reassigned across all five frontends

**What:** `.claude/launch.json` changed, so everything that names a port changed with it.

```
marketing  3001 → 3000      patient   3003 → 3002
portal     3000 → 3001      admin     3002 → 3003
aiportal   3004 (unchanged)  api      4000 (unchanged)
```

Two pairs **swap**, which is the part that matters: a sequential find-and-replace would have applied each substitution twice and silently produced garbage. Every file went through placeholder tokens so the swap was atomic.

**A port belongs to the application, not to the environment.** It is pinned in that workspace's `dev` **and** `start` scripts, mirrored in `.claude/launch.json`, and matched by the Nginx upstreams in `deploy/`. Changing one without the others gives a preview tool that watches the wrong port, or an Nginx that proxies to nothing. All four now move together, and `README.md` and `domains.md` say so.

**The bug this would have caused if only `launch.json` had changed:** `hms_frontend/lib/origins.ts` defaults `ADMIN_ORIGIN` to `:3002` and `PATIENT_ORIGIN` to `:3003` — exactly the two that swapped. The Portal would have accepted a support-session handover from the _patient_ app's origin and printed QR posters pointing at the _admin_ console. `aiportal/lib/links.ts` had the same shape for portal and marketing.

26 files updated mechanically, then hand-tidied where the swap left tables out of numeric order.

**Deliberately not touched:** `DECISIONS.md` and every `DONE.md`. Both are append-only records of a point in time, and ADR-051's table shows the ports as they were decided. `resources/domains.md` now carries a dated note saying it is the authority, so a reader who meets an old number in the history knows where truth lives.

**Also fixed while in there** — all five per-app `README.md` files were `create-next-app` boilerplate claiming port 3000, which was already wrong for four of them before today; the root `README.md`'s application table, single-app commands and project layout still listed only two frontends, from before ADR-051.

**Testing status:** typecheck, build and tests clean across all six workspaces (119 backend, 73 `@hms/ui`, 31 `@hms/utils`, 12 `@hms/client`). `patient/.next` had a truncated generated `routes.d.ts` from an interrupted dev server and was deleted — a build artifact, unrelated to this change.

## 2026-08-17 — Correction paths on the tables that lacked them (ADR-060)

**What:** ADR-060's rule is that a record which can be displayed incorrectly must have a permitted, safe way to be corrected. An audit against that rule found two real gaps:

- **Patients** had View and Edit but no way to retire a record. Added **deactivate/reactivate**, never delete — a patient row is referenced by visits, prescriptions, lab orders and invoices, and destroying it would orphan a clinical history the hospital is obliged to keep. The confirmation says exactly that: the record and everything attached to it stays, it is hidden from day-to-day lists, and it can be reactivated.
- **Users** had View and suspend but no way to fix a misspelled name. Added **Edit**, routing to the existing user page rather than a second form in a dialog — one editing surface per record.

Both use the existing `updatePatient` / `updateUser` endpoints, so the server re-checks permission regardless of what the row rendered, and both changes are audited like any other update.

**A correction to my own audit.** I first reported that `appointments` and `pharmacy/stock` had _no row actions at all_. That was wrong — I had grepped for `TableAction ` with a trailing space and missed every generic action. They have Check in / Cancel and Receive stock respectively. The real gaps were the two above, plus edit-in-place for `branches` and `departments`, which is still open because it needs a `Dialog` primitive `@hms/ui` does not yet have.

**Testing status:** typecheck and build clean across all six workspaces. The two lint warnings on these files are the pre-existing repo-wide `set-state-in-effect` on data-loading effects, already recorded in `BACKLOG.md`.

## 2026-08-17 — Edit-in-place for branches and departments (ADR-060)

**What:** Both tables had Toggle only — a branch or department entered with a typo could be deactivated but never corrected, which is exactly the failure ADR-060 exists to prevent.

`components/EditRecordDialog.tsx` is the shared edit surface for a **simple** record: fields are declared rather than hand-built, so every edit dialog validates the same way, reports failures through the shared toast, disables Save until something actually changed, and **sends only the fields the user altered** — a partial update can never blank a column the dialog does not show. A record with sections or clinical content still gets a page; the choice is made per table.

**What is deliberately not editable.** `code` on both. It identifies the record in check-in routing, in exports, and in any integration a hospital has built on top, so renaming one silently re-points all of them — that is a migration, not a correction. A department's head and specialty stay on the create form until `@hms/ui` has a `Select`; a free-text box for a foreign key would be worse than the current gap.

**Testing status:** typecheck and build clean; the dialog's behaviour was verified in a running browser (see `packages/ui/DONE.md` for what was checked, including the focus bug it surfaced).

## 2026-08-17 — Dashboards link to their records; patients filters run server-side (ADR-062, ADR-063)

**Every KPI tile with a real destination now navigates.** Across the hospital-admin, clinical (doctor / receptionist / pharmacist / lab) and staff dashboards, tiles like "In the queue now", "Collected", "Outstanding", "Lab results pending" and "Registered today" link to the OPD queue, Billing, the laboratory worklist and today's registrations — each with an accessible name that says where it goes. Tiles with no genuine destination ("Seen today") stay plain, per ADR-062.

**Patients filters the whole dataset, not the page.** The table's gender/status/city facets and a new registration date-range (`DateRangeFilter`) now reach the API — `listPatients` sends them and the backend applies them — so a selection narrows every page, not just the rows on screen. `defaultHidden` audit (ADR-063): the patient **Registered** column, audit **Severity**, registration **Email** and pharmacy **Reorder** are visible by default again; only the registration free-text note stays hidden, now with a stated reason in the config.

**Testing status:** typecheck and build clean; the DataTable + StatCard behaviour is covered by `@hms/ui` unit tests and the patient filters by backend tests (against a real DB). A live browser pass was not run — it needs the full stack plus a seeded login, and the `.claude/launch.json` ports are mis-mapped (tracked in BACKLOG).

## 2026-08-17 — Appointments, billing and audit filter through the shared faceted filter (ADR-063)

Each of these tables carried a bespoke status/severity `<select>` beside a `filterable` column that did nothing in server mode. They now use the **one** faceted filter (with predefined `filterOptions` so the closed enum shows in full), routed through `server.filters` to the API — so the control is multi-select, server-side, and identical to every other table. The bespoke selects and their separate state are gone. Appointments' **provider** facet was removed rather than half-wired: it filtered by display name, not id (a proper `providerId` control is tracked in BACKLOG).

**Testing status:** typecheck and build clean; the wiring is covered by `@hms/ui` and backend tests.

## 2026-08-17 — Billing gains an invoice-total amount filter (ADR-063)

The billing table now carries a `NumberRangeFilter` for invoice total: the user enters rupees, the page converts to paise, and `GET /invoices` narrows on `amountFrom`/`amountTo` server-side. This completes the ADR-063 filter set (facets, date-range, amount-range).

**Testing status:** typecheck and build clean; `NumberRangeFilter` is covered by `@hms/ui` tests.

## 2026-08-17 — Shared page header; End-of-day report (#1, #2)

**Page header consolidated.** The Portal's `PageHeader` is now the shared `@hms/ui` one (the local file re-exports it), and `DashboardShell` renders it too — so the role dashboards' title block matches every other tab instead of its old bigger, context-above-title layout. `/reports` gained the description it was missing.

**End-of-day report.** The hospital's **EOD report** — one day's operating picture: a date (default today), tiles for visits / collected / payments / labs-still-pending, and the visit register plus the day's collections, exportable to CSV. It sits in **Revenue → EOD report** beside Reports (`/reports/eod`, so it highlights on its own route via the longest-match rule), gated by the same `reports.view`. Built on the existing report endpoints with `from === to === the day`, so it invents no metric the platform cannot already produce; uses the shared `PageHeader`, `StatCard`, `DataTable`, `DateField`.

**Testing status:** typecheck and build clean (`/reports/eod` prerendered); the report endpoints are covered by backend tests.

## 2026-08-17 — Page-header/action CTAs on the shared Button

Normalized the remaining raw `hms-btn` class usages in Portal app code onto the shared `<Button>`, so a button's size/padding comes from the component, not from per-page classes. The role dashboards' primary action (`PrimaryAction` in `ClinicalDashboard`, "Register patient" in `HospitalAdminDashboard`) were `hms-btn--sm` links inside the page-header actions slot — smaller than every other page's `<Button>` CTA; they now use the shared `<Button>` (md) via `<Link><Button>`. The 404 page's two links moved onto `<Button>` / `<Button variant="secondary">` the same way. No raw `hms-btn` class usage remains in Portal app code (the shared `@hms/ui` primitives that own the class internally are unchanged).

**Testing status:** typecheck and build clean.

## 2026-08-17 — Documents settings: letterhead image, page size, unified preview (ADR-065)

`/settings/documents` is now one cohesive screen (fetches the profile once, no longer via `ProfileForm`): a **Letterhead image** card (upload / preview / replace / remove through `uploadLetterheadImage` / `removeLetterheadImage`), a **Page size** segmented radiogroup (A4 / A5 / US Letter / US Legal) and the existing letterhead text fields saved together, and a live **Preview** that shows the image (or the text header) on a page whose aspect ratio matches the selected size. `useDocumentBrand` now passes `letterheadImageUrl` + `pageSize` to every print document, so the choices reach invoices, receipts, prescriptions and reports with no per-page change.

**Testing status:** typecheck clean. Verified live in the Portal (CITYCARE): the letterhead image loads, the page-size selector re-shapes the preview (A4→US Legal `216/356`), and an invoice print document renders the letterhead band with the injected `@page` size.

## 2026-08-17 — The clinical workflow wired end-to-end in the Portal (ADR-066)

- **Consultation** (`opd/[id]`): prescriptions pick from the **drug master** (datalist; stock + price hint; free text still allowed) and lab orders from the **test master** (price + "billed at sample collection" hint) — rows round-trip their ids so a re-save updates in place, and a row the pharmacy/lab has progressed renders locked with its status. Added the missing **route** and **instructions** inputs. A **Past consultations** panel shows the patient's earlier signed encounters. Opening an unpaid visit now shows a **Payment pending** panel with the balance and a Collect payment link instead of a bare error.
- **OPD queue**: row actions send the visit's `version` (no more silent clobber); a **"My patients only"** toggle (default on for clinicians who don't run the front desk) drives the server-side `mine` filter.
- **Check-in**: the fee field is blank-by-default — blank charges the doctor's configured fee (named in the hint and in the provider dropdown); typing overrides. Inactive doctors are no longer offered.
- **Patients**: registration catches the `DUPLICATE_PATIENT` 409 with a dialog — "Use this patient" (navigates to the chart) or "Register anyway"; the QR-approval queue gets the same dialog plus **"Link this chart"** (approves against the existing patient). The record page honours `?edit=1` (the list's Edit action finally lands in edit mode) and gains a permission-gated **History** section (visits, consultations, invoices, lab orders). Fixed: Deactivate sent `inactive` (the API's state is `archived`) — every deactivation from the list 400'd.
- **Providers**: the read-only table became real management — **Add doctor** (details, fee, optional login link for the personal queue, first specialty + department), **Edit**, **Assign specialty**, **Deactivate/Reactivate** — the required "Doctors & specialties" setup step is finally completable from the UI.
- **Pharmacy**: the dispense card pre-selects the exact prescribed drug by id when the prescription is master-linked; the name heuristic only covers free-text prescriptions.
- Cleanup: dead `/admin/tenants` entry dropped from `MOBILE_PRIMARY_ORDER` (ADR-051 moved it out of this app).

**Testing status:** typecheck and `next build` clean. Manual end-to-end pass in the browser (17/08/2026) across the real role logins — receptionist registered + checked in (fee from the provider default), cashier was refused an overpayment then settled ₹500 cash, doctor saw only their own queue, was gated until payment, consulted with master-linked rx + CBC order, signed; pharmacist dispensed the pre-matched drug once; lab tech collected (₹300 billed at collection), entered 3500 → auto-flagged **low**; cashier settled the final ₹820 invoice (consultation + pharmacy + lab, two cash payments); the patient record shows the completed visit and paid invoice in History. Backend API journey suite covers the same flow for two patients (see `hms_backend/DONE.md`).

## 2026-08-17 — Workflow extensions in the Portal + patient app (ADR-067…070)

- **Services** (`/services`): catalogue DataTable + create/edit dialog + deactivate; **Billing**: "Add item" on the invoice (catalogue = server-priced select, or custom line) and "New invoice" (patient search + line editor) — manual billing finally has a UI.
- **Referrals**: consult page gains a "Refer to a department" card (department/doctor/reason + this visit's referrals with status); `/referrals` worklist with Check in (prefills and locks the patient via `?referralId=`) and Cancel; check-in shows the referral banner and sends `referralId`.
- **Rosters**: providers page "Weekly schedule" dialog (windows editor, HH:mm wall-clock, overlap-checked, save-disabled until loaded so a failed load can't wipe a roster); appointment booking shows **free-slot chips** when the doctor has a roster (required pick) and stays free-form when not.
- **Online booking**: `/settings/booking` (toggle, public link + branded QR, poster print `/print/booking-qr`, regenerate, pending count); `/appointments/requests` review queue (approve dialog with provider + date + slot chips or HH:mm fallback, DUPLICATE_PATIENT link/create dialog, reject with reason); patient app gains the public `(public)/book/[token]` form mirroring registration. QR drawing extracted to one shared `usePublicQr`.
- **Laboratory**: optional report file attach on result entry (uploads via the file module), "Verify report" for `laboratory.result.verify` holders, verified badge, Attachment download.
- **Pharmacy stock**: supplier select on receive, Suppliers card (add/deactivate), per-drug "Adjust stock" dialog (signed delta + reason; server errors keep the dialog open), Recent corrections ledger card.
- **Consultation**: "Print prescription" on signed encounters → `/print/prescription/[visitId]` (letterhead Rx document via the print kit, read-only endpoint); **AI draft** button (renders only when the deployment reports the capability; drafted rows land in the same editable form, with the caution note shown); **Dictate** buttons on complaint/SOAP via the browser speech engine (hidden when no engine).
- Nav: Referrals, Services, Booking requests; settings tab for Online booking.

**Testing status:** typecheck + `next build` clean for hms_frontend and patient; backend suite 150 green (see backend DONE). Browser smoke on the new screens: services catalogue rendered the seeded rows; "Add item" put a server-priced ₹50 Injection line on a paid invoice (status recomputed to partially paid, then settled); referrals and booking-requests pages render with correct role gating (cashier 403 on referrals by design). Full role-by-role browser pass of the new flows is queued in testcases.md (§11a/§11b + new BIL/LAB/PHR/EMR rows).

## 2026-08-17 — Deduplicated the public-surface settings + posters (clean-code gate)

The booking settings screen and poster had shipped as line-for-line copies of the registration ones (~420 duplicated lines across four files). Extracted the shared mechanics into `components/settings/PublicAccessPanel.tsx` (toggle / pending badge / QR preview / copy / download / print / preview / regenerate, both confirmations) and `components/print/PublicQrPoster.tsx` (the poster document: permission-scoped settings read, brand, disabled/loading states, QR layout). All four routes are now thin configurations supplying only their words, API calls and QR hook — the third token-fronted surface, if one ever ships, is a config file. `usePublicQr` already carried the shared QR drawing.

**Testing status:** typecheck + `next build` clean; both settings pages and both poster routes verified rendering in the browser as org_admin — identical behaviour from the single implementation.

## 2026-08-17 — Lab-report uploads folder by category (ADR-007)

`api.uploadFile(file, category?)` now takes an optional storage category and appends it as `?category=`; the lab result-entry attachment passes `lab-reports` so report files land in that folder in R2. No behaviour change otherwise (branding/letterhead uploads already carry their category server-side). Typecheck + build clean.

## 2026-08-18 — Dev/staging quick-login test-user switcher, absent from production (issue #7)

The sign-in page (`app/(auth)/login/page.tsx`) gains a **Quick login** panel (`components/auth/QuickLogin.tsx`) for non-production environments: a list of the DEVELOPMENT-seeder accounts (Platform Owner, CityCare's org/branch admin + doctor / reception / pharmacist / lab / cashier, and a second hospital SUNRISE for cross-tenant testing) as cards showing **Role · email · organization**. Clicking one fills the visible orgCode / email / password fields and submits through the **same** `useAuth().login` path the form uses — no second authentication mechanism, no weakened auth, just a pre-fill over the normal API.

- **Single source, no hardcoded real credentials.** The list lives in `lib/devUsers.ts` and mirrors the dev seeder; every value is a known **synthetic** dev credential — emails use the RFC-2606 reserved `.example` TLD (can never be a real address) and the password is the seeder's published dev default (`NEXT_PUBLIC_DEV_LOGIN_PASSWORD` overrides it). No production or real credential appears anywhere.
- **Off by default; environment-gated by an explicit build flag, not `NODE_ENV`.** `NEXT_PUBLIC_ENVIRONMENT` must be `local` / `development` / `staging` to enable it; `production`, any other value, or unset → disabled. We deliberately do **not** key off `NODE_ENV` because `next build`/`next start` run with `NODE_ENV=production` on staging too, so it can't tell staging from production — the explicit flag can.
- **Credentials are physically absent from a production build, not merely un-rendered.** `NEXT_PUBLIC_ENVIRONMENT` is inlined as a string literal at build, so `QUICK_LOGIN_ENABLED` constant-folds; `DEV_USERS` is built as `QUICK_LOGIN_ENABLED ? [ …accounts… ] : []`, which minifies to `[]` in a production build — the whole account array (and its credential string literals) is dropped by dead-code elimination. Double-gated: `QuickLogin` also returns `null` when disabled.

**Testing status:** typecheck clean. **Production-safety verified by grep**: built with `NEXT_PUBLIC_ENVIRONMENT=production` (clean `next build`) — `ChangeMe#123`, the `.example` emails, and the "Dev only" marker are **absent** from `.next/static` and `.next/server` (excluding `.map`/cache). Symmetric check: the same grep with `NEXT_PUBLIC_ENVIRONMENT=staging` finds them **present** (feature enabled), proving the gate is value-sensitive. Browser-verified earlier in local: one-click login as Doctor landed on the dashboard as the seeded doctor, and switching to Pharmacist re-authenticated correctly as the pharmacist — multi-user switching works.

## 2026-08-18 — Standardized to three environments; retired `local` → `development` (ADR-071, issue #9)

The project now recognises exactly three environments — **development | staging | production** — with `NEXT_PUBLIC_ENVIRONMENT` as the single build-time marker for every frontend. The legacy `local` value is retired in favour of `development` (the dev machine still runs on `localhost` — a host, not an environment).

- **Quick-login gate** (`lib/devUsers.ts`, `app/(auth)/login/page.tsx`): now `=== 'development' || === 'staging'` (dropped the `'local'` arm). Still **inline literal comparisons** so the credential array constant-folds out of production builds (issue #7) — re-verified: `production` build drops `ChangeMe#123`, `development` build keeps it (switcher works on the dev machine).
- **`.env` / `.env.example`** (`hms_frontend`, `marketing`): `NEXT_PUBLIC_ENVIRONMENT=development`, with comments naming the three environments and what each turns on. `marketing` now declares the marker it reads for the staging `noindex`. The other apps' `.env` headers reworded `local development` → `development environment`.
- **Dev-time validation**: `devUsers.ts` warns (development only, folds away in production) if `NEXT_PUBLIC_ENVIRONMENT` is set to a non-canonical value.

**Testing status:** hms_frontend typecheck clean; `production` build → dev credentials absent, `development` build → present (both re-verified by grep). If a Portal dev server is already running it must be restarted to pick up the `.env` change (build-time inlined).

## 2026-08-18 — Quick-login moved into a modal; login form stays compact (issue #10)

The dev/staging quick-login was a list rendered under the sign-in form, which made the page long and scrollable. It is now a single compact **"Test credentials"** button (ghost, below Sign in) that opens the shared `@hms/ui` `Dialog`:

- The modal shows a **"Development only"** badge and the seeded accounts as a responsive card grid (1 col mobile, 2 desktop). Each card shows **Role**, the **email** (mono), the **organization · org code**, and a "Use this account" affordance.
- Choosing a card **fills** the existing sign-in form (org code, email, password) and closes the modal — it does **not** auto-submit. The form then shows a subtle "Filled with <Role> · <email>. Review and sign in." confirmation (hidden the moment a field is edited), and the user signs in with the normal button. Same one auth path as before; no second mechanism.
- Built on the shared `Dialog` (portal, background scroll-lock, focus-trap, Esc/backdrop close, focus return) so it matches the design system and behaves correctly on desktop and mobile.
- Still gated to `development`/`staging` and absent from production (issue #7 / ADR-071): re-verified a `production` build drops the credentials from `.next/static` + `.next/server`.

**Testing status:** typecheck clean; `production` build → credentials absent (re-verified). Browser-verified in the Portal: the form is compact, the button opens the modal with all eight seeded cards, selecting **Doctor** filled the form + closed the modal + showed the confirmation without submitting, and the normal Sign in then authenticated as Dr. Rajesh Gupta (doctor@citycare.example).

## 2026-08-18 — Removed stylistic em dashes from user-facing copy, platform-wide (issue #11)

Swept every app and the backend for em dashes (—) used as sentence/phrase separators in user-facing text (the style that reads as AI-generated) and replaced them with natural punctuation (period, comma, or colon), rewriting minimally so each string reads naturally. About **126** strings across: hms_frontend (~84 — toasts, empty states, form hints, print docs, dialog titles `Title — {x}` → colon, dashboard aria labels `stat — open …` → comma), the backend's user-facing API `message` strings (20 — e.g. `… — please retry` → `. Please retry`), patient/admin/aiportal (~19), packages/ui (1 print-doc default), and marketing (3).

**Deliberately left untouched:** empty-value placeholder glyphs (`?? "—"`, `"—"` in table cells/options), en-dash numeric ranges (lab reference ranges, tax 0–100), genuine paired-em-dash parentheticals, and developer-facing strings (code comments, OpenAPI route summaries/descriptions in Swagger, dev logs, health-probe responses) — those are not user-facing UI copy.

New copy written for issues #10 and #12 was authored to the same rule, so the pattern does not reappear.

**Testing status:** every workspace typechecks clean (11/11). Browser-verified in the Portal that fixed strings render naturally (dashboard greeting "Your clinic today, Rajesh"; empty states read as plain sentences).

## 2026-08-18 — Predefined catalogue pickers + patient immunisations (ADR-072, issue #13)

Hospital Admins now pick standardised items instead of re-typing them, while keeping full custom freedom.

- **`components/catalog/CatalogPicker`** — one reusable, searchable picker over `GET /catalog/:category`, tagging each item System or **Custom**, with a `CatalogPickerButton` ("Choose from catalogue") that opens it in the shared `Dialog`.
- **Retrofitted the four setup screens**: the lab-test master, drug master, services catalogue, and departments each gained "Start from a standard … / Choose from catalogue", which pre-fills the standardised fields (name, code, sample/form/strength/unit, specialty). **Price, tax and stock always stay the hospital's own** and are never seeded. Adopting a lab test / drug / service records its `catalogCode`; "add custom" is the unchanged free-text flow.
- **Immunisations** (new): `components/patients/ImmunizationsCard` on the patient record lists a patient's vaccinations and records a new one by picking from the predefined India schedule (17 vaccines) — or adding a hospital-specific **custom vaccine** inline — then a date, dose and notes. Permission-gated (`clinical.immunization.view` / `.manage`).

**Testing status:** typecheck clean across `@hms/types`, `@hms/permissions`, `hms_frontend`. Browser-verified in the Portal: the vaccine picker loaded the 17 seeded vaccines with their schedules, selecting **BCG** → date → **Record** persisted and rendered "BCG 18/08/2026" on the chart (DD/MM/YYYY); the custom-vaccine input is present. The four priced-catalogue pickers use the same verified component.

## 2026-08-18 — Quick-login shows the two Platform Admins (issue #15)

`lib/devUsers.ts` now lists the two seeded Platform Admins (`jaivik@thefortunetech.com`, `nishant@thefortunetech.com`, org `PLATFORM`, "Nirogix (Platform)") at the top of the dev/staging quick-login, replacing the removed `owner@takoriya.example`. These are the real operator emails the seeder provisions, always with the **dev default password** (never a real password). The whole `DEV_USERS` array still constant-folds out of a production build — re-verified: a `production` build contains neither the emails nor the password.

**Testing status:** typecheck clean; production build → admin emails + password absent. Browser-verified in the Portal: the quick-login modal shows both Platform Admin cards, and one-click sign-in as `jaivik@thefortunetech.com` authenticated to the dashboard.

## 2026-08-18 — Per-hospital availability config screen (ADR-073, issue #14)

New Hospital Configuration tab **Hospital availability** (`/settings/availability`, org_admin, permission `platform.catalog.availability.manage`): pick a hospital + item type (Medicines / Lab tests / Services / Vaccines), see the organisation's items each with an **Offered here / Not offered** toggle. Toggling saves through `PUT /branch-availability`; the day-to-day pickers/lists (which pass a branch) then filter to what that hospital offers — enforced by the backend (ADR-073), not just the UI. `api.getAvailabilityItems` / `setBranchAvailability` added.

**Testing status:** typecheck clean. Browser-verified as CityCare's org_admin: the screen loaded both branches (Kothrud, Baner) and the four item types; toggling Paracetamol to **Not offered** at Kothrud saved and **persisted across a reload**.

## 2026-08-18 — Platform Admins back on the Portal quick-login; org code `NIROGIX` (ADR-074)

The two Platform Admins (`jaivik@`, `nishant@`) are restored to the Portal's dev/staging "Test credentials" list, now carrying org code **`NIROGIX`** (ADR-074, was `PLATFORM`). Still the one inline-gated array that folds out of a production build (issue #7); selecting a card fills the same login form. The hospital-role cards are unchanged. (They also live on the Admin console now — see `admin/DONE.md` — since operators sign in there.)

**Testing status:** typecheck clean (Portal + admin + backend). The list is source-only data behind the `NEXT_PUBLIC_ENVIRONMENT` gate; the production fold-out is unchanged from issue #7.

## 2026-08-19 — Quick-login list is environment-true: staging shows the staging seeder's accounts (ADR-077)

The "Test credentials" dialog previously showed the **development** seeder's accounts in every non-production environment — on staging it offered CityCare accounts that do not exist in the staging database. `lib/devUsers.ts` now builds the list per environment behind the same inline `NEXT_PUBLIC_ENVIRONMENT` gate: **development** → the dev seeder's list (CityCare + the two Platform Admins, dev default password); **staging** → the staging seeder's **QA General Hospital / `QAHOSP`** accounts (`qa.*@qahospital.example`, the deterministic QA password committed in `seed.staging.ts`, ADR-058); **production** → nothing. The staging list deliberately contains **no platform-operator account** — those credentials are real on staging (ADR-077). Each bundle physically contains only its own environment's list (constant-fold + dead-code elimination, as in issue #7). The dialog's badge ("Development only" / "Staging only") and reseed hint (`db:seed` / `db:seed:staging`) follow the environment.

**Testing status:** typecheck clean; staging build chunks grepped — QAHOSP accounts present, no `citycare.example`, no `thefortunetech.com`, no dev default password. Dev build unchanged.

## 2026-08-19 — Forgot password, quick-login hardening, pharmacy nav parity (ADR-080, ADR-081)

**What:** `/forgot-password` + `/reset-password` pages and a "Forgot password?" link on the login form (ADR-081) — outcomes inline (`feedback: false`), uniform messages from the backend. Quick-login now lists **hospital roles only in every environment** (ADR-080: the two Platform Admin cards left the dev list too; staging gained the QA Branch Admin card to match the seeder). The sidebar's Pharmacy item now carries the landing page's own permission (`pharmacy.dispense.create`, was `pharmacy.stock.view`) — a doctor no longer sees an item whose destination refused them; the audit confirmed every other nav item already matched its page guard, and the rule is now written at the item ("a nav item's perm is its landing page's RequirePermission key").

**Testing status:** typecheck green; browser-verified in dev — no Platform Admin card, doctor's sidebar has no Pharmacy while direct `/pharmacy` still shows the Forbidden panel, forgot-password renders the uniform 202 inline, a garbage reset link shows the uniform refusal. Happy-path consume is covered by the backend's `passwordReset.test.ts`.

## 2026-08-20 — Content-Security-Policy and idle sign-out in the Portal (ADR-082)

**What:** `proxy.ts` (Next 16’s replacement for `middleware.ts`) mints a per-request nonce, sends the CSP built by `@hms/utils`, and adds the platform’s static security headers. The root layout became async so it can read that nonce from `x-nonce` and stamp it on the one inline script the app owns — the no-flash theme script. Static assets and prefetch requests are excluded from the matcher: they carry no script, and a nonce minted for a prefetch would be stale by the time the page rendered.

The Portal also inherits idle sign-out from `@hms/client` — 15 minutes without interaction ends the session server-side, which is what a clinical workstation in a corridor actually needs.

**Testing status:** verified live against the running Portal — sign-in, dashboard, patients list and client-side navigation all work under the policy, with no violations in the console. One real gap was found this way and fixed in the shared builder: tenant logos are served by the API over plain http in development, which `img-src` had not allowed. Build and typecheck green.

---

## ABDM / ABHA at the registration desk (ADR-084)

**What:** `components/abdm/AbhaVerificationPanel.tsx` sits above the patient registration form and
offers three ways to reach the same place — a verified ABDM profile the operator reviews and accepts.
**Scan & Share leads** (the patient scans the hospital's facility QR in their own ABHA app; no OTP at
all), then verifying an ABHA the patient already holds (by number, address, mobile or Aadhaar), then
creating one from Aadhaar with the secondary mobile check and the ABHA-address step.

**The form is unchanged and stays the fallback.** The panel never registers anyone: it hands back a
prefill and a transaction id. `applyAbhaPrefill` fills **only empty fields**, so a receptionist who
already typed something the patient corrected in person does not lose it, and every field stays
editable. Registration goes through the ordinary endpoint; the ABHA is linked afterwards, and a
failure to link never blocks the redirect — the chart is saved either way. Typing over a verified
ABHA number drops the verification with it, matching what the backend does.

**Nothing is offered that cannot work.** The panel asks the API what this hospital can actually do:
a tenant without the module gets no panel at all (the capabilities probe is deliberately silent —
403 is a normal state for most tenants, not a toast), and Scan & Share is disabled with an
explanation until the hospital has both a facility id and a QR payload. Test mode says so on screen,
including the fixed OTP, so nobody mistakes a mock profile for a real ABHA.

**A returning patient is presented as one.** An exact ABHA match is badged _Already registered here_
with a link to the existing chart; a demographic look-alike is shown as _similar charts to check_ —
never merged automatically, because two people share a name, a gender and a birth year.

**New screen:** Hospital configuration → **ABDM / ABHA** (`app/(app)/hospital-setup/abdm/page.tsx`),
where org_admin enters the hospital's own HFR facility id and QR payload, previews the code, and
switches Scan & Share on. Gated by `abdm.facility.view` / `abdm.facility.manage`, so the tab is
absent for everyone else.

**Extracted rather than duplicated:** `lib/useQrDataUrl.ts` now owns QR drawing, and
`components/print/usePublicQr.ts` composes it (ADR-029) — the facility QR was the second QR in the
Portal, and two copies of the drawing options would have drifted on the details that decide whether a
camera can read the code.

**Testing status:** typecheck and the production build are green; the new route appears in the build
output. The panel's behaviour is covered end to end at the API level in the backend suite (62 tests);
the browser walk-through is `docs/manual-testing-guide.md` §5.1a and `testcases.md` §23 (ABDM-01…34).

---

## 2026-08-25 — Environment files: complete, uncommented, and mirrored into `.env`

**What:** the Nirogix Portal's `.env.example` and its gitignored `.env` now hold the same keys in the same
order, every one live and uncommented, so copying the example gives a boot-ready file where only
values change (CLAUDE.md → _Environment files_).

**Changed:** `.env.example` now lists every `NEXT_PUBLIC_*` the app actually reads, all uncommented,
with 1–2 line comments — including `NEXT_PUBLIC_DEV_LOGIN_PASSWORD`, which `lib/devUsers.ts` reads
but the example file never documented. It is quoted (`'ChangeMe#123'`) because dotenv ends an
unquoted value at the first `#`. The gitignored `.env` was regenerated to mirror the same keys in
the same order.

**Testing status:** no runtime change — env keys and their values are unchanged for local
development. Repo-wide rule and the `README.md` environment table updated in the same change.

---

## ABDM: verification now fills the form (ADR-084)

**What:** the review step no longer waits for a click. The moment a verification succeeds the
registration form is populated and the panel says so, naming anything ABDM did not send. From a
Scan-and-Share profile the receptionist now presses exactly one button — **Register patient** —
and the ABHA links itself to the new chart.

**With one deliberate exception.** A `returning` or `ambiguous` match does **not** auto-fill. There
the panel still stops and offers the existing chart, because auto-filling would put a second chart
for the same person one button away, and a duplicated clinical record costs far more to undo than a
click costs to make. The shortcut applies exactly where it is safe: a patient this hospital has not
seen before.

**Verified live** end to end: a shared profile → one click → form filled (name, gender, date of
birth in DD/MM/YYYY, phone, address, city, state, PIN, ABHA number and address) → Register →
`UHID-000008` with the ABHA reading **Verified with ABDM**.

---

## ABDM: correcting the profile at ABDM (ADR-084)

**What:** a folded-away **Correct these details at ABDM** panel on the verified-profile card,
rendered only for staff holding `abdm.profile.update` — which the receptionist does not hold by
default. It sends only the fields the operator actually changed: resending unchanged values would
rewrite fields nobody touched, on a national identity register.

The copy is the important part. It states the change lands **at ABDM**, not just at this hospital,
and points at the registration form below for a local-only fix — because those two corrections look
identical on screen and are not remotely the same act.

**Testing status:** typecheck and the production build green; the behaviour is covered end to end in
the backend API suite, and the manual walk-through is `docs/manual-testing-guide.md` §5.1a.13.

## ABDM Milestone 3 — the external history card (ADR-095)

The Portal surface for M3, on the patient chart. A doctor asks the patient for permission to read
their history at other hospitals, watches the request's status, and reads the merged result.

Almost every state here is one the product cannot resolve on its own, so the card is built to be
honest about that. **Waiting is shown as a state, not a spinner** — the patient answers in their own
ABHA app, in seconds or never, and a spinner would imply something is on its way. **Polling stops**:
every fifteen seconds while a request is outstanding, never past a ten-minute ceiling, so an
unanswered request cannot leave a tab polling a national gateway all day. **Records disappearing is
explained before it happens**, in a line under the timeline, so a doctor reads it as the system
working rather than as a fault.

Only doctors with a medical registration number can be picked, and when none exists the card says
why instead of offering a button that always fails. The card adds no clinical judgement of its own:
the "Abnormal finding" badge appears only where the source hospital's FHIR said so.

External history sits **beside** our own records rather than merged into them — borrowed records
vanish when consent lapses and ours never do, and one combined feed would hide which is which at
exactly the moment it matters.

**Verified in a browser against the running stack**, which is where both defects turned up:

1. **A double toast.** The shared API client raised a generic "Saved." while the card raised its own,
   more informative message — two notifications for one event, which ADR-057 forbids. The client
   calls now opt out with `feedback: false`.
2. **The source line printed the facility twice** when a hospital names itself as its own
   organisation ("Sunrise Multispeciality · Sunrise Multispeciality"), which reads as a rendering
   fault. Deduplicated.

**The certification behaviour was demonstrated through the UI**, not only in tests: with the consent
lapsed and the purge sweep deliberately not run — the record still physically on disk — the
diagnosis, the lab value and the allergy were all gone from the doctor's screen, replaced by the
empty state that explains why. Light and dark both resolve from the tokens; the abnormal emphasis
reads the dark warning token rather than a literal.

## ABDM Milestone 4 — the national registries screen (ADR-099)

One screen under Hospital configuration for both registries. M4 moves no patient data, so the risk
is not disclosure — it is misleading an administrator through a weeks-long external process nobody
here controls.

**Submitted is never shown as done.** A submitted facility reads "Awaiting verification", with a line
saying a verifier at ABDM still has to approve it and that no Facility ID is issued until they do. A
green tick would have somebody believe they hold an id they do not, and find out when the ABDM
service registration fails a month later.

**The screen is honest that bulk is a portal process** rather than offering a button implying we
upload for them. An import failure names the row and the reason; an ambiguous row names how many
people it matched and what would tell them apart, because a bare count leaves nobody able to act.

CSV parsing handles quoted cells — a naive `split(",")` corrupts a hospital name containing a comma
by shifting every later column, which would then match the wrong person — and strips Excel's BOM so
it does not become part of the first column's name.

**Verified in a browser against the running stack.** The permission gate bounced a doctor to the
dashboard; the page rendered for org_admin; the export returned the real seeded roster with the id
column blank; a results file imported, matched one clinician by registration number and named the two
failures with their spreadsheet line numbers; the enrolment persisted and re-rendered on reload. Light
and dark both resolve from the tokens.

## Health Facility Registry — the registration form (ADR-102)

Milestone 4's services shipped without screens, so 123 HFR certification cases were failing for want
of a form rather than for want of logic. This is the first of them.

Around forty fields — identity, ownership, location, contact, systems of medicine, medical
infrastructure, eight external programme identifiers — each traceable to a numbered case in NHA's
HFR workbook. Four things shape it, all following from one fact: **registration is filled over days
and judged by a human, weeks later.**

- **Save is not submit.** A draft saves in any state, with anything blank. Nobody has the CEA number
  and the ventilator count to hand in one sitting.
- **Submitted is never shown as approved.** A green tick would have somebody believe they hold a
  Facility ID they do not, and find out when service registration fails a month later.
- **A rejection reopens the form with everything still in it**, and shows the verifier's own words
  verbatim — they are the instruction, and rewording them would obscure it.
- **Totals are stated, not computed.** The workbook asks an operator to be accountable for the bed
  totals; a mismatch is pointed out, never silently corrected.

`RegistryMasterSelect` is new and serves all twenty registry-backed dropdowns (ADR-029). It knows
which filters each list cannot be read without, clears a dependent value when its scope changes —
pick Karnataka, choose a district, switch to Kerala, and the stale district must not be submitted —
keeps a saved code that arrives before its list, and reports a failed list **in place** rather than
rendering an empty box. It never raises a toast: one registry outage would otherwise raise twenty
(ADR-057).

Pointing the form at the real sandbox immediately earned that last decision. Four of the nine
reference lists came back empty — they are POST endpoints, not GET — and the field order was wrong,
because facility type turns out to require both an ownership and a system of medicine and so can
only come third. Both are recorded in ADR-102. The chain now works end to end against ABDM's own
sandbox: Private → Allopathy → Hospital → Civil Hospital / General Hospital / Nursing Home.

## ABDM Milestone 4 — the last three registry screens (ADR-103), 30/08/2026

Registration shipped in ADR-102; these are the three the certification audit still counted as
missing — HFR facility search, HFR facility update, and the HPR enrolment wizard.

**Search comes before registration, and claims nothing.** One building must hold one Facility ID,
because that id is the `hipId` M1–M3 identify us by — register a hospital HFR already lists and
record linking breaks for real patients, weeks later, with no obvious cause. So the screen is linked
ahead of the forty-field form and again from inside its header, since the moment somebody doubts is
while they are filling it in. There is deliberately no "use this facility" action: a result is
somebody else's registry entry, and claiming one is a decision a human makes with evidence. An empty
search is refused outright rather than paging the national registry, and no results is written as
the answer it usually is — nobody has registered this building yet — instead of as an error.

**Update is a separate act with a separate route.** Saving has always refused a verified
registration so nobody re-registers a building that already holds a Facility ID. That refusal needed
a door beside it, not a hole in it, so the form unlocks only through an explicit "Update details"
and then offers a different pair of buttons. The Facility ID is untouched and the status stays
`verified` — showing "awaiting verification" would tell an administrator their hospital had fallen
out of the registry.

**The HPR wizard follows the registry's order and reads its position from stored status.** An
interrupted enrolment resumes at the step the clinician actually reached rather than restarting with
another OTP. The Aadhaar field clears the instant it has been used. "They already hold an HPR ID" is
reported as a success, because it is one.

Not verified against the live registry: HFR update has never run (HFR publishes no update endpoint —
re-running the wizard against the stored tracking id is inferred from its statefulness), and the HPR
Aadhaar chain still mints real national identities and so is still stubbed in tests.

## 2026-09-01 — Check-in: register a patient without leaving the page; real dropdowns; native scroll

**What:**

- **`components/patients/PatientPicker.tsx`** — search a patient or register one in a dialog, without
  leaving the workflow. The typed search text seeds the new record (a number becomes the phone, text
  becomes the name), the new chart is selected the instant it exists, and the half-filled visit form
  underneath survives. A `DUPLICATE_PATIENT` 409 switches the dialog to the matching charts with
  **Use this patient** as the primary action; registering anyway stays available. Hidden entirely
  without `patient.create`. Used by both check-in and appointment booking, which removes the
  duplicated patient-search block that existed in each.
- **Check-in** now uses the shared `Select` for department and provider — the provider option carries
  the speciality underneath and the fee on the right, so the desk quotes the fee as it picks the
  doctor — and a real `Textarea` for the chief complaint (four rows, 2000 characters, counter). The
  patient is locked when it arrived from an appointment or a referral, because the server takes it
  from that record regardless.
- **Dropdowns converted** along the patient journey: check-in, appointment booking (provider,
  duration, and the reason field promoted to a textarea), the appointment-request queue (status,
  doctor), the OPD queue status filter, and the billing service picker.
- **Native scrolling (ADR-111).** `SmoothScroll` removed from the root layout, `lenis` dropped from
  the app dependencies, the now-meaningless `data-lenis-prevent` markers removed from the two
  Portal-only scroll regions, and the shell moved to `dvh` units so a phone with collapsing browser
  chrome does not get a sidebar taller than the viewport.

**Testing status:** monorepo typecheck green (13/13 tasks). Backend suite 617 tests, all passing —
including the rewritten OPD critical-path case (see `hms_backend/DONE.md`). Browser-verified: no
Lenis on the Portal after hydration, `--hms-text-xs` live. The check-in screen itself needs a signed-in
session and was not visually verified in this session; cases CHK-01…CHK-08 and SEL-01…SEL-10 in
`testcases.md` cover it.

## 2026-09-01 — Workflow configuration screen, desk vitals, and the vitals queue (ADR-113)

**What:**

- **Hospital configuration → Workflow** — where vitals are recorded, which parameters are required or
  merely offered, and when the consultation fee must be settled. Scoped to the whole organization or
  to one hospital, and it says plainly which of those the numbers on screen came from: a branch
  following the organization default is told so, and told that saving creates an override.
- **`components/vitals/VitalsFields.tsx`** — one component for all three places a reading is taken.
  Blood pressure is one control with two numbers, because nobody records half of one. Which fields
  appear comes from the configuration; the units, bounds and labels do not vary by where the staff
  member is standing.
- **Check-in** grows a Vitals section, but only under `during_checkin`. Until the configuration
  loads nothing is shown — guessing and then removing fields under the user is worse than a moment
  without them.
- **`/opd/vitals`** — the vitals queue. Derived from the visits, so it cannot drift from the OPD
  board. A recorded entry stays on the list marked done, because the nurse needs to see what they
  finished and be able to re-take a reading they doubt. The dialog opens **blank** even when a
  reading exists: pre-filling it invites saving numbers nobody took.
- **The consultation** shows the trail — each earlier reading with where it was taken, by whom and
  when — above a pre-filled latest. No vital is marked required there: the required list exists so
  the desk cannot skip a reading, and holding a clinician to it would block them correcting one
  number.
- A hospital on a different workflow gets an explanation and a link to the setting, never an empty
  table it has to interpret.

**Testing status:** monorepo typecheck green (13/13). 832 tests pass across the workspaces. The
screens themselves need a signed-in session and were not visually verified in this session; cases
WF-01…WF-09, VIT-01…VIT-20 and PAY-01…PAY-05 in `testcases.md`, and §3.9a–c / §5.2a / §5.2b / §6b /
§7.3a in `docs/manual-testing-guide.md`, cover them.

## 2026-09-01 — Check-in and booking are one form (ADR-115)

**What:** `components/visit/VisitWorkflow.tsx` replaces both forms. `/opd/check-in` and
`/appointments/new` are now three lines each: the same component, a different starting timing.

They were two screens asking almost exactly the same questions and differing in one — **when** — so
timing became a control inside the form rather than a choice of page. Switching keeps every shared
answer and resets only the half that no longer applies; a desk that has typed a patient, a doctor
and a paragraph of chief complaint does not lose it by deciding the patient should come back
Tuesday.

The routes stay because the navigation, the OPD queue, the patient chart, the referral worklist and
everyone's bookmarks link to them, and because their permissions differ. The **When** control is
offered only to someone holding both, and is hidden entirely when the patient arrived from a booked
appointment or a pending referral — neither can become a future booking, so a toggle there would be
a control that cannot work.

The merged form is an assembly of pieces that already existed rather than a fourth place they are
re-implemented: `PatientPicker` for the patient step, `Select` for every dropdown (ADR-112),
`VitalsFields` for the desk vitals (ADR-113), `Textarea` for the complaint.

**Not built, deliberately:** the requested `caseType: NEW | EXISTING` control. Cases do not exist in
the data model, and a dropdown offering a choice nothing can store is worse than its absence.

**Testing status:** monorepo typecheck 13/13; **842 tests pass**. The merged form needs a signed-in
session and was not visually verified here; both routes were confirmed to compile and auth-guard.
Cases UNI-01…UNI-12 and ARR-01…ARR-07 in `testcases.md`, and §5.2c / §5.2d in
`docs/manual-testing-guide.md`, cover it.

## 2026-09-01 — Choosing a treatment case at check-in, and managing one from the chart (ADR-116)

**What:**

- **`components/visit/CasePicker.tsx`**, inside the unified visit workflow. Three answers: no case
  (the default, because most visits are one-offs), an existing open case, or a new one. **The
  patient's open cases load the instant a patient is chosen** and are named in a panel above the
  control — accidental duplicates come from not knowing a case is already open, so the fix is to
  make it impossible to miss rather than to refuse the second one. Setting **Visit type =
  Follow-up** preselects the most recent open case, which is what a follow-up almost always is.
  Changing the patient clears the choice; the server would refuse it anyway.
- **`components/patients/CasesCard.tsx`** on the chart: open cases first, closed ones kept below
  **with the reason they closed** — "why did this stop?" is a question people ask months later.
  Opening a case warns when one is already open; closing demands a reason; reopening confirms
  through the shared `ConfirmDialog` and explains why reopening beats starting a second case.
- **The OPD queue gained a Case column** — the title and the `C-` number. That is the answer to
  "why is this patient back?", which the board could not previously give.

**Testing status:** monorepo typecheck 13/13; **861 tests pass**. The screens need a signed-in
session and were not visually verified here. Cases CAS-01…CAS-22 in `testcases.md`, and §5.2e /
§5.2f in `docs/manual-testing-guide.md`, cover them.

## 2026-09-01 — The fee is quoted from the price list, not typed (ADR-117)

**What:**

- **Hospital configuration → Fee schedule.** Rules listed **most specific first**, in the order the
  server applies them, each row saying what it matches on — a hospital writing "cardiology is ₹600"
  and also "Dr Sharma is ₹800" has to be able to predict the winner without reading documentation.
  An empty list is explained, not treated as an error: it means every consultation is charged the
  doctor's own fee, which is what the product did before. Retiring is offered; deleting is not.
- **Check-in shows the fee as a stated amount**, re-priced live as the doctor, department or visit
  type changes, with a badge naming where the number came from. The free-text fee box is gone —
  a blank field with a placeholder reads as an invitation to type something else, which is how the
  policy ended up in a receptionist's head in the first place.
- **"Charge a different amount"** appears only for someone holding `billing.fee.override`, and
  demands a reason before it will submit. The server checks both again.

**Testing status:** monorepo typecheck 13/13; **880 tests pass**. The screens need a signed-in
session and were not visually verified here. Cases FEE-01…FEE-17 and OVR-01…OVR-07 in
`testcases.md`, and §3.9a1–5 / §5.2g / §5.2h in `docs/manual-testing-guide.md`, cover them.

## 2026-09-01 — The Arrivals board, and the self check-in poster (ADR-118)

**What:**

- **`/opd/arrivals`** — patients who have said they are here. A matched arrival shows the
  appointment it belongs to and checks in with one click; an **unmatched** one stays on the board
  marked _Needs a human_, with no check-in action and a pointer to the search screen. Dropping it
  would be hiding a person standing in the lobby because a lookup failed.
  _Already checked in_ appears where a colleague beat the kiosk to it, turning a confusing double
  entry into an obvious dismissal.
- **Hospital configuration → Self check-in**, and a printable poster, both built as configurations
  of the same `PublicAccessPanel` / `PublicQrPoster` / `usePublicQr` the registration and booking
  surfaces already use. Third instance of one pattern, not a third implementation.
- **The patient app kiosk page** (`patient/app/(public)/check-in/[token]`): one field, and copy that
  is honest twice over — it says the desk will confirm, and it never claims to have found you,
  because the endpoint deliberately cannot tell it whether it did.

**Testing status:** monorepo typecheck 13/13; **900 tests pass**. The screens need a signed-in
session (or a live token) and were not visually verified here. Cases SCI-01…SCI-20 in
`testcases.md`, and §3.9a0 / §5.2i / §5.2j in `docs/manual-testing-guide.md`, cover them.

## 2026-09-01 — The patient's record beside the check-in form (ADR-119)

**What:** the existing `PatientHistory` **extended**, not duplicated — it already showed visits,
signed consultations, invoices and lab orders on the chart, each permission-gated. It gained a
`rail` layout (one column, newest four per block), a Cases block, a Documents block, and now renders
beside the check-in form.

**The gating is the substance.** The same component now renders for a receptionist at the desk and a
doctor in the consultation, and they must not see the same thing. Reception sees cases, visits,
bills and documents; the **Consultations** block carries chief complaints and ICD-10 diagnoses,
requires `emr.encounter.view`, and is simply absent without it. The absence is not the boundary —
the API refuses reception either way.

**Only this hospital's records.** External history is ABDM territory: consent-gated and requested by
a named clinician from the chart (ADR-092). Pulling it into a desk-side panel because someone walked
up would defeat that consent, so the panel does not, and the code says why.

- `PatientDocumentsCard` is shared by the chart and the rail. Attaching is two steps underneath and
  one to the user; the title defaults to the filename, because a list of untitled rows is unusable.
  Archiving demands a reason and keeps the row.
- Two columns on a wide screen, stacked below the form on anything narrower. **The form keeps its
  own readable width rather than stretching** — a check-in form as wide as a 27-inch monitor is
  harder to fill in, not easier.
- The Cases block is rail-only: the chart already has `CasesCard`, which manages cases rather than
  listing them, and two cases blocks on one page is duplication rather than richness.

**Testing status:** monorepo typecheck 13/13; **913 tests pass**. The panel needs a signed-in session
and was not visually verified here. Cases HIS-01…HIS-09 and DOC-01…DOC-12 in `testcases.md`, and
§5.2h1 / §5.2h2 in `docs/manual-testing-guide.md`, cover it.

## 2026-09-01 — Consent status in the check-in rail (ADR-120)

**What:** `components/patients/ConsentStatusCard.tsx`, in the check-in side panel.

It shows **a state, never a record**: waiting on the patient, granted (and until when), declined,
lapsed, or a technical failure — with no source hospital, no record count and no requesting
clinician, because the desk needs none of those to tell a waiting patient what is happening.

It also states the thing people get wrong about ABDM, in the place the misunderstanding would
matter: **asking is a doctor's job**, because the request carries their registration number to the
patient. The desk can see that nothing has been asked; it cannot ask.

Where the hospital is not entitled to external history the API 403s and the card renders **nothing**
— silence rather than an error toast, because advertising a feature a hospital has not bought is
worse than saying nothing at all. Rail-only: the chart has `ExternalHistoryCard`, which shows the
records themselves to whoever may read them.

**Testing status:** monorepo typecheck 13/13; **926 tests pass**. The card needs a signed-in session
and was not visually verified here. Cases CST-01…CST-12 in `testcases.md`, and §5.2h1b in
`docs/manual-testing-guide.md`, cover it.

## 2026-09-01 — Two more ways to price a consultation, shown only where they exist (ADR-121)

**What:** consultation type and case type in the check-in form, `CasePicker`, `CasesCard` and the
fee-schedule screen, plus a vocabulary editor in `hospital-setup/workflow`.

The rule the whole change follows: **a field nobody has defined is not shown**. A hospital that
has not written its own consultation types sees no dropdown at check-in, no extra dimension in the
price list, and a line on the fee screen telling it where to define them if it wants them. Two
permanently empty dropdowns would be two more things to not understand.

The vocabulary editor is a **chip list, not a comma-separated text field**, because these values
are stored on every visit and case that uses them and are matched by the fee schedule — so
"Corporate," with a trailing comma has to be impossible to create rather than merely discouraged.

`CasePicker` asks for the case type **once, when the case is opened**, and then shows it on the
chosen case: _"This is a Corporate case, and that is what prices this visit."_ The desk sees why
the number is what it is instead of wondering.

**Testing status:** monorepo typecheck 13/13; **944 tests pass**. Not visually verified — the
screens need a signed-in session. Cases FRT-01…FRT-14 in `testcases.md` and §5.2f2 in
`docs/manual-testing-guide.md` cover them.

## 2026-09-01 — The SOAP note now says what each box is for

**What:** placeholder hints on Chief complaint, Subjective, Objective, Assessment and Plan in the
consultation screen. `SOAP_HINT` in `app/(app)/opd/[id]/page.tsx`.

SOAP is the standard clinical note, but only to someone who was taught it. The four one-word labels
told a receptionist, a new junior, or the non-clinical staff who read these notes back precisely
nothing, and the boxes sat empty with no guidance in them at all — the prescription and lab rows on
the same screen had placeholders, these did not. The hints carry the one distinction people actually
get wrong: **Subjective is what the patient claims, Objective is what the room measured**, Assessment
is the conclusion, Plan is the action.

Hint text, not a template: it disappears the moment the clinician types, so it teaches the reader who
needs it and costs nothing to the doctor who does not.

**Testing status:** monorepo typecheck clean; frontend suite 13/13. Not visually verified — the
consultation screen needs a signed-in session with a live visit.

## 2026-09-02 — Missing values, and one screen for the three QR codes (ADR-123, ADR-124)

**Every `—` in the Portal now says which kind of missing it is.** Around eighty call sites across
tables, list views, filtered results, detail pages, cards, dropdowns and the three print documents
moved onto `EmptyValue` / `ValueOrEmpty` / `emptyLabel()` / `valueLabel()` from `@hms/ui`, each
naming a reason: a walk-in's Provider is **Not assigned** (someone can assign it), a public
booking's Department is **Not specified** (the patient did not ask for one), an audit entry written
by a job has **Not applicable** in Request and Status, a qualitative lab test has **Not applicable**
for its reference range, a doctor with no personal fee is **Not configured** (the hospital's fee
schedule decides), a user with no roles is **None**. Empty `<option>` labels became words too.

**`/services` was the reported case, and it was not a display bug.** The API returns
`departmentName` from a real left join; the dataset had simply never named a department for a
seeded service, so every row was genuinely unassigned. Fixed where it was broken — the dataset now
names a department per service and a backfill fills existing rows (ADR-122) — after which the
column reads _General Medicine_, _Cardiology_, _Orthopaedics_, and **Not assigned** on the one
service deliberately left unfiled.

The accessor now carries the same words as the cell, so the Department filter offers "Not assigned"
as a value and a search finds those rows. Two dashboard tiles that showed `—` before their count
arrived now show `0`, which is what a count of nothing is.

**Three settings tabs became one: `/hospital-setup/public-access` — "Patient self-service"**
(ADR-124). _Patient registration_, _Online booking_ and _Self check-in_ rendered the same
`PublicAccessPanel` with different words, and an administrator could not tell from the screen which
one they were on. They are now three sections of one page, under an explainer that states the thing
everyone gets wrong once: none of the three writes to the hospital's records. **Nothing behind the
screen changed** — each keeps its own toggle, token, public endpoint, review queue and audit trail,
and turning one off leaves the other two working. The three old paths are permanent redirects in
`next.config.ts`, because they are in bookmarks and printed on posters, and the three poster
documents now point their back link at the new route.

**Testing status:** frontend typecheck and `next build` clean; verified in the running Portal —
`/services` renders real department names, `/hospital-setup/patient-registration` redirects to the
consolidated page with all three panels live and their pending counts intact.

## 2026-09-02 — Bottom padding restored, and the admin's own buttons appear (ADR-125)

**The app shell padded three sides.** `<main>` carries `p-5`, but `.hms-bottomnav-offset` in
`@hms/ui` set `padding-bottom: 0` above the `md` breakpoint — the class meant to clear the mobile
bottom bar was cancelling the page's own bottom padding on every desktop screen, so content sat
flush against the bottom of the scroll area. The class now **adds** to the page padding instead of
replacing it (`--hms-page-pad`, defaulting to the shell's `1.25rem`). Measured on the running
Portal: desktop `20px` on all four sides, mobile `20px / 20px / 88px / 20px` — 20 page padding plus
68 of bar clearance.

**Missing action buttons were the role, not the UI** (ADR-125). An Organization Admin saw one eye
icon in the Patients Actions column and no _New appointment_ button, because `org_admin` held
`patient.record.view` and `appointment.booking.view` and nothing else. The role now covers every
action inside its own hospital. **No frontend change was needed** — every button and row action was
already gated on a permission key rather than on a role, so widening the role revealed them. That
is the evidence the gating was built the right way round.

## 2026-09-02 — The refusal panel explains itself, and the dashboard stops growing (ADR-126)

**A dashboard scrolled ~200px past the bottom of the app shell**, on the Portal and the admin
console alike. The cause was in `@hms/ui`: each chart carries a screen-reader data table marked
`.hms-visually-hidden`, and a `<table>` sizes to its content and **ignores** the utility's
`width: 1px; height: 1px`. The element stayed absolutely positioned at its full 744px and
lengthened the page by whatever was left below the shell. The wrapper now carries the class and
the table sits inside it, hidden and clipped, semantics intact — `display: block` on the table
would also have hidden it, and would have stripped the table role the markup exists for.
Measured after: document height equals shell height exactly.

**`RequirePermission` checks the module before the permission**, in the order the server enforces
it. This matters now that an administrator holds nearly every key (ADR-125): typing
`/pharmacy/stock` in a hospital with no Pharmacy module would otherwise have rendered the screen
and let it fail against the API. A permission the registry does not claim is Platform Core and is
never module-gated, and an entitlement set that has not loaded yet is _not_ read as "this hospital
has nothing".

**The `Forbidden` panel now answers the three questions a bare 403 cannot** — which permission (in
words _and_ as a key), which of this hospital's roles hold it (read from the tenant's own tables,
so a custom role appears without being hard-coded), and whether the hospital even has the module.
The module case gets its own headline and no role list, because "your hospital has not enabled
this" is not something an administrator can grant their way past.

Verified in the running Portal: the two pages the report named — `/patients/new` and
`/opd/check-in` — render for an Organization Admin; a hospital without Pharmacy sees _This feature
is not available for your hospital_; a receptionist opening `/audit` sees _View the audit log ·
`audit.log.view`_ with _Super Admin, Organization Admin_ listed as the roles that hold it.

## 2026-09-02 — The patient chart in the order staff read it (ADR-127)

**The old page made people hunt.** Name and UHID sat in the header; below them a two-column grid of
_Identity / Contact / Emergency contact / Portal access_. Age appeared nowhere, blood group was the
third row of a card called "Identity", _Patient portal access_ — a desk task — shared the top tier
with a phone number, and visits and consultations came last, below immunisations.

**Five tiers now, ordered by what somebody reaches for:**

1. **Identity strip** — initials, name, UHID, **age**, gender, date of birth, **blood group**,
   status. One line, above everything, and the five things a member of staff checks against the
   person in front of them. Blood group is a badge rather than a table row because it is a clinical
   fact, and **its absence is stated** — "we do not know this patient's blood group" is the part
   worth knowing.
2. **Contact**, then **Emergency contact**.
3. **National health ID (ABDM)** — an identifier, not a demographic, so it has its own card below
   the details people open the chart for.
4. **Treatment cases**, then **Immunisations** — ongoing care before past care.
5. **History** (visits, consultations, invoices, lab orders, documents) → **History from other
   hospitals** → **Patient portal access**, last, because it is administrative.

**Nothing was removed.** Every field, card and permission gate still renders; the order changed and
portal access moved out of the grid.

**A permission bug surfaced while reordering.** `CasesCard` was inside the same `<Can>` as the
immunisations card and so was gated on `clinical.immunization.view` — a role permitted to manage
treatment cases but not immunisations saw neither. It now carries `opd.case.view`, the key the API
enforces.

**And the chart scrolled sideways on a phone**, which it had before this change: `PatientHistory`'s
grid items kept their default `min-width: auto`, so one long visit line pushed the cards to 817px
inside a 375px viewport. `[&>*]:min-w-0` on both grids, `break-words` on the detail rows. Measured
after: **zero elements wider than the viewport**.

`ageInYears` moved to `@hms/utils` and is now shared with the patients list — a chart that
disagreed with the list it was opened from is a bug people report.

**Testing status:** frontend typecheck and `next build` clean; verified in the running Portal at
desktop and at 375px.

## 2026-09-02 — One place for a page's primary action (ADR-128)

_Book appointment_ and _Check in_ sat top-right in the page header. _Register patient_ sat one row
lower, inside the table's filter toolbar beside **Columns** — one screen out of twenty-one, and the
one a receptionist opens most. It now matches every other list.

The mechanism was `toolbarActions` on the Standard DataTable, used by exactly one page in the whole
monorepo. A slot with one caller doing something no other caller does is not a feature in use; it
is an available way to be inconsistent. It is **deleted**, along with the `actions` prop it fed on
`DataTableToolbar`, so the toolbar is Search → Filters → Sort → Column visibility → Pagination and a
create button has nowhere else to go. A rule you cannot break beats one you have to remember.

Written down with it: supporting actions first and the primary **last** (right-most) — `ghost` for
navigating away, `secondary` for a side task like _Print / PDF_, the default variant for the action
the page exists for. That is what every multi-action header already did.

**Testing status:** 107 `@hms/ui` component tests pass unchanged; frontend typecheck clean.
Verified in the running Portal — _Register patient_ now sits level with the page title, and the
filter row holds only search, filters and Columns.

## 2026-09-02 — The desk could not read the workflow that draws its own form (ADR-129)

A receptionist opening **Book appointment** got _Not permitted_, beside a form that then worked.
`GET /workflow-config` requires `platform.workflow.view`, which the receptionist did not hold — and
the workflow configuration is what that form is built from (ADR-113): where vitals are taken decides
whether the vitals fields render, when the fee is due decides whether payment gates the
consultation, and the consultation-type and case-type vocabularies fill two of its dropdowns.

The key had been scoped as though the configuration were the administrator's private setting. Four
screens read it — the check-in and booking form, the vitals queue, the patient chart's cases block,
and the fee schedule — and only the last belongs to an administrator.

**`platform.workflow.view` now goes to receptionist, doctor, branch_admin and cashier** as well as
the administrator; not to the pharmacist or lab technician, who reach none of those screens. The
split that matters is untouched: _view_ is reading how the hospital runs, **`platform.workflow.manage`
is deciding it**, and only the administrator holds the second. Widening the route to any
authenticated session was the alternative and was rejected — it would leave the permission enforced
by nothing, and a page guard on a key no endpoint checks is a boundary in name only.

**And a failure the caller already handles no longer raises a toast.** `getWorkflowConfig` is
fetched with `feedback: false` (ADR-057's own opt-out). Every call site already treated "no config"
as "use the platform defaults" — the behaviour a hospital that has configured nothing gets anyway —
so a hospital that denies this key on one account now sees that account's form fall back, rather
than an error beside a form that works.

Existing hospitals pick the key up through `reconcileSystemRoles()` in `db:migrate`, additively.

**Testing status:** verified as `reception@citycare.example` — **Book appointment**, **Check in**
and the **Vitals queue** all load with no toast, and `GET /workflow-config` returns 200 where it
previously returned 403.

## 2026-09-02 — An ABHA verification stopped throwing away everything but its last step (ADR-130)

Two sandbox reports, one cause. `verification/verify` returned an account list carrying ABHA
number, ABHA address, gender and date of birth, and the `select-account` after it returned
`prefill: { gender: null }`. `enrolment/aadhaar/verify` returned the whole demographic record —
name, gender, DOB, phone, address, city, state, pincode, ABHA number — and the
`enrolment/mobile/verify` after it returned `prefill: { gender: null }`. The desk watched a filled
card become _Unnamed · Not specified · DOB unknown · no phone_, above a blank form.

`completeWithProfile` treated **the newest response as the whole profile**. A verification is
several calls answering different amounts — Aadhaar returns everything, the mobile OTP after it
returns a token, resolving a chosen ABHA returns a token — so overwriting with the newest answer
discarded what the earlier steps had established. `abhaNumber: profile.abhaNumber ?? null` blanked
the identifier for the same reason. And the multi-account branch never stored the account list,
which was the only description of those patients the flow would ever produce.

**Now: an absent field means "this call did not say", never "this person has no name."**
`completeWithProfile` merges the incoming profile over what the transaction holds, per field,
skipping null/undefined/blank, stores the merged result and builds the prefill from it; identifiers
fall back to the transaction's own. The candidate account list is persisted, and the chosen
account's fields are merged in when the operator picks — its single `name` going in **whole**,
because guessing a surname from a space is how "Patel Jaivik Kamleshkumar" becomes the wrong two
fields.

**The mock now answers as sparsely as the sandbox.** It used to return the full profile on the
second call of both flows, which is exactly why 306 passing ABDM tests never saw this. All 306
still pass against the sparse mock — that is the evidence the merge does the work the mock was
doing for it.

All four verification identifiers get the fix together (ABHA number, ABHA address, mobile,
Aadhaar), because it lives in the shared completion path, as do both enrolment paths. **No
driving-licence flow exists** and none was added; it is in `BACKLOG.md`.

**Testing status:** the multi-account test asserted only that the ABHA number survived — the one
field that did — and now asserts the demographics too; a second test asserts a later step never
blanks an earlier one. **47 M1 tests pass**, 306 across ABDM.

## 2026-09-02 — Three defects behind one "create a new ABHA" attempt (ADR-131)

A receptionist reported one flow and it contained three separate faults, all sitting on a
`enrolment/aadhaar/verify` that returned **200 with a complete profile** — name, gender, date of
birth, phone, full address, ABHA number.

**The form stayed empty.** The panel saw `requiresMobileVerification: true` and `return`ed into the
mobile-OTP step without handing the profile up. Every field the desk needed was on the screen above
an empty form, held behind another OTP. It now calls `onVerified(res)` first: a further step that
confirms _a phone number_ is not permission to withhold the other ten fields, and an operator whose
second OTP never arrives is left holding a complete, editable form instead of a blank one.

**"User not found" appeared under the Verify button** on a step that had just succeeded, because
the mobile-OTP request shared the verification's `try`. It has its own now, and its own message —
_"The details below are verified and filled in. Confirming the mobile number failed: …"_.

**A second OTP went to the phone that had just received the first.** The gateway adapter read the
flag as `Boolean(pick(...) ?? undefined)`, which cannot produce `undefined`, so ABDM omitting
`mobileMatchesAadhaar` — which it usually does — was recorded as _does not match_, and
`Boolean(input.mobile) && matches === false` then demanded a second OTP whenever a mobile was typed
at all. The adapter now keeps the flag tri-state, and the service decides from the **numbers**:

```ts
Boolean(requestedMobile) &&
  requestedMobile !== mobileOnRecord &&
  result.mobileMatchesAadhaar !== true;
```

If the desk asked for the mobile ABDM already holds there is nothing to prove; where they differ,
an explicit `true` short-circuits it, and not knowing means asking.

**And the mock hid it, again.** `enrolByAadhaar` echoed the requested mobile back as the profile's
mobile, so the two could never differ. It returns the Aadhaar-linked number now, as the sandbox
does — the third mock-fidelity correction in two days.

**Testing status:** a new test asserts that the same mobile asks for no second OTP and that the
profile arrives complete on the first step; the existing differs-mobile test now exercises the real
condition rather than a flag the mock always set. **307 ABDM tests pass, 48 in M1.**

**Not verified live.** These came from captured sandbox traces and are proved against the mock; the
local backend is `ABDM_PROVIDER=gateway` and a real run needs a real Aadhaar and a live OTP.

## 2026-09-02 — The OPD board stopped being seeded for one particular Tuesday (ADR-133)

Reported as "staging has no data". It was not volume. Three screens were empty, each for its own
reason, and the same three were empty on a developer machine seeded last week — the reporter's own
dashboard showed _In the queue now 0 · Seen today 0_ above six weeks of history.

**The OPD queue, "in the queue now" and "seen today" are relative to the day the seeder ran.**
`seedTodayQueue` builds its ten live visits at `dayOffset(0, …)`, and the clinical story runs once
per tenant (ADR-122), so it never rebuilt. Staging is seeded on deployment and then left: from the
next morning the board was blank until somebody reset the environment.

It is now **extracted from the story and run on every seed**, guarded on the only question that
matters — _does this hospital already have a visit dated today?_ Nothing else. Re-running is free,
a queue somebody is working through is untouched, and a QA environment has a live board every
morning rather than on the morning it was deployed. The story writes a past and a past is written
once; the board is the present, and the present moves.

**The Vitals queue was empty in every environment, always** — it only has rows under
`vitalsMode: 'after_checkin'`, and no dataset ever set a workflow configuration. Datasets can now
declare `workflow` (typed as the service's own input minus the version, rather than a hand-copied
union), and both busy hospitals run a separate vitals step and carry consultation and case
vocabularies.

**The Arrivals board was empty in every environment and could not be otherwise** — an arrival comes
from a patient scanning a QR, which no seeder performs and no history leaves behind. Two are now
seeded with the queue and refreshed the same way.

**A collision degrades rather than aborts.** The first version of this died on
`The provider already has an appointment in this time slot`, because a scattered future appointment
had landed on today. A taken slot now makes that patient a walk-in, a patient already in the OPD is
skipped, and an arrival whose booking fails is announced without one — each counted in the report.

**Verified on a database seeded days earlier:** OPD queue 0 → **10 rows across every workflow
state**, Vitals queue → **3 waiting**, Arrivals → **2 ready to check in**; a second run the same day
reported `todayQueueAlreadyPresent` for all three hospitals and created nothing.

**This one needs no reset.** The daily refresh carries no marker, so the next staging deploy gives
`QAHOSP` a live board — and so does every deploy after it.

## 2026-09-03 — The consultation screen, treated as a record rather than a form (ADR-134)

Reported as "the Save button has an issue". It had several, and they were all the same mistake in
different places: the page was built as a form and a consultation is a record.

**The vitals configuration was never fetched.** `workflow` was declared, read in three places, and
never assigned — so every hospital saw _This hospital has not configured any vitals to record_,
whatever it had configured. The doctor holds `platform.workflow.view` precisely so this screen can
read it (ADR-129); nothing was reading it. One `api.getWorkflowConfig()`.

**Save scrolled out of reach.** The primary action belongs in the `PageHeader` (ADR-128) and it
still does — but this page's work runs several screens below it. `PageHeader` gains `sticky`, and
beside Save the header now **states what it knows**: _Unsaved changes_ or _All changes saved_,
computed by comparing the form against the server's last answer rather than a dirty flag, so
typing something and undoing it correctly reports saved. `beforeunload` covers reload and tab
close. An in-app navigation guard is **not** done; the header saying so is what covers it.

**A double-click could send two saves.** `loading` disables the button on the next render, which is
one render too late. An in-flight ref closes the window.

**Signing saved over a failed save.** The old `sign()` saved, then signed, in one `try` — so a
failed save was followed by an attempt to sign anyway. The signature now proceeds only from the
save's own result.

**`window.confirm` is gone from the product.** It was the last one. Signing, discarding an
amendment and deleting a **saved** prescription or lab order all use the shared `ConfirmDialog`.
Removing a row added ten seconds ago and never saved still just removes it — a dialog there is
noise, not safety.

**The pickers are the shared `Combobox`.** Drug, lab test and ICD-10 were an `<input list>` +
`<datalist>` that showed no price, no stock and no code, and could not distinguish a picked drug
from a matching string. Frequency and route gained suggestion lists on the same control — free text
still wins, because the schedule a doctor needs next is always the one an enumeration left out.

**Alignment.** The prescription row stretched every control to the tallest cell, so a field carrying
a hint made its neighbours taller than themselves — which is what the screenshot showed.
`items-start` plus a label per field fixes it; `[&>*]:min-w-0` stops one long dictated line
scrolling the page sideways (ADR-127).

**Add moved to the card footer.** _Add medicine_ and _Add test_ sit at the end of the list they
extend, not above a row the doctor has not finished, and the footer states how many blank rows will
not be saved rather than dropping them silently.

**Amendment (ADR-134).** A signed note shows the trail and, with `emr.encounter.amend`, an **Amend
consultation** action; without it, a panel naming the permission in words and as a key and saying
who to ask (ADR-126) — not a disabled button. Reopening asks for a reason in a form dialog that
states what is preserved. While amending, a banner carries the reason, its author and the original
signing time, and the header offers Save / Sign amendment / Discard amendment.

**Also standardised in this pass** — four master-data pickers that were still native `<select>`:
service on an invoice, drug at the pharmacy counter, supplier on a stock receipt, test on a lab
result. All four are bind-to-a-record answers, so they are the searchable `Select`, not
`Combobox`; free text there would be a worse answer, not a kinder one. Payment method stays a
`Select` too — small list, but the design system's control rather than the browser's.

**Testing status:** frontend typecheck clean. `window.confirm` / `alert` no longer appear anywhere
in `hms_frontend`, `admin`, `patient`, `aiportal` or `packages`; no `<datalist>` remains.
Manual coverage: `testcases.md` EMR-14…EMR-29 and the new AMD-01…AMD-15, plus
`docs/manual-testing-guide.md` §7.3b–d, §7.4–7.5 and §7.8.

## 2026-09-03 — Every remaining native dropdown, and three vocabularies that were being kept per screen (ADR-135)

ADR-134 converted the four `<select>`s that were master-data pickers. Thirty-three were left, and a
rule that holds on four screens and not on the other twenty is not a rule.

**Converted here:** patient registration and the patient chart's edit form (gender, blood group,
status), providers (gender, login account, specialty ×2, department ×2, roster weekday), users
(role on create; account status, role to assign, permission override, override effect),
departments (branch, head of department), services (department), referrals (status filter),
hospital availability (hospital, item type), HFR facility registration (facility), HPR
professional enrolment (clinician, category), the ABDM verification panel (verify using), the
external-history card (requesting doctor), and `RegistryMasterSelect` — which is one component and
therefore around twenty HFR fields at once.

**Two were more than a swap.**

- **The permission-override picker** listed ~200 raw keys with no search. It is now grouped by
  module, labelled with what the permission _means_, and searchable on the key as well — an
  administrator looking for "who can take money" does not know it is `billing.payment.collect`.
- **`RegistryMasterSelect`** kept all three behaviours it exists for and stated them better: a
  saved code whose list has not arrived leads the options with _"Saved earlier; the registry list
  is still loading"_ instead of disappearing behind a placeholder, and a registry that **failed**
  now reads differently from one that returned **nothing** and from a search matching nothing.

**Three vocabularies moved to `@hms/utils`.** Gender had been written out four times in four orders
with four different words for the empty answer; blood group twice; record status once as raw
column values (_active_ / _archived_) shown to a person. The patient portal keeps its own wording
for the blank gender — _Prefer not to say_ is right on a form a patient fills in themselves, where
_Not specified_ is right at a hospital counter — because that is the placeholder, not the list.

**A flourish was reverted during verification.** The shared blood-group list briefly used a
typographic minus (`AB−`) against the stored `AB-`. Every other surface renders the stored value,
so the picker would have spelled it differently from the chart beside it.

**Testing status:** monorepo typecheck 13/13, build 8/8, lint 0 errors (warning counts unchanged),
996 tests across 7 workspaces pass. Verified in the running Portal: zero native `<select>` elements
on `/patients/new`, `/providers`, `/services`, `/departments`, `/users`, `/referrals`,
`/laboratory`, `/pharmacy` and the patient chart. The decisive check was the wire, not the markup —
registering a patient sent `{"bloodGroup":"AB-","gender":"female"}`, and reopening that record
mapped the stored codes back to _AB-_ and _Female_. The test patient was archived afterwards.

## 2026-09-03 — Import from a spreadsheet, sign without printing, and lists that lead with the work

Portal side of ADR-136, ADR-137 and ADR-138.

**The sort control now does something.** Appointments and Billing are server-mode tables that
offered sorting and dropped the parameter: the arrow moved, the URL changed, the rows did not.
`api.sortParam()` turns the DataTable's sort state into the `key:dir` string both ends already
use, and the two pages send it.

**`components/import/BulkImportDialog.tsx` is the whole import experience**, for every module.
Four steps in the order somebody needs them: download a sample CSV with real columns and two real
rows; choose the file; **check the columns** — shown always, not only on failure, because a person
needs to see that `MRP` went to _Selling price_ before trusting the import; then the counts, the
duplicate strategy, and only the rows that need a decision. A table of 500 correct rows is not a
preview, it is the file they already have.

Wired into six pages — drug master, test master, services, doctors, departments, patients — as an
**Import** action in the `PageHeader` _before_ the page's primary action (ADR-128), gated by the
same permission as creating one record. Six lines of page code; the behaviour is identical
everywhere because it is written once.

**`components/profile/SignatureCard.tsx`** lets a person manage their own signature, and is
careful about three things that would otherwise mislead: it says on the card that this is an
image and not a certified cryptographic signature; it says that replacing does not change a
document already signed, at the moment somebody is deciding; and its remove dialog says "new
documents will print a blank line" rather than implying a purge. Earlier versions are listed, not
hidden — they are what past documents still show.

The prescription document renders the signature the encounter **pinned**, with the signing date
under the name. An unsigned one, or a clinician who has uploaded none, prints a blank line exactly
as before.

**Testing status:** typecheck 13/13, build 8/8, lint 0 errors. Verified against the running Portal
end to end: a CSV using another system's headers (`Drug Name` / `SKU` / `MRP`) auto-mapped, a bad
price and an in-file duplicate reported with the row numbers Excel shows, two rows imported with a
counted toast, and a re-import with **update** raising the price without creating a second row.

---

## The ABHA panel's OTP route and resend button (ADR-139) · 03/09/2026

Two controls added to `components/abdm/AbhaVerificationPanel.tsx`, both because an NHA certification
case asks for something a screen has to show.

**Send the OTP to.** An ABHA number and an ABHA address can each be verified by an Aadhaar OTP or by
the ABHA-linked mobile, and NHA makes all four combinations mandatory (`VRFY_ABHA_101`, `_102`,
`_201`, `_202`). The control appears only for those two identifiers — a mobile number and an Aadhaar
number have one sensible route each and get no control rather than a control with one option.

**Resend OTP.** `CRT_ABHA_106`, `VRFY_ABHA_305` and `_405` all say _"System may activate the Resend
OTP button maximum 2 times after 60 seconds"_. The endpoint had existed since ADR-084 and **nothing
in the Portal called it**, so the case was satisfied by a service and by no screen. `ResendOtpButton`
sits beside Verify on the Aadhaar creation step, the secondary-mobile step and every verification
route, counts down from sixty, allows two, and then says to start again. Each flow passes what it
must re-supply — the transaction stores a masked hint and nothing else, so there is no identifier
there to resend to.

Verified in the running Portal against the live API: the route control shows both options for ABHA
number and ABHA address and is absent for Mobile number; no new console errors and every ABDM request 200.
