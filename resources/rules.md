# Rules & Engineering Standards

**Document:** `rules.md`  
**Version:** 1.0  
**Last Updated:** August 2026  
**Prepared for:** Takoriya Technology LLP  
**Source of Truth:** Enterprise HMS — Architecture and Development Roadmap v2.1, plus two corrections identified in subsequent review (permission-cache expiry bound; break-glass notification/review boundary).

---

This document states rules only. For the architecture each rule is derived from, see **Architecture Document**. For when each rule applies during the build, see **Development Phases & Roadmap**.

---

## Contents

- **Engineering Standards**
  - [Design System & UI Consistency](#design-system--ui-consistency)
  - [Standard DataTable](#standard-datatable)
  - [Table Row Actions](#table-row-actions)
  - [Seeded Data That Ages](#seeded-data-that-ages-binding--adr-133)
  - [Multi-Step External Flows](#multi-step-external-flows-binding--adr-130)
  - [Configuration Read Keys](#configuration-read-keys-binding--adr-129)
  - [Page Actions](#page-actions-binding--adr-128)
  - [Form & Input Behaviour](#form--input-behaviour-binding--adr-127)
  - [Access Refusals](#access-refusals-binding--adr-126)
  - [Missing Values](#missing-values-binding--adr-123)
  - [Light & Dark Theme](#light--dark-theme)
  - [Branding & Multi-Tenant Customization](#branding--multi-tenant-customization)
- **Development Rules**
  - [Architecture Rules](#architecture-rules)
  - [Authorization Rules](#authorization-rules)
  - [Tenancy Rules](#tenancy-rules)
  - [Database Rules](#database-rules)
  - [API Rules](#api-rules)
  - [UI / UX Rules](#ui--ux-rules)
  - [Frontend Delivery Workflow](#frontend-delivery-workflow)
  - [SEO / AEO / GEO Rules](#seo--aeo--geo-rules)
  - [Marketing Content & Claim Accuracy](#marketing-content--claim-accuracy)
  - [Marketing Imagery](#marketing-imagery)
  - [API Feedback & Notification Rules](#api-feedback--notification-rules)
  - [Frontend Performance & Next.js Optimization Rules](#frontend-performance--nextjs-optimization-rules)
  - [Security Rules](#security-rules)
  - [Audit Rules](#audit-rules)
  - [Testing Rules](#testing-rules)
  - [Manual Test Cases (testcases.md)](#manual-test-cases-testcasesmd)
  - [Documentation Rules](#documentation-rules)
  - [Dependency Rules](#dependency-rules)
  - [Git Rules](#git-rules)
  - [Prohibited Patterns](#prohibited-patterns)
- **Documentation System**
  - [Documentation & AI-Agent Knowledge System](#documentation--ai-agent-knowledge-system)
  - [Architecture Decision Records (DECISIONS.md)](#architecture-decision-records-decisionsmd)

---

## Engineering Standards

### Design System & UI Consistency

### Design System & UI Consistency

- One shared design-token set — font family, sizes, weights, line-height, spacing, radius, colors, shadows — defined once in packages/ui and consumed everywhere; no component hardcodes a raw value
- One canonical implementation per UI pattern — buttons, forms, tables, cards, modals, dropdowns, alerts, empty/loading/error states — built once and reused; a module needing a variant extends or configures the shared component, never forks it
- Before building any new UI pattern: check packages/ui first. If the capability is missing, extend the shared component rather than building a module-local one

### Standard DataTable

### Standard DataTable Component

**One DataTable system → many modules → consistent UX.** It lives in `@hms/ui`, is built on the shadcn/ui Data Table pattern (TanStack Table headless core, styled on our tokens — ADR-029), and every tabular view in the platform renders through it. No module ships `PatientTable.tsx` / `DoctorTable.tsx` / `BillingTable.tsx`; it ships a _column + filter configuration_ for the shared table.

- **Required capabilities:** column sorting (with a visible unsorted / ascending / descending indicator, Lucide icons) and multi-column sorting where it makes sense; pagination with a configurable page size (10 / 20 / 50 / 100, sensible default per module — never a hardcoded single size); search; per-column and faceted filtering; column visibility (show / hide / restore, with a sensible default set per table); row selection and select-all where required; empty, loading (skeleton) and error states; responsive behaviour with contained horizontal scrolling; sticky headers where appropriate; keyboard operation and visible focus states; a consistent action column; custom cell rendering and column definitions.
- **Client-side or server-side, stated explicitly.** Small local datasets sort/filter/paginate in the browser; large ones (patient lists, audit, MIS reports) use server-side pagination, sorting, filtering and search. The table's configuration makes the mode obvious at the call site. Never load thousands of rows into the browser to filter them there.
- **Consistent control layout:** _Search → Filters → Column visibility → Actions_ above the table; _Rows per page → Pagination → "Showing X–Y of Z"_ below it.
- **URL/query state** where a view is worth linking or reloading into (page, page size, sort, search, filters).
- **Filters are reusable components** (status, department, doctor, date range, branch, role, priority, payment status), configured per module — never re-implemented per page.
- **Row actions use the one shared action menu/button.** Same affordance in every module; destructive actions always go through the shared confirmation dialog.
- Missing DataTable functionality is added to the shared component, never worked around locally. A module needing a genuinely specialised table documents why in its `KNOWLEDGE.md`.

### Table Row Actions

**One Action column, everywhere.** Every table in the Portal and in the System Admin / tenant interfaces that has row-level operations renders them through the shared action components in `@hms/ui` — `TableActions` with `ViewAction`, `EditAction`, `DeleteAction`, `ToggleAction`, `MoreActions`. No table implements its own action button, icon set, menu, or confirmation.

- **The column is the last column, headed "Actions"**, and holds only the actions that row supports: View/Details (eye), Edit (pencil), Delete (trash), Enable/Disable and Activate/Deactivate (the shared toggle), plus `MoreActions` (`…`) for anything beyond the primary set or context-specific operations.
- **The shared components own the presentation and behaviour** — iconography, size, spacing, hover, active and focus states, tooltips, accessible labels, disabled reasons, loading state, confirmation behaviour, and permission handling. A module supplies intent (label, handler, permission, disabled reason), never styling.
- **Permission-aware by construction.** An action the signed-in user is not permitted is not rendered; an action that is temporarily unavailable is disabled with a reason, never silently inert. This is a UX affordance — the server still re-checks (see Authorization Rules).
- **Destructive actions always confirm** through the shared `ConfirmDialog`, naming the record and the consequence. No table deletes on a single click.
- **Overflow rule:** at most three inline icon actions per row; everything beyond that moves into `MoreActions`, so the column stays a fixed, predictable width on every screen size.
- **Missing capability is added to the shared components**, never worked around in a page.

### Seeded Data That Ages (binding — ADR-133)

**Anything a seeder writes relative to "today" is stale tomorrow.** A queue, an arrivals board, a
"seen today" count and a vitals queue are the _present_, and the present moves; a history is a
_past_, and a past is written once. Seed them differently:

- **A past runs once**, guarded by a marker (ADR-122).
- **The present is rebuilt on every run**, guarded on the day itself — "does today already have
  one?" — so re-running is free, work in progress is never disturbed, and an environment seeded
  last week still has a live board this morning.
- **A screen that is empty in every environment, always, is a seeding gap, not a feature.** The
  Vitals queue needed a workflow mode no dataset set; the Arrivals board needed rows no history
  produces. Blank-because-nothing-happened is indistinguishable from blank-because-broken, and a
  tester learns to stop looking.
- **A collision degrades, it does not abort.** A taken appointment slot becomes a walk-in, a
  patient already in the queue is skipped, an arrival without a booking is still an arrival — and
  each is counted in the seed report. A seeder that refuses to seed because a doctor is busy at
  09:20 has chosen the wrong trade.

### Multi-Step External Flows (binding — ADR-130)

**An absent field means "this call did not say", never "this value is empty".** Where a flow spans
several calls to an external system — ABDM verification and enrolment today — each response is
**merged over** what is already known, per field, skipping null, undefined and blank. Never treat
the newest response as the whole answer: the step that returns the most is rarely the last one.

- **Persist what a step gives you even when you cannot use it yet.** An account list the operator
  must choose from is often the only description of that person the flow will ever produce.
- **Never split a name on a space.** An external register's single `name` goes in whole; the
  operator correcting one field beats the system inventing two.
- **A test double must be no kinder than the system it stands in for.** Where the sandbox returns
  less on a later call, the mock returns less too, and where it returns the value it holds rather
  than the value you asked for, so does the mock — a double that answers more fully, or more
  agreeably, than reality hides exactly the bugs this rule exists to prevent, and a full green
  suite will not find them.
- **Use what you already have as soon as you have it** (ADR-131). A profile that has arrived fills
  the form now; a further step that confirms one field is not a reason to withhold the other ten,
  and an operator whose last step fails should still be holding everything the earlier ones proved.
- **One request, one error.** Two calls sharing a `try` means a failure in the second is reported
  with the first one's message — a step that succeeded gets blamed for one that did not.
- **Parse a tri-state as a tri-state.** `true`, `false` and _absent_ are three answers. An adapter
  that flattens "not stated" into `false` is inventing a response, and the caller then acts on it:
  a missing `mobileMatchesAadhaar` read as `false` sent every patient to a second OTP.
- **Decide from the data where the data can decide.** Where two values can simply be compared —
  the mobile asked for against the mobile on record — compare them, and treat a provider's flag as
  a tie-breaker rather than the authority.

### Configuration Read Keys (binding — ADR-129)

**A permission named for the screen that _edits_ something is the wrong key for the screens that
merely _read_ it.** Where a configuration governs a form — where vitals are taken, when a fee is
due, which vocabularies a dropdown offers — **every role that uses the form needs the read key**,
or the form 403s against the settings that describe it.

- Keep the pair: `…​.view` is reading how the hospital runs, `…​.manage` is deciding it. Only the
  administrator holds the second, and the settings screen is gated on it.
- **Do not "fix" it by dropping the permission from the route.** A page guard on a key no endpoint
  enforces is a boundary in name only.
- **A failure the caller already handles must not raise a toast** (ADR-057's `feedback: false`).
  Where a screen falls back to a documented default, the fallback is the behaviour — reporting an
  error beside a form that works is noise, and it trains people to ignore real errors.

### Page Actions (binding — ADR-128)

**A page's primary action lives in its `PageHeader`, top-right, and nowhere else.** _Register
patient_, _Book appointment_, _Check in_, _New invoice_, _Add service_, _Add doctor_ — every one of
them is in the same place on every screen, so a member of staff learns the position once instead of
hunting for it per page. A control that moved between screens was the defect this rule exists to
prevent.

- **The header is the only slot.** The Standard DataTable has **no toolbar action slot** — the
  toolbar is Search → Filters → Sort → Column visibility → Pagination (ADR-029) and holds nothing
  else. Putting a create button there is not a style choice; there is nowhere to put it.
- **Ordering when a page has several:** supporting actions first, the primary action **last**
  (right-most) — `ghost` for navigation away, `secondary` for a side task such as _Print / PDF_,
  and the default variant for the one action the page is for.
- **Permission-gated in place.** Wrap the button in `<Can perm={…}>`; an action the user may not
  perform is not rendered, and the header simply has no actions. Never disable it instead, and
  never move it.
- **Row-level actions stay in the Action column** (ADR-039). The header is for the page, the
  Action column is for a record; they are different questions and never trade places.
- **Empty states may repeat the primary action** (`emptyAction`), because a table with nothing in
  it is exactly when somebody needs it and the header may be scrolled away. That is a repeat of the
  header's action, not an alternative home for it.

### Form & Input Behaviour (binding — ADR-127)

**Typing must never move the caret.** A focus trap — dialog, drawer, any overlay — depends on
whether it is **open**, never on a callback prop. Callers pass inline handlers, whose identity
changes on every render; an effect that lists one as a dependency tears down and re-arms on each
keystroke, moving focus to the first control in the panel. Keep the current callback in a ref and
read it from the handler.

**Scrolling never edits a value.** `input[type=number]` must not change when the wheel passes over
it. `NumberInputGuard` from `@hms/ui` is mounted once per app and handles this for every numeric
input, including raw ones — never an `onWheel` copied into a form, and never a fix applied to one
page. Typing, arrow keys, `step`, decimals and validation stay as they are.

**A grid that holds free text sets `[&>*]:min-w-0`.** A grid item's default `min-width: auto`
refuses to shrink below its content, so one long line pushes the track past the viewport and
scrolls the whole page sideways — the body must never scroll horizontally.

### Access Refusals (binding — ADR-126)

**A refusal names the problem, and the two problems are different.** Every page guard checks the module before the permission, in the order the server enforces (`requireModule()` → `requirePermission()`):

- **The hospital does not have the module** — its subscription. No administrator can grant their way past it, so the screen must not suggest asking for a permission. Different headline, different tone, no role list.
- **The role does not include the permission** — a question the hospital's administrator can answer today. The screen states the permission in **words and as a key**, and **which of this hospital's roles hold it**, read from that tenant's own `role_permissions` so a custom or renamed role appears without anyone hard-coding a role name.

Two rules follow:

- **Never hard-code a role name in a message.** Roles are per tenant and a hospital may invent its own; the roles that hold a permission are looked up, never assumed.
- **A guard is still not a boundary.** The server re-checks every call (invariant #2). These rules are about telling the truth to the person refused, not about enforcement.

### Missing Values (binding — ADR-123)

**A missing value states which kind of missing it is.** Never a bare `-` or `—`. Every absence is rendered through `EmptyValue` / `ValueOrEmpty` from `@hms/ui`, or written with `emptyLabel()` / `valueLabel()` wherever a plain string is required — a DataTable `accessor`, a print document, an export, an accessible name.

- **The reason is chosen at the call site**, because only the call site knows which is true: `unassigned` (a link to another record that nobody has made yet), `unspecified` (an optional field left blank), `notRecorded` (an observation nobody took), `notConfigured` (a setting the hospital has not set up), `notApplicable` (the field cannot have a value for this row), `none` (an empty list, where zero is the complete answer), `notAvailable` (the value exists but this screen does not have it — rare, and usually a bug worth chasing rather than labelling).
- **The accessor carries the same words as the cell**, so the column's filter offers "Not assigned" as a value and a search finds those rows.
- **Investigate before labelling.** A column empty on _every_ row is a data or query problem, not a display one — fix the join, the mapper or the dataset first, and label only what is genuinely absent. Changing the placeholder without finding out why the value is missing is the failure this rule exists to prevent.
- A dash survives only where it is **typography** — the `–` between the two ends of a reference range — never as a placeholder.
- **CSV and other machine-readable exports keep an empty cell.** A spreadsheet sorts, filters and sums an empty cell correctly; a label in an amount column turns a number into text. The reason is for a human reading a screen or a printed document.

### Reusable UI Architecture

**Build once, configure everywhere, reuse forever.** Applies to every frontend — the Portal, marketing, the admin console, the patient portal and the AI Portal — to current and future work.

**Frontend boundaries (binding — ADR-051).** Five applications, one audience each, one backend. A frontend may render and may hide; it may never decide. Specifically:

- **No authorization logic is duplicated into a frontend.** Every route it calls is independently re-checked server-side (`authenticated → tenant entitled → user permitted → business rule`). A guard in an app is UX only, and that matters more once URLs like `/admin` and the AI Portal exist for someone to type.
- **No application calls an API outside its audience.** The admin console holds no clinical call; the Portal holds no platform-administration call. An operator works inside a hospital through an audited support session on the _Portal's_ origin, never by rendering clinical screens on the platform origin.
- **No cross-application session.** The refresh cookie is host-only on the API; each origin is listed individually in `CORS_ORIGINS` per environment; nothing sets `Domain=.nirogix.com`.
- **A token never travels in a URL.** The support-session handoff uses `postMessage` with both sides naming the other's origin from configuration.
- **No development credential appears in any frontend source or bundle.** Seed accounts live in `hms_backend/src/scripts/seed.development.ts` and `testcases.md`.
- **The design system is the only thing shared by copy or import.** `@hms/ui`, `@hms/types` and `@hms/permissions` are shared; business logic is not.

**Public (unauthenticated) endpoints (binding — ADR-056).** There is one unauthenticated write path in the product and there must not casually be a second. Any endpoint that accepts a request without a session obeys all of:

- **The tenant is resolved server-side from an opaque token in the path** — never from a body field, a header, a query parameter, or a subdomain. A caller must have no way to name a tenant.
- **The token is high-entropy, opaque and derived from nothing internal.** It may be printed on a poster, so treat everything encoded in it as published: no tenant id, no record id, no configuration, nothing authenticating.
- **It never writes to a clinical table.** It may create a request for a human to review; a patient, encounter, order or invoice is created only by an authenticated, permitted user.
- **Every failure mode returns the same status and message.** Unknown token, retired token and feature-disabled are indistinguishable, so the endpoint cannot be used to enumerate tenants.
- **It is rate-limited at the sign-in tier** and audited against the tenant with no actor.

- **Before building any UI, check `@hms/ui` first** (then the app's own shared components). If something close exists, extend or configure it; if a pattern appears in a second place, extract it into a shared component in the same change that duplicates it.
- **The shared layer covers the recurring patterns:** DataTable and its toolbar/pagination/column-visibility/filter parts, buttons, action buttons and action menus, cards and stat cards, forms and form fields, inputs, selects, comboboxes, date pickers, filters, dialogs/modals/drawers, dropdown menus, tabs, badges and status indicators, toasts, alerts, tooltips, pagination, search bars, empty states, loading states and skeletons, confirmation dialogs, back-to-top, preloader, and navigation.
- **Reusable is not uniform.** Components take props/variants so a module can vary labels, icons, actions, columns, filters, data, empty-state content, loading behaviour, permissions, variants, sizes, and layout — without forking the component. The chain is: primitives → shared patterns → module configuration → page.
- **Use shadcn/ui as the scaffolding source** for standard primitives rather than reinventing them (ADR-028), then restyle onto the design tokens before shipping.
- **Row actions are a Definition-of-Done item, not a nice-to-have (ADR-039, ADR-060).** Every table is reviewed for the actions its workflow actually needs — view, edit, delete, activate, deactivate, approve, reject, restore, or a module-specific one. Not every action on every table: what appears is decided by role, permission, record state and business rule. **A record that can be displayed incorrectly must have a permitted, safe way to be corrected** — leaving a user staring at a wrong name they cannot fix is a defect.
- **Destructive actions confirm first, in the shared `ConfirmDialog`, and say what will happen.** For clinical and administrative records prefer **soft delete or deactivation**: nothing medical is destroyed because someone clicked Delete, unless the retention policy explicitly allows it.
- **The button is not the boundary.** Hiding Edit or Delete is UX; the backend independently re-checks permission on every call, so a direct API request from an unauthorised user is refused regardless of what the UI rendered.
- **Every important record change is audited** — who, what, when, which record, and previous/new values where the audit policy requires them.
- **Editing reuses one pattern per workflow shape** — dialog, drawer or page, chosen by the complexity of the record, built from the shared form and validation components. Never a bespoke edit implementation per table.
- **Column alignment is a property of the column, not of the cell.** `align` on a DataTable column governs the heading and the values together — a heading that sits left over right-aligned values is a defect, not a style choice. Reserve `right` for magnitudes a reader compares down the column (money, quantities, stock counts) and the actions column; a label that merely contains a digit — an age, a duration, a status code, a lab value that may be text — stays left, where it reads next to its heading.
- **Organisation:** shared primitives and the DataTable parts live in `@hms/ui` (`src/components/`, `src/components/data-table/`); app-specific compositions live under that app's `components/`. Generated shadcn source lands in `hms_frontend/components/ui/` or `marketing/components/shadcn/` for review before promotion.

### Dates & Formatting

- **Every user-facing date is `DD/MM/YYYY`, every time `hh:mm AM/PM`, and the two together `DD/MM/YYYY, hh:mm AM/PM`** (ADR-046) — Portal, marketing, print documents and PDFs, in tables, forms, date pickers, appointments, patient and staff records, billing, invoices, reports, audit logs, notifications, activity timelines, dashboards, filters, and search results. Never `2026-08-15`, `08/15/2026`, `15-08-2026`, `Aug 15, 2026`, or a 24-hour `16:45` in the UI. Days and months are always zero-padded and the meridiem is always shown.
- **Entry uses the shared fields, never a native date/time input** (ADR-048): `DateField`, `TimeField` and `DateTimeField` from `@hms/ui`. A native `<input type="date">` renders in the _browser's_ locale, so the same field reads differently machine to machine — the standard has to hold at the keyboard, not only on the screen. The value crossing the boundary is always ISO.
- **The meridiem may be rendered as a badge** in schedules, time pickers and dense components — `formatTimeParts()` splits it out for exactly that, styled from the design tokens.
- **Chart axes are the one abbreviated exception**, and even they go through the central layer: `formatMonthLabel()` (`Aug 26`) and `formatDayLabel()` (`16/08`) exist because twelve full dates cannot fit across an axis. No other abbreviated date form exists anywhere in the platform.
- **Display format is separate from transport format.** APIs, the database, and query parameters keep their machine-readable format (ISO-8601); conversion happens once, at the display boundary.
- **All of it goes through the centralized date utility** (`@hms/utils`): formatting, parsing, comparison, ranges, validation, and input↔output conversion — and is _rendered_ through `DateDisplay` / `TimeDisplay` / `DateTimeDisplay` in `@hms/ui`, which also emit the machine-readable `<time datetime>` value. No component calls `toLocaleDateString()`, hand-rolls a format, or adds a date library of its own. A new date-bearing component uses the utility or extends it, so a future change to the standard is one edit rather than a sweep of every module.

### Light & Dark Theme

### Light & Dark Theme Support

- Centralized theme tokens for background, text, border, primary/secondary, status, card, input, table, modal, hover, focus, and disabled states — no component reads a hardcoded color
- Light is the default theme; switching to Dark is available from the Portal UI
- Every component is verified in both themes before being considered complete — a component that's unreadable in Dark mode is a defect, not a follow-up task

### Branding & Multi-Tenant Customization

### Branding & Multi-Tenant Customization

- Brand colors, logos, and typography are tenant-configurable values consumed from the centralized branding system, never hardcoded into a component
- A new UI component works correctly for any tenant's branding without a module-specific redesign — this is what makes the tenant-level branding requirement in §4 hold at the component level, not just the page level
- **Branding comes from the theme, not from a component.** No component-level colour literal — not in a class, an inline style, an SVG fill, or a shadow. A brand-coloured surface reads the semantic token (`--hms-brand` / `--hms-brand-hover` / `--hms-brand-fg` / `--hms-ring` in the Portal, `--mk-accent…` on marketing); changing the brand value re-skins it with no code change.
- **Both token scopes stay independent, and shared components work in both.** A component from `@hms/ui` used on the marketing site must resolve to the marketing accent, not to the Portal's default — the app maps the `--hms-*` slots it consumes onto its own scope once, in its global stylesheet, rather than each component learning about two token sets.
- **Every interactive state is branded, not just the resting one** — hover, active/pressed, focus ring, selected, and disabled — for buttons, links, navigation, table actions, the back-to-top control, and every other interactive control. A control that follows the brand at rest but reverts to a default colour on hover or focus is a defect.
- **Verification is per change:** the control is checked in Light and Dark, and under a non-default tenant accent (Portal) / a platform-branding override (marketing), before it is done.

### Responsive & Mobile Navigation

**Mobile is an app, not a squeezed desktop** (ADR-033). Both surfaces follow the same shape.

- **Under the `md`/`lg` breakpoint:** a fixed **bottom navigation bar** carrying **at most five** primary destinations (icon + short label, clear active/inactive states, safe-area padding, ≥44px touch targets), plus a **hamburger in the top right** that opens a **slide-out drawer** for everything else.
- **The drawer** scrolls independently, locks background scrolling through the shared `useScrollLock` and `data-lenis-prevent`, restores scrolling on close, traps focus, and closes on Esc, on backdrop press, and on navigation.
- **The bar respects role and permissions.** In the Portal it is derived from the same permission-filtered nav as the sidebar — a phone never offers a route the user cannot open.
- **The five destinations are chosen per surface** from that surface's own information architecture; the marketing site does not copy the Portal's clinical menu.
- **Desktop keeps its own professional navigation** (Portal sidebar, marketing header). The bottom bar is never shown on desktop.
- Both are built from the shared `BottomNav` / `NavDrawer` in `@hms/ui` — never re-implemented per app or per page.

### Content & Language

- **Write natural, professional English.** No hyphens joining words that are not a real compound: _Hospital Management System_, never _Hospital-Management-System_. Legitimate compounds and terminology keep their hyphens — `multi-tenant`, `check-in`, `follow-up`, `no-show`, `India-resident`, `append-only`, `role-based` — as do URLs, slugs, CSS classes, and technical identifiers. Never bulk-strip hyphens.
- Applies to every user-facing string: headings, body copy, buttons, navigation, cards, labels, marketing copy, form text, error messages, empty states, tooltips, metadata, and SEO content.
- Product copy stays inside the PRD's content guardrails (no invented customers, no certification claims, no published prices).

## Development Rules

### Architecture Rules

- All module code deploys as a single modular-monolith application. Do not introduce microservices, Kubernetes, or a service mesh without an explicit decision recorded in DECISIONS.md.
- Every module's routes are gated by a `requireModule()` check, evaluated before any permission check.
- Business modules do not directly depend on another module's internals. Cross-module interaction goes through Domain Events or a defined service interface, never a direct import of another module's internal code.
- Financial Transaction Infrastructure (Platform Core) is the only place invoice/payment/tax/receipt/ledger primitives are implemented. Billing & Payments and any other billing-capable module consume it; none reimplement it.
- New specialties are added via the configurable specialty form-template mechanism. The core Patient/Provider/Encounter schema is never modified to accommodate a single specialty.

### Authorization Rules

- Every protected backend endpoint independently validates, in order: Authenticated → Tenant entitled to module → User permitted the action → Business logic. Frontend visibility is never treated as security.
- A route or action's required permission key is declared explicitly in code, never inferred from context.
- Explicit DENY always overrides GRANT, at both the role-permission and user-override level.
- Temporary permission overrides include `valid_from`/`valid_until`; permanent overrides have `valid_until = NULL`.
- Permission cache TTL must never exceed the earliest `valid_until` among the temporary overrides it contains. Setting `revoked_at` triggers immediate, targeted cache invalidation — never a wait for natural expiry. (See Architecture Document, RBAC & User-Level Overrides.)
- Break-glass access, when implemented, never modifies a user's permanent role, and post-event review never modifies RBAC as a side effect of the review itself.
- No module implements its own authorization check outside the shared requireAuth → requireModule → requirePermission chain.

### Tenancy Rules

- Every table holding tenant-scoped data has a `tenant_id` column and a PostgreSQL Row-Level Security policy. No new table ships without one.
- The tenant context is set server-side from the authenticated session. Never trust a `tenant_id` supplied by the client.
- Every module's automated test suite includes a tenant-isolation test proving Tenant A cannot read Tenant B's data.
- Branch-scoping uses a nullable `branch_id` (NULL = organization-wide). Do not introduce a second, parallel branch-scoping mechanism.

### Database Rules

- Migrations are additive and reversible. No destructive schema change ships without an explicit data-migration plan.
- Optimistic locking/versioning is required on any record multiple users may edit concurrently — clinical notes, prescriptions, inventory counts, billing line items, admission records.
- Entitlement and permission-override records are never physically deleted. State changes (revoked, expired, cancelled, deactivated) are represented as data, not row removal.
- No EAV (entity-attribute-value) modeling for core clinical entities — Patient, Provider, Encounter, Diagnosis, Prescription, Invoice stay strongly typed. Only genuinely specialty-varying fields use the configurable form-template mechanism.

### API Rules

- All endpoints are versioned under `/api/v1`. Breaking changes require a new version, not an in-place change.
- Every request is validated (Zod or equivalent) before it reaches business logic.
- Payments, invoices, appointment bookings, notifications, and external integration calls are idempotent via an idempotency key.
- API error responses use one consistent shape across every module.
- OpenAPI/Swagger documentation is generated from route definitions, not hand-maintained separately, and is part of the Definition of Done for every endpoint (see API Documentation Rules).

### API Documentation Rules

OpenAPI/Swagger documentation is part of backend implementation — not an optional or final-stage task — and is **mandatory for the entire Nirogix lifecycle**, from the first endpoint to the final production release.

- **No undocumented production API.** Every backend route under `/api/v1` has a corresponding OpenAPI operation before the change is complete. Automated coverage (`npm run openapi:validate`) fails the build on any undocumented route.
- **Docs change with the code, in the same change.** New route → add its operation; controller/request DTO/response DTO changed → update the corresponding schema; authentication changed → update `security`; permission changed → update the authorization note; endpoint deprecated → mark `deprecated`; endpoint removed → remove its operation; API version changed → document it under the new version.
- **Single source of truth.** The spec is generated from route/schema definitions (Zod + zod-to-openapi), never hand-written in a separate file. The same Zod schema powers both request validation and documentation.
- **Environment-aware, never hard-coded.** Server URL, environment name, and auth configuration come from configuration per environment (Local / Testing-Staging / Production). The running instance advertises its own server from config; additional environment servers are surfaced only when their env vars are set.
- **Every documented operation includes, where applicable:** HTTP method, path, summary/description, module tag, authentication requirement + required roles/permissions, path/query/header parameters, request body + validation rules, success and error response schemas with HTTP status codes, pagination/filter/sort/search parameters, and at least one example.
- **Versioning is explicit.** Versions are distinguishable (`/api/v1`, `/api/v2`); incompatible versions are never merged into a single undocumented contract.
- **Accessible in development.** Swagger UI at `/api/v1/docs` and the raw spec at `/api/v1/openapi.json`. The JSON spec is always served; the interactive UI is toggled per environment via `OPENAPI_UI_ENABLED`.
- **Validated automatically.** `npm run openapi:validate` checks spec validity (schemas, `$ref`s, parameters), duplicate operationIds, missing responses, missing tags, and missing security definitions, plus route coverage. CI runs it on every push/PR; a production deploy never publishes an invalid specification.

### UI / UX Rules

- All tabular data uses the shared DataTable component (packages/ui). No module implements its own pagination, sorting, or filtering.
- No component hardcodes a color, spacing, radius, or typography value outside the shared design tokens.
- Every component renders correctly in both Light and Dark themes, and under a non-default tenant's branding, before being considered complete.
- Unauthorized sidebar items, tabs, buttons, and routes are hidden client-side, and a manually entered unauthorized URL renders a 403/forbidden state — never a blank screen or silent redirect.

### Frontend Delivery Workflow

Binding order for **every** new page or feature on the Marketing site and the Portal — each step is part of the Definition of Done, not a follow-up task:

**Requirements → UX → SEO (where applicable) → Accessibility → Next.js optimization → API feedback → Performance → Code cleanup.**

The shipped result is _SEO-friendly + fast + accessible + responsive + maintainable + secure + production-ready_. A page that renders correctly but has duplicate metadata, no API feedback, an un-optimized image, or leftover unused files is not done.

### SEO / AEO / GEO Rules

**Scope.** The Marketing site (`marketing/`) is the public, indexable surface and carries the product's SEO. The Portal (`hms_frontend/`) is a private application: it is optimized for humans and never for search engines. SEO work on a Portal page is only ever appropriate for a genuinely public, non-authenticated route.

**Reference standard.** The **Claude SEO Skill** (https://www.claudeseoskill.com/) is the SEO/AEO/GEO implementation reference for this project. Where it and this section differ, this section wins (it encodes the project's own content guardrails).

**Technical SEO (marketing, every public route)**

- **Unique title and meta description per route.** No two routes ship the same title/description pair. Written for the page's actual search intent, not templated filler.
- **Canonical URL** on every public page; the base URL comes from `NEXT_PUBLIC_SITE_URL` via `metadataBase`, never hard-coded.
- **One `<h1>` per page**, heading levels never skipped, semantic HTML (`header`/`nav`/`main`/`section`/`article`/`footer`) — the same structure that AEO/GEO answer extraction relies on.
- **Open Graph + Twitter/social metadata** on every public page, with an OG image appropriate to that page family.
- **Structured data / JSON-LD, only where it describes what the page actually shows:** `Organization` site-wide; `SoftwareApplication` on product/platform/module pages; `LocalBusiness` on the company/contact page (Ahmedabad, Gujarat, India); `BreadcrumbList` on nested routes; `FAQPage` only where a real, visible FAQ exists.
- **`sitemap.ts` and `robots.ts` stay in sync with the real route table** — a new public route adds its sitemap entry in the same change; a removed route is redirected (301), never left dead.
- **Descriptive, kebab-case, hierarchical URLs.** Content identity never depends on a query parameter.
- **Internal linking** is deliberate: every public page is reachable from navigation or a contextual in-content link; no orphan pages.
- **Every non-decorative image has meaningful `alt` text**; decorative images use `alt=""`.
- **Mobile-first and Core Web Vitals are SEO requirements**, governed by the performance rules below.

**Keyword strategy**

- Keywords are **mapped to the page whose search intent they match**, and used naturally in the title, `<h1>`, and body — or not used at all. The mapping is recorded in `marketing/KNOWLEDGE.md`.
- The working set is the product's real market: _Hospital Management System / Software_, _…in India_, _…Gujarat_, _Hospital Software Ahmedabad_, _Healthcare Management Software_, _Clinic Management Software_, _Hospital ERP Software_, _HMS Software for Hospitals_, _Hospital Billing Software_, _Hospital Appointment Management_, _Patient Management System_, _Doctor Management System_, _Pharmacy Management_, _Laboratory Management System_. Location and module terms belong on the pages that genuinely serve them (module pages, solutions, contact), not sitewide.
- **SEO never overrides UX.** If a keyword makes a sentence worse, the sentence wins.

**Prohibited in SEO work**

- Keyword stuffing, artificial repetition, hidden text, doorway pages, or duplicated metadata.
- Structured data for content not visible on the page, and **fabricated reviews, ratings, or `aggregateRating`** — this extends the PRD Regulatory Register's no-fabricated-social-proof rule.
- Misleading claims. The marketing content guardrails still bind SEO copy: no prices/named tiers, no compliance-certification claims, no reference customers that do not exist.

**Portal / private-surface rules**

- Every authenticated Portal route is **`noindex, nofollow`**, and the Portal serves a `robots.ts` disallowing crawling. Public auth routes (`/login`) are noindex too — product SEO lives on the marketing site.
- **No patient, tenant, staff, clinical, or operational data ever appears** in a title, meta description, OG image, URL path, sitemap, or any crawler-visible surface.

### Marketing Content & Claim Accuracy

**The marketing site describes the product we actually have.** It never advertises, claims, implies, or visually suggests a feature, capability, integration, workflow, certification, security capability, or service that is not in the approved product scope. Accuracy outranks looking feature-rich.

- **Every claim is traceable** to at least one of: `resources/projectrequirementdoc.md`, `resources/architecture.md`, `resources/development-plan.md`, a defined phase in `resources/phases.md`, or already-implemented functionality. If it cannot be traced, it is not published.
- **No claim from assumption.** Not from "common HMS features", not from a competitor's site, not from "it would be useful", not from what the roadmap will probably contain.
- **Never claim, unless traced and available:** integrations, certifications, compliance guarantees, AI capabilities, automation, mobile apps, payment capabilities, analytics/reporting, clinical workflows, security capabilities, communication channels, third-party services.
- **Planned ≠ available.** A capability scheduled for a future phase is labelled as planned, in the phase's own language, and never written in the present tense or shown as a working screen. Roadmap wording carries no date we have not committed to.
- **Validate before adding anything** — section, feature card, headline, sub-headline, CTA, comparison, table, screenshot, mockup, animation, illustration, diagram, statistic, or promotional sentence. Verification means naming the source document or the shipped code, not recognising the phrase.
- **Screenshots and mockups are claims.** A UI shown on the marketing site depicts a screen that exists, with fields and states the product really has. An illustrative mockup of a planned screen is labelled as such.
- **Numbers are claims too** — uptime, response time, tenant counts, savings, adoption. No metric without a source we can produce on request.
- This extends, and never relaxes, the PRD content guardrails (no invented customers, no certification claims, no published prices) and the SEO prohibitions above.
- The test is the complaint we are preventing: _"your website says you have this, the product does not."_ If a sentence could produce it, rewrite the sentence.

### Marketing Imagery

**No image for decoration.** The marketing site's default visual language is typography, product UI screenshots, UI mockups, abstract brand elements, simple vector graphics, product diagrams, data visualisations, geometric brand patterns, and subtle motion — a clean, premium, product-focused design.

- **Default: no image.** An image ships only where it demonstrably improves communication over the type and layout already there.
- **When an image is genuinely required, it is proposed before it is produced**, stating: the page/section that needs it, why the visual communicates better than text, the required aspect ratio, a detailed generation prompt written for that exact use, and how it stays consistent with the Nirogix brand.
- **An image is subject to the claim-accuracy rules.** A visual must not imply a capability the product does not have — no fabricated dashboards, device mockups of apps that do not exist, integration logos we do not integrate with, or badges resembling certifications.
- **No stock photography and no generic healthcare imagery** (smiling clinicians, stethoscope-on-desk, abstract "medical technology") without a stated reason that survives review.
- Every non-decorative image carries meaningful `alt` text and follows the performance rules (`next/image`, correct `sizes`, one LCP `priority` image per route at most).

### Printing & Document Generation

**Print prints the document, not the application** (ADR-047). A printed or exported HMS document — invoice, receipt, laboratory report, prescription, discharge summary, statement, certificate — is a standalone, hospital-branded document. The interface used to reach it never appears on it.

- **A printable document is its own route**, in the `(print)` route group with no application shell. Never `window.print()` on an application page, and never a `@media print` rule that merely hides the sidebar: the shell stays in the DOM, screen styles leak, and nobody can see what will print until it prints.
- **Never on the page:** sidebar, navigation, topbar, filters, page controls, action buttons, row actions, edit/delete controls, toasts, or any other screen-only element.
- **One document kit** in `@hms/ui` (`PrintDocument` + `PrintSection` / `PrintFields` / `PrintTable` / `PrintTotals` / `PrintSignatures` / `PrintNote`) owns the page geometry, `@page` margins, repeating table headers across pages, break-avoidance, signature blocks, the confidentiality notice and the footer. A module supplies content only, and a new document is a template — never a new print system.
- **Structure follows the document type.** An invoice is not a lab report; the kit is shared, the layout is not.
- **Branding is the hospital's own** — name, logo and accent from the tenant's configured branding, resolved before the dialog opens so a document is never produced without its header. With nothing configured, the platform default applies. A document must never carry another tenant's branding or data: the branding call is RLS-scoped like every other read.
- **Print and PDF come from the same definition.** "Save as PDF" is the browser dialog over the same markup; a server-rendered PDF, if added, renders the same template headlessly rather than defining the document twice.
- **Authorization is re-checked, not inherited from the link.** The document route carries the same permission as the screen and reads the same RLS-scoped endpoint, so a user cannot print what they could not open. Only that record's data appears — no application state, no other patients, and nothing sensitive in logs.

### Database Seeding Rules (binding — ADR-058, ADR-122)

- **One seeder per environment — development, staging, production — and each refuses to run anywhere else.** A seeder declares the environment it is written for; `NODE_ENV` must match, and the guard _additionally_ inspects `DATABASE_URL`, because `NODE_ENV` is set by whoever typed the command while the connection string decides which database is actually written.
- **Development** seeds realistic synthetic data — platform owner, demo hospitals, every role, doctors, staff, departments, patients, appointments. **Never real patient information**, in any environment, ever.
- **Staging** seeds a controlled, **deterministic** dataset shaped like production, so QA, E2E and regression assertions can depend on exact values.
- **Production seeds bootstrap configuration only** — the permission catalogue, system roles, and where genuinely required a first administrator. **Never a hospital, a patient, an appointment, a demo doctor, or any other invented record.** It requires an explicit confirmation variable so it cannot run as a side effect of a deploy.
- **Idempotent in the useful sense: a seeder converges on _present_, never on the dataset's values** (ADR-122). It creates what is missing and **never updates, resets or deletes** a record that exists — a value edited by hand on a shared environment belongs to the person who edited it. Records are matched on a **stable key** (a code, an email, a registration number, a phone number), never on a display name. An action with no record of its own — applying a profile, a colour, a toggle, a history, a column backfill — is recorded in `seed_markers` and done once; a backfill fills a newly added column **only where it is NULL**.
- **Staging is seeded automatically by its deployment workflow**, immediately after migrations, so a new table or a newly required record reaches it on the deploy that ships them. Development is run by hand. **No workflow ever seeds production, and no workflow ever passes `--reset`.** Adding seed data for a new table, or a backfill for a new column, is part of the change that adds them.
- **Deterministic wherever practical**, so re-running is safe and repeatable.
- **No secrets in a seeder.** Development passwords are known throwaway defaults, and are obviously that.
- **Every seeder prints its target** (credentials redacted) before the first write, and a refusal exits with a distinct code and a plain sentence — never a stack trace, which invites someone to "fix" the guard.

The failure this exists to prevent is unrecoverable: invented patients interleaved with real clinical records, carrying real-looking UHIDs. Making the wrong command fail loudly is worth more than making the right command convenient.

### Communication Rules (binding — ADR-016, ADR-059)

- **One `CommunicationService` is the only code that talks to a provider** — `sendEmail`, `sendSms`, `sendOtp`, `verifyOtp`, `resendOtp`. No module calls MSG91, or any future provider, directly.
- **A frontend never calls a provider.** The path is Frontend → HMS API → CommunicationService → provider. Auth keys, template ids, sender ids and domain credentials are **server-side only** and must never reach a bundle.
- **Every provider value comes from configuration** and is documented in `.env.example` as a placeholder name only. Nothing hard-coded: auth key, access token, template ids, sender id, DLT entity, sending domain, from-name, from-address.
- **Never ask anyone to paste a secret into chat, a ticket, or source.** Credentials are supplied through the environment/secrets mechanism, by the person who owns them.
- **Transactional messages are the ones the workflow requires** — sign-in codes, contact verification, password reset, hospital onboarding and approval, user invitation and activation, appointment confirmation / cancellation / reschedule, and administrative notices a person must act on. **Send nothing else.** A notification nobody needs trains people to ignore the ones they do.
- **A message carries no clinical detail beyond its purpose**, and no message is sent that a person did not cause or need.

### API Feedback & Notification Rules

- **One shared notification/Toast system in `@hms/ui`**, built on **React Toastify** (ADR-057), consumed by every frontend that needs one. No page, module, or feature builds its own toast, snackbar, or ad-hoc inline banner for API results.
- **All user-facing toast notifications must use the centralized reusable notification system.** No new toast library, and no page-specific toast implementation, without an explicit ADR. `react-toastify` is imported **only inside `@hms/ui`** — by the adapter (`src/toast.tsx`) and the viewport it mounts (`src/components/Toaster.tsx`) — and importing it anywhere else is the defect this rule exists to prevent.
- **The API is `toast.success | error | warning | info | loading`**, plus `dismiss` and `update`, taking either a message string or `{ title, description, duration, action, dedupeKey }`. It is callable from plain TypeScript with no React mounted, because the shared API client raises every notification and is not a component.
- **Position: top-right**, below the app bar, on every application and every breakpoint. Auto-close on success and info, longer on a warning, persist on an error and while loading. Pause on hover and while the tab is inactive, a close button, a progress indicator on anything timed, a stack limit, and de-duplication so a retry refreshes its toast instead of adding another.
- **Theme and branding come from the design tokens, never from a call site or a component.** The library's `--toastify-*` variables are re-pointed at `--hms-*` in one block in `@hms/ui/styles.css`; Light/Dark and the active tenant accent follow automatically, and an app that scopes the tokens differently is served by the same mapping. Passing a colour to a toast is prohibited.
- **A loading toast must be resolved.** Update it to its outcome or dismiss it — a spinner left on screen after the operation finished is a defect.
- **Every state-changing API call produces user-visible feedback, and every failure does** — a silently failed request is a defect. Background/read-only refreshes may be silent on success but never on error.
- **Feedback is centralized in the shared API client**, not written per call site. The `if (success) toast(...) / if (error) toast(...)` pattern repeated in pages is prohibited; the client extracts the message, classifies the outcome, and raises one notification.
- **Show the backend's message when it provides one.** Success responses carrying a `message` (e.g. `"Hospital registered successfully."`) are displayed verbatim; failures use `error.message` from the canonical `{ error: { code, message, details? } }` envelope. Generic fallback copy is used **only** when the response carries nothing usable — never as a blanket replacement.
- **Variants** map to the semantic tokens in `resources/DESIGN.md` §2 — success (green), error (danger red), warning (amber), info (blue/neutral), loading/processing (neutral) — never a hardcoded colour.
- **The layer handles every failure mode:** network failure, timeout, validation (field errors rendered on the fields plus one summary notification), 401 (session expired → silent refresh, then the re-auth path — never a bare "Unauthorized"), 403 (the standard Forbidden panel at page level), 409/optimistic-lock conflict, 429, 5xx, and unstructured or non-JSON responses.
- **Never surface internals.** No stack traces, SQL, raw provider errors, internal hostnames, or developer-facing `details` reach the user; full detail goes to the structured logger / `errorTracker`. **Never render PHI in a notification.**
- **Accessible by construction:** `role="status"` (polite) for routine messages and `role="alert"` (assertive) for errors and warnings, keyboard-reachable with a labelled close control, auto-dismiss for success, errors persist until dismissed, honours `prefers-reduced-motion`, positioned so it never covers the app bar or the primary action, with a stack limit and de-duplication.
- **Status is never carried by colour alone.** Every variant renders a distinct icon _and_ a title in words, so the state survives greyscale, colour-blindness, and a screen reader reading the text with no styling at all.
- **One layer owns each message.** The API client raises the notification for a request's outcome; a page that has already handled the same failure inline (a field error, an inline error panel) passes `feedback: false` rather than letting a second toast say the same thing. Two notifications for one event is the failure mode this rule prevents.
- **Idempotent retries produce one notification, not one per attempt.**

### Frontend Performance & Next.js Optimization Rules

The Next.js optimization guides are the reference. **Both apps are Next 16** — read the version-matched docs bundled at `node_modules/next/dist/docs/` (per each app's `AGENTS.md`) rather than any older online version.

- **Images:** `next/image` with explicit dimensions (or `fill` inside a sized container), a correct `sizes`, lazy by default, and `priority` on at most one genuinely above-the-fold LCP image per route. Modern formats. No raw `<img>` for content images; icons remain Lucide.
- **Fonts:** `next/font` only (Geist / Geist Mono today) — self-hosted and subset, only the weights actually used, no runtime font-CDN request, no layout shift on load. Typography stays identical across Marketing and Portal.
- **Scripts:** third-party scripts load through `next/script` with a deliberate strategy (`afterInteractive` / `lazyOnload`) and never block first render. **No third-party script ships without a stated product requirement** and a privacy review.
- **Metadata:** use the Next Metadata API — global defaults in the root layout, per-route overrides, `generateMetadata` for dynamic routes. No hand-rolled `<head>` tags.
- **Static assets:** organized under each app's `public/`; an asset no longer referenced is deleted (clean-code rule, `resources/DESIGN.md` §9.7).
- **Bundle:** run bundle analysis before adding a heavy dependency and when a route's JavaScript grows noticeably. Prefer Server Components; push `"use client"` to the leaves; no two libraries doing the same job.
- **Lazy loading:** `next/dynamic` for heavy non-critical UI — charts, rich editors, complex dialogs, below-the-fold marketing sections, admin-only panels. **Never** lazy-load above-the-fold or LCP content.
- **Budgets, measured before "done":** LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 on a mid-range mobile profile for public marketing routes; the Portal targets the same INP/CLS with LCP measured on the authenticated shell.
- **Analytics & instrumentation:** loaded lazily, off the critical path, and separate from core application logic. **Never send PHI, patient/clinical detail, or tenant-identifying operational data to an analytics or telemetry platform** — page-level events only, identifiers stripped. The Portal ships no third-party analytics by default.
- **Observability:** application/API telemetry flows through the existing structured logger and the `errorTracker` abstraction (ADR-019, ADR-007); OpenTelemetry, if adopted, sits behind that same seam. Internal telemetry is never exposed to end users beyond a support reference id.

### Security Rules

**Security is part of every feature, not a phase before release.** For each new API, form, database operation, file upload, authentication flow, permission, piece of user-generated content, third-party integration, admin feature, or background job, walk the chain: **authentication - authorization - validation - sanitization - rate limiting - data exposure - logging - abuse cases**. A feature that works functionally is not production ready.

- **Authorization is server-side, always.** A hidden button is never the boundary; every endpoint re-checks auth, entitlement and permission, and is tested for IDOR/BOLA, horizontal and vertical privilege escalation, and tenant isolation.
- **Validate at the server boundary with strict schemas** (body, query, path, headers, cookies, file metadata) and reject unexpected input rather than coercing it.
- **Never build a query or command from untrusted strings.** Parameterized queries and safe ORM APIs only; sortable/filterable columns are allow-listed, never taken from the client.
- **Rate-limit by risk**, not one global number: credential routes tightest, expensive endpoints capped, ordinary reads generous (ADR-036).
- **Never expose more than the screen needs.** No internal or database-only fields in API responses, no sensitive values in URLs, no PHI in logs, error messages, or analytics.
- **Secrets never reach the client or the repository.** Server-only values never go through `NEXT_PUBLIC_*`; a secret found in code or history is treated as compromised and rotated, not merely deleted.
- **Production is not development.** With `NODE_ENV=production`: debug and dev-only endpoints off, no stack traces to users, secure cookies, CORS restricted to an allowlist, security headers on, rate limits active, environment validated at startup, and no development or seed credentials present.
- **The findings live in `SECURITY-AUDIT.md`** at the repository root, re-run before each production release and updated in the same change that fixes a finding.
- Encryption in transit and at rest is mandatory for all PHI-bearing data.
- File uploads are validated server-side for type and size before acceptance, regardless of client-side validation.
- PHI-bearing files use default-private storage with short-lived signed URLs. Nothing is served as a permanent public object URL.
- MFA and SSO hooks exist in the authentication layer from Phase 0, even where not enforced for every tenant at MVP.

### Audit Rules

- Every mutating action, permission grant/deny, and entitlement change produces an audit-log entry.
- Audit-log entries are immutable and are never deleted, including when the record they reference is later deleted or anonymized.
- Break-glass access, when implemented, produces an enhanced-severity audit event distinct from routine access logging.

### Testing Rules

**Every feature ships as: implement → automated tests → manual test cases → verify → complete.** Test documentation is never postponed to the end of the project.

- A milestone is not complete until its full automated regression suite passes — not just its own new tests.
- Every milestone's Definition of Done includes explicit entitlement, RBAC, override, and temporary-permission checks in both directions (access works / access denied). See Development Phases & Roadmap.
- Direct URL access to an unauthorized route is tested explicitly, never assumed safe because navigation is hidden.
- **Automated coverage is expected at the level the change deserves:** unit tests for pure logic (formatters, calculators, permission resolution), component tests for shared UI, integration/API tests for every endpoint (happy path, validation failure, 401, 403, tenant isolation), and end-to-end tests for the critical workflows (sign-in, register patient → book → check-in → consult → dispense → bill → collect).
- **A feature is not complete while a known automated test is failing**, unless the failure is written down and explicitly accepted — in `BACKLOG.md`, with the reason.
- Manual test cases are **not** a substitute for automated tests, and automated tests are not a substitute for the manual QA checklist. Both are required.

**The gate before manual QA (binding).** Testing staff are handed `testcases.md` only after the automated suite has been run to green, end to end:

```
implement → automated tests → FULL suite → fix failures → regression → manual QA
```

- **Run everything, not a subset** — unit, component, integration/API, and the complete E2E suite. Critical journeys end to end, authentication and authorization, API workflows, database interactions, role and permission boundaries in both directions, validation and error paths, and responsive critical flows where browser automation reaches them.
- **Map `testcases.md` to automated coverage** before the handover, so it is known which cases the suite already proves and which genuinely need a human.
- **A failure is diagnosed, not re-run.** Find the root cause, fix the implementation or the test, re-run that test, run the regression suite around it, then re-run the **full** suite before declaring anything ready.
- **Report the actual numbers** — total / passed / failed / skipped / blocked. "Tests were run" is not a result.
- **A known failure is documented in `BACKLOG.md` with its reason, or it blocks the handover.** Never silently skipped, and never left for the manual tester to rediscover.

Handing an unverified build to QA wastes the scarcest thing in the process — a tester's attention — on defects the suite would have caught in seconds.

### Manual Test Cases (`testcases.md`)

The repository root holds **`testcases.md`** — the complete manual QA checklist for the platform, organised by module, written so a tester who has never seen the code can execute it.

- **Every case carries:** ID, feature/module, preconditions, steps, expected result, priority, test type, the role/user required, and status.
- **It is updated in the same change as the feature.** A new page, workflow, endpoint, component, validation, permission, or behaviour adds its cases; changed behaviour updates them; removed behaviour deletes them; a change that could affect existing functionality adds regression cases.
- At any point in the project it must be usable as-is for a full feature-by-feature regression pass. Letting it drift is the same defect as letting `KNOWLEDGE.md` drift.

### Documentation Rules

- Every app and package maintains KNOWLEDGE.md (current state) and DONE.md (append-only implementation log). A feature is not done until both are updated.
- Anything knowingly **blocked, skipped, or deferred** is recorded in the root **BACKLOG.md** in the same change that discovered it — including what is needed from the product owner and which file/decision it unblocks. An item leaves BACKLOG.md only when it is done (and logged in DONE.md) or explicitly dropped with a reason.
- Architecturally significant decisions are recorded in DECISIONS.md as a numbered ADR. DECISIONS.md is appended to, never rewritten.
- A root CLAUDE.md indexes the whole monorepo and links to every app/package's own KNOWLEDGE.md and DONE.md.

### Dependency Rules

- A business module's hard dependencies (Module Capability Matrix, Project Requirements Document) are enforced by the entitlement engine at activation time. The system refuses to activate a module whose hard dependency is not already entitled.
- New third-party dependencies sit behind a provider abstraction (SmsService, EmailService, FileStorageService). Module code never makes a direct SDK call to an external vendor.
- **Every new dependency is audited before it is added**, frontend included: is it actually necessary; does an existing dependency or `@hms/ui` already solve it; does Next.js/the platform provide it natively; what is its bundle cost; is it actively maintained; does it introduce a security or privacy concern. A large library is never introduced where a lightweight existing solution or a native capability is sufficient. The reasoning is recorded in the PR (and in DECISIONS.md when the choice is architecturally significant).
- **One canonical component kit: `@hms/ui`.** Shipped product UI comes from it, and missing capability is added to it. **shadcn/ui is installed in both frontends as a CLI + reference layer only (ADR-028)** — `shadcn add` is a scaffolding shortcut, not a second kit. Anything it generates must be reviewed before it ships: restyled onto `--hms-*` / `--mk-*` (never shadcn's own palette), verified in Light + Dark and under a non-default tenant accent, and kept out of the paths the existing kit already covers. No third UI library.

### Git Rules

- One feature branch per module/milestone, merged to a staging branch that auto-deploys to the staging environment.
- CI runs lint, tests, and build on every push. A push that fails CI does not merge.
- Commit messages and pull requests reference the milestone/module they implement, so DONE.md entries stay traceable back to source control.

### Clean Code & Replacement Rules

**If it is not used, it does not stay. No garbage code, ever — in this change, not "later".**

- **No dead implementations.** Replacing a technology or component follows _migrate → verify → delete_, in the same change. The old implementation is never kept "for future use", and two systems solving the same problem are never both active without a documented reason.
- **Deletion is part of Done, not a follow-up.** A change that leaves behind something it made unnecessary is unfinished — this is a Definition-of-Done gate, and a reviewer rejects on it.
- **The cleanup pass covers, at minimum:** orphaned files and components (nothing imports them), unused imports/exports/types/constants/hooks/utilities, dead CSS and design tokens, unreferenced images / Lottie / fonts / other `public/` assets, superseded API services and endpoints, generated scaffolding nothing consumes, empty directories, commented-out code, and **dependencies nothing imports — removed from `package.json` in the same commit**.
- **Regenerable scaffolding is deleted too.** Tooling output that can be recreated on demand (for example a `shadcn add` that was not adopted, or the `lib/utils.ts` its init writes) is removed while unused; the tool will write it again when it is actually needed.
- **Never keep code "just in case".** Git history is the archive. If it might be wanted later, it is recoverable from the commit that removed it — say so in the message rather than leaving it in the tree.
- **Verify, do not assume.** Before deleting, grep the whole repo for the symbol/filename/asset; after deleting, `typecheck` + `build` both apps. A green build with the code gone is the proof it was dead.

### Prohibited Patterns

- Do not check authorization in the frontend only.
- Do not create a module-specific table/pagination/sorting implementation when the shared DataTable exists.
- Do not hardcode brand colors, logos, or theme values in a component.
- Do not build a new authorization/permission engine for a specific feature (temporary access, break-glass, or otherwise) instead of extending the existing one.
- Do not physically delete entitlement, permission-override, or audit records.
- Do not merge or deploy a backend API route without synchronized, valid OpenAPI/Swagger documentation (enforced by `npm run openapi:validate` in CI).
- Do not write per-call success/error notification logic in a page or component instead of using the shared API-feedback layer.
- Do not build a second notification/toast implementation, add a second toast library, or import `react-toastify` outside `@hms/ui` — extend `@hms/ui` instead, and record an ADR if the engine itself must change (ADR-057).
- Do not pass a colour, or any style, to a toast call: variants resolve through the design tokens so a tenant's branding and the active theme apply automatically.
- Do not ship a `shadcn add` component as-is: unreviewed, on shadcn's own palette, or unverified in Dark and under a tenant accent.
- Do not build a module-specific table, toolbar, pagination, column-visibility, filter, action menu, empty/loading/error state, or confirmation dialog when the shared one exists — configure it instead.
- Do not hardcode a single page size, or fetch a whole large table into the browser to paginate it client-side.
- Do not render a user-facing date or time in any format other than `DD/MM/YYYY`, `hh:mm AM/PM`, or `DD/MM/YYYY, hh:mm AM/PM`, and do not format dates or times outside `@hms/utils` (ADR-046).
- Do not print an application page. A printable document is its own route with its own template, carrying the hospital's branding and none of the interface (ADR-047).
- Do not leave a replaced implementation, its config, styles, or its dependency in the repository after migrating away from it.
- Do not ship a feature without its automated tests and its `testcases.md` entries, and do not mark one complete while a known test is failing without documenting the acceptance.
- Do not render the mobile bottom bar on desktop, put more than five destinations in it, or offer a destination the signed-in user has no permission to open.
- Do not build a per-table action button, icon set, row menu, toggle, or delete confirmation when the shared `TableActions` components exist, and do not delete a row without the shared confirmation flow.
- Do not render an action the signed-in user has no permission to perform.
- Do not publish a marketing claim, section, card, headline, CTA, comparison, screenshot, mockup, animation, illustration, or statistic that cannot be traced to the PRD, architecture, development plan, a defined phase, or shipped functionality — and do not present a planned capability in the present tense.
- Do not add a decorative image to the marketing site, and do not use stock or generic healthcare photography, without a stated communication benefit agreed first.
- Do not hyphenate words that are not a compound in user-facing copy (and do not bulk-remove legitimate hyphens).
- Do not replace a usable backend message with generic copy, and do not show a raw technical error, stack trace, or backend internal to a user.
- Do not let any authenticated Portal route be indexable, and do not place patient/tenant/staff/operational data in metadata, URLs, OG images, or a sitemap.
- Do not ship duplicate page metadata, keyword-stuffed copy, hidden SEO text, or structured data describing content that is not visible on the page (including fabricated reviews or ratings).
- Do not use a raw `<img>` for a content image, load fonts from a runtime CDN, or ship a render-blocking third-party script.
- Do not send PHI or tenant-identifying operational data to an analytics or telemetry platform.
- Do not silently convert a "Pending verification" regulatory assumption into a stated compliance requirement.
- Do not introduce Kubernetes, Kafka, a service mesh, or multi-region deployment without an explicit, documented Phase 2+ decision.

## Documentation System

### Documentation & AI-Agent Knowledge System

### Documentation & AI-Agent Knowledge System

- Every major app and package maintains two living documents: **KNOWLEDGE.md** — current state (purpose, architecture, key files, components, services, APIs, database models, business rules, permissions, dependencies, integration points, known constraints, troubleshooting notes) — and **DONE.md** — an append-only chronological implementation log (date/time, feature, what was implemented, API/DB/frontend/integration changes, testing status, decisions, known limitations)
- One root CLAUDE.md indexes the whole monorepo — architecture, stack, coding/UI/theming/branding conventions, auth/RBAC/entitlement architecture, API and database conventions, testing and deployment conventions — and links to every app and package's own KNOWLEDGE.md and DONE.md
- Reading order for both human and AI-assisted development: root CLAUDE.md → the relevant module's KNOWLEDGE.md → DONE.md for historical context → source code — so architecture and past decisions are never rediscovered from scratch
- KNOWLEDGE.md is updated whenever a module's architecture or behavior changes; DONE.md is appended, never rewritten, whenever a feature is completed

> **Definition of Done, extended:** Documentation is not a follow-up task. On top of every milestone's own testing criteria (see "How This Roadmap Works"), a feature is not complete until KNOWLEDGE.md reflects it, DONE.md records it, and it has been verified in both themes and under a non-default tenant's branding. For any frontend work, the [Frontend Delivery Workflow](#frontend-delivery-workflow) is also part of Done — SEO (where applicable), accessibility, Next.js optimization, shared API feedback, performance budgets, and cleanup of everything the change made obsolete.

### Architecture Decision Records (DECISIONS.md)

A fourth documentation file, alongside CLAUDE.md, KNOWLEDGE.md, and DONE.md — recording _why_, not _what_ or _when_.

- **CLAUDE.md** — what the AI/developer must follow (conventions, standards)
- **KNOWLEDGE.md** — how the system currently works
- **DONE.md** — what was completed and when (append-only log)
- **DECISIONS.md** — why an important architectural decision was made, as a numbered Architecture Decision Record (ADR) per entry

Seed entries for this platform's own foundational decisions:

- ADR-001 — Modular monolith over microservices for MVP
- ADR-002 — PostgreSQL with Row-Level Security for multi-tenancy, over database-per-tenant
- ADR-003 — RBAC with user-level overrides, over pure role-based or full ABAC
- ADR-004 — Module entitlements as a runtime check, not a deployment decision
- ADR-005 — E2E Networks as primary hosting provider
- ADR-006 — India-resident object storage as the default for PHI (pending formal legal verification, see File Storage Architecture, Part VI)
- ADR-007 — Provider abstraction (SmsService/EmailService/FileStorageService) over direct SDK dependencies
- ADR-008 — FHIR-aligned Provider/PractitionerRole model for specialty-agnostic core
- ADR-009 — Vertical-slice, module-by-module MVP delivery order over horizontal layer-by-layer delivery

New architectural decisions of similar weight are appended here as they are made, with the same rigor as DONE.md is append-only for implementation history.

---

_Rules & Engineering Standards — v1.0 — Takoriya Technology LLP — August 2026_
