# hms_frontend — KNOWLEDGE.md

Current state of the Nirogix Portal (staff-facing web app). Read after root `CLAUDE.md` and `hms_frontend/AGENTS.md`. See `DONE.md` for the chronological log.

> ⚠ **This is Next.js 16 (App Router, Turbopack, React 19).** APIs differ from older Next. `AGENTS.md` points at the version-matched docs bundled in `node_modules/next/dist/docs/` — read them before writing routing/rendering code.

## Purpose

The web portal for **hospital staff**, on its own origin (`:3001` → `portal.nirogix.com`). Since ADR-051 it serves hospital staff only — the vendor's platform-operator screens live in the separate `admin` application, so operator code no longer ships in a hospital's bundle.

The single web portal for all hospital staff roles. One RBAC-driven shell renders every role's workspace; the visible menu and pages derive from the signed-in user's **effective permissions**, but visibility is never security — every backend endpoint independently re-checks `auth → module → permission → business logic` (invariant #2).

## Stack

- **Next.js 16** (App Router, Turbopack default) + **React 19** + TypeScript
- **Tailwind v4** (`@import "tailwindcss"` + `@tailwindcss/postcss`) for layout utilities
- **@hms/ui** design system (tokens + primitives + Standard DataTable) — the source of every colour/spacing/radius/type value
- **@hms/permissions** (shared with the backend) for permission keys; **@hms/types** for API contracts
- No data-fetching library yet — a small typed `fetch` client (`lib/api.ts`). Server state lives in React context.

## Layout

```
app/
  layout.tsx            Root: fonts, @hms/ui styles, no-flash theme script, <Providers>
  providers.tsx         Client: <ThemeProvider><AuthProvider> composition
  globals.css           Tailwind + maps --hms-* tokens into Tailwind @theme (bg-surface, text-fg, …)
  page.tsx              "/" → redirect to /dashboard
  forbidden/page.tsx    Standalone 403 route
  (auth)/               Public route group (no shell): login, forgot-password, reset-password (ADR-081)
    layout.tsx          Centered card shell
    login/page.tsx      Org-code + email + password sign-in
  (app)/                Authenticated route group
    layout.tsx          CLIENT GUARD: redirects to /login unless authenticated; renders <AppShell>
    dashboard/page.tsx  Role-aware roll-up — platform stats (super-admin) or org summary (others)
    providers/page.tsx  Provider directory — Standard DataTable + live API (guarded by providers.view)
    audit/page.tsx      Audit log — paginated DataTable (guarded by audit.log.view)
    settings/            HOSPITAL CONFIGURATION CONSOLE (ADR-049) — tabbed layout
      layout.tsx         Page header + tab nav, shared by every tab
      page.tsx           Setup overview: derived progress, step checklist, area grid
      organization/      The hospital's identity — address, contact, registration, GSTIN
      documents/         Letterhead — image upload, page size, header/footer/signatory (ADR-056, ADR-065)
      branding/          Accent colour, logo, favicon (moved out of the old settings page)
      registration/      Patient self-registration QR — token, poster, regenerate (ADR-056)
      modules/           Entitled modules, read-only (entitlements are granted by Nirogix)
    patients/
      registrations/     Self-registration review queue — front desk converts a request
lib/
  api.ts                Typed fetch client: Bearer + silent refresh-on-401 + canonical error unwrap
  auth.tsx              AuthProvider + useAuth + useCan — session & capabilities context
  theme.tsx             ThemeProvider + useTheme — Light/Dark + per-tenant brand override
  nav.ts                Primary nav items, each tagged with its required permission key
components/
  AppShell.tsx          Sidebar (permission-filtered) + topbar (user, theme toggle, sign out)
  Can.tsx               <Can perm> (hide) + <RequirePermission perm> (page-level 403)
  Forbidden.tsx         The standard 403 panel
  PageHeader.tsx        Consistent page title block
  ThemeToggle.tsx       Light/Dark switch
```

## Authentication (client-side session)

- **Cross-origin, token-in-memory.** The Portal (`:3001`) talks to the backend API (`:4000`). `POST /auth/login` returns an **access token** (held in memory only — never localStorage) and sets an **httpOnly refresh cookie** on the API origin. All requests use `credentials: 'include'` so the cookie flows; `Authorization: Bearer` carries the access token.
- **Silent refresh.** On a full reload the access token is gone, so `AuthProvider` calls `POST /auth/refresh` (cookie) to mint a new one, then loads `/auth/me` + `/rbac/permissions`. A 401 on any call triggers one silent refresh + retry; if that fails the session flips to anonymous.
- **CORS/cookie:** backend runs `cors({ origin: true, credentials: true })`; the refresh cookie is `SameSite=Lax` (localhost ports are same-site, so it's sent cross-port). No backend change was needed.
- **MFA:** a `{ mfaRequired: true }` login response is surfaced as "not supported yet" (second factor lands in a later phase). SSO plugs in at the same layer.

## Authorization (RBAC-driven UI)

- **Capabilities context** (`lib/auth.tsx`): after login it loads the caller's **effective permission set** (`{ wildcard, permissions[] }`) from `GET /rbac/permissions`. `useCan(key)` = `wildcard || permissions.has(key)`.
- **Menu** (`AppShell`): `NAV_ITEMS` are filtered by `can(item.perm)`; items the user can't use never render.
- **`<Can perm>`**: hides buttons/fragments (e.g. a "New provider" action).
- **`<RequirePermission perm>`**: wraps a protected page's body; renders the standard **Forbidden** panel when the permission is missing, so a direct URL hit gets a clean 403 instead of a broken screen (and the API would 403 the data calls anyway).
- **Keys come from `@hms/permissions`** — the same module the backend enforces with, so the menu and server never drift.
- **The active nav item is the longest matching href** (`activeNavHref` in `lib/nav.ts`). A plain prefix test lit up both _Patients_ and _Registration requests_ on `/patients/registrations`; the longest match picks the specific one, while `/patients/{id}` — which has no item of its own — still resolves to _Patients_, which is what a detail page wants.
- Verified live (CITYCARE demo): **org_admin** sees Dashboard/Providers/Audit/Settings; **receptionist** sees only Dashboard/Settings, and a direct hit to `/providers` renders the 403 panel with **no `/providers` API call made**.
- **There is no platform context here (ADR-051).** `navGroupsForUser(can)` renders the hospital's navigation for everyone, including an operator inside a support session — they are working as a hospital user, and the banner says so. `lib/api.ts` holds no platform-administration call; `admin` does.

## Support sessions — the receiving end (ADR-037, ADR-051)

- `/support/enter` claims a session that the **admin console** mints. The token arrives by `postMessage`, never in a URL, because a URL lands in history, referrers and server logs.
- The sender is now a **different origin**, so the check is explicit: only `ADMIN_ORIGIN` (`lib/adminOrigin.ts`, from `NEXT_PUBLIC_ADMIN_ORIGIN`) may hand this tab a session. Before the split this was a `window.location.origin` comparison — correct then, silently wrong after.
- Once claimed, the operator sees this app's normal navigation with the support banner and an explicit exit.

## Hospital Configuration console (ADR-049)

- **`/settings` is the console**, not a personal settings page. A tab layout over `/settings` (setup overview), `/settings/organization` (the hospital's identity), `/settings/branding` and `/settings/modules`, gated on `platform.organization.manage`. It appears in the sidebar's _Organization_ group as **Hospital setup**.
- **Progress is derived, never stored.** `components/settings/SetupChecklist.tsx` renders `GET /setup/status`: each step shows its real count, a step whose dependency is unmet says what it is waiting on rather than hiding, and a step the user cannot perform says so instead of offering a dead link. `SetupProgressCard` puts the same status on the Hospital Admin dashboard, **removes itself once setup is complete**, and can be **dismissed** before then — an administrator who has decided to finish later should not be nagged every morning. The dismissal is keyed by **user id** in `localStorage`, because a shared reception machine is the normal case and one person hiding a nudge must not hide it from the next; it is read through `useSyncExternalStore`, so the server render stays honest and dismissing in one tab hides the card in the others. Hiding the reminder hides nothing else — the full checklist stays under Hospital configuration, which is in the sidebar.
- **The console links, it does not duplicate.** Branches, departments, providers, users, the lab test master and the drug master keep their own screens; the overview grid is how an administrator finds them. There is no tab for sub-departments, services, packages, treatment plans or wards — the product has none (`BACKLOG.md` E-1, E-3…E-8).
- **`/departments` (ADR-050)** — the Standard DataTable plus a create form whose branch and head pickers offer only this hospital's own records. The row action is a **toggle, not a delete** (visits reference departments), and its confirmation states how many doctors are attached. Check-in offers **active departments only**.
- **Setup is not a wizard.** There is no completion flag and no one-way flow; every area stays editable afterwards through the same console.
- **Appearance moved to `/profile`.** A theme is one person's preference, not the hospital's configuration.
- **Printed documents carry the hospital's identity:** `useDocumentBrand` fetches branding and the organization profile together and passes `contactLines`, the letterhead lines, the default signatory, the uploaded **letterhead image** and the **page size** into `PrintDocument` (ADR-065). An unconfigured hospital still prints name and logo only — nothing is invented; a hospital with an uploaded letterhead prints that image full-width in place of the text header.
- **One record, more than one screen (ADR-056).** `/settings/organization` edits `organization_profile` through the shared `components/settings/ProfileForm.tsx`; `/settings/documents` is its own cohesive screen (letterhead image, page size and letterhead text) that calls the profile API directly (ADR-065). Each screen declares the fields it owns and sends only those, so saving the letterhead cannot blank an address. There is no second identity store to drift.
- **`/hospital-setup/public-access` — "Patient self-service" (ADR-124)** — the one screen for all three QR surfaces: self-registration (ADR-056), online booking (ADR-069) and self check-in (ADR-118). Each is a `PublicAccessPanel` section with its own toggle, token, review-queue link, copy link, download PNG, print poster, preview and confirmed regenerate; each states plainly that nothing is created automatically. They were three tabs rendering the same component with different words, which left an administrator unable to tell from the screen which one they were on — but they are **not one setting**: separate columns, tokens, public endpoints, queues and audit trails, and turning one off leaves the other two working. The three old routes (`/hospital-setup/patient-registration`, `/hospital-setup/online-booking`, `/hospital-setup/self-check-in`) are **permanent redirects** in `next.config.ts`, because they are in bookmarks and printed on posters.
- **The QR is drawn in the hospital's own accent**, through `components/print/useRegistrationQr.ts` — one definition shared by the settings screen and the printable poster, so a preview and the printed sheet cannot differ. The colour passes through `ensureContrast` from `@hms/utils` first: a pale accent is darkened until it scans, keeping its hue, because a QR is read by a camera off a photocopy and a code that looks pretty but does not scan is worthless. Light modules stay pure white. The code is held **with the URL it encodes**, so a regenerated token never shows the retired code beside the new link.
- **`/print/registration-qr`** is the poster — a real document route with the hospital's logo, name, address and colour from `useDocumentBrand`, not a hand-built popup (ADR-047). It reads the registration settings itself under `platform.organization.manage`, so **no token travels in the URL**.
- **`/patients/registrations` is the review queue**, in the _Clinical_ nav group. Gated on `patient.record.view` — deliberately **not** `patient.record.create`, because gating the screen on the permission to _act_ would hide it from everyone who may only look. The approve/reject actions carry `permitted={canReview}` (`patient.record.create`), so a role that may view but not act — a cashier — sees the queue read-only. Since ADR-125 `org_admin` holds both and can work the queue; the server re-checks both regardless.

## The patient chart (ADR-119, reordered by ADR-127)

Five tiers, ordered by what a member of staff reaches for: an **identity strip** (initials, name,
UHID, age, gender, date of birth, blood group, status) above everything; **Contact** then
**Emergency contact**; **National health ID (ABDM)**, which is an identifier rather than a
demographic; **Treatment cases** then **Immunisations**, because ongoing care outranks past care;
and then **History** → **History from other hospitals** → **Patient portal access**, which is
administrative and goes last.

Blood group is a badge, not a table row — it is clinical, and its **absence is stated** rather than
left blank. Age comes from `ageInYears` in `@hms/utils`, shared with the patients list so the two
cannot disagree. `CasesCard` carries `opd.case.view` (it was gated on `clinical.immunization.view`
by sharing a `<Can>` with the immunisations card, so a role with case permission but not
immunisation permission saw neither). There is **no allergies section**: the patient record has no
allergies field, and an empty card would promise a place to record something the system cannot
store — tracked in `BACKLOG.md`.

## Access refusals (ADR-126)

`RequirePermission` checks the **module before the permission**, in the order the server enforces
(`requireModule()` → `requirePermission()`). It matters now that an administrator holds nearly
every key (ADR-125): typing `/pharmacy/stock` in a hospital with no Pharmacy module would
otherwise render the screen and fail against the API. The module comes from
`permissionModuleKey()` in `@hms/permissions`, derived from the registry; a permission the
registry does not claim is Platform Core and is never module-gated. An entitlement set that has not
loaded yet is empty and is **not** read as "this hospital has nothing" — the sidebar makes the same
allowance.

`components/Forbidden.tsx` fetches `GET /rbac/access?permission=…` and answers what a bare 403
cannot: the required permission in words _and_ as a key, the roles in **this** hospital that hold it
(from the tenant's own `role_permissions`, so a custom role appears without being hard-coded), and
whether the hospital has the module at all. The module case gets its own headline and no role list,
because it is the hospital's subscription and no administrator can grant past it. The fetch is
`feedback: false` — the screen is already showing the refusal, and a toast would report the same
event twice (ADR-057).

## Missing values (ADR-123)

Nothing in the Portal renders a bare `—` any more. An absence goes through `EmptyValue` /
`ValueOrEmpty` from `@hms/ui`, or `emptyLabel()` / `valueLabel()` where a string is needed — a
DataTable `accessor`, a print document, an export, an accessible name — and the call site names the
reason, because only the call site knows which is true: a walk-in's Provider is **Not assigned**
(assignable), a public booking's Department is **Not specified** (the patient did not ask), an audit
entry written by a job is **Not applicable**, a doctor without a personal fee is **Not configured**
(the fee schedule decides — ADR-117), a user with no roles is **None**.

Two habits go with it. The **accessor carries the same words as the cell**, so a column filters and
searches on "Not assigned". And a column that is empty on _every_ row is treated as a data or query
problem: `/services` read `Department: —` on every row not because the API withheld it — it comes
from a real left join — but because the dataset never named a department for a seeded service
(fixed in the dataset, with a backfill for rows already seeded — ADR-122).

## Design system & theming

- **@hms/ui is the only source of visual tokens.** `import '@hms/ui/styles.css'` (once, in the root layout) defines the `--hms-*` custom properties (colour, radius, type, shadow) — **Light under `:root` (default), Dark under `[data-theme="dark"]`**. Primitives (`Button`, `Field`, `Card`, `Badge`, `Alert`, `Spinner`, `DataTable`) are built entirely on those tokens; nothing hardcodes a raw value.
- **Tailwind shares the tokens.** `globals.css` maps `--hms-*` into Tailwind's `@theme` (`bg-surface`, `text-fg-muted`, `border-border`, `bg-brand`, `rounded-token`…), so app-level layout utilities use the exact same values as the primitives.
- **Theme** (`lib/theme.tsx`): `data-theme` on `<html>` toggles Light/Dark; persisted to `localStorage`; a no-flash inline script applies it before first paint. Default is **Light**.
- **Tenant branding (server-persisted, ADR-021):** the accent is a single token (`--hms-brand`). `theme.tsx` exposes `applyBranding(b)` (sets **only** `--hms-brand` — hover, pressed, subtle and the focus ring derive from it in the token layer, ADR-040 — swaps the favicon, tracks the logo URL) and `previewBrandColor(hex)` (live preview while editing). `components/BrandingLoader` (mounted in the authenticated shell) fetches `GET /branding/current` at bootstrap and applies it; a cached brand colour in `localStorage` lets the no-flash script paint it before hydration. The **Hospital configuration → Branding** tab (org_admin, `platform.branding.manage`) is a real colour picker + logo/favicon upload + reset, persisted via the branding API. `AppShell` shows the uploaded logo. No component hardcodes colour — branding is a token swap.
- Verified in **Light and Dark** and under a **non-default brand**.

## shadcn/ui — CLI + reference layer (ADR-028)

Installed, but **not** a second component kit: `@hms/ui` remains canonical and nothing shadcn-generated ships without review.

- `components.json` (style `base-nova`, base `base` = Base UI, Lucide icons, `@/` alias), `lib/utils.ts` (`cn` for generated components), and `components/ui/` as the `shadcn add` target. Dependencies: `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`; the `shadcn` CLI is a devDependency.
- **`app/globals.css` re-points shadcn's whole semantic contract at `--hms-*`** — `--background`/`--foreground`/`--card`/`--popover`/`--primary`/`--secondary`/`--muted`/`--accent`/`--destructive`/`--border`/`--input`/`--ring`/`--radius`/`--sidebar-*`/`--chart-*`. shadcn's neutral OKLCH palette and its `.dark` block are deliberately absent, and `@custom-variant dark` is redefined to `[data-theme="dark"]` (the switch this app actually uses). Net effect: a component added by the CLI inherits Light/Dark **and** the tenant accent with no extra work.
- Init's two regressions were reverted by hand: `--font-sans` is back to `var(--hms-font-sans)`, and the generated demo `button.tsx` was deleted (the `@hms/ui` `Button` is the real one).
- Usage rule: run `npx shadcn@latest add <component>` for primitives `@hms/ui` lacks (Select, Dialog, Command, Popover), then review — tokens, both themes, tenant accent, a11y — before it reaches a screen. The `shadcn` agent skill in `.agents/skills/` reads this config.

## The Standard DataTable

Every tabular view renders through `DataTable` from `@hms/ui` (ADR-029) — a **configuration**, never a per-page table. Columns carry `sortable` / `filterable` / `hideable` / `defaultHidden` / `accessor` flags; the toolbar (search → filters → columns → actions) and pagination (10/20/50/100 + "Showing X–Y of Z") come with it, as do the skeleton, empty and error states.

- **Server mode** for large datasets: pass `server={{ total, page, pageSize, search, sort, onChange }}` and the API owns paging/search (search is debounced). **Patients** runs this way, with `urlState` so `?page/size/q/sort` survives a reload and a link.
- **Client mode** for small local sets — **Providers** sorts, searches, and offers faceted filters (Specialties, Status) in the browser.
- **Row actions use the shared Action column** (ADR-039): `actionsColumn()` + `TableActions`, with `ViewAction` / `EditAction` / `ToggleAction` / `TableAction` / `MoreActions` inside it. Permission gating is a prop (`permitted`), not a hand-rolled conditional, and every destructive or state-changing action carries its own confirmation copy. Live today on patients (view / edit / archive-reactivate), providers (edit / assign specialty / deactivate-reactivate — plus an Add doctor dialog, ADR-066), branches and users and tenants (view + suspend/activate switch), appointments (check in / cancel), OPD (open visit / start consult / complete — actions carry the visit `version`), pharmacy stock (receive), billing (view invoice), the tenant's module list (revoke) and a user's roles and overrides (remove / revoke). Dates in cells come from `@hms/utils` (`DD/MM/YYYY`).
- The remaining screens (audit, appointments, billing, opd, laboratory, pharmacy, users, branches, tenants, reports) still pass the original `{ key, header, cell }` columns — valid, since the API is a superset — and gain sorting/filters by adding flags. Tracked in root `BACKLOG.md`.

## Shared workflow components

Consultation type and case type (ADR-121) appear **only where the hospital has defined them** — in the check-in form, in `CasePicker`, in `CasesCard`'s new-case dialog, and as two more dimensions on the fee-schedule screen. An empty vocabulary means no field anywhere, which is the default. `hospital-setup/workflow` edits both lists with a local `TypeListEditor` (a chip list, not a comma-separated field, so a trailing comma cannot become a price dimension); it is used twice on that one screen and moves to `@hms/ui` if a third use appears. `CaseChoice` carries the chosen case's own `caseType` so the desk can be quoted the right fee without a second fetch — it is never sent back, because the server prices from the case row.

`components/patients/ConsentStatusCard.tsx` shows a patient's ABDM consent **state** in the check-in rail (ADR-120) — waiting, granted, declined, lapsed or failed — and never a record, a source hospital or the requesting clinician. It also says who may ask: the request carries a named doctor's registration number to the patient, so the desk can see that nothing has been asked but cannot ask. Where the hospital lacks the external-history capability the API 403s and the card renders **nothing**, because advertising a feature a hospital has not bought is worse than silence. Rail-only — the chart has `ExternalHistoryCard`, which shows the records to whoever may read them.

`app/(app)/opd/[id]/page.tsx` is the consultation, and it is a **record rather than a form** (ADR-134). Three things follow from that. Its `PageHeader` is `sticky`, because the doctor fills prescriptions several screens below it and Save must not be something they scroll back up to find; beside Save the header states _Unsaved changes_ / _All changes saved_, derived by comparing a canonical snapshot of the form against the server's last answer — not a dirty flag, so typing something and undoing it reports saved. Every request goes through one in-flight ref, because `loading` disables a button on the _next_ render and a double-click happens before that. And signing proceeds only from its own save's result: the two used to share a `try`, so a failed save was followed by an attempt to sign anyway.

A **signed** note is read-only and carries its amendment trail. With `emr.encounter.amend` it also carries an **Amend consultation** action, which asks for a reason in a form dialog stating what is preserved; without the permission the screen names the permission in words and as a key and says who to ask (ADR-126) — never a disabled button. While `status === 'amending'` the fields edit exactly like a draft, and a banner keeps saying which it is, under whose reason, and when the note was originally signed.

The drug, lab-test and ICD-10 pickers are `Combobox` from `@hms/ui`; the ICD-10 one runs in server-search mode (`filter={false}`) with `onSelect` adding a row, since it is a search-and-add control rather than a bound value. `Add medicine` / `Add test` live in the `Card` **footer** at the end of the list they extend (ADR-128 governs the _page's_ primary action, which is still top-right), and the footer states how many blank rows will not be saved rather than dropping them silently. Confirmation is the shared `ConfirmDialog` for signing, discarding an amendment, and deleting a row **the server already holds** — removing an unsaved row just removes it.

`components/patients/PatientHistory.tsx` serves two surfaces (ADR-119): the patient chart (`layout="grid"`) and the check-in side rail (`layout="rail"` — one column, newest four per block). **Every block is permission-gated and the API re-checks**, which matters here more than almost anywhere: the same component renders for a receptionist at the desk and a doctor in the consultation. Reception sees cases, visits, bills and documents; the **Consultations** block carries chief complaints and ICD-10 diagnoses, needs `emr.encounter.view`, and is absent without it. Only this hospital's own records — external history is consent-gated and doctor-initiated from the chart (ADR-092), never pulled into a desk-side panel. The Cases block is rail-only, because the chart has the richer `CasesCard`.

`/opd/arrivals` is the Arrivals board (ADR-118): patients who scanned the entrance QR to say they are here. Nothing on it is a check-in — confirming a row runs the ordinary check-in, so the public path buys the patient a shorter queue rather than a way around `opd.visit.checkin`. An arrival the server could not match to an appointment stays on the board marked _Needs a human_ rather than being dropped: it is a person in the lobby. The settings screen and the printable poster are configurations of the same `PublicAccessPanel` / `PublicQrPoster` / `usePublicQr` that registration and booking use — a third instance of one pattern, not a third implementation.

The consultation fee at check-in is **shown, never typed** (ADR-117): `VisitWorkflow` previews it from the fee schedule as the doctor, department or visit type changes, and badges where the number came from. A free-text fee box with the doctor's default as a placeholder was itself the problem — it read as an invitation to type something else. "Charge a different amount" appears only for `billing.fee.override` and demands a reason; the server re-checks both. Hospital configuration → **Fee schedule** lists rules most-specific-first, in the order the server applies them.

`components/visit/CasePicker.tsx` asks which course of treatment a visit belongs to (ADR-116) — none (the default, because most visits are one-offs), an existing open case, or a new one. A patient's open cases load the instant a patient is chosen and are named above the control: accidental duplicates come from not knowing a case exists, so they are made impossible to miss rather than the second one being refused. `components/patients/CasesCard.tsx` manages them from the chart, keeping closed cases visible with the reason they closed.

`components/visit/VisitWorkflow.tsx` is the **one** workflow that brings a patient into the hospital (ADR-115). Booking and check-in were two forms asking the same questions and differing in _when_, so timing is a control inside the form rather than a choice of page. `/opd/check-in` and `/appointments/new` are thin wrappers that render it with a different starting timing — the routes stay because the navigation, the OPD queue, the chart and the referral worklist link to them and their permissions differ, but there is only one implementation. The **When** toggle appears only for a user holding both permissions, and is hidden when the patient came from a booked appointment or a pending referral, neither of which can become a future booking. Switching keeps every shared answer and resets only the half that no longer applies.

`components/vitals/VitalsFields.tsx` is the one vitals form, used by check-in, the vitals queue and the consultation (ADR-113). Which fields appear comes from the hospital configuration (`GET /workflow-config`); the units, bounds and labels never vary by where the staff member is standing. Blood pressure is one control with two numbers. A blank field means **not taken**, never zero — `toVitalsPayload` drops blanks rather than sending them.

Hospital configuration → **Workflow** (`/hospital-setup/workflow`) chooses the vitals placement, which parameters are required or offered, and when the fee is settled, for the whole organization or one hospital. It states where the numbers on screen came from, because "this hospital is following the organization default" is what an administrator needs to know before changing anything. `/opd/vitals` is the vitals queue; a hospital on a different placement gets an explanation and a link to the setting, not an empty table.

`components/patients/PatientPicker.tsx` is the single answer to "which patient?" — a debounced search over UHID, name and phone, plus registration in a dialog for when the answer is nobody. Used by OPD check-in and appointment booking, so both ask the question identically and neither has to navigate away and lose a half-filled form. The typed search text seeds the new record; a `DUPLICATE_PATIENT` 409 switches the dialog to the matching charts with **Use this patient** as the primary action; the whole registration affordance is absent without `patient.create`. Reach for it before writing another patient search.

Every dropdown on the check-in and booking path is `Select` from `@hms/ui` (ADR-112) — searchable, with the provider option showing the speciality underneath and the fee on the right, so the fee is quoted as the doctor is picked. The remaining native `<select>` elements elsewhere in the Portal are a tracked mechanical sweep (root `BACKLOG.md`).

## System Admin dashboard (ADR-043)

`/platform` is the operator's home — the whole platform, never one hospital, and **every tile is a real query**: `GET /admin/stats` for the counts, `GET /admin/trends` for month-by-month growth derived from each record's own `created_at`, the audit trail for security activity by day and severity, and the API's own liveness/readiness probes for health. Metrics with no data source (revenue, subscriptions, storage, uptime history, support tickets) are listed as pending on the screen rather than estimated.

- **Charts come from `@hms/ui`** (`AreaChart`, `BarChart`, `StatCard`, `UsageBar`) — token-driven SVG, no charting dependency, and each repeats its data in a visually-hidden table.
- **A range control (6 / 12 / 24 months)** re-queries every series at once; the API clamps `months` to 3–36.
- **`/dashboard` is the hospital's dashboard only.** A platform operator hitting it is redirected to `/platform`, unless they are inside a support session — where the tenant's own view is the whole point (ADR-037).

## Printable documents (ADR-047)

`app/(print)/` is an authenticated route group with **no application shell** — printing an app page would put the sidebar, topbar and action buttons on the invoice. `/print/invoice/[id]` and `/print/lab-order/[id]` exist today; a new document is a template under the same group.

- Built from the `@hms/ui` document kit; the page supplies content, the kit supplies geometry, repeating table headers, page breaks, signatures and the footer.
- `components/print/useDocumentBrand.ts` resolves the hospital's own name, logo and accent from `GET /branding/current` (RLS-scoped), falling back to the Nirogix default. Printing waits for it, so a document never appears without its header.
- The route carries the same `RequirePermission` as the screen and reads the same endpoint — a user cannot print what they could not open.
- **Not yet available in the header:** address, phone, email, website, registration/GST numbers — not in the schema (`BACKLOG.md` U-8). The header renders what exists rather than a placeholder.

## Role dashboards (ADR-044)

`/dashboard` picks a dashboard from **what the user is permitted to do**, never from a role name — a hospital can rename its roles, but permissions are the truth:

| Who                          | Gets                                                                        | Built from                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Platform operator            | redirect to `/platform`                                                     | ADR-037 — an operator has no clinical dashboard                                                                           |
| Can manage users or branches | `HospitalAdminDashboard`                                                    | revenue billed vs collected, today's OPD load by hour, doctors on duty, low stock, registrations, capacity, quick actions |
| Clinical permission          | `ClinicalDashboard` with `role=doctor \| receptionist \| pharmacist \| lab` | one component, four configurations — the queue, the worklist, prescriptions, arrivals                                     |
| Anyone else                  | `StaffDashboard`                                                            | degrades to exactly what their permissions reach                                                                          |

All of them are configurations of `components/dashboard/DashboardShell` (`DashboardShell` · `KpiGrid` · `DashboardRow` · `RangeChips` · `PanelRow` · `PanelEmpty`), which is also the shape `/platform` uses — so every dashboard in the product reads the same way. One endpoint feeds them: `GET /dashboard/overview` (RLS-scoped, real rows only, clinical day bucketed in server-local time).

## Navigation (ADR-043)

The Portal **scrolls natively** (ADR-111) — Lenis runs on the marketing site only. The shell **scrolls in two panes**: the sidebar is `sticky top-0 h-dvh overflow-y-auto overscroll-contain`, so a long menu scrolls inside itself instead of with the page, and the topbar is sticky too. `dvh` rather than `vh` because a phone's collapsing browser chrome otherwise leaves the sidebar taller than what is visible. `lib/nav.ts` exports **grouped** navigation — `PLATFORM_NAV_GROUPS` (Customers · Platform · Account) and `TENANT_NAV_GROUPS` (Clinical · Revenue · Organization · Account) — with `navGroupsForContext()` filtering by permission and dropping any group left empty. `PLATFORM_NAV` / `NAV_ITEMS` stay as flattened lists for the mobile bar. A new screen joins a group; a new area of the product adds one. Never add an item for a screen that does not exist yet.

## API feedback (ADR-026)

**One** notification path: the shared `@hms/ui` toast, raised inside the API client. Pages never write toast logic.

- `lib/apiErrors.ts` — `ApiRequestError` (canonical `{ error: { code, message, details? } }`), `NetworkError`, `TimeoutError`. Split out so the client and the feedback layer share them without an import cycle.
- `lib/feedback.ts` — the only place an outcome becomes user-facing copy. `describeError()` maps timeout / offline / 401 / 403 / 404 / 409 / 400+422 / 429 / 5xx / unknown to a title + description, preferring the **backend's own message** when it is usable (a bare error code, a stack-shaped string, or anything over 300 chars is rejected). **5xx always uses generic copy** — a server message may carry internals. Full detail goes to the console/error tracker, never the screen; PHI never enters a toast. `successMessage()` prefers the API's `message`, then the call's own copy (a string or a formatter over the response), then `Saved.`/`Removed.`.
- `lib/api.ts` — `request()` owns it: a 30s `AbortController` timeout turns a stalled call into `TimeoutError`, a dead connection into `NetworkError`; **every failure notifies**; **every mutating method also notifies on success**. Per-call `feedback` opts out (`false`), silences just the success toast (`{ success: false }`), or sets the copy (`{ success: "Patient registered." }` / a formatter, e.g. dispensing reports drug × qty and the amount added to the bill). Sign-in is the one opt-out: it renders failure inline from the same `describeError()` copy, so nothing is said twice.
- Pages keep **client-side validation** messages and DataTable load-error states; they no longer keep "Saved."-style banners.

## SEO boundary (ADR-027)

The Portal is private and never indexed: the root layout sets `robots: { index: false, follow: false, nocache: true }` (+ `googleBot.noimageindex`) and `app/robots.ts` disallows the whole origin. No patient/tenant/staff/operational data may appear in metadata, a URL path, an OG image, or a sitemap. All product SEO belongs to `marketing/`.

## Frontend performance

## Browser security headers (ADR-082)

`proxy.ts` (Next 16’s replacement for `middleware.ts`) sends the Content-Security-Policy built by `@hms/utils` plus `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a `Permissions-Policy` that leaves only the microphone (dictation, ADR-070). This app is in **nonce mode**: a per-request nonce, `strict-dynamic`, and no `unsafe-inline`. The root layout is async so it can read the nonce from the `x-nonce` header and stamp it on the one inline script the app owns (the no-flash theme script) — any new inline script needs the same treatment, or it will not run. Sessions also sign out after 15 minutes idle (`@hms/client`, ADR-082).

- Fonts: `next/font` (Geist / Geist Mono). Images: `next/image` — the tenant logo (AppShell + Settings) uses `unoptimized` with explicit dimensions, because tenant assets come from per-deployment object storage whose origin cannot be enumerated in `images.remotePatterns`.
- Heavy, non-critical UI uses `next/dynamic`; third-party scripts go through `next/script`; `<head>` comes from the Metadata API. No third-party analytics by default — and never PHI or tenant-identifying data in any telemetry.

## Conventions

- **Client vs server components:** context/providers/interactive pages are `"use client"`. `app/page.tsx` uses a server `redirect()`. Route groups `(auth)` / `(app)` separate the public and authenticated shells without adding URL segments.
- **Every API call goes through `lib/api.ts`** — never a bare `fetch`. It centralises the base URL, auth header, refresh, and error unwrapping.
- **Permission keys are never string literals in components** — import them from `@hms/permissions`.

## Running

- Dev: `npm run dev -w hms_frontend` → `http://localhost:3001` (needs the backend on `:4000`; set `NEXT_PUBLIC_API_BASE_URL` in `.env.local`, default `http://localhost:4000/api/v1`).
- All apps together: `npm run dev` at the repo root (turbo) — backend `:4000`, portal `:3001`, marketing `:3000`.
- Build: `npm run build -w hms_frontend` (Turbopack; all routes prerender static). Typecheck: `npm run typecheck -w hms_frontend`.
- **Demo login:** org `CITYCARE`, `admin@citycare.example` / `ChangeMe#123` (org_admin) or `reception@citycare.example` / `ChangeMe#123` (receptionist, reduced menu).

## Constraints / not-yet-built

- No unit/component tests yet (Playwright/RTL land with the testing increment). Verification so far is live browser walkthrough + `next build`.
- Access token in memory means a hard reload always does one `/auth/refresh` round-trip (by design; avoids storing a JWT in `localStorage`).
- Admin CRUD (create provider, assign specialty, manage roles/users) is not wired to the UI yet — the pages are read-only views proving the shell, auth, RBAC, and DataTable. Forms come with each module's real screens.
- **Super-Admin area (built, A3):** `app/(app)/admin/tenants/` — Tenants list, the **Create-Tenant wizard** (org → module checklist from `GET /admin/module-catalog` → first admin → optional branch, with a **one-time temp-password reveal**), and the tenant detail page (status control, module grant/revoke, branches). Gated by `platform.tenants.manage` (only `super_admin`; the "Tenants" nav item and pages are hidden/403 for everyone else). Onboarding is operator-driven, not public self-registration (ADR-020).
- **Org-Admin area (built, A4):** `app/(app)/users/` — Users list (roles + status) with inline create (one-time temp-password reveal) and a detail page (status, role assign/remove, effective-permission view, GRANT/DENY override add/revoke from the `@hms/permissions` catalog). `app/(app)/branches/` — list + inline create + active toggle. Reads gated by `platform.users.view`/`platform.branches.view`; mutating controls wrapped in `<Can>` for `.manage` / `platform.rbac.manage`. Nav items "Users"/"Branches" appear for `org_admin` (not for roles lacking the view permission).
- **Master data & immunisations (built, ADR-072):** `components/catalog/CatalogPicker` (+ `CatalogPickerButton`) is the one shared, searchable "Choose from catalogue" picker over `GET /catalog/:category`; the lab-test, drug, service and department setup forms use it to pre-fill standardised fields from the seeded system catalogue (price/tax/stock stay the hospital's). `components/patients/ImmunizationsCard` on the patient record lists and records a patient's vaccinations from the India schedule or a hospital-custom vaccine. **Per-hospital availability (ADR-073):** the `/settings/availability` tab lets an org_admin toggle which drugs/lab tests/services/vaccines each hospital offers; the day-to-day pickers filter by branch (backend-enforced).
- **ABDM / ABHA at registration (built, ADR-084):** `components/abdm/AbhaVerificationPanel.tsx` above the patient registration form — Scan & Share (facility QR, no OTP) leading, plus verify-an-existing-ABHA and create-from-Aadhaar. It never registers anyone: it returns a prefill (which fills **only empty fields**) and a transaction id the form links after the chart is created. The capabilities probe is silent by design, so a tenant without the `abdm` module simply sees no panel. `app/(app)/hospital-setup/abdm/` is where org_admin enters the hospital's own HFR facility id and QR payload. QR drawing is shared through `lib/useQrDataUrl.ts` (ADR-029); `components/print/usePublicQr.ts` composes it.
- **The ABHA panel carries two controls the certification cases require (ADR-139):** _Send the OTP to_
  — shown only for an ABHA number and an ABHA address, the two identifiers NHA offers a choice on
  (`VRFY_ABHA_101`/`_102` are the Aadhaar route, `_201`/`_202` the ABHA-linked mobile) — and
  `ResendOtpButton`, sixty seconds and at most twice, beside Verify on **both** the enrolment and the
  verification steps. The resend endpoint had existed since ADR-084 with no caller anywhere, so
  `CRT_ABHA_106` was an API-only claim against a case that asks for a button. The countdown is UX;
  the limit is re-checked on the transaction, so a reloaded page cannot spend a patient’s daily
  UIDAI allowance.
- Public self-registration + self-serve billing stay in the Enterprise track. Password reset / email invite, per-branch branding, and a custom-role editor are later slices.
- MFA challenge, forgot-password, and branch switching are stubs/not present.

## Module & capability aware navigation (ADR-085)

The sidebar, the mobile bottom bar and the drawer all render the intersection the backend already
enforces: **tenant module ∩ tenant capability ∩ user permission**. `NavItem` carries an optional
`module` and `capability`; `navEntitled(item, entitlement)` in `lib/nav.ts` is the single predicate
both `navGroupsForUser` and `mobilePrimaryNav` use, and a group whose every item is hidden
disappears. Entitlement comes from the shared session (`@hms/client` `useAuth().hasModule` /
`hasCapability`, loaded from `GET /entitlements`).

Rules worth keeping:

- **Hiding is never the boundary.** Every route is independently re-checked by `requireModule` →
  `requireCapability` → `requirePermission`; a hidden item typed as a URL still gets a 403 and the
  screen reports _"This module is not available for your organization"_.
- **WILDCARD does not bypass entitlement.** A platform operator in a support session still cannot
  see a module the hospital never bought — entitlement is the tenant's, permission is the user's.
- **No entitlement context = show everything permitted.** While the session loads (or if the
  entitlements call fails) the menu falls back to permission-only filtering rather than emptying.
- An item with no `module` is Platform Core (Dashboard, Profile, Users…) and is never entitlement-filtered.

Covered by `lib/__tests__/nav.test.ts` (8 tests — the Portal's first automated tests).

## Bulk import and signatures (ADR-137, ADR-138)

`components/import/BulkImportDialog.tsx` is the **only** import UI, for every module: sample CSV,
file, column check, preview, duplicate strategy, commit. A page adds `<BulkImportAction
moduleKey="drugs" onImported={reload} />` to its `PageHeader` — _before_ its primary action
(ADR-128) — and gets identical behaviour, because the module's fields, aliases and duplicate key
come from the server (`GET /imports`), not from the page.

Two deliberate choices in that dialog. The **column check is always shown**, not only when
detection fails: a person needs to see that `MRP` went to _Selling price_ before trusting an
import. And the preview lists **only rows that need a decision** — a table of 500 correct rows is
not a preview, it is the file they already have.

`components/profile/SignatureCard.tsx` manages a person's own signature. It says on the card that
this is an image rather than a certified cryptographic signature; it says that replacing does not
change a document already signed, where somebody is deciding; and "remove" is described as _new
documents print a blank line_, because that is what it does. Earlier versions are listed rather
than hidden — they are what past documents still show.

The prescription document renders the signature the **encounter pinned**, never the doctor's
current one. Absent renders a blank line, exactly as before the feature existed.

Both import endpoints are multipart, so they go through `send` rather than `request`: the shared
client JSON-stringifies every body, which would destroy a `FormData`.
