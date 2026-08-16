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

**What:** The Portal side of Appointments — the schedule list, a booking form, and cancellation — completing the clinic spine *register patient → book → cancel* (development-plan §21).

**Added:**
- `app/(app)/appointments/page.tsx` — schedule (DataTable: when, patient→profile link, provider, duration, status) with a **status filter**, pagination, and a per-row **Cancel** (`<Can appointment.booking.cancel>`, booked rows only) + "Book appointment" (`<Can appointment.booking.create>`).
- `app/(app)/appointments/new/page.tsx` — booking form: **patient picker** (debounced search → pick), provider select, `datetime-local`, duration, reason; supports `?patientId=` prefill; surfaces the **double-booking 409** as an inline error. Wrapped in `<Suspense>` (uses `useSearchParams`).
- Nav "Appointments" (`appointment.booking.view`); `lib/api` + `@hms/types` appointment contracts. **`@hms/permissions`: receptionist granted `providers.view`** so the front desk can pick a provider when booking (re-seed applies it to existing tenants).

**Testing status:** typecheck green (7 workspaces) · `next build` green (18 routes). **Live-verified (receptionist):** the seeded appointment lists with patient+provider names; booking a **free slot** succeeds → appears in the list; booking the **already-booked provider slot** shows *"The provider already has an appointment in this time slot"* (409); **Cancel** flips the row to `cancelled` and removes its Cancel action. Test appointment removed afterward.

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

**Cause:** those screens were still passing the *minimal* column shape (`{ key, header, cell }`) the old table accepted. Without an `accessor` a column has no comparable value, so the table could not sort, search, or facet it — and their pages still owned paging themselves, so the table's rows-per-page control changed nothing the API was asked for.

**Fixed:**
- `@hms/ui` — a column with an `accessor` is now **sortable and searchable by default** (opt out with `sortable: false`), so configuring a table no longer means repeating flags. Server-mode sorting now computes the next sort state and emits *that* (it previously read the pre-click state back through a `setTimeout`, so the API received the wrong sort). The toolbar no longer renders an empty bar for tables with no filters.
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

**Testing status:** `typecheck` green (7 workspaces) · both apps `next build` green *after* the removals — which is the proof the code was dead.

---

## 2026-08-15 — App-like mobile navigation (ADR-033)

- `lib/nav.ts` — `MOBILE_PRIMARY_ORDER` + `mobilePrimaryNav(can)`: ranks the permission-filtered nav by day-to-day use, so the bottom bar shows what *this* user actually works with (receptionist → OPD/Appointments/Patients; pharmacist → Pharmacy; super-admin falls through to Tenants).
- `components/AppShell.tsx` — renders the shared `BottomNav` (five slots, mobile only) plus a top-right hamburger opening the shared `NavDrawer` with every permitted module. `main` carries `.hms-bottomnav-offset`. The desktop sidebar is untouched and the bar never renders above `md`.

**Testing status:** `typecheck` + `next build` green. **Live-verified at 375px** as CITYCARE org_admin: bar renders the permitted destinations with the active one marked, sidebar hidden, drawer lists all 11 permitted modules, `body` scroll locks while open and restores on close, `data-lenis-prevent` set, focus trapped inside, Esc closes.

---

## 2026-08-15 — Tests for the API feedback classifier

Vitest added (`npm run test -w hms_frontend`), with 12 tests over `lib/feedback.ts` — the layer every API failure passes through (ADR-026). They pin what the user is *told*, which is a security boundary as much as a UX one:

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

**Added a shared dashboard layout** (`components/dashboard/DashboardShell`) — context line, title, range chips, KPI grid, panel rows, panel rows and empty states — and rebuilt every hospital dashboard as a *configuration* of it, matching the shape `/platform` already used.

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

Joined the sidebar's *Organization* group and the Hospital Configuration console's area grid. Check-in gained a department picker that offers **active departments only** — the server refuses a retired one regardless, so the form simply never presents an invalid choice.

**Testing status:** typecheck clean, `next build` clean (`/departments` prerendered), 12 frontend tests pass. Lint reports the repo-wide `react-hooks/set-state-in-effect` on the data-loading effect — the same shape every other Portal list page has, and tracked in `BACKLOG.md` as repo-wide debt rather than solved differently on one screen. Manual cases DEPT-01…DEPT-21 added to `testcases.md`.
