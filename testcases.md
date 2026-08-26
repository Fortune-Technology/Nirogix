# testcases.md — Nirogix manual QA checklist

The complete manual test pass for the platform, organised by module. A tester who has never seen the code should be able to execute any case here from the steps alone.

**This file is maintained with the code, not at the end.** A new page, workflow, endpoint, component, validation, permission, or behaviour adds its cases in the same change; changed behaviour updates them; removed behaviour deletes them; a change that can affect existing functionality adds regression cases (`resources/rules.md` → Manual Test Cases). Automated tests do not replace this file, and this file does not replace automated tests.

> **Run the automated suite first.** `npm run test:regression` covers authentication, roles and permissions, tenant isolation, the clinical workflow's state transitions, and five-app smoke. **`docs/automated-testing.md` maps each area below to the suite that covers it** and states plainly what is still manual-only. Start a manual pass from a green suite — a case already covered automatically needs a spot-check here, not a full re-run.

## How to read a case

| Field | Meaning |
|---|---|
| **ID** | `MODULE-nn`, stable — referenced from bug reports |
| **Priority** | P1 blocks release · P2 important · P3 cosmetic/edge |
| **Type** | Functional · Security · Validation · UI/UX · Responsive · Accessibility · Integration · Regression |
| **Role** | The user the case must be run as |
| **Status** | Not run · Pass · Fail · Blocked · N/A — reset each release |

## Test environment & accounts

- **Marketing** `http://localhost:3000` · **Portal** `http://localhost:3001` · **Patient portal** `http://localhost:3002` · **Platform admin** `http://localhost:3003` · **AI Portal** `http://localhost:3004` · **API** `http://localhost:4000/api/v1` (Swagger at `/api/v1/docs`). Five frontends, one backend (ADR-051).
- Seeded demo tenants: **CITYCARE**, **SUNRISE**, plus the vendor tenant **PLATFORM**.
- Accounts (seed, password `ChangeMe#123`): `jaivik@thefortunetech.com` and `nishant@thefortunetech.com` (super_admin, PLATFORM) · `admin@citycare.example` (org_admin) · `reception@citycare.example` (receptionist) · plus doctor / pharmacist / lab / cashier users per the seed.
- Run each UI case in **Light and Dark**, and at least once at **mobile width (375px)** and desktop.
- **Status legend below is per release.** Everything currently reads *Not run* — this checklist has not yet been executed end to end by a tester.

---

## 1. Authentication & session

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Sign in with valid credentials | Seeded tenant | Open `/login` → enter org code `CITYCARE`, email, password → Sign in | Lands on `/dashboard`; sidebar shows only permitted modules; no toast is raised | P1 | Functional | org_admin | Not run |
| AUTH-02 | Sign in with a wrong password | — | Same, with a wrong password | Inline error "Invalid credentials" on the form; **no** toast (the form owns this message); user stays on `/login` | P1 | Functional | any | Not run |
| AUTH-03 | Sign in with an unknown org code | — | Org code `NOSUCHORG` + valid email/password | Inline error; no hint about whether the email exists | P1 | Security | any | Not run |
| AUTH-04 | Password field reveal | — | Focus password → press the eye toggle | Password becomes readable, toggles back; control is keyboard reachable | P3 | Accessibility | any | Not run |
| AUTH-05 | Session survives a reload | Signed in | Press F5 on `/patients` | Page reloads still signed in (silent refresh); no flash of the login screen | P1 | Functional | any | Not run |
| AUTH-06 | Expired/again-invalid session | Signed in | Clear the refresh cookie in devtools → trigger any API call | Warning toast "Session expired"; redirected to `/login`; no infinite retry loop | P1 | Security | any | Not run |
| AUTH-07 | Sign out | Signed in | Topbar → Sign out | Returns to `/login`; success toast "Signed out."; back button does not restore an authenticated page | P1 | Security | any | Not run |
| AUTH-08 | Direct URL to a protected route while signed out | Signed out | Open `/patients` directly | Redirected to `/login`, not a blank screen | P1 | Security | anonymous | Not run |
| AUTH-09 | MFA-flagged account | Account with MFA required | Sign in | Clear "not supported yet" message; no partial session created | P2 | Functional | any | Not run |
| AUTH-20 | Refresh rotation invalidates the previous token (H-4 regression) | Signed in | Trigger a refresh, then replay the previous `hms_refresh` cookie | **401** — before this was fixed, two tokens minted in the same second were identical and the old one stayed valid for its whole lifetime | P1 | Security | receptionist | Not run |
| AUTH-21 | Refresh cookie is path-scoped | Signed in | Inspect the cookie | `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`, `Secure` in production, and **no** `Domain` attribute | P1 | Security | receptionist | Not run |
| AUTH-22 | A patient token is not a staff token | A patient token | Call any staff route with it | **401** — refused by principal type, before any permission is read (ADR-052) | P1 | Security | — | Not run |
| AUTH-30 | Forgot password — request (Portal) | Seeded tenant | `/login` → **Forgot password?** → enter org code + a real staff email → submit | Inline success: "If an account matches, a password-reset link has been emailed…" — no toast; an email is sent (dev: logged by the log provider) | P1 | Functional | any | Not run |
| AUTH-31 | Forgot password — uniform response | — | Same, with an unknown email, then an unknown org code | The **same** inline message and timing as AUTH-30 — the endpoint is not a directory (ADR-081) | P1 | Security | anonymous | Not run |
| AUTH-32 | Reset link sets a new password | A reset email's link | Open the link → enter a new password (≥10 chars) twice → submit | Success message; sign-in works with the new password and refuses the old one | P1 | Functional | any | Not run |
| AUTH-33 | Reset link is single-use | AUTH-32 done | Open the same link again and submit another password | "Invalid or expired reset link" — the consumed link is dead | P1 | Security | any | Not run |
| AUTH-34 | Reset link expires | A link older than 30 min | Open and submit | Same uniform "Invalid or expired reset link" | P1 | Security | any | Not run |
| AUTH-35 | Reset revokes every session | Signed in on another browser when the reset lands | Complete AUTH-32, then act in the other browser | The other session is signed out (refresh refused); user signs in again with the new password | P1 | Security | any | Not run |
| AUTH-36 | Forgot password on the Admin console | — | `admin` app `/login` → **Forgot password?** → operator org code + email | Same flow as the Portal; the emailed link opens the **admin** app's reset page (ADMIN_URL), not the Portal's | P1 | Functional | super_admin | Not run |
| AUTH-37 | Operator changes own password in the Admin console | Signed in as an operator | Sidebar → **My profile** → Password card → current + new (≥10, twice) → Change password | Success toast; signed out everywhere (this session too); sign-in works with the new password only. Wrong current password → 422 message, nothing changes | P1 | Security | super_admin | Not run |
| AUTH-40 | Account locks after repeated failures (H-3) | A test staff account | Sign in with a wrong password 5 times in a row | The 5th attempt still says "Invalid credentials"; the account is now locked for 1 minute | P1 | Security | any | Not run |
| AUTH-41 | The real user is told about the lock | AUTH-40 done | Sign in with the CORRECT password while locked | 429 with "Too many failed sign-in attempts. Try again in N minute(s)." — only a caller with the right password learns a lock exists | P1 | Security | any | Not run |
| AUTH-42 | The lock is not an enumeration oracle | AUTH-40 done | Sign in with a wrong password while locked | The same generic "Invalid credentials" as any wrong password — no mention of a lock | P1 | Security | anonymous | Not run |
| AUTH-43 | Attempts during a lock do not extend it | AUTH-40 done | Keep attempting wrong passwords, then wait out the original window | The account unlocks on the original schedule; somebody who knows an email cannot hold it shut | P1 | Security | anonymous | Not run |
| AUTH-44 | Backoff grows, then the lock lifts | A locked account | Fail again after the first lock expires; note the wait each time | 60s, 2 min, 4 min… to a 15-minute ceiling; no administrator action is ever needed | P2 | Security | any | Not run |
| AUTH-45 | A lock is per account, not per hospital | AUTH-40 done | Sign in as a DIFFERENT user in the same tenant | Signs in normally — one locked account never blocks a ward | P1 | Security | any | Not run |
| AUTH-46 | The lock is in the audit trail | AUTH-40/41 done | Audit log → filter Warning/Critical | `auth.login.locked` when it locked and `auth.login.blocked` for attempts against it; ≥10 failures shows as **Critical** | P1 | Security | org_admin | Not run |
| AUTH-47 | Success clears the streak | A partly-failed account (fewer than 5) | Sign in correctly, then fail once | The next lock takes a full 5 failures again — the counter reset on success | P2 | Functional | any | Not run |
| AUTH-48 | Password policy on change and reset (M-6) | Signed in | My profile → Password → try `password1234`, then `Short#1a`, then your own name + year | Each is refused with a specific reason (commonly guessed / too short / built from your own details); a genuinely strong one is accepted | P1 | Security | any | Not run |
| AUTH-49 | Password policy on admin-created accounts | org_admin | Users → New user → supply a weak password | 422 with the same policy message the user sees on self-service — an admin-created account is not an exemption | P1 | Security | org_admin | Not run |
| AUTH-50 | Generated temporary passwords are strong | org_admin | Users → New user with **no** password → note the temp password; repeat 3 times | 16 characters, mixed classes, and no shared prefix between them (it used to start `Hms-` every time) | P2 | Security | org_admin | Not run |
| AUTH-51 | Idle sign-out (L-5) | Signed in | Leave the tab untouched for 15 minutes, then return | Signed out, back at `/login`, with an info toast naming inactivity; the session is dead server-side, not just in the tab | P1 | Security | any | Not run |
| AUTH-52 | Idle timer is per browser, not per tab | Signed in, two tabs open | Work continuously in tab A for 20 minutes without touching tab B | Neither tab signs out — activity is shared across tabs | P2 | Functional | any | Not run |
| AUTH-53 | Idle sign-out on the patient portal | A signed-in patient | Leave the portal idle for 15 minutes | Same behaviour on the patient app, which is opened on borrowed phones and kiosks | P1 | Security | patient | Not run |

## 2. Authorization, roles & tenancy

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| RBAC-01 | Menu reflects permissions | — | Sign in as receptionist; compare with org_admin | Receptionist sees a reduced menu (no Users/Branches/Audit); org_admin sees the full permitted set | P1 | Security | receptionist | Not run |
| RBAC-02 | Direct URL to an unpermitted page | Signed in as receptionist | Open `/audit` directly | Standard Forbidden panel renders; **no** data request is made for that page | P1 | Security | receptionist | Not run |
| RBAC-03 | API refuses what the UI hides | Signed in as receptionist | Call `GET /api/v1/audit` with that token (Swagger/curl) | HTTP 403 with the canonical error shape — visibility is not the control | P1 | Security | receptionist | Not run |
| RBAC-04 | Explicit DENY beats a role grant | org_admin can manage overrides | Users → pick a user with `patient.view` via role → add DENY override for it → sign in as them | Patients is hidden and `/patients` 403s despite the role granting it | P1 | Security | org_admin | Not run |
| RBAC-05 | Temporary override window | — | Add a GRANT with `validUntil` in the past, then one valid now | Expired override grants nothing; current one grants immediately | P2 | Security | org_admin | Not run |
| RBAC-06 | Sidebar item ↔ page guard parity | — | For each role, compare every sidebar item against opening its route directly | Every item the sidebar shows opens without a Forbidden panel; nothing permitted is missing. The rule: a nav item's permission is its landing page's guard (nav.ts) | P1 | Security | all roles | Not run |
| RBAC-07 | Doctor and the pharmacy workspace | Signed in as doctor | Check the sidebar; then open `/pharmacy` directly | No **Pharmacy** item (doctor holds stock-view for the in-consult formulary, not dispense); direct `/pharmacy` still shows the Forbidden panel and the API still 403s | P1 | Security | doctor | Not run |
| TEN-01 | Tenant isolation in the UI | Two seeded tenants | Sign in to CITYCARE, note a patient UHID; sign in to SUNRISE and search for it | Not found — no cross-tenant record is reachable | P1 | Security | org_admin | Not run |
| TEN-02 | Tenant isolation at the API | Token for CITYCARE | Request a SUNRISE record id directly | 404/403, never another tenant's data | P1 | Security | org_admin | Not run |
| TEN-03 | Super admin sits outside customer tenants | — | Sign in as `jaivik@thefortunetech.com` | Platform surfaces (Tenants, platform branding) are available; no clinical menu for a hospital they do not belong to | P2 | Security | super_admin | Not run |

### Module & capability entitlement (ADR-085)

The capability tier beneath modules. Chain: `requireAuth → requireModule → requireCapability → requirePermission`. Deny-by-exception — a capability is ON by default whenever its module is entitled. The `billing.services` capability (services & packages catalogue) is the shipped demonstrator; there is no capability-config UI yet (P5), so disable/enable is exercised at the service/API level.

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| CAP-07 | Sidebar hides a module the tenant lacks | Lab technician at a tenant WITHOUT `laboratory` | Sign in, read the sidebar | No **Laboratory** item, though the role holds `laboratory.order.view`; re-granting the module restores it on the next load | P1 | Security | lab_technician | Not run |
| CAP-08 | Direct URL to a hidden module is refused | As above | Type `/laboratory` | The screen reports "This module is not available for your organization" and the API answers 403 `MODULE_NOT_ENTITLED` — hiding was never the boundary | P1 | Security | lab_technician | Not run |
| CAP-09 | Sidebar hides a switched-off capability | Receptionist; `opd` on, `opd.referral` off | Sign in, read the sidebar | No **Referrals** item although the role holds `opd.referral.view`; OPD queue still present; re-enabling restores it | P1 | Security | receptionist | Not run |
| CAP-10 | Operator does not bypass entitlement | Platform operator in a support session at a tenant without a module | Read the sidebar | The module is absent — WILDCARD grants permissions, never entitlement | P2 | Security | super_admin | Not run |
| CAP-01 | Capability ON by default | Tenant entitled to `billing`, no capability config | Call `GET /api/v1/billing/services` with a permitted token | 200 — the catalogue works with no capability row (deny-by-exception default-ON) | P1 | Functional | cashier | Not run |
| CAP-02 | Disabling a capability gates its API | `billing` entitled; `billing.services` set DISABLED for the tenant | Call `GET/POST /api/v1/billing/services` | 403 `CAPABILITY_NOT_ENTITLED` regardless of the user's `billing.services.*` permission — a capability off overrides every role that holds its permission | P1 | Security | cashier | Not run |
| CAP-03 | Module off cascades to its capabilities | `billing` suspended | Resolve `billing.services` | Capability is off even with no capability row — a capability is never entitled when its module is not | P1 | Security | — | Not run |
| CAP-04 | Entitlements surface carries capabilities | Signed in | `GET /api/v1/entitlements` | Response has `modules` **and** `capabilities` (enabled capability keys of entitled modules); disabling one drops it from the list | P2 | Functional | org_admin | Not run |
| CAP-05 | Dependency guard on configure | `abdm` entitled; `abdm.facility` + `abdm.scan_share` on | Attempt to disable `abdm.facility` while `abdm.scan_share` is enabled | Refused, naming `abdm.scan_share`; enabling `abdm.scan_share` while `abdm.facility` is off is likewise refused | P2 | Functional | — | Not run |
| CAP-06 | Disable ≠ delete (invariant #6) | Tenant had `billing.services` used, then DISABLED | Read existing invoices/lines that referenced catalogue services | Historical invoices and lines remain readable; only new catalogue operations are blocked | P1 | Security | cashier | Not run |

## 3. Shared UI: DataTable, toasts, dates

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| TBL-01 | Sorting cycles correctly | Any list page | Click a sortable header three times | Unsorted → ascending → descending → unsorted, with the matching arrow indicator | P2 | UI/UX | any | Not run |
| TBL-02 | Multi-column sort | `/providers` | Click one header, then Shift+click another | Both columns sort; the second shows its order number | P3 | UI/UX | any | Not run |
| TBL-03 | Rows per page actually changes the fetch | `/audit` with >100 entries | Set rows per page to 100 | 100 rows render and "Showing 1–100 of N" updates (server refetch, not client slice) | P1 | Functional | org_admin | Not run |
| TBL-04 | Search on a server-mode table | `/patients` | Type a partial name | One debounced request; results narrow; `?q=` appears in the URL | P1 | Functional | receptionist | Not run |
| TBL-05 | Faceted filter | `/users` | Open the Roles filter → tick a role | Only matching rows remain; the filter chip shows a count; Clear resets | P2 | Functional | org_admin | Not run |
| TBL-06 | Column visibility | Any list page | Columns → hide a column, then Show all | Column disappears and returns; pinned identity columns are not offered | P2 | UI/UX | any | Not run |
| TBL-07 | URL state survives reload | `/patients` | Sort + search + page, then reload | The same view is restored from the query string | P2 | Functional | any | Not run |
| TBL-08 | Empty state | Search for nonsense on any table | — | Shared empty state with a clear message (and an action where offered), never a blank table | P2 | UI/UX | any | Not run |
| TBL-09 | Loading state | Throttle the network, open a list page | — | Skeleton rows render, not a layout jump | P3 | UI/UX | any | Not run |
| TBL-10 | Error state + retry | Stop the API, open a list page | — | Shared error state with a Try again control; retry works once the API is back | P2 | UI/UX | any | Not run |
| UI-30 | Scrollbars follow the theme | Any app, any scrollable view (page, sidebar, dialog, dropdown, table) | Check scrollbars in Light, toggle Dark, re-check; hover the thumb | Thin token-coloured thumb on a transparent track in BOTH themes (never the browser default white/grey in Dark); hover darkens the thumb; consistent across all five apps | P2 | UI/UX | any | Not run |
| TBL-11 | Overflow row actions | Any table using `MoreActions` | Open the "…" menu on a row | Same menu everywhere; only permitted actions appear; Esc closes; arrow keys move between items | P2 | Accessibility | any | Not run |
| ACT-01 | The Action column is identical everywhere | `/patients`, `/users`, `/branches`, `/appointments`, `/opd`, `/billing`, `/admin/tenants` | Compare the last column on each | Always last, **left-aligned** (ADR-064), headed "Actions", same icon size, spacing and hover treatment; never more than three inline icons | P1 | UI/UX | org_admin | Not run |
| ACT-02 | Action tooltips and labels | Any table with row actions | Hover, then tab to each action | Every action has a tooltip and the same accessible name; icons are never unlabelled | P1 | Accessibility | any | Not run |
| ACT-03 | Permission gating | `/users` as a role without `platform.users.manage` | Open the list | The suspend/activate switch is absent (not greyed); View still appears; the API also refuses the action if called directly | P1 | Security | receptionist | Not run |
| ACT-04 | Destructive action confirms | `/admin/tenants/{id}` → Modules → Revoke | Trigger it | Shared confirmation names the module and the consequence; Cancel leaves the entitlement in place; Confirm revokes and the list refreshes | P1 | Functional | super_admin | Not run |
| ACT-05 | Suspending a user confirms and states the effect | `/users` | Toggle an active user off | Confirmation names the person and says they are signed out; on confirm the status badge flips to suspended | P1 | Functional | org_admin | Not run |
| ACT-06 | Toggle is a real switch | `/branches` | Tab to the status toggle and press Space | Announces as a switch with its on/off state; keyboard operates it; the branch's active state flips | P2 | Accessibility | org_admin | Not run |
| ACT-07 | Loading state blocks double submission | `/branches` on a slow network | Activate a branch, then click again immediately | The action shows a spinner and accepts no second click; exactly one request is sent | P2 | Functional | org_admin | Not run |
| ACT-08 | Disabled actions explain themselves | Any row where an action is unavailable | Hover the greyed action | The tooltip gives the reason; the control is never silently inert | P2 | UI/UX | any | Not run |
| ACT-09 | Roles and overrides confirm before removal | `/users/{id}` | Remove a role, then revoke an override | Each confirms first, naming what the user loses; the audit trail records both | P1 | Security | org_admin | Not run |
| ACT-10 | Clinical row actions keep one click | `/opd` | Start a consult, then complete the visit from the queue | Each is a single click with a tooltip; the status badge advances; no confirmation is imposed on a routine transition | P1 | Functional | doctor | Not run |
| TBL-12 | Destructive confirmation | Any destructive row action | Trigger it | Shared confirmation dialog; Cancel aborts; background does not scroll while open | P1 | UI/UX | org_admin | Not run |
| TBL-13 | Wide table scrolling | `/reports` OPD register at 375px | Scroll horizontally | The table scrolls inside its own container; the page layout does not break | P2 | Responsive | any | Not run |
| TBL-14 | All columns visible by default (ADR-063) | `/patients`, `/audit` | Open each fresh, without touching Columns | Every applicable column shows on first render — patient Registered and audit Severity included; only a documented exception (registration "Their note") starts hidden | P1 | UI/UX | org_admin | Not run |
| TBL-15 | Faceted filter narrows the whole dataset server-side (ADR-063) | `/patients` with >1 page of patients across genders/cities | Open the Gender (or City) filter → tick a value | One request fires; the total and every page reflect the filter — not just the rows that were already on screen; `?` params/state update; Clear resets and refetches | P1 | Functional | receptionist | Not run |
| TBL-16 | Registration date-range filter | `/patients` | Set the Registered From/To dates | Both ends read `DD/MM/YYYY`; results narrow to patients registered in the window (whole dataset, server-side); the clear (×) removes the range and refetches | P2 | Functional | receptionist | Not run |
| TBL-17 | Multi-select status/severity filter, server-side (ADR-063) | `/appointments`, `/billing`, `/audit` | Open the Status (or Severity) faceted filter → tick two values | Every closed-enum value is offered even if none are on the current page; ticking two returns rows matching **either**, across the whole dataset (one request per change); the count chip shows 2; Clear resets. There is no separate bespoke dropdown beside it | P1 | Functional | org_admin | Not run |
| TBL-18 | Invoice amount-range filter | `/billing` | Enter a Total (₹) min and/or max | Results narrow to invoices whose total is in the rupee range (whole dataset, server-side — rupees are sent as paise); an emptied field is an open end, not zero; the clear (×) removes the range and refetches | P2 | Functional | org_admin | Not run |
| TOAST-01 | Success feedback carries the API message | — | Settings → Save colours | Success toast reading the backend's message ("Branding saved.") | P1 | Functional | org_admin | Not run |
| TOAST-02 | Failure feedback | — | Open `/users/00000000-0000-0000-0000-000000000000` | Error toast "Not found — User not found"; persists until dismissed | P1 | Functional | org_admin | Not run |
| TOAST-03 | No duplicate stacking | — | Press Save colours three times quickly | One toast, refreshed — not three | P2 | UI/UX | org_admin | Not run |
| TOAST-04 | Server errors reveal nothing internal | Force a 500 | — | Generic copy; no stack trace, SQL, hostname, or PHI anywhere in the toast | P1 | Security | any | Not run |
| TOAST-05 | Offline / timeout | Disable the network → trigger any action | — | "Can't reach the server" (or timeout) toast; the app does not hang silently | P1 | Functional | any | Not run |
| TOAST-06 | Dismissal | Raise any toast | Press the close control | The toast dismisses; success and info auto-dismiss after ~5s, a warning after ~7s, errors do not | P2 | UI/UX | any | Not run |
| TOAST-07 | Position | Raise any toast on desktop | Look at where it appears | Top-right, clear of the app bar — it never covers navigation or the primary action | P1 | UI/UX | any | Not run |
| TOAST-08 | Position on a phone | Below 480px wide | Raise any toast | Spans the width inside the safe-area inset, below the app bar, and never causes horizontal scroll | P1 | UI/UX | any | Not run |
| TOAST-09 | Status is not colour-only | Raise one of each variant | View in greyscale, or read the text alone | Each carries a distinct icon **and** a word ("Success", "Warning", "Something went wrong") | P1 | Accessibility | any | Not run |
| TOAST-10 | Screen-reader semantics | A screen reader running | Raise a success, then an error | The success is announced politely (`role="status"`), the error interrupts (`role="alert"`); the region is labelled "Notifications" | P1 | Accessibility | any | Not run |
| TOAST-11 | Follows the tenant's branding | A tenant with a non-default accent | Raise an info toast in Light, then Dark | The icon, accent edge and progress bar are the tenant's accent; the surface, text and border follow the theme. Nothing is hardcoded | P1 | UI/UX | org_admin | Not run |
| TOAST-12 | Stacking and the cap | — | Raise six toasts quickly | Four are visible, newest at the top, the rest queue — the page is never buried | P2 | UI/UX | any | Not run |
| TOAST-13 | Pauses while unattended | A success toast on screen | Hover it, then switch browser tab and come back | The timer pauses on hover and while the tab is inactive, so a toast is never missed | P2 | UI/UX | any | Not run |
| TOAST-14 | A loading toast resolves | An operation using a loading toast | Start it and wait | The same toast becomes success or error — one toast, updated, never a spinner left behind or a second toast | P1 | Functional | any | Not run |
| TOAST-15 | No duplicate notification per event | A page that handles a failure inline | Trigger that failure | One message only — either the inline treatment or the toast, never both for the same event | P1 | UI/UX | any | Not run |
| TOAST-16 | One toast system | — | Grep the repo for `react-toastify` | It is imported only inside `@hms/ui` (`src/toast.tsx` and `src/components/Toaster.tsx`); no app, page or module imports it, and no second toast library is installed | P1 | Regression | — | Not run |
| DATE-01 | Date format everywhere | Any screen showing dates | Compare tables, detail pages, filters | Every user-facing date reads `DD/MM/YYYY` (with time: `DD/MM/YYYY HH:mm`) regardless of the machine's locale | P1 | UI/UX | any | Not run |
| DATE-02 | Missing dates | Record with an empty date | View it | Renders an em dash, never "Invalid Date" or blank | P3 | UI/UX | any | Not run |

## 4. Mobile & responsive navigation

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| NAV-01 | Portal bottom bar appears on mobile only | 375px | Open any authenticated page; then widen past 768px | Bottom bar with ≤5 items on mobile; sidebar on desktop; never both | P1 | Responsive | any | Not run |
| NAV-02 | Bottom bar respects permissions | 375px, receptionist | Inspect the bar | Only permitted destinations; no route the user cannot open | P1 | Security | receptionist | Not run |
| NAV-03 | Active state | 375px | Navigate between bar destinations | The current destination is highlighted and marked `aria-current` | P2 | UI/UX | any | Not run |
| NAV-04 | Drawer opens from the top-right hamburger | 375px | Tap the hamburger | Drawer slides in from the right listing all permitted modules | P1 | UI/UX | any | Not run |
| NAV-05 | Background scroll lock | 375px, drawer open | Try to scroll the page behind the drawer | Background does not move; the drawer scrolls independently; closing restores normal scrolling | P1 | UI/UX | any | Not run |
| NAV-06 | Drawer keyboard behaviour | Drawer open | Press Tab repeatedly, then Esc | Focus stays inside the drawer; Esc closes it and focus returns to the hamburger | P2 | Accessibility | any | Not run |
| NAV-07 | Content is never covered by the bar | 375px | Scroll to the bottom of a long page | The last row/button is fully reachable above the fixed bar | P2 | Responsive | any | Not run |
| NAV-08 | Marketing bottom bar | 375px, marketing | Visit the site | Bar shows Home · Modules · Specialties · Pricing · Demo, with the active one marked | P2 | Responsive | anonymous | Not run |
| NAV-09 | Marketing drawer | 375px, marketing | Tap the top-right hamburger | Drawer lists the full navigation plus legal links and the sign-in / demo actions | P2 | UI/UX | anonymous | Not run |
| NAV-10 | Desktop is unchanged | ≥1280px | Both apps | No bottom bar; Portal sidebar and marketing header nav behave as before | P1 | Responsive | any | Not run |

## 5. Patient management

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| PAT-01 | Register a patient | `patient.create` | Patients → Register patient → fill required fields → Save | Patient created with a generated UHID; success toast; appears in the list | P1 | Functional | receptionist | Not run |
| PAT-02 | Required-field validation | — | Submit the form empty | Field-level errors; nothing is created; no server error toast | P1 | Validation | receptionist | Not run |
| PAT-03 | Phone/email format validation | — | Enter an invalid phone and email | Rejected with a readable message before submission | P2 | Validation | receptionist | Not run |
| PAT-04 | Search by UHID, name, phone | Several patients | Search each way | Matching patients returned; searching nonsense shows the empty state | P1 | Functional | receptionist | Not run |
| PAT-05 | Open a patient record | — | Click a UHID | Detail view with demographics and history; dates in `DD/MM/YYYY` | P1 | Functional | doctor | Not run |
| PAT-06 | Edit a patient | `patient.create` | Change a field → Save | Change persists after reload; success toast | P2 | Functional | receptionist | Not run |
| PAT-07 | Permission gate | Role without `patient.view` | Open `/patients` | Forbidden panel | P1 | Security | pharmacist | Not run |
| PAT-08 | Duplicate warning on registration | A patient with the same phone + name (or phone + DOB) exists | Register with those details | 409 dialog lists the matching charts with UHID/phone/DOB; nothing created yet | P1 | Validation | receptionist | Not run |
| PAT-09 | Register anyway / use existing | Duplicate dialog open | Choose "Use this patient" or "Register anyway" | Use → navigates to the existing chart, nothing created; anyway → new chart with its own UHID | P1 | Functional | receptionist | Not run |
| PAT-10 | Archive and reactivate | Active patient | Row action → Deactivate, then Reactivate | Status becomes archived then active again; record and history untouched; both changes audited | P1 | Functional | receptionist | Not run |
| PAT-11 | Edit from the list | — | Patients list → row action "Edit details" | Lands on the record with the edit form already open | P2 | UI/UX | receptionist | Not run |
| PAT-12 | Record history | Patient with visits/bills | Open the record | History cards show visits, consultations, invoices and lab orders — each card only for roles holding that module's view permission | P1 | Functional | doctor | Not run |
| PAT-13 | QR approval duplicate → link existing chart | Pending request matching an existing patient | Approve it | Duplicate dialog offers "Link this chart"; linking marks the request approved against the existing patient — no second chart | P1 | Functional | receptionist | Not run |

## 6. Appointments

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| APPT-01 | Book an appointment | Patient + provider exist | Appointments → Book → choose patient, provider, slot → Save | Appointment created with status booked; success toast; visible in the list | P1 | Functional | receptionist | Not run |
| APPT-02 | Double-booking a slot | Slot already taken | Book the same provider/time | Rejected with a clear message; no second appointment | P1 | Validation | receptionist | Not run |
| APPT-03 | Past-date booking | — | Choose a past slot | Rejected with a readable message | P2 | Validation | receptionist | Not run |
| APPT-04 | Filter by status | Mixed statuses | Use the status filter | Only matching appointments; filter resets cleanly; page returns to 1 | P2 | Functional | receptionist | Not run |
| APPT-05 | Cancel an appointment | `appointment.cancel` | Cancel a booked appointment | Status becomes cancelled; success toast; check-in action no longer offered | P1 | Functional | receptionist | Not run |
| APPT-06 | Cancel without permission | Role lacking the permission | — | The action is not offered, and the API refuses it if called directly | P1 | Security | doctor | Not run |
| APPT-07 | Date/time display | — | Inspect the When column | `DD/MM/YYYY HH:mm`, in the clinic's expected reading order | P2 | UI/UX | any | Not run |

## 7. OPD queue & check-in

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| OPD-01 | Check a patient in | Booked appointment | Appointments → Check in | Visit created with a token number; appears in the OPD queue; **a draft consultation invoice is opened automatically** | P1 | Functional | receptionist | Not run |
| OPD-02 | Walk-in check-in | No appointment | OPD → Check in → pick patient + provider | Visit + token created the same way | P1 | Functional | receptionist | Not run |
| OPD-03 | Queue ordering | Several visits today | View the queue | Ordered by token; status and waiting information readable at a glance | P2 | UI/UX | receptionist | Not run |
| OPD-04 | Status transitions | Visit in queue | Move waiting → in consultation → completed | Each transition persists and is reflected in the queue | P1 | Functional | doctor | Not run |
| OPD-05 | Check-in without permission | Role lacking `opd.checkin` | — | Action hidden; API refuses a direct call | P1 | Security | pharmacist | Not run |
| OPD-06 | Bill link from the queue | Visit with an invoice | Click the bill badge | Opens that patient's invoice | P2 | Functional | cashier | Not run |
| OPD-07 | Provider default fee | Provider has a configured consultation fee | Check in with the fee field blank | Invoice opens with exactly the provider's fee; the field's hint names that fee | P1 | Functional | receptionist | Not run |
| OPD-08 | Second walk-in blocked | Patient already checked in today (live visit) | Check the same patient in again | Refused with the existing visit number; no second visit or invoice | P1 | Validation | receptionist | Not run |
| OPD-09 | My patients only | Doctor linked to a provider; other doctors have patients today | Open the OPD queue as the doctor | Defaults to their own patients; unticking shows the whole queue; a login with no provider record sees an empty personal list | P1 | Functional | doctor | Not run |
| OPD-10 | Start consult blocked while unpaid | Checked-in visit, unpaid invoice | Row action → Start consult | Refused with "consultation fee is unpaid"; status unchanged | P1 | Validation | doctor | Not run |

## 8. Clinical workflow (EMR)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| EMR-01 | Open a consultation | Active visit | OPD → open the visit | Encounter opens with patient context; no toast for opening | P1 | Functional | doctor | Not run |
| EMR-02 | Save SOAP notes and vitals | Open encounter | Enter chief complaint, SOAP, vitals → Save | Success toast "Consultation saved."; values persist after reload | P1 | Functional | doctor | Not run |
| EMR-03 | Add an ICD-10 diagnosis | Open encounter | Search a term → select | Diagnosis attaches with its code; first one marked primary | P1 | Functional | doctor | Not run |
| EMR-04 | Prescribe | Open encounter | Add drug, dose, frequency, duration, route → Save | Prescription saved and visible on the record; reaches the pharmacy queue after signing | P1 | Integration | doctor | Not run |
| EMR-05 | Order a lab test | Open encounter | Add a lab order → Save | Order appears in the laboratory worklist | P1 | Integration | doctor | Not run |
| EMR-06 | Sign the consultation | Draft encounter | Sign | Confirmation first; record locks; visit marked completed; further edits refused | P1 | Functional | doctor | Not run |
| EMR-07 | Concurrent edit | Same encounter open twice | Save in both | The second save is refused with a conflict message, not silently overwritten | P2 | Validation | doctor | Not run |
| EMR-08 | Access control | Role without EMR permission | Open the encounter URL | Forbidden panel; no clinical data rendered | P1 | Security | cashier | Not run |
| EMR-09 | Payment gate on opening | Unpaid checked-in visit | Open the visit as the doctor | "Payment pending" panel with the balance and a Collect payment link; no draft encounter created | P1 | Validation | doctor | Not run |
| EMR-10 | Prescribe from the drug master | Drugs in the master | Pick a drug from the picker | Row shows stock and unit price; after save the prescription carries the master link and the exact master name | P1 | Functional | doctor | Not run |
| EMR-11 | Order from the test master | Tests in the master | Pick a test from the picker | Row shows the price and "billed at sample collection"; the saved order carries the master link | P1 | Functional | doctor | Not run |
| EMR-12 | Re-save never destroys progressed work | Lab order collected/resulted on a draft encounter | Edit notes and save again | The collected/resulted order and its result survive; only still-ordered rows follow the edit; dispensed prescriptions stay locked in the form | P1 | Integration | doctor | Not run |
| EMR-13 | Past consultations panel | Patient with earlier signed encounters | Open a new consultation | Earlier signed visits listed with date, doctor, complaint and diagnoses; current visit excluded | P2 | Functional | doctor | Not run |

## 9. Pharmacy

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| PHR-01 | Add a drug | `pharmacy.manage` | Stock → Add drug → fill → Save | Drug listed with price and reorder level; success toast | P1 | Functional | pharmacist | Not run |
| PHR-02 | Receive stock | Existing drug | Receive → quantity, batch, expiry | On-hand increases by exactly that quantity; success toast | P1 | Functional | pharmacist | Not run |
| PHR-03 | Low-stock indication | Stock below reorder level | View stock | Low badge shows; the Stock level filter finds it | P2 | UI/UX | pharmacist | Not run |
| PHR-04 | Dispense against a prescription | Signed prescription | Pharmacy → dispense | Stock decreases; charge is added to the patient's bill; toast names the drug, quantity and amount added | P1 | Integration | pharmacist | Not run |
| PHR-05 | Dispense more than stock | Quantity > on hand | Attempt it | Rejected with a clear message; stock unchanged | P1 | Validation | pharmacist | Not run |
| PHR-06 | Invalid quantity | — | Enter 0 or a negative number | Client-side validation message; no request sent | P2 | Validation | pharmacist | Not run |
| PHR-07 | Draft prescriptions never reach pharmacy | Encounter saved but not signed | Open the pharmacy worklist | The prescription is absent; a direct dispense call is refused ("not signed") | P1 | Security | pharmacist | Not run |
| PHR-08 | No double dispense | Prescription already dispensed | Dispense it again (second tab / direct call) | Refused with a conflict; stock deducted exactly once; one pharmacy line on the bill | P1 | Validation | pharmacist | Not run |
| PHR-09 | Master-linked prescription pre-selects the drug | Prescription made from the drug picker | Open its dispense card | The exact prescribed drug is pre-selected by id, not guessed from the name | P2 | Functional | pharmacist | Not run |

## 10. Laboratory

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| LAB-01 | Add a test to the master | `lab.manage` | Tests → Add | Test listed with sample type, reference range, price | P1 | Functional | lab_tech | Not run |
| LAB-02 | Order appears in the worklist | Lab order raised in EMR | Open Laboratory | The order is listed with its status | P1 | Integration | lab_tech | Not run |
| LAB-03 | Collect a sample | Ordered test | Mark collected | Status moves to collected; success toast | P1 | Functional | lab_tech | Not run |
| LAB-04 | Enter a result | Collected sample | Enter value, unit, notes → Save | Result saved; flag (normal/high/low/critical) derived from the reference range | P1 | Functional | lab_tech | Not run |
| LAB-05 | View the report | Result entered | Open the order | Printable report with patient, test, result, reference range and flag | P1 | Functional | doctor | Not run |
| LAB-06 | Lab charge on the bill | Result entered | Open the patient's invoice | The lab charge is a line item on the existing invoice, not a separate bill | P1 | Integration | cashier | Not run |
| LAB-07 | Result without a value | — | Save an empty result | Validation message; nothing saved | P2 | Validation | lab_tech | Not run |
| LAB-08 | Result before collection is refused | Ordered (not collected) test | Enter a result directly | Refused with "collect the sample first"; status unchanged | P1 | Validation | lab_tech | Not run |
| LAB-09 | Billed once, at collection | Master-linked order | Collect the sample, then enter the result | The lab line lands on the visit's invoice at collection, at the master price — and exactly once after the result too | P1 | Integration | cashier | Not run |

## 11. Billing & payments

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| BIL-01 | Invoice from check-in | Checked-in visit | Billing → open the invoice | Draft invoice with the consultation fee line | P1 | Functional | cashier | Not run |
| BIL-02 | Totals are correct | Invoice with several lines | Compare line items with the summary | Subtotal, tax and total are exact to the paisa; no float drift | P1 | Functional | cashier | Not run |
| BIL-03 | Collect a full payment | Unpaid invoice | Collect payment → full amount → Record | Status becomes paid; balance zero; success toast; receipt shows the payment | P1 | Functional | cashier | Not run |
| BIL-04 | Part payment | Unpaid invoice | Pay less than the balance | Status becomes partially paid; balance is the remainder | P1 | Functional | cashier | Not run |
| BIL-05 | Overpayment / invalid amount | — | Enter 0, a negative, or more than the balance | Rejected with a clear message | P1 | Validation | cashier | Not run |
| BIL-06 | Idempotent retry | Payment form open | Submit, then submit the same attempt again (double-click / retry) | Exactly one payment recorded — never a double charge | P1 | Functional | cashier | Not run |
| BIL-07 | Filter by status | Mixed invoices | Use the status filter | Only matching invoices; paging resets to page 1 | P2 | Functional | cashier | Not run |
| BIL-08 | Print a receipt | Paid invoice | Print | Print view shows the receipt only, without navigation chrome | P2 | UI/UX | cashier | Not run |
| BIL-09 | Money formatting | Any invoice | Inspect amounts | Indian rupee formatting, two decimals, aligned right in tables | P2 | UI/UX | any | Not run |
| BIL-10 | Settled invoice takes no more | Fully paid invoice | Attempt another payment (direct call) | Refused with "already settled"; the Collect button is gone from the screen | P1 | Validation | cashier | Not run |
| BIL-11 | Services catalogue CRUD | `billing.services.manage` | Services → Add (code, name, price, tax) → edit → deactivate | Code stored uppercase and unique; deactivated service leaves history intact and disappears from pickers | P1 | Functional | org_admin | Not run |
| BIL-12 | Add a catalogue item to a bill | Open invoice; active service | Invoice → Add item → pick service + qty | Line lands at the CATALOGUE price (client sends no price); totals recompute to the paisa | P1 | Functional | cashier | Not run |
| BIL-13 | Custom one-off line | Open invoice | Add item → Custom (description, price, qty, tax) | Line appears exactly as typed; void invoice refuses any line | P2 | Functional | cashier | Not run |
| BIL-14 | Manual invoice | `billing.invoice.create` | Billing → New invoice → pick patient → add lines → create | Invoice created with INV number; lands on its detail; payment flow identical to check-in invoices | P1 | Functional | cashier | Not run |

## 11a. Referrals (ADR-068)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| REF-01 | Refer from a consultation | Open/signed visit | Consult → Refer card → department + reason → Refer | Referral created (pending); listed on the visit; audited | P1 | Functional | doctor | Not run |
| REF-02 | Referral worklist | Pending referrals exist | Open Referrals | Pending list with patient, from-visit, target department/doctor, reason | P1 | Functional | receptionist | Not run |
| REF-03 | Check in against a referral | Pending referral; source visit finished | Referrals → Check in | Check-in form locked to the referred patient, department preselected; visit created; referral flips to completed with the resulting visit linked | P1 | Integration | receptionist | Not run |
| REF-04 | A referral is consumed exactly once | Completed referral | Check in against it again (direct call) | 409 "already been used"; no second visit | P1 | Validation | receptionist | Not run |
| REF-05 | Cancel a pending referral | Pending referral | Cancel (confirm) | Status cancelled; check-in against it refused; only pending referrals can cancel | P2 | Functional | doctor | Not run |
| REF-06 | Same chart, never a copy | Completed referral | Open the resulting visit as the receiving doctor | The patient's existing history and encounters are visible — nothing was duplicated | P1 | Integration | doctor | Not run |

## 11b. Rosters & online booking (ADR-069)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| ROS-01 | Set a weekly roster | `providers.manage` | Providers → Weekly schedule → add windows → Save | Windows persist; overlapping windows on one day are refused with a message | P1 | Functional | org_admin | Not run |
| ROS-02 | Booking outside the roster | Provider with windows | Book at a time outside every window | Refused: "not available at that time"; inside a window books normally | P1 | Validation | receptionist | Not run |
| ROS-03 | Slot picker | Roster + one booked slot | Appointments → New → pick provider + date | Free slots shown as chips; the booked slot is absent; no roster → free-form time entry stays | P1 | Functional | receptionist | Not run |
| BKG-01 | Enable online booking | `platform.organization.manage` | Settings → Booking → enable | Token minted once; public link + QR shown; poster printable | P1 | Functional | org_admin | Not run |
| BKG-02 | Public request form | Enabled booking token | Open the public link → fill name, phone, wish → submit | 202 "hospital will confirm"; a REQUEST appears in the queue — no appointment, no patient created | P1 | Functional | public | Not run |
| BKG-03 | Uniform token failure | — | Open an unknown/disabled/retired token | Identical "not valid" response in all three cases — no hospital enumeration | P1 | Security | public | Not run |
| BKG-04 | Approve a request | Pending request | Booking requests → Approve → provider + real slot | Patient created (or duplicate flow triggers), appointment booked through the normal rules (roster + double-booking), request approved | P1 | Integration | receptionist | Not run |
| BKG-05 | Approve hits a duplicate | Request phone matches an existing chart | Approve | DUPLICATE_PATIENT dialog: link the existing chart (no second chart) or knowingly create new | P1 | Validation | receptionist | Not run |
| BKG-06 | Reject a request | Pending request | Reject with a reason | Status rejected; nothing created; re-review refused | P2 | Functional | receptionist | Not run |

## 12. Reports

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| RPT-01 | OPD register | Visits in range | Reports → OPD register → set dates | Rows match the visits in that range; dates read `DD/MM/YYYY` | P1 | Functional | org_admin | Not run |
| RPT-02 | Collections | Payments in range | Collections tab | Totals reconcile with the payments recorded | P1 | Functional | org_admin | Not run |
| RPT-03 | Pending labs | Outstanding orders | Pending labs tab | Only unfinished orders appear | P2 | Functional | org_admin | Not run |
| RPT-04 | CSV export | Any report | Export | File downloads; contents match what is on screen | P2 | Functional | org_admin | Not run |
| RPT-05 | Empty range | Range with no data | — | Shared empty state, not an error | P3 | UI/UX | org_admin | Not run |
| RPT-06 | Permission gate | Role without `reports.view` | Open `/reports` | Forbidden panel | P1 | Security | receptionist | Not run |
| RPT-07 | Portal end-of-day report | `reports.view`, a day with visits + collections | Sidebar **Revenue → EOD report** (`/reports/eod`); pick a day | Tiles (Visits/Completed, Collected + payments, Labs still pending) and the visit register + the day's collections for that date; changing the day reloads; Export CSV downloads the day's visits; gated by `reports.view` (a role without it gets the Forbidden panel) | P1 | Functional | org_admin | Not run |
| RPT-08 | Admin end-of-day report | super_admin at `:3003`, a day with audit activity | Sidebar **Overview → EOD report** (`/eod`); pick a day | Tiles (Events, Warning-or-critical, Support sessions) and the day's audit entries; no invented aggregate figures; gated by `audit.view` | P1 | Functional | super_admin | Not run |

## 12b. Frontend separation (ADR-051)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| FE-01 | Admin console is its own app | — | Open `http://localhost:3003` | The platform admin sign-in renders, on the shared design system, with no hospital branding | P1 | Functional | super_admin | Not run |
| FE-02 | Platform routes are gone from the Portal | — | Open `/platform`, `/admin/tenants`, `/admin/branding` on `:3001` | All 404 — the operator surface no longer exists in the Portal | P1 | Regression | super_admin | Not run |
| FE-03 | Hospital admin cannot use the admin console | org_admin credentials | Sign in at `:3003` | Forbidden panel, not an empty console; the API refuses the same calls independently | P1 | Security | org_admin | Not run |
| FE-04 | Operator has no clinical menu | super_admin | Sign in at `:3003` | Overview (Dashboard, EOD report), Customers (Hospitals), Support (Support sessions), Platform (Branding, Security & audit) — no patients, appointments, OPD, pharmacy, laboratory or billing, and no dead "My profile" item | P1 | Security | super_admin | Not run |
| FE-05 | Support session crosses origins | super_admin at `:3003` | Hospitals → a hospital → start a support session | A **Portal** tab opens at `:3001/support/enter`, claims the session, and lands on the hospital's dashboard with the support banner | P1 | Functional | super_admin | Not run |
| FE-06 | Token never appears in a URL | Same as FE-05 | Watch the address bar and browser history | The token is never in a URL, a query string or history — it travels only by `postMessage` | P1 | Security | super_admin | Not run |
| FE-07 | Only the admin origin may hand over a session | — | Open `:3001/support/enter` directly, and post a fake `hms:support-session` from another origin | The page fails to claim anything; a message from any origin other than `NEXT_PUBLIC_ADMIN_ORIGIN` is ignored | P1 | Security | — | Not run |
| FE-08 | Sessions are not shared between apps | Signed in at `:3003` | Open `:3001` in the same browser | The Portal does not inherit the admin session — each origin holds its own | P1 | Security | super_admin | Not run |
| FE-09 | CORS is per origin | — | Preflight `/api/v1/admin/stats` with `Origin: http://localhost:3003` | 204, `Access-Control-Allow-Origin: http://localhost:3003`, `Allow-Credentials: true` | P2 | Security | — | Not run |
| FE-10 | Portal still applies the platform branding default | Platform "hms" branding set | Sign in to the Portal | The default palette applies, then tenant branding on top — the Portal keeps the public read | P2 | Regression | org_admin | Not run |
| FE-11 | No development credentials in any bundle | — | Search the built output of every frontend for the seed email and password | No match in any app | P1 | Security | — | Not run |
| FE-12 | Patient portal is not usable | — | Open `http://localhost:3002` | A scaffold only — no login, no patient data. Nothing claims otherwise | P1 | Functional | — | Not run |
| FE-13 | AI Portal is not usable | — | Open `http://localhost:3004` | A scaffold only — no AI capability, and no claim that one exists | P1 | Functional | — | Not run |
| FE-14 | Every app's tab shows the Nirogix mark (ADR-061) | — | Open each of `:3000`–`:3004` and look at the browser tab; check `/icon.svg` resolves | Each tab shows the Nirogix N monogram — never Next's default favicon, a blank icon, or a sibling app's mark. `patient`/`admin`/`aiportal` were previously on the default | P2 | Functional | — | Not run |
| FE-15 | No framework scaffolding is served (ADR-061) | — | Request `/next.svg`, `/vercel.svg`, `/window.svg`, `/globe.svg`, `/file.svg`, `/favicon.ico` on `:3002`, `:3003`, `:3004` | All 404 — the `create-next-app` scaffolding was deleted; the SVG `app/icon.svg` is the only mark | P2 | Regression | — | Not run |
| FE-16 | Each app's tab title is its own (ADR-061) | — | Read the `<title>` on each of `:3000`–`:3004` | Distinct, correct titles (marketing, Nirogix Portal, the patient portal, Nirogix Platform Admin, Nirogix AI) — none reads "Create Next App" or another app's name | P2 | Functional | — | Not run |
| FE-17 | Admin routes are canonical, legacy paths redirect | super_admin at `:3003` | Open `/tenants`, click a tenant → detail; then hit a legacy `/admin/tenants/{id}` URL directly | Tenant list → detail works (canonical `/tenants/{id}`); the legacy `/admin/tenants/{id}` **redirects** to the canonical route rather than 404ing; no internal link points at `/admin/*` | P1 | Functional | super_admin | Not run |
| FE-18 | Support route resolves | super_admin at `:3003` | Click **Support → Support sessions** in the sidebar, then **Choose a hospital** | `/support` renders (no 404), explains the audited per-hospital session model, and links to the hospital list where a session is started. No dead `/profile` item remains in the sidebar | P1 | Functional | super_admin | Not run |
| FE-19 | Admin shell matches the Portal | super_admin at `:3003`, compared to `:3001` | Scroll a long page; toggle the theme; resize to mobile | Only the main content scrolls — the sidebar and topbar stay put (sticky), no full-page or nested scrollbars; the theme toggle is a flush ghost button with **no square** behind the icon, matching the Portal; sidebar width/spacing/active state, header height and nav styling read the same as `:3001` in both Light and Dark; below `md` the sidebar collapses to the hamburger drawer | P2 | UI/UX | super_admin | Not run |
| FE-20 | Admin smooth scroll matches the Portal | super_admin at `:3003`, compared to `:3001` | Scroll a long page (e.g. Audit) with the wheel; scroll with the pointer over the sidebar; press **Back to top** | Page scrolls with the same Lenis easing/inertia as `:3001` — no jitter, no layout jump, no double scrollbar; a wheel over a long sidebar scrolls the **menu**, not the page (`data-lenis-prevent`); a route change opens scrolled to the top; **Back to top** returns smoothly | P2 | UI/UX | super_admin | Not run |
| FE-21 | Page-header CTAs share one size | super_admin at `:3003` (dashboard vs Tenants) and any role at `:3001` (a role dashboard vs another tab) | Compare the primary CTA in the page header across tabs — "Onboard hospital" vs "Onboard tenant"; a dashboard's action vs "Register patient" on Patients | Same-purpose header CTAs are the **same size and padding** everywhere (the shared `<Button>`, md) — the dashboard CTA is no longer smaller; no page renders a hand-styled `hms-btn` link of a different size | P2 | UI/UX | super_admin | Not run |

## 12c. Patient identity & portal API (ADR-052)

The portal frontend does not exist yet — these are API cases, run with curl or the Swagger UI.

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| PAT-01 | Hospital grants portal access | Receptionist, a registered patient | `POST /patients/{id}/portal-access` with a mobile | 201 with `identityId` and `linkId`; an audit entry `patient.portal.link` at **notice** | P1 | Functional | receptionist | Not run |
| PAT-02 | Granting is the only way in | — | Search the API for any route that lets a caller link themselves | None exists — there is no public patient signup | P1 | Security | — | Not run |
| PAT-03 | Wrong permission is refused | org_admin (holds only `patient.record.view`) | Same call as PAT-01 | 403 | P1 | Security | org_admin | Not run |
| PAT-04 | Linking is idempotent | An existing link | Repeat PAT-01 | Same `linkId`, no duplicate | P2 | Functional | receptionist | Not run |
| PAT-05 | A chart cannot be claimed twice | A linked patient | Link the same patient to a different contact | 409 | P1 | Security | receptionist | Not run |
| PAT-06 | Code request is uniform | — | `POST /patient/auth/request-code` for a registered contact, then an unregistered one | Both 202, identical body — the endpoint never reveals who is a patient | P1 | Security | — | Not run |
| PAT-07 | Codes are stored hashed | A requested code | Read `patient_verification` | `code_hash` only; no plaintext anywhere | P1 | Security | dba | Not run |
| PAT-08 | Verify mints a patient session | A valid code | `POST /patient/auth/verify` | 200 with an access token whose `pt` claim is `patient` | P1 | Functional | — | Not run |
| PAT-09 | A code is single use | Just-used code | Replay it | 401 | P1 | Security | — | Not run |
| PAT-10 | Wrong code and unknown contact fail identically | — | Verify with a wrong code, then an unknown contact | Both 401, same message | P1 | Security | — | Not run |
| PAT-11 | Attempts are capped | — | Send 6 wrong codes for one issued code | Refused after the cap even before expiry | P1 | Security | — | Not run |
| PAT-12 | Verification is not sent from a hospital | A code request | Check `notification_log` | Logged against **PLATFORM**, never a hospital — no hospital learns that a patient signed in | P1 | Security | super_admin | Not run |
| PAT-13 | Unverified identity has no access | Linked but never verified | `GET /patient/hospitals` with a token minted another way | Empty list — a link is not access | P1 | Security | — | Not run |
| PAT-14 | Patient sees only their own hospitals | Linked at two hospitals | `GET /patient/hospitals` | Exactly those two, no others | P1 | Security | — | Not run |
| PAT-15 | Patient reads their own record | Linked hospital | `GET /patient/hospitals/{tenantId}/profile` | Their own UHID and details | P1 | Functional | — | Not run |
| PAT-16 | Unlinked hospital is refused | A tenant they are not linked to | Same call with that tenant id | 403 | P1 | Security | — | Not run |
| PAT-17 | No patient id is accepted from the caller | — | Inspect every patient route | None takes a patient id — it comes from the link | P1 | Security | — | Not run |
| PAT-18 | Revocation is immediate | An active link | Revoke, then repeat PAT-15 without re-authenticating | 403 straight away — access is re-checked per request, not baked into the token | P1 | Security | receptionist | Not run |
| PAT-19 | Revoke is no harder than grant | Receptionist | `DELETE /patients/{id}/portal-access` | 204 — the same permission that grants can withdraw | P1 | Security | receptionist | Not run |
| PAT-20 | Patient token is refused on staff routes | A patient token | `GET /patients` | 401 — refused by principal type, not by an empty permission set | P1 | Security | — | Not run |
| PAT-21 | Staff token is refused on patient routes | A staff token | `GET /patient/hospitals` | 401 — the boundary holds in both directions | P1 | Security | receptionist | Not run |
| PAT-22 | Lab reports are resulted only | An ordered-but-unresulted test | `GET /patient/hospitals/{tenantId}/lab-reports` | The pending order is absent | P1 | Functional | — | Not run |
| PAT-23 | Code requests are rate limited | — | Request codes repeatedly | 429 at the sign-in tier | P2 | Security | — | Not run |
| PAT-24 | Clinical record survives revocation | A revoked link | Staff opens the patient | The record is intact; only portal access was withdrawn | P1 | Regression | receptionist | Not run |

## 12d. Patient portal — the application (ADR-052, F-3)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| PP-01 | Sign-in screen | — | Open `http://localhost:3002` | Two-step sign-in; a line stating there is **no signup** and that the hospital grants access | P1 | UI/UX | patient | Not run |
| PP-02 | Unknown contact reveals nothing | — | Request a code for an unregistered number | The screen advances to the code step exactly as for a registered one — no "we don't recognise that" | P1 | Security | patient | Not run |
| PP-03 | Sign in with a code | Portal access granted, code received | Enter the code | Lands on the hospital picker | P1 | Functional | patient | Not run |
| PP-04 | Wrong code | — | Enter a wrong code | Inline error; no session | P1 | Validation | patient | Not run |
| PP-05 | Hospital picker | Linked at two hospitals | Open the portal | Both listed, no others | P1 | Functional | patient | Not run |
| PP-06 | No hospitals | A verified identity with no active link | Sign in | Empty state explaining the hospital grants access — not an error | P2 | UI/UX | patient | Not run |
| PP-07 | Records screen | A linked hospital | Open it | Own details, appointments, bills and resulted lab reports | P1 | Functional | patient | Not run |
| PP-08 | Tenant in the URL is not trusted | Signed in | Edit the address bar to another hospital's id | Refused — the server re-checks the link | P1 | Security | patient | Not run |
| PP-09 | Pending lab work is hidden | An ordered-but-unresulted test | Open the records screen | It does not appear; only finished reports do | P1 | Functional | patient | Not run |
| PP-10 | Results are not interpreted | A flagged result | Read the lab section | The lab's own flag, plus a line saying a value outside the usual range is not a diagnosis | P1 | UI/UX | patient | Not run |
| PP-11 | Read-only | Signed in | Look for any action | Nothing books, pays, cancels or messages — the portal only shows records | P1 | Functional | patient | Not run |
| PP-12 | Session survives a reload | Signed in | Reload | Still signed in — the portal restores the session from the refresh cookie, showing "Restoring your session…" briefly | P1 | Functional | patient | Not run |
| PP-13 | Nothing readable is stored on the device | Signed in | Inspect `localStorage`, `sessionStorage` and the cookie | No token or record data in storage — only the theme preference. The refresh cookie is `HttpOnly`, so JavaScript cannot read it | P1 | Security | patient | Not run |
| PP-21 | Refresh rotates | Signed in | Reload twice, capturing the cookie each time | The cookie value changes; **replaying the previous one returns 401** | P1 | Security | patient | Not run |
| PP-22 | Sign-out revokes server-side | Signed in | Sign out, then replay the last refresh cookie | 401 — the session is dead on the server, not merely dropped by the browser | P1 | Security | patient | Not run |
| PP-23 | Cookie is path-scoped | Signed in | Inspect the cookie, then call a staff route | `Path=/api/v1/patient/auth`; the cookie is not sent to `/api/v1/auth/*` | P1 | Security | patient | Not run |
| PP-24 | A staff token cannot refresh a patient session | A staff refresh cookie value | Send it as `hms_patient_refresh` to `/patient/auth/refresh` | 401 | P1 | Security | receptionist | Not run |
| PP-25 | Two devices coexist | Signed in on two browsers | Use both | Neither signs the other out — a patient may use a phone and a laptop | P2 | Functional | patient | Not run |
| PP-14 | Sign out | Signed in | Sign out | Returned to sign-in; the back button does not restore records | P1 | Security | patient | Not run |
| PP-15 | Portal access card | Receptionist, a patient with a mobile on file | Patients → open one | A **Portal access** card offering grant and withdraw | P1 | Functional | receptionist | Not run |
| PP-16 | Granting is not signing in | Just granted | Read the card's copy | It says the patient still has to verify the contact — access granted is not access used | P2 | UI/UX | receptionist | Not run |
| PP-17 | No contact on file | A patient with no mobile or email | Open the card | Explains a contact is needed first, and offers no grant button | P2 | UI/UX | receptionist | Not run |
| PP-18 | Withdrawing confirms | A patient with access | Withdraw | Confirmation naming the effect; afterwards the patient is refused immediately | P1 | Security | receptionist | Not run |
| PP-19 | Card is hidden without permission | A role without `patient.record.create` | Open a patient | No Portal access card | P1 | Security | cashier | Not run |
| PP-20 | Patient origin CORS | — | Preflight `/patient/hospitals` from `http://localhost:3002` | 204 with that exact origin allowed | P2 | Security | — | Not run |

## 12e. AI Portal — the boundary (ADR-053)

There is **no AI capability**. These cases prove the door, and that the room behind it is empty.

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| AI-01 | Sign-in screen | — | Open `http://localhost:3004` | Staff sign-in; a line saying access is granted per person and patients cannot sign in | P1 | UI/UX | — | Not run |
| AI-02 | Every staff role can enter (ADR-055) | Any seeded staff account | Sign in as each of the seven hospital roles | All reach the landing screen — the portal is for the whole team | P1 | Functional | any staff | Not run |
| AI-03 | An individual can still be denied | org_admin | Add a DENY override for `ai.portal.access` on one account, sign in as them | *Access restricted* screen — explicit deny beats the role grant | P1 | Security | org_admin | Not run |
| AI-04 | API refuses a denied account | A token for the denied account | `POST /api/v1/ai/portal/session` | 403 | P1 | Security | org_admin | Not run |
| AI-05 | Platform owner reaches it | super_admin | Sign in | Landing screen loads (WILDCARD covers the permission) | P2 | Functional | super_admin | Not run |
| AI-05b | Existing tenants get the grant | A tenant onboarded before ADR-055 | Run `npm run db:migrate`, sign in as its receptionist | Reaches the portal — `reconcileSystemRoles()` carried the grant without re-onboarding | P1 | Regression | receptionist | Not run |
| AI-06 | **A patient can never sign in** | A patient token | `POST /api/v1/ai/portal/session` with it | **401** — refused by principal type, before the permission is read | P1 | Security | patient | Not run |
| AI-07 | Knowing the URL achieves nothing | No token | Same call | 401 | P1 | Security | — | Not run |
| AI-08 | Nothing is offered | super_admin | Read the landing screen | States plainly that no AI capability is enabled. **No disabled input, no model picker, no "coming soon"** | P1 | Functional | super_admin | Not run |
| AI-09 | Capabilities are empty | super_admin | Inspect the session response | `capabilities: []` | P1 | Functional | super_admin | Not run |
| AI-10 | Entry is audited | super_admin | Open the portal, then check the audit trail | An `ai.portal.enter` entry at **notice**, naming the actor | P1 | Security | super_admin | Not run |
| AI-11 | Granting access per person works | An override granting `ai.portal.access` | Grant it to a named user, then sign in as them | They reach the landing screen; removing the override refuses them again | P1 | Security | org_admin | Not run |
| AI-12 | Origin is allowed | — | Preflight `/ai/portal/session` from `http://localhost:3004` | 204 with that exact origin | P2 | Security | — | Not run |
| AI-13 | Nothing markets AI | — | Search all five frontends and the marketing site for AI claims | None — the capability reference keeps every AI phrase on the never-claim list | P1 | Regression | — | Not run |
| AI-14 | Signed-out landing | — | Open `:3004` while signed out | The AI Portal landing: heading, who it is for, sign-in form, **no sign-up button**, links to the Portal and the public site | P1 | UI/UX | — | Not run |
| AI-15 | No dead password link | — | Read the password field | A hint saying an administrator issues a new password — **no "forgot password" link**, because self-service reset is not built | P2 | UI/UX | — | Not run |
| AI-16 | Access-restricted screen | An account with a DENY override on `ai.portal.access` | Sign in | A dedicated screen naming the signed-in account, with **Return to Nirogix Portal** and **Sign out** — not a bare 403 | P1 | UI/UX | org_admin | Not run |
| AI-17 | Return route works | On the restricted screen | Click *Return to Nirogix Portal* | Lands on the configured Portal origin, not a hard-coded localhost URL | P1 | Functional | org_admin | Not run |
| AI-18 | Sign out from the restricted screen | On the restricted screen | Sign out | Session ends and the sign-in landing is shown | P1 | Functional | org_admin | Not run |
| AI-19 | Sign-in copy sets expectations | — | Read the landing | It states that access is granted per account and that signing in is not the same as having access | P2 | UI/UX | — | Not run |
| AI-20 | No AI on the public site | — | Browse the marketing site end to end | No AI section, no AI nav item, no "Explore Nirogix AI" call to action, no ecosystem diagram containing AI | P1 | Regression | public | Not run |

## 13. Platform administration (super admin)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| ADM-01 | Onboard a tenant | — | Tenants → Create → org details → modules → first admin → branch | Tenant created; temporary password shown **once**; the new admin can sign in | P1 | Functional | super_admin | Not run |
| ADM-02 | Duplicate org code | Existing code | Reuse it | Rejected with a clear message | P2 | Validation | super_admin | Not run |
| ADM-03 | Grant / revoke a module | Existing tenant | Toggle a module | Entitlement changes; the tenant's menu reflects it after re-login; hard dependencies are enforced | P1 | Functional | super_admin | Not run |
| ADM-CAP-01 | Capabilities card lists module sub-features | Tenant entitled to Billing (+ Laboratory/ABDM) | Open the tenant → Capabilities card | Each entitled module that has sub-features is listed with its capabilities, all **Enabled** by default; a module with none is absent | P1 | Functional | super_admin | Not run |
| ADM-CAP-02 | Disable a capability | As above | Disable `billing.services` | Badge flips to Disabled + success toast; the hospital's `GET /billing/services` then returns 403 `CAPABILITY_NOT_ENTITLED` while other Billing routes still work; historical invoices remain readable | P1 | Functional | super_admin | Not run |
| ADM-CAP-03 | Dependency conflict is refused with a message | ABDM entitled; `abdm.facility` + `abdm.scan_share` on | Disable `abdm.facility` | Refused (409); the toast shows the backend message naming `abdm.scan_share`; the badge does not change | P2 | Functional | super_admin | Not run |
| ADM-MOD-01 | Three-level manager opens | A tenant | Tenant → Manage modules & capabilities | `tenants/[id]/modules`: Level 1 rail lists all 11 domains with counts; Level 2 lists that domain's modules; clicking one opens Level 3 (its capabilities) with a breadcrumb back | P1 | Functional | super_admin | Not run |
| ADM-MOD-07 | Whole catalog is present | — | Walk every domain | 42 modules / 246 capabilities across Core, Clinic/OPD, Hospital, Billing, Add-ons, Specialty, Clinical Support, Patient Engagement, Reporting, AI, Platform Services — nothing from the decomposition missing | P1 | Functional | super_admin | Not run |
| ADM-MOD-08 | Platform Services is required, not togglable | — | Open Platform Services | Shows **Required 🔒**, is always enabled, and offers no Enable/Disable control; its capabilities list Authentication, Authorization, Audit Logging etc. | P2 | Functional | super_admin | Not run |
| ADM-MOD-02 | Enabled-configuration preview | A tenant with a mix on | Read the top "Enabled configuration" card | Lists every enabled module grouped by domain with per-module feature counts (e.g. ABDM 3/3); matches what is toggled on | P1 | Functional | super_admin | Not run |
| ADM-MOD-03 | Unbuilt modules are honest | — | Open the Hospital domain | IPD/ICU/OT/Emergency/CSSD show **"Coming soon — no screens yet"** and their hard-deps; never presented as working | P1 | Functional | super_admin | Not run |
| ADM-MOD-04 | Search & filter | — | Type "billing"; then the Coming-soon filter | Search spans domains and matches modules + capabilities; the filter narrows to unbuilt modules | P2 | Functional | super_admin | Not run |
| ADM-MOD-05 | Module dependency confirmation | A tenant with `opd` (needs patient) enabled | Disable `patient` | A confirmation names the enabled modules that depend on it before revoking; Cancel leaves it enabled | P2 | Functional | super_admin | Not run |
| ADM-MOD-09 | Capability toggles at onboarding | — | Tenants → Create → expand a selected module (chevron) | Its capabilities list with On/Off pills, all **On** by default; switching some off and creating the tenant leaves exactly those off on the new tenant's Capabilities view, everything else on | P1 | Functional | super_admin | Not run |
| ADM-MOD-10 | Capability control needs its module | — | Expand an **unselected** module | Its capability pills are visible but disabled ("Select the module first"); selecting the module enables them | P2 | UI/UX | super_admin | Not run |
| ADM-MOD-06 | Onboarding modules grouped by domain | — | Tenants → Create → Modules section | Chips are grouped under domain headings (Core, Clinic/OPD, Hospital, Billing, Add-ons…), not one flat list; unbuilt modules show a **soon** marker; the MVP defaults are pre-selected | P2 | UI/UX | super_admin | Not run |
| ADM-04 | Suspend a tenant | Active tenant | Set status suspended | Its users can no longer sign in | P1 | Security | super_admin | Not run |
| ADM-05 | Platform branding scopes | — | Admin → Branding → change marketing, then the Nirogix Portal default | Each scope changes only its own surface; the other is untouched | P2 | Functional | super_admin | Not run |
| ADM-06 | Non-super-admin is refused | org_admin token | Open `/admin/tenants`; call the API directly | Forbidden panel; API 403 | P1 | Security | org_admin | Not run |
| PLT-01 | The dashboard is the operator's landing page | super_admin | Sign in, then open `/dashboard` directly | Both land on `/platform`; the clinical quick-link list never appears for an operator (ADR-037) | P1 | Functional | super_admin | Not run |
| PLT-02 | Sidebar groups | super_admin | Read the sidebar | Sections read Customers · Platform · Account with no clinical items; a section with no permitted item is absent, not empty | P1 | UI/UX | super_admin | Not run |
| PLT-03 | Range control re-queries | super_admin | Switch 6 → 12 → 24 months | Every series redraws for the chosen window; the caption shows the real first and last month | P2 | Functional | super_admin | Not run |
| PLT-04 | Growth matches reality | super_admin, a known tenant count | Compare the cumulative line's last point with the hospital count on the Hospitals screen | They agree; a month with no onboarding shows zero, never an interpolated rise | P1 | Functional | super_admin | Not run |
| PLT-05 | Onboarding a hospital moves the numbers | super_admin | Onboard a tenant, then reload the dashboard | "Added this month" and the current month's bar both increase by one | P1 | Functional | super_admin | Not run |
| PLT-06 | Charts are readable without sight | Screen reader | Tab through each chart | Each is announced with its label and its numbers are available as a table; the hover readout snaps to a real period | P1 | Accessibility | super_admin | Not run |
| PLT-07 | Charts follow the theme and the accent | super_admin | View in Dark, then with a platform accent set | Lines, fills, bars and tooltips all use the accent and stay legible; no hardcoded blue survives | P2 | UI/UX | super_admin | Not run |
| PLT-08 | No invented metrics | super_admin | Read the whole dashboard | Revenue, subscriptions, storage, uptime history and support tickets appear only in the "Not reported yet" list — never as a figure | P1 | Functional | super_admin | Not run |
| PLT-09 | Health tile tells the truth | super_admin | Stop the API, reload; restart it, reload | Unreachable is shown while it is down and Operational when it is back — never a stale "Operational" | P1 | Functional | super_admin | Not run |
| PLT-10 | Trends stay aggregate-only | org_admin token | Call `GET /admin/trends` directly | 403; and as super_admin the response contains counts only — no patient, staff or tenant rows | P1 | Security | org_admin | Not run |

## 13b. Role dashboards (ADR-044)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| DASH-01 | The clinical day is local, not UTC | A check-in after 18:30 local | Open the admin dashboard | The visit appears in today's hourly chart at its local hour, not tomorrow's | P1 | Functional | org_admin | Not run |
| DASH-02 | Each role lands on its own dashboard | Seeded staff accounts | Sign in as org_admin, doctor, receptionist, pharmacist, lab technician, cashier | Hospital operations · Your clinic today · Front desk · Pharmacy · Laboratory · Welcome — each with its own KPI row, all on the same layout | P1 | Functional | any | Not run |
| DASH-03 | Dashboards show only permitted work | Cashier | Read every panel and link | Nothing links to a module the cashier cannot open; the panels match their sidebar exactly | P1 | Security | cashier | Not run |
| DASH-04 | Revenue matches billing | org_admin | Compare the revenue chart total with the Billing screen for the same window | Billed and collected agree; outstanding equals the sum of open invoice balances | P1 | Functional | org_admin | Not run |
| DASH-05 | Today's numbers move with the day | Receptionist | Check a patient in, then reload | Waiting count and the current hour's bar both increase by one | P1 | Functional | receptionist | Not run |
| DASH-06 | Low stock is real | Pharmacist | Drop a drug below its reorder level | It appears in Low stock with the correct on-hand figure; zero stock reads as danger | P2 | Functional | pharmacist | Not run |
| DASH-07 | Empty states, not empty boxes | A tenant with no activity today | Open any role dashboard | Every panel explains what is missing ("Nobody has checked in yet today"), never a blank card or a false zero | P2 | UI/UX | any | Not run |
| DASH-08 | One refresh under load | Any role, expired access token | Open a dashboard and watch the network panel | Exactly **one** `POST /auth/refresh` is sent, not one per request; every panel then loads | P1 | Functional | any | Not run |
| DASH-09 | Sidebar and page scroll independently | Any role, a long page | Scroll the main content; then scroll with the pointer over the sidebar | The sidebar stays put while the page scrolls; a menu taller than the viewport scrolls inside itself; the topbar stays visible | P2 | UI/UX | any | Not run |
| DASH-10 | Sidebar sections are legible | Any role | Read the sidebar | Overview · Clinical · Revenue · Organization · Account (or the platform set) with a divider between each; no section without items | P2 | UI/UX | any | Not run |
| DASH-11 | Greeting handles an honorific | A user named "Dr. Ananya Sharma" | Open the dashboard | Greets "Ananya", never "Dr." | P3 | UI/UX | doctor | Not run |
| DASH-12 | A stat card with a destination navigates (ADR-062) | Any role dashboard | Click a linked tile (e.g. "In the queue now", "Collected", "Registered today"); on the System Admin dashboard, "Hospitals" and "Failed sign-ins" | Lands on the matching screen (OPD queue, Billing, today's registrations; admin → Tenants, Audit). A hover affordance (arrow) and pointer show before the click | P2 | Functional | any | Not run |
| DASH-13 | Stat cards are keyboard-operable and named | Any role dashboard | Tab to a linked tile; read its accessible name; press Enter | It takes focus with a visible focus ring, the screen reader announces where it goes ("Collected — open billing"), and Enter navigates | P1 | Accessibility | any | Not run |
| DASH-14 | Only meaningful tiles are clickable | Any role dashboard | Tab through the KPI row | Tiles with no genuine destination ("Seen today", "Branches") are plain text, not focusable links — clickability was not added for uniformity | P2 | UI/UX | any | Not run |
| DASH-15 | Trend colour follows the metric's meaning | System Admin dashboard | Compare a rise in "Failed sign-ins" against a rise in "Hospitals" | A rise in failed sign-ins reads as bad (danger), a rise in hospitals as good — the sign alone never decides the colour (`invertDelta`) | P2 | UI/UX | super_admin | Not run |

## 14. Org administration (users, roles, branches, branding)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| ORG-01 | Create a user | `platform.users.manage` | Users → Create | User created; temporary password revealed once; they can sign in | P1 | Functional | org_admin | Not run |
| ORG-02 | Duplicate email | Existing user email | Reuse it | Rejected with a clear message | P2 | Validation | org_admin | Not run |
| ORG-03 | Assign / remove a role | Existing user | Assign, then remove | Effective permissions change accordingly | P1 | Functional | org_admin | Not run |
| ORG-04 | Add a GRANT / DENY override | Existing user | Add each | Effective permission list updates; DENY wins over the role | P1 | Security | org_admin | Not run |
| ORG-05 | Deactivate a user | Active user | Set inactive | They can no longer sign in | P1 | Security | org_admin | Not run |
| ORG-06 | Create a branch | `platform.branches.manage` | Branches → New | Branch listed and selectable where branch scoping applies | P2 | Functional | org_admin | Not run |
| ORG-07 | Tenant branding | `platform.branding.manage` | Hospital configuration → Branding → pick a colour → Save; upload a logo; Reset | Accent applies across the Portal in both themes; logo shows in the shell; reset restores the default | P2 | UI/UX | org_admin | Not run |
| ORG-08 | Branding is per tenant | Two tenants | Set a colour in one | The other tenant is unaffected | P1 | Security | org_admin | Not run |

## 14b. Hospital Setup Console (ADR-049)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| SETUP-01 | Console opens | `platform.organization.manage` | Sidebar → Hospital setup | Console opens at `/settings` with progress, the step checklist and the configuration-area grid | P1 | Functional | org_admin | Not run |
| SETUP-02 | Progress is real | A hospital with branches and staff | Open the console | The bar reads *completed / total*; each step shows a real count (e.g. "Done · 2" for branches) | P1 | Functional | org_admin | Not run |
| SETUP-03 | Progress is derived, not stored | A complete step | Delete/deactivate what completed it, reload | The step reports incomplete again — no cached "setup finished" state | P1 | Functional | org_admin | Not run |
| SETUP-04 | Dependencies are explained | A hospital with no branches | Open the console | Doctors and Staff show a lock icon and "Waiting on branches first" rather than being hidden | P2 | UI/UX | org_admin | Not run |
| SETUP-05 | Steps link to the real screen | — | Click *Configure* on each step | Navigates to the existing screen (branches, providers, users, lab tests, drug master) — never a duplicate | P1 | Functional | org_admin | Not run |
| SETUP-06 | Module steps follow entitlement | A tenant without Laboratory | Open the console | No laboratory test-master step appears, and progress does not count it | P1 | Functional | org_admin | Not run |
| SETUP-07 | Complete state | Every required step done | Open the console | Success alert: *"… is ready for operations"*, and the dashboard card disappears | P2 | UI/UX | org_admin | Not run |
| SETUP-08 | Dashboard nudge | Setup incomplete | Open the dashboard | A "Finish setting up your hospital" card shows progress and the next step; it is absent once complete | P2 | UI/UX | org_admin | Not run |
| SETUP-09 | Permission gate (UI) | Role without `platform.organization.manage` | Open `/settings` | Forbidden panel; no "Hospital setup" item in the sidebar | P1 | Security | receptionist | Not run |
| SETUP-10 | Permission gate (API) | Same role's token | `GET /api/v1/setup/status` | 403, not a partial response | P1 | Security | receptionist | Not run |
| SETUP-11 | No unbuilt areas are shown | — | Read every tab and card | Nothing offers Departments, Sub-departments, Procedures, Services, Packages, Treatment plans, Wards, Rooms or Beds | P1 | Functional | org_admin | Not run |
| SETUP-12 | Hospital information saves | `platform.organization.manage` | Hospital information → fill address, phone, GSTIN → Save | Toast confirms; values persist on reload; badge flips to *Ready for documents* | P1 | Functional | org_admin | Not run |
| SETUP-13 | Field validation | — | Enter PIN `12`, GSTIN `NOPE`, website `example.com` | Each rejected with its own message; nothing saved | P1 | Validation | org_admin | Not run |
| SETUP-14 | Partial update | Saved profile | Change only the phone → Save | Only the phone changes; other fields are untouched | P2 | Functional | org_admin | Not run |
| SETUP-15 | Clearing a field | Saved profile | Empty *Address line 2* → Save | Field clears to blank rather than keeping the old value | P2 | Functional | org_admin | Not run |
| SETUP-16 | Header preview matches print | Saved profile | Compare *How this prints* with an invoice print view | The same lines, in the same order | P2 | UI/UX | org_admin | Not run |
| SETUP-17 | Invoice header carries the profile | Saved profile | Open an invoice → Print | Header shows legal name, address, phone/email, registration number and GSTIN | P1 | Functional | cashier | Not run |
| SETUP-18 | Nothing is invented | Empty profile | Print an invoice | Name and logo only — no placeholder address, no empty labels | P1 | Functional | cashier | Not run |
| SETUP-19 | Profile is per tenant | Two tenants | Set details in one, sign in to the other | The second shows its own name and an empty profile | P1 | Security | org_admin | Not run |
| SETUP-20 | Write is gated, read is not | Receptionist token | `GET` then `PUT /api/v1/organization/profile` | 200 on read (documents need it), 403 on write | P1 | Security | receptionist | Not run |
| SETUP-21 | Update is audited | — | Save the profile, open Audit | An `organization.profile.update` entry names the actor and the changed fields | P1 | Security | org_admin | Not run |
| SETUP-22 | Enabled modules are read-only | — | Hospital configuration → Enabled modules | Entitled modules listed with an *Enabled* badge; no control claims to add one | P2 | UI/UX | org_admin | Not run |
| SETUP-23 | Appearance moved | — | Open `/profile` | Theme switch is on the profile; Settings no longer offers it | P3 | UI/UX | any | Not run |
| SETUP-24 | New permission reaches existing tenants | A tenant onboarded before this release | Run `npm run db:migrate`, sign in as its org_admin | The console opens — the role gained `platform.organization.manage` without re-onboarding | P1 | Regression | org_admin | Not run |
| SETUP-25 | Stale session after a permission is added | Signed in before the reconcile | Stay signed in, open `/settings` | Forbidden — the client's permission snapshot is taken at sign-in. Signing out and back in resolves it | P2 | Functional | org_admin | Not run |

## 14c. Departments (ADR-050)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| DEPT-01 | List departments | `platform.departments.view` | Sidebar → Departments | Table lists code, department, branch, head, doctor count and status | P1 | Functional | org_admin | Not run |
| DEPT-02 | Create a department | `platform.departments.manage` | New department → code `ortho`, name `Orthopaedics` → Create | Created; code stored as `ORTHO`; toast confirms | P1 | Functional | org_admin | Not run |
| DEPT-03 | Code is normalised outside the form too | An existing `ORTHO` | Re-run `npm run db:seed`, or POST `{"code":"ortho"}` to the API | Rejected as a duplicate — the uppercase rule lives in the service, not just the form | P1 | Validation | org_admin | Not run |
| DEPT-04 | Duplicate code | An existing department | Reuse its code | 409 with a clear message; nothing created | P1 | Validation | org_admin | Not run |
| DEPT-05 | Same code in another hospital | Two tenants | Create `ORTHO` in each | Both succeed — the code is unique per hospital, not globally | P2 | Functional | org_admin | Not run |
| DEPT-06 | Organization-wide by default | — | Create without picking a branch | Branch column reads *Organization-wide* | P2 | Functional | org_admin | Not run |
| DEPT-07 | Branch scoping | Two branches | Create scoped to one | Branch column names it | P2 | Functional | org_admin | Not run |
| DEPT-08 | Another hospital's branch is refused | Two tenants | PATCH a department with the other tenant's `branchId` | Rejected: *does not belong to your organization* | P1 | Security | org_admin | Not run |
| DEPT-09 | Another hospital's provider as head is refused | Two tenants | Create with the other tenant's `headProviderId` | Rejected with the same message | P1 | Security | org_admin | Not run |
| DEPT-10 | Head of department | A provider exists | Assign one, reload | Head column shows the doctor's name | P2 | Functional | org_admin | Not run |
| DEPT-11 | Deactivate | An active department with doctors | Toggle → read the confirmation | Confirmation names the doctor count; after confirming the row reads *inactive* | P1 | Functional | org_admin | Not run |
| DEPT-12 | Deactivation is audited | Just deactivated one | Open Audit | A `department.deactivate` entry at **notice** severity | P1 | Security | org_admin | Not run |
| DEPT-13 | Deactivated stays visible | A deactivated department | Reload the list | Still listed as inactive — departments are never deleted | P1 | Functional | org_admin | Not run |
| DEPT-14 | Check-in offers active departments only | One active, one inactive | OPD → Check in | Only the active one is in the picker | P1 | Functional | receptionist | Not run |
| DEPT-15 | Check-in records the department | — | Check a patient in with a department | The visit carries it, and the queue row shows it | P1 | Functional | receptionist | Not run |
| DEPT-16 | Retired department refused at check-in | Deactivated mid-session | POST a check-in with its id | Rejected: *no longer active* | P1 | Validation | receptionist | Not run |
| DEPT-17 | Cross-tenant read | Two tenants | `GET /api/v1/departments/{id}` with the other tenant's id | 404, not 403 — the record does not exist for this caller | P1 | Security | org_admin | Not run |
| DEPT-18 | View gate | Role without `platform.departments.view` (pharmacist) | Open `/departments` | Forbidden panel; API returns 403; no sidebar entry | P1 | Security | pharmacist | Not run |
| DEPT-19 | Manage gate | Receptionist | Open `/departments`, then POST to the API | List is readable; no *New department* button; POST returns 403 | P1 | Security | receptionist | Not run |
| SETUP-D1 | The dashboard reminder can be dismissed | Setup incomplete | Dashboard → press the × on *Finish setting up your hospital* | The card disappears; nothing else on the dashboard moves or breaks | P2 | UI/UX | org_admin | Not run |
| SETUP-D2 | Dismissal survives a reload | Just dismissed it | Reload the dashboard | The card stays hidden — the reminder is not repeated every visit | P2 | UI/UX | org_admin | Not run |
| SETUP-D3 | Dismissal is per person, not per browser | A shared machine | Dismiss as one user, sign out, sign in as another with the same permission | The second user still sees the card — one person hiding a nudge must not hide it from the next | P1 | UI/UX | org_admin | Not run |
| SETUP-D4 | Dismissal syncs across tabs | The dashboard open in two tabs | Dismiss in one, look at the other | The card disappears in both | P3 | UI/UX | org_admin | Not run |
| SETUP-D5 | Hiding the reminder hides nothing else | Reminder dismissed | Open Hospital configuration | The full checklist and progress are unchanged and still reachable from the sidebar | P1 | Functional | org_admin | Not run |
| SETUP-D6 | The close control is reachable and named | Reminder showing | Tab to the ×, and inspect it | It is focusable with a visible focus ring and is announced as *Hide this reminder* | P2 | Accessibility | org_admin | Not run |
| DEPT-20 | Setup step | No departments | Open Hospital configuration | *Departments* shows as needed; *Doctors & specialties* says it is waiting on branches and departments | P2 | Functional | org_admin | Not run |
| DEPT-21 | Existing visits keep their department | A visit checked in before this release | Open it | The old free-text department still displays | P1 | Regression | receptionist | Not run |

## 14d. Patient self-registration by QR (ADR-056)

*The product's only unauthenticated write path. QR-01 to QR-06 are the security cases — run them on every release that touches this module.*

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| QR-01 | **A hospital's QR never reaches another hospital** | Both hospitals have registration on | Copy Hospital A's link, submit a person through it | The request appears in A's queue and **not** in B's; the patient created on approval belongs to A | P1 | Security | public | Not run |
| QR-02 | **The QR carries nothing sensitive** | Registration on | Decode the QR image with any reader | A URL plus an opaque token — no tenant id, patient data, configuration, credentials or internal identifier | P1 | Security | public | Not run |
| QR-03 | **The hospital cannot be named by the caller** | A valid token | POST to `/public/registration/{token}` with an extra `tenantId` of the *other* hospital in the body | Ignored entirely; the request lands in the token's hospital | P1 | Security | public | Not run |
| QR-04 | **Unknown, retired and disabled fail identically** | One valid token | Request a made-up token; regenerate then reuse the old one; switch registration off and reuse the current one | All three return the same 404 and the same message — nothing reveals which hospitals exist or which are open | P1 | Security | public | Not run |
| QR-05 | **A submission creates no patient** | Registration on | Submit the form, then check the patient list and the database | Nothing in `patients`; one row in `registration_requests` with status *pending* | P1 | Security | receptionist | Not run |
| QR-06 | **Another hospital cannot act on the queue** | A pending request in A | As B's receptionist, POST approve with A's request id | 404 — the record does not exist for this caller; A's request is untouched | P1 | Security | receptionist | Not run |
| QR-07 | Off by default | A newly onboarded hospital | Hospital configuration → Patient registration | Status reads *Disabled*; no QR is shown | P1 | Functional | org_admin | Not run |
| QR-08 | Turning it on issues a QR | Registration off | Turn on | A QR and a link appear; status reads *Enabled* | P1 | Functional | org_admin | Not run |
| QR-09 | Disabling keeps the token | Registration on; note the link | Turn off, then on again | The link is identical — pausing does not require reprinting posters | P1 | Functional | org_admin | Not run |
| QR-10 | The public form is refused while off | Registration off | Open the link | *This registration link is not active*; a POST returns 404 | P1 | Security | public | Not run |
| QR-11 | Regenerating retires the poster | Registration on; note the link | Regenerate → read the confirmation | The confirmation states printed posters stop working; the new link differs; the old one returns 404 | P1 | Functional | org_admin | Not run |
| QR-12 | Enable, disable and regenerate are audited | Just done all three | Open Audit | `patient.registration.enabled` / `.disabled` / `.token_regenerated` at **notice** | P1 | Security | org_admin | Not run |
| QR-13 | Copy, download and print | A QR is shown | Copy link; Download QR; Print poster | Link copies with a toast; a PNG downloads; Print poster opens `/print/registration-qr` with no application chrome | P2 | Functional | org_admin | Not run |
| QR-27 | The poster carries the hospital's branding | A logo and brand colour configured | Print poster | The hospital's logo, name and address print in the header, in its own accent — the same header an invoice uses | P2 | Functional | org_admin | Not run |
| QR-28 | The code is drawn in the hospital's colour | A brand colour configured | Look at the QR on screen and on the poster | Both are the hospital's accent, and both are identical — one definition drives the screen and the paper | P2 | Functional | org_admin | Not run |
| QR-29 | A pale brand colour still scans | Set the accent to a light yellow, e.g. `#fde047` | Regenerate nothing; just reload and scan the QR with a phone | The code prints in a darkened yellow rather than the pale one, and scans. A colour already dark enough (deep teal) prints unchanged | P1 | Functional | org_admin | Not run |
| QR-30 | The poster route needs the same permission | Receptionist | Open `/print/registration-qr` directly | Forbidden panel; the settings API returns 403 | P1 | Security | receptionist | Not run |
| QR-31 | No token in the poster's URL | — | Open Print poster and read the address bar | `/print/registration-qr` with no query string — the page reads the token server-side under its own permission | P1 | Security | org_admin | Not run |
| QR-32 | The poster says so when registration is off | Registration off | Open `/print/registration-qr` | An explanation and no poster, rather than a blank sheet | P2 | Functional | org_admin | Not run |
| QR-14 | The form names the right hospital | A valid link | Open it | The hospital's display name (or its name) and city, and nothing else about the hospital | P1 | Functional | public | Not run |
| QR-15 | The form is honest about what it does | A valid link | Read the page and submit | Both the form and the success screen say the details go to the front desk and that no account, appointment or record access is created | P1 | Functional | public | Not run |
| QR-16 | Date of birth is `DD/MM/YYYY` | A valid link | Open the date field | `DateField`, not a native picker; typed and displayed as `DD/MM/YYYY`; a future date is refused | P2 | Functional | public | Not run |
| QR-17 | Validation | A valid link | Submit with no name, then a bad phone | 422 with a field-level message; nothing created | P2 | Validation | public | Not run |
| QR-18 | Rate limiting | A valid link | Submit rapidly, repeatedly | Throttled at the sign-in tier with a 429 | P2 | Security | public | Not run |
| QR-19 | **The configurer can see the queue** | A pending request | Sign in as org_admin → Clinical → Registration requests | The queue is visible and lists the request — org_admin does **not** hold `patient.record.create`, and gating the screen on it hid this page from the person who printed the QR | P1 | Security | org_admin | Not run |
| QR-20 | ...but cannot act on it | As QR-19 | Look for the row actions, then POST approve directly | No approve or reject action is rendered; the API returns 403 | P1 | Security | org_admin | Not run |
| QR-21 | The front desk can act | A pending request | Sign in as receptionist → Registration requests → Register as a patient → confirm | A patient record with a UHID is created; the browser lands on it | P1 | Functional | receptionist | Not run |
| QR-22 | Approving twice is refused | A just-approved request | POST approve again with the same id | 409 *already reviewed*; no second patient | P1 | Validation | receptionist | Not run |
| QR-23 | Rejecting keeps the row | A pending request | Reject → confirm | No patient created; the request is retained with status *rejected* and the reason | P1 | Functional | receptionist | Not run |
| QR-24 | Review is audited | Just approved and rejected one each | Open Audit | `patient.registration.approved` and `.rejected` at **notice**; the approval names the created patient | P1 | Security | org_admin | Not run |
| QR-25 | The list leaks nothing internal | A pending request | Inspect the `GET /registration-requests` response | No `tenantId`, no submitted IP, no reviewer id — only the documented fields | P2 | Security | receptionist | Not run |
| QR-26 | Pending count on the settings page | One pending request | Hospital configuration → Patient registration | A badge reads *1 awaiting review* | P2 | Functional | org_admin | Not run |

## 14e. Hospital letterhead (ADR-056)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| LTR-01 | Letterhead is a tab of the same console | `platform.organization.manage` | Hospital configuration → Letterhead | Header line, footer text, signatory and designation, with a live preview | P1 | Functional | org_admin | Not run |
| LTR-02 | It prints | Letterhead saved | Print an invoice | Header line under the hospital name; footer line above the confidentiality notice; the hospital's signature line carries the signatory and designation | P1 | Functional | cashier | Not run |
| LTR-03 | The patient's signature line stays blank | As LTR-02 | Look at the patient/attendant line | No name printed there — the default signatory fills only the hospital's line | P1 | Functional | cashier | Not run |
| LTR-04 | Empty fields print nothing | Letterhead cleared | Print an invoice | No empty label, no placeholder — the lines simply do not appear | P1 | Functional | cashier | Not run |
| LTR-05 | One record, two screens | — | Save the letterhead, then open Hospital information | The address, phone and GSTIN are unchanged — a partial update never blanks fields another screen owns | P1 | Regression | org_admin | Not run |
| LTR-06 | Public identity fields | — | Hospital information | Display name, alternate phone and patient support email are present and save | P2 | Functional | org_admin | Not run |
| LTR-07 | Another hospital is unaffected | Two tenants | Set a letterhead in A, print in B | B prints its own (or none) — never A's | P1 | Security | org_admin | Not run |

### Letterhead image & page size (ADR-065)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| LTR-08 | Upload a letterhead image | `platform.organization.manage` | Hospital configuration → Letterhead → Letterhead image → Upload image (choose a PNG/JPG) | The image previews immediately; a success toast; the button now reads *Replace image* and a *Remove image* button appears | P1 | Functional | org_admin | Not run |
| LTR-09 | The image survives a reload | LTR-08 done | Reload the page | The previously uploaded image is still shown — it is read back from the server, not held in the browser | P1 | Functional | org_admin | Not run |
| LTR-10 | The image prints as the header | Letterhead image set | Print an invoice | The image spans the full width at the top of the document and replaces the plain name/logo/address header; the document title (*Tax invoice*) sits in a bar beneath it | P1 | Functional | cashier | Not run |
| LTR-11 | Remove restores the text header | Letterhead image set | Remove image, then print an invoice | The document falls back to the constructed name/address header; no broken image | P1 | Functional | org_admin | Not run |
| LTR-12 | Only an image is accepted | — | Try to upload a PDF or text file as the letterhead | Rejected with a clear message; nothing is stored | P2 | Negative | org_admin | Not run |
| LTR-13 | Page size is selectable | — | Letterhead → Page size → choose A5 / US Letter / US Legal | The chosen size is highlighted; the preview's page shape changes to match; Save persists it and it reads back after reload | P1 | Functional | org_admin | Not run |
| LTR-14 | Page size drives the printed sheet | Page size set to A5 | Print an invoice and open the print dialog | The document targets A5 (the `@page` size and sheet width follow the choice), not a hard-wired A4 | P1 | Functional | cashier | Not run |
| LTR-15 | Default is A4 | Page size never set | Print an invoice | The document is A4 — the platform default when nothing is configured | P2 | Functional | cashier | Not run |
| LTR-16 | The image is the hospital's own | Two tenants, image set in A | Print in B | B never shows A's letterhead image — the file is tenant-scoped | P1 | Security | org_admin | Not run |

## 14f. Table and navigation consistency

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| TBL-01 | Every column is left-aligned (ADR-064) | `/reports/eod`, `/billing`, `/audit` on both apps | Look at each column's heading and its values | Every column — heading and cells, including numeric ones (Total, Balance, Token, Status code) and the Actions column — is **left-aligned**; nothing is right- or centre-aligned, and heading and values share the same (left) edge in every table on both `:3001` and `:3003` | P1 | UI/UX | org_admin | Not run |
| TBL-02 | Label columns read left | — | Open Patients (Age), Appointments (Duration), Audit (Status) | Heading and values are both left-aligned — a label containing a digit is not a magnitude | P2 | Functional | org_admin | Not run |
| TBL-03 | The Actions heading sits over its buttons | Any table with row actions | Look at the Actions column | Heading and action buttons share the right edge | P2 | Functional | org_admin | Not run |
| TBL-04 | Sorting does not move the heading | Any sortable column | Sort it ascending, then descending | The heading and its sort arrow stay **left-aligned** in every state, never jumping to another edge (ADR-064) | P2 | Functional | cashier | Not run |
| NAV-01 | One nav item is active at a time | — | Open `/patients/registrations` | *Registration requests* is highlighted and *Patients* is not | P1 | Functional | receptionist | Not run |
| NAV-02 | A detail page keeps its parent active | A patient exists | Open `/patients/{id}` | *Patients* is highlighted — the route has no nav item of its own | P1 | Functional | receptionist | Not run |
| NAV-03 | The same holds on mobile | Below the breakpoint | Open `/patients/registrations` | The bottom bar and drawer highlight exactly one destination | P2 | Functional | receptionist | Not run |

## 15. Audit log

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| AUD-01 | Mutations are audited | — | Perform a create/update, then open Audit | An entry exists with actor, action, resource, method/path and status | P1 | Security | org_admin | Not run |
| AUD-02 | Sign-in is audited | — | Sign in, then check | An auth entry is recorded | P1 | Security | org_admin | Not run |
| AUD-03 | Server-side search | Many entries | Search "branding" | Only matching entries; the count reflects the filtered total | P2 | Functional | org_admin | Not run |
| AUD-04 | Severity filter | Mixed severities | Filter by notice | Only that severity; combined with search it narrows further | P2 | Functional | org_admin | Not run |
| AUD-05 | Sorting | — | Sort by Action, then reverse | Order changes server-side; the URL records the sort | P2 | Functional | org_admin | Not run |
| AUD-06 | Immutability | DB access | Attempt UPDATE/DELETE on `audit_log` | Refused by the database trigger | P1 | Security | dba | Not run |
| AUD-07 | Permission gate | Role without `audit.log.view` | Open `/audit` | Forbidden panel | P1 | Security | receptionist | Not run |

## 16. Marketing website

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| MKT-01 | Every route renders | — | Visit each nav destination and both legal pages | No console errors; each page has exactly one `<h1>` | P1 | Functional | anonymous | Not run |
| MKT-02 | Unique metadata | — | Compare `<title>`, description and canonical across routes | Every route has its own; canonicals point at the right URL | P1 | Functional | anonymous | Not run |
| MKT-03 | Social cards | — | Inspect `og:image` on several routes | A per-route 1200×630 card is served and renders correctly | P2 | Functional | anonymous | Not run |
| MKT-04 | Structured data | — | Run a rich-results check on `/`, a module page, `/pricing` | Organization, SoftwareApplication, BreadcrumbList, FAQPage validate; no fabricated review/rating markup | P2 | Functional | anonymous | Not run |
| MKT-05 | Sitemap & robots | — | Open `/sitemap.xml` and `/robots.txt` | Sitemap lists exactly the public routes; robots allows crawling and points at the sitemap | P1 | Functional | anonymous | Not run |
| MKT-06 | Portal is not indexable | — | Open the Portal's `/robots.txt` and page source | `Disallow: /` and `noindex, nofollow`; no tenant or patient data in any metadata | P1 | Security | anonymous | Not run |
| MKT-07 | Content guardrails | — | Read pricing, security, home | No prices, no certification claims, no invented customers or testimonials, no popularity badge | P1 | Functional | anonymous | Not run |
| MKT-11 | Every module states its availability | — | Open `/modules` and the home module bento | Each card carries a Built or Planned badge; the release note explains what the statuses mean; nothing implies the whole catalogue is usable | P1 | Functional | anonymous | Not run |
| MKT-12 | A module page separates today from planned | — | Open `/modules/pharmacy` | "What it does today" lists only shipped behaviour; planned PRD scope sits in its own labelled block; the two never mix | P1 | Functional | anonymous | Not run |
| MKT-13 | Integrations are honest | — | Open `/integrations` | ICD-10 and SMS/email are Built; FHIR APIs, SNOMED/LOINC, DICOM, ABDM, WhatsApp, gateway and Tally are Planned; the FHIR entry distinguishes the modelled core from the unbuilt APIs | P1 | Functional | anonymous | Not run |
| MKT-14 | Security separates enforced from committed | — | Open `/security` | Each practice is tagged Enforced today or Commitment; hosting reads as a design commitment; the alignment note rules out certification, audit and accreditation | P1 | Functional | anonymous | Not run |
| MKT-15 | Claim spot-check against the product | Portal running | Pick five claims at random from any marketing page and try them in the Portal | Each either works as described or is labelled planned; anything else is a defect, not a copy tweak | P1 | Functional | org_admin | Not run |
| MKT-08 | Theme toggle | — | Switch Light/Dark; reload | Choice persists; no flash of the wrong theme on load | P2 | UI/UX | anonymous | Not run |
| MKT-09 | Contact form | — | Submit the demo form | Confirmation state shown. **Known limitation: the form does not transmit yet** (`BACKLOG.md` U-2) | P1 | Functional | anonymous | Not run |
| MKT-10 | Back to top & smooth scroll | Long page | Scroll down, press Back to top | Smooth return to top; routes always open scrolled to the top | P3 | UI/UX | anonymous | Not run |
| MKT-16 | The product is called Nirogix | — | Read the header, footer, titles, legal pages and OG cards | Nirogix everywhere the product is named; "HMS" appears only as the industry term in search-intent copy, never as our name | P1 | Functional | anonymous | Not run |
| MKT-17 | The brand mark renders | — | Check the marketing header and footer, a browser tab, and an OG card; then the Portal's login card and app shell | The N monogram appears at each place — no stray letter from the old name, no blank tile, no default framework favicon. It follows the accent in Light and Dark, and a tenant's own logo replaces it in the Portal where one is uploaded | P2 | UI/UX | anonymous | Not run |

## 16b. Environments & domains (ADR-042, `resources/domains.md`)

Run at staging bring-up and again before each production release. Every case here fails the release if it fails.

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| DOM-01 | Every host resolves over TLS | DNS + certificates in place | Open each production and staging host | All load over HTTPS with a valid `*.nirogix.com` certificate; no browser warning, no IP or provider hostname anywhere | P1 | Functional | anonymous | Not run |
| DOM-02 | `www` redirects to the apex | Production | Request `https://www.nirogix.com/pricing` | 301 to `https://nirogix.com/pricing`; `www` never serves content | P1 | Functional | anonymous | Not run |
| DOM-03 | Canonicals match the environment | Staging and production | Compare `<link rel=canonical>`, sitemap URLs and JSON-LD `url` on each | All use that environment's own origin; staging never emits a production URL | P1 | Functional | anonymous | Not run |
| DOM-04 | Staging is not indexable | Staging | Fetch any staging page and `/robots.txt` | `X-Robots-Tag: noindex, nofollow` on the response and access control in front; the staging site cannot be reached anonymously | P1 | Security | anonymous | Not run |
| DOM-05 | CORS allowlist is environment-specific | Any deployed API | Call the API with `Origin: https://evil.example`, then with that environment's Portal origin | The first is refused, the second allowed; no wildcard reflected, and no production origin listed in staging | P1 | Security | anonymous | Not run |
| DOM-06 | The refresh cookie is host-only | Deployed Portal | Sign in and inspect the cookie | `Secure; HttpOnly; SameSite=Lax` with **no** `Domain` attribute, on the API host only; it is never sent to the marketing or Portal host | P1 | Security | any | Not run |
| DOM-07 | Staging cannot reach production data | Staging | Check the database URL, R2 bucket and notification sender in use | Each is the staging one; a staging session cannot authenticate against production | P1 | Security | super_admin | Not run |
| DOM-08 | Swagger UI is closed in production | Production | Open `/api/v1/docs`, then `/api/v1/openapi.json` | The interactive UI is not served; the JSON spec is | P2 | Security | anonymous | Not run |
| DOM-09 | No hard-coded host | Repository | Grep the apps for `nirogix.com` | Only configuration, documentation and comments match — never application logic | P2 | Functional | any | Not run |

## 17. Specializations (marketing)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| SPC-01 | Index lists every specialty | — | Open `/specialties` | All specialties render; the six featured ones link to their own page | P1 | Functional | anonymous | Not run |
| SPC-02 | Featured specialty page | — | Open `/specialties/cardiology` | Challenges, platform support, modules, configuration and related specialties all render | P1 | Functional | anonymous | Not run |
| SPC-03 | Non-featured specialty has no page | — | Open `/specialties/oncology` | 404 — no thin auto-generated page exists | P2 | Functional | anonymous | Not run |
| SPC-04 | Specialty SEO | — | Check title/description/canonical on a specialty page | Intent-matched ("Hospital Management Software for Cardiology"), unique per specialty | P2 | Functional | anonymous | Not run |
| SPC-05 | Honest claims | — | Read any specialty page | States that specialties differ in configuration, not code; no claim of a specialty-specific module | P1 | Functional | anonymous | Not run |
| SPC-06 | Navigation entry | — | Desktop nav and mobile bar | Specialties is reachable from both | P2 | UI/UX | anonymous | Not run |

## 17b. Printable documents (ADR-047)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| DOC-01 | Print prints the document | An invoice | Billing → open an invoice → Print / PDF | A standalone document opens: no sidebar, no topbar, no filters, no action buttons, no collect-payment form | P1 | Functional | cashier | Not run |
| DOC-02 | The printed page matches the preview | Same | Use the browser's print preview | What the screen shows is what the preview shows; only the toolbar disappears | P1 | UI/UX | cashier | Not run |
| DOC-03 | Tenant branding is applied | A hospital with a logo and brand colour configured | Open any document | The hospital's name, logo and accent appear in the header — never Nirogix's | P1 | Functional | org_admin | Not run |
| DOC-04 | Default branding fallback | A hospital with no branding configured | Open any document | The Nirogix default is used; the document still looks finished, with no empty logo slot | P1 | Functional | org_admin | Not run |
| DOC-05 | Never another tenant's branding | Two hospitals with different logos | Print the same document type from each | Each carries its own hospital's identity; no leakage in either direction | P1 | Security | org_admin | Not run |
| DOC-06 | Multi-page tables | An invoice with enough line items to span pages | Print preview | The table header repeats on each page, no row is split across a break, and the totals block stays whole | P1 | UI/UX | cashier | Not run |
| DOC-07 | Save as PDF matches print | Any document | Print → Save as PDF | The PDF is identical to the printed output; both carry the branding | P1 | Functional | cashier | Not run |
| DOC-08 | Permission is re-checked | A user without `billing.invoice.view` | Open `/print/invoice/{id}` directly | Forbidden panel; no document data is rendered, and the API refuses the fetch | P1 | Security | receptionist | Not run |
| DOC-09 | Document types differ | An invoice and a lab report | Print each | The invoice has items, totals, payments and a receipt note; the report has results, reference ranges, interpretation and a verifying signature — same kit, different structure | P2 | UI/UX | any | Not run |
| DOC-10 | Only relevant data | Any document | Read every line | Only that record's information appears — no other patients, no application state, no debug output | P1 | Security | any | Not run |

## 17c. Date & time format (ADR-046)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| FMT-01 | Dates everywhere | — | Walk tables, forms, dashboards, audit, invoices and printed documents | Every date reads `DD/MM/YYYY` with zero padding; no ISO, US or long-form date survives | P1 | UI/UX | any | Not run |
| FMT-02 | Times everywhere | — | Same walk | Every time reads `hh:mm AM/PM`; no 24-hour clock survives | P1 | UI/UX | any | Not run |
| FMT-03 | Date and time together | Audit log, appointment list | Read a timestamp | `DD/MM/YYYY, hh:mm AM/PM` — comma included | P1 | UI/UX | any | Not run |
| FMT-04 | Midnight and noon | A record created at 00:05 and one at 12:05 | Compare | `12:05 AM` and `12:05 PM` — never `00:05` or a swapped meridiem | P1 | Functional | any | Not run |
| FMT-05 | Meridiem badge | A schedule or picker using `badge` | Inspect | AM/PM renders as a chip on the design tokens, legible in Light and Dark | P3 | UI/UX | any | Not run |
| FMT-07 | Date entry is DD/MM/YYYY on every machine | Patients → New | Type `05/01/2027` into Date of birth | Accepted as 5 January 2027; the field shows `05/01/2027` regardless of the browser's locale, and the API receives `2027-01-05` | P1 | Functional | receptionist | Not run |
| FMT-08 | Calendar picker | Same field | Open the calendar and pick a day | The chosen date fills the field in `DD/MM/YYYY`; today is outlined; the calendar follows the tenant accent in Light and Dark | P2 | UI/UX | receptionist | Not run |
| FMT-09 | Impossible and out-of-range dates | Same field | Type `32/13/2026`, then a future date of birth | Neither is accepted; the last good value returns; no invalid date reaches the form | P1 | Validation | receptionist | Not run |
| FMT-10 | Time entry with AM/PM | Appointments → New | Enter `04:45` and press PM | The stored value is 16:45; switching to AM stores 04:45; 12 AM and 12 PM behave correctly | P1 | Functional | receptionist | Not run |
| FMT-11 | No native date input survives | Repository / UI | Grep for `type="date"`, `type="time"`, `type="datetime-local"`; walk every form | None remain; every date or time field is the shared component | P1 | UI/UX | any | Not run |
| FMT-06 | Transport is unchanged | Any list with a date filter | Watch the request | The API still receives ISO-8601; only the display is localised | P2 | Functional | any | Not run |

## 18. Cross-cutting: accessibility, theming, performance

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| A11Y-01 | Keyboard-only operation | — | Complete sign-in → patient search → open a record using only the keyboard | Every control is reachable, focus is always visible, no trap outside dialogs | P1 | Accessibility | any | Not run |
| A11Y-02 | Screen-reader announcements | Screen reader on | Trigger a success and an error toast | Success announces politely, error assertively | P2 | Accessibility | any | Not run |
| A11Y-03 | Contrast | — | Check text on surfaces in both themes | Meets WCAG AA | P2 | Accessibility | any | Not run |
| A11Y-04 | Reduced motion | OS setting on | Navigate, open drawers and toasts | Animations collapse to static; nothing becomes unusable | P3 | Accessibility | any | Not run |
| THEME-01 | Dark mode across the app | — | Toggle Dark and walk the main screens | Every surface, table, toast, drawer and dialog is readable; no white flash | P1 | UI/UX | any | Not run |
| THEME-02 | Tenant accent | Custom brand colour set | Walk the Portal | Buttons, links, badges, active nav and table accents all follow the tenant colour | P2 | UI/UX | org_admin | Not run |
| BRD-05 | The accent survives interaction | Custom brand colour set (e.g. deep purple) | Hover and press the primary button, a row action, and the back-to-top control | Hover and pressed states are shades of the tenant colour, never the default teal; the focus ring follows it too | P1 | UI/UX | org_admin | Not run |
| BRD-06 | Back to top follows the brand on both surfaces | Portal with a tenant accent; marketing with a platform-branding override | Scroll each site and inspect the button in Light and Dark | The Portal button uses the tenant accent, the marketing button the marketing accent; neither shows the other's colour or a hardcoded teal | P1 | UI/UX | org_admin | Not run |
| BRD-07 | Shared components on the marketing site | Marketing site | Open the bottom nav, the drawer and a toast in both themes | All follow `--mk-accent` and the marketing surfaces, not the Portal defaults | P2 | UI/UX | anonymous | Not run |
| PERF-01 | Core Web Vitals | Throttled mid-range mobile | Lighthouse on the marketing home and a Portal list page | LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. **Not yet measured — see `BACKLOG.md`** | P2 | Functional | any | Not run |

## 19. My profile & account security

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| PRF-01 | Open the profile | Signed in | Click the avatar in the topbar | `/profile` opens showing name, email, role badges, account status, MFA state, last sign-in and member-since | P1 | Functional | any | Not run |
| PRF-02 | Same screen for every role | — | Repeat as receptionist, doctor, org_admin | One screen throughout; only the values differ | P2 | UI/UX | any | Not run |
| PRF-03 | Rename yourself | Signed in | Change Full name, Save | Success toast; the topbar name updates without a reload; the change survives a reload | P1 | Functional | any | Not run |
| PRF-04 | Cancel discards the edit | Signed in | Type a new name, press Cancel | Field reverts; Save is disabled until something actually changes | P2 | UI/UX | any | Not run |
| PRF-05 | Email is not self-editable | Signed in | Attempt to edit Email | Read-only, with an explanation | P2 | Security | any | Not run |
| PRF-06 | Change password, happy path | Signed in | Enter current + a new password twice, submit | Signed out and returned to `/login`; the new password works, the old one does not | P1 | Security | any | Not run |
| PRF-07 | Wrong current password | Signed in | Enter a wrong current password | Rejected; password unchanged; the message does not reveal which field was wrong | P1 | Security | any | Not run |
| PRF-08 | New password too short / mismatched | Signed in | Enter 9 characters, then two different values | Blocked client-side with a field-level message; no request sent | P2 | Validation | any | Not run |
| PRF-09 | Reusing the current password | Signed in | Set the new password to the current one | Rejected with a clear message | P2 | Security | any | Not run |
| PRF-10 | All sessions revoked | Signed in on two browsers | Change the password in one | The other browser's next request fails and returns to sign-in | P1 | Security | any | Not run |
| PRF-11 | Cannot edit another user | Signed in | Call `PATCH /auth/profile` with another user's id in the body | Ignored — the endpoint acts only on the token's user | P1 | Security | any | Not run |
| PRF-12 | Password manager works | — | Sign in, then change the password | The browser offers to save at sign-in and to update after the change (no `autocomplete="off"` anywhere) | P2 | UI/UX | any | Not run |

## 20. Error pages & rate limiting

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| 404-01 | Portal 404 | Signed in | Open `/does-not-exist` | Branded Portal 404 with a dashboard CTA, using design-system tokens and Lucide icons — never a browser error page | P2 | UI/UX | any | Not run |
| 404-02 | Marketing 404 | — | Open `/does-not-exist` on the marketing site | Branded 404 with Back-to-home, Book-a-demo and the section links | P2 | UI/UX | anonymous | Not run |
| 404-03 | 404s are not indexed | — | Inspect both 404 pages' robots metadata | `noindex`; the marketing one keeps `follow` so crawlers can leave via the links | P3 | Functional | anonymous | Not run |
| RATE-01 | Login brute force is throttled | `RATE_LIMIT_IN_DEV=true` | Fail sign-in 11 times within 15 minutes | The 11th is refused with 429 and the shared toast, not another credential check | P1 | Security | anonymous | Not run |
| RATE-02 | Successful logins are not penalised | Same | Sign in and out repeatedly | Never throttled — only failures consume the allowance | P2 | Functional | any | Not run |
| RATE-03 | Password-change throttling | Same | Submit the change form 21 times in 15 minutes | Refused with 429 | P2 | Security | any | Not run |
| CORS-01 | Cross-origin is refused in production | Production build with `CORS_ORIGINS` set | Call the API from an origin outside the allowlist | Browser blocks it; the server logs the refused origin | P1 | Security | anonymous | Not run |
| CSP-01 | Every app sends a Content-Security-Policy (M-1) | Each app running | Load each of the five apps and inspect the response headers | A `content-security-policy` header on all five; the four authenticated apps carry `'nonce-…' 'strict-dynamic'`, marketing carries the static policy | P1 | Security | any | Not run |
| CSP-02 | No CSP violations in normal use | Portal running | Walk sign-in → patients → a patient → billing → print preview with the console open | No "violates the following Content Security Policy directive" messages; tenant logos and report images render | P1 | Security | any | Not run |
| CSP-03 | An injected inline script does not run | Portal running | In devtools, append `<script>window.__x=1</script>` to the DOM | Blocked by policy; `window.__x` stays undefined (the nonce is what makes this hold) | P1 | Security | any | Not run |
| CSP-04 | The app cannot be framed | Any app | Embed a page in an `<iframe>` from another origin | Refused — `frame-ancestors 'none'` plus `X-Frame-Options: DENY` | P1 | Security | anonymous | Not run |
| CSP-05 | Device permissions are closed | Any app | Inspect `Permissions-Policy` | Camera, geolocation, payment and topics are empty; only `microphone=(self)` is allowed, for dictation (ADR-070) | P2 | Security | any | Not run |
| REQID-01 | Every response carries a request id (L-3) | — | Make any API call and inspect the response headers | `X-Request-Id` present on every response, different per request | P2 | Functional | any | Not run |
| REQID-02 | The id ties a response to its audit row | Signed in as org_admin | Perform a mutation, note `X-Request-Id`, then open Audit log | A row exists carrying that same request id, so a support report can be traced without matching timestamps | P1 | Security | org_admin | Not run |
| REQID-03 | A supplied id cannot poison the trail | — | Send `X-Request-Id: <script>alert(1)</script>` and then a clean `X-Request-Id: trace-0123456789` | The junk value is replaced with a fresh UUID; the plain id is honoured | P2 | Security | anonymous | Not run |
| UPLOAD-01 | A renamed binary is refused (M-4) | Signed in with upload rights | Rename any `.exe`/binary to `.png` and upload it as a logo or report attachment | 422 "contents do not match its declared type" — nothing is stored | P1 | Security | org_admin | Not run |
| UPLOAD-02 | A real file declared as the wrong type is refused | Same | Upload a genuine PDF with its type declared as `image/png` | 422, same message | P2 | Security | org_admin | Not run |
| UPLOAD-03 | Genuine files still upload | Same | Upload a real PNG, JPEG, PDF and a `.txt` | All succeed; existing logo, letterhead and lab-report attachment flows are unaffected | P1 | Functional | org_admin | Not run |
| DOCS-01 | API documentation is closed in production (L-2) | Production build | Open `/api/v1/docs` and `/api/v1/openapi.json` | Both 404 unless `OPENAPI_UI_ENABLED=true` is deliberately set; in development and staging both still work | P1 | Security | anonymous | Not run |

## 21. System master data & immunisations (ADR-072)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| MD-01 | Lab test from catalogue | Seeded | Lab test master → Add test → **Choose from catalogue** → pick "Complete Blood Count (CBC)" | Name/sample/unit/ref-range pre-fill; price stays blank for you to set; Save creates the test | P1 | Functional | lab_technician | Not run |
| MD-02 | Drug from catalogue | Seeded | Pharmacy stock → Add drug → **Choose from catalogue** → pick "Paracetamol 500 mg" | Name/form/strength pre-fill; you set price + reorder; Save creates the drug | P1 | Functional | pharmacist | Not run |
| MD-03 | Service from catalogue | Seeded | Services → Add service → **Choose from catalogue** → pick "General Consultation" | Code + name pre-fill; you set price + tax; Save creates the service | P2 | Functional | org_admin | Not run |
| MD-04 | Department suggestion | Seeded | Departments → New department → **Choose from catalogue** → pick "Cardiology" | Code + name pre-fill; head/branch stay yours; Save creates the department | P2 | Functional | org_admin | Not run |
| MD-05 | Custom still works | Seeded | On any of the above, ignore the catalogue and type a name/price by hand | Saves as a pure custom row (no catalogue code); nothing is forced | P1 | Functional | org_admin | Not run |
| MD-06 | Catalogue search | Seeded | Open any catalogue picker and type e.g. "glucose" / "amox" | List filters by name or code; system items tagged, custom items badged Custom | P2 | Functional | any | Not run |
| MD-07 | System data is read-only to hospitals | Seeded | Inspect the catalogue in the picker | A hospital can select but has no control to edit or delete a system item | P2 | Security | org_admin | Not run |
| IMM-01 | Record immunisation (predefined) | Patient exists | Patient record → Immunisations → Record → pick "BCG" → date → Record | The immunisation lists with vaccine, dose and DD/MM/YYYY date | P1 | Functional | doctor | Not run |
| IMM-02 | Custom vaccine | Patient exists | In the Record dialog, type a custom vaccine name → Add, then record it | The custom vaccine is added (badged Custom), selectable, and records against the patient | P2 | Functional | doctor | Not run |
| IMM-03 | Custom vaccine is tenant-scoped | Two tenants | Add a custom vaccine in tenant A; open the picker in tenant B | Tenant B sees the system vaccines but **not** A's custom one | P1 | Security | doctor | Not run |
| IMM-04 | Immunisation permission gating | — | Sign in as a role without `clinical.immunization.manage` | The "Record" control is absent; the record is read-only where `.view` is held | P2 | Security | cashier | Not run |
| MD-08 | Production seeds the catalogue, not tenant data | Production seeder | Run `db:seed:production` | `reference_catalog` is populated (system master data); no hospital/patient/immunisation rows created | P1 | Functional | ops | Not run |

## 22. Per-hospital availability (ADR-073)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| AVAIL-01 | Config screen loads | Org with ≥1 branch + items | Settings → Hospital availability | Hospital + item-type selectors; the org's items each with an Offered here / Not offered toggle | P1 | Functional | org_admin | Not run |
| AVAIL-02 | Disable an item at one hospital | Two branches | Turn a drug **Not offered** at Hospital 1; reload | It persists as Not offered at Hospital 1; still Offered at Hospital 2 | P1 | Functional | org_admin | Not run |
| AVAIL-03 | Disabled item drops from that hospital's picker | AVAIL-02 done | Prescribe/dispense at Hospital 1 vs Hospital 2 (branch passed) | The disabled drug is absent from Hospital 1's picker, present at Hospital 2 | P1 | Functional | doctor/pharmacist | Not run |
| AVAIL-04 | Per-hospital price override | — | Set a price override for an item at Hospital 2 | Lists/pickers for Hospital 2 show the override price; the org price is unchanged elsewhere | P2 | Functional | org_admin | Not run |
| AVAIL-05 | History is unaffected by disabling | An item already on a past invoice/prescription | Disable it for a hospital | The past record still shows the item (snapshot); only new pickers are affected | P1 | Functional | any | Not run |
| AVAIL-06 | Cross-organization isolation | Two orgs | As Org B, inspect availability | Org B never sees Org A's per-hospital config; a foreign branch id is refused (422) | P1 | Security | org_admin | Not run |
| AVAIL-07 | Permission gating | Role without the permission | Sign in as a role lacking `platform.catalog.availability.manage` | The Hospital availability tab is absent and the API returns 403 | P2 | Security | doctor | Not run |

---

## 23. ABDM / ABHA — Milestone 1 (ADR-084)

Run with `ABDM_PROVIDER=mock` unless a case says otherwise; the mock's OTP is `123456` and the scenario is selected by the **last digit of the Aadhaar** (`0` already has an ABHA, `1` no linked mobile, `5` two ABHA accounts, `9` OTP rejected, anything else a clean creation). Sandbox OTPs are also returned in-band, so the same steps hold against the real sandbox.

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| ABDM-01 | Panel absent without the module | Tenant NOT entitled to `abdm` | Patients → Register patient | No ABHA panel; the form is exactly as before; no error toast | P1 | Security | receptionist | Not run |
| ABDM-02 | Panel absent without the permission | Tenant entitled; role lacks `abdm.verification.perform` | Register patient as a doctor | No ABHA panel; `GET /abdm/capabilities` returns 403 | P1 | Security | doctor | Not run |
| ABDM-03 | Facility settings gated to the administrator | Tenant entitled | Open Hospital configuration as receptionist | The ABDM / ABHA tab is absent; a direct `PUT /abdm/facility` returns 403 | P1 | Security | receptionist | Not run |
| ABDM-04 | Register the hospital's facility | org_admin | Hospital configuration → ABDM / ABHA → enter facility id, QR payload, enable Scan and Share → Save | Saved; the QR preview renders and scans in a phone camera | P1 | Functional | org_admin | Not run |
| ABDM-05 | Scan and Share leads when configured | ABDM-04 done | Register patient | The Scan & Share tab is selected by default and marked "Fastest" | P2 | UX | receptionist | Not run |
| ABDM-06 | Scan and Share offered only when it can work | Facility id present, QR empty | Register patient | The Scan & Share tab is disabled with a tooltip; the other two work | P1 | UX | receptionist | Not run |
| ABDM-07 | Consent gate — Aadhaar | — | Create a new ABHA, fill an Aadhaar, do NOT tick consent | Send OTP stays disabled; forcing the call returns 422 `ABDM_CONSENT_REQUIRED` | P1 | Security | receptionist | Not run |
| ABDM-08 | Create an ABHA with Aadhaar OTP | Consent ticked | Aadhaar `111122223333` → Send OTP → enter `123456` → Verify | Profile shown, "New ABHA created", demographics readable, match = new | P1 | Functional | receptionist | Not run |
| ABDM-09 | Verification fills the form by itself | ABDM-08 | Complete the verification | The form is filled the moment verification succeeds — no extra click — with a "Details filled into the form below" note naming anything ABDM did not send | P1 | Functional | receptionist | Not run |
| ABDM-09a | Prefill never overwrites typed input | A name already typed before verifying | Complete the verification | The typed value survives; only empty fields fill; every field stays editable | P1 | Functional | receptionist | Not run |
| ABDM-09b | A returning patient does NOT auto-fill | A chart already holds that ABHA | Complete the verification | The form is left alone and the existing chart is offered; filling anyway needs the explicit "Register as a new patient anyway" | P1 | Security | receptionist | Not run |
| ABDM-10 | One button finishes the job | ABDM-09 | Press Register patient | Chart created; the ABHA reads as verified on it; the audit log holds `abdm.abha.linked`. From a shared profile this is the ONLY button the receptionist presses | P1 | Functional | receptionist | Not run |
| ABDM-10a | The ABHA number is stored intact | Any completed flow | Open the chart | The number reads `XX-XXXX-XXXX-XXXX` in full — not partially masked. (Regression: the Aadhaar scrubber used to mangle it, since its last 12 digits are a 4-4-4 group) | P1 | Functional | receptionist | Not run |
| ABDM-10b | A +91 mobile is accepted | Aadhaar flow with a different mobile | Enter the mobile through the phone field | Accepted and normalised — `+91…`, `91…`, `0…` and the bare 10 digits all work | P2 | Functional | receptionist | Not run |
| ABDM-11 | Secondary mobile verification | — | Aadhaar `444455556666` with a different mobile → verify | A second OTP step appears for that mobile; after it the profile carries the new number | P1 | Functional | receptionist | Not run |
| ABDM-12 | ABHA address creation | A newly created ABHA | Pick a suggested address → Create ABHA address | The address is claimed and appears on the prefill | P2 | Functional | receptionist | Not run |
| ABDM-13 | ABHA card download | A completed verification | Download the card | The card opens inline; nothing is added to the hospital's file store | P2 | Functional | receptionist | Not run |
| ABDM-14 | Rejected OTP | — | Aadhaar `111122223339` → verify with any OTP | A clear "OTP is incorrect or has expired" message; the form is still usable | P1 | Negative | receptionist | Not run |
| ABDM-15 | Aadhaar with no linked mobile | — | Aadhaar `111122223331` → Send OTP | ABDM's own message is shown ("No mobile number is linked to this Aadhaar"), not generic copy | P1 | Negative | receptionist | Not run |
| ABDM-16 | Manual fallback undisturbed | Any ABDM failure | Ignore the panel and complete the form by hand | Registration succeeds exactly as before; the ABHA number stays unverified | P1 | Functional | receptionist | Not run |
| ABDM-17 | Verify an existing ABHA by number | Patient holds an ABHA | Verify by ABHA number → OTP | Profile returned and prefilled | P1 | Functional | receptionist | Not run |
| ABDM-18 | Verify by ABHA address | — | Verify using an `@sbx` address → OTP | Profile returned | P1 | Functional | receptionist | Not run |
| ABDM-19 | Verify by mobile | — | Verify using a mobile → OTP | Profile returned; the hint shows a masked number only | P1 | Functional | receptionist | Not run |
| ABDM-20 | Verify by Aadhaar | Consent ticked | Verify using an Aadhaar → OTP | Profile returned; consent is required exactly as for creation | P1 | Functional | receptionist | Not run |
| ABDM-21 | Several ABHA accounts on one identifier | — | Verify with a mobile ending `5` | An account picker appears; choosing one loads that profile | P2 | Functional | receptionist | Not run |
| ABDM-22 | Returning patient by ABHA number | A chart already holds that ABHA | Verify the same ABHA again | Marked "Already registered here"; the existing chart is offered; no duplicate created | P1 | Functional | receptionist | Not run |
| ABDM-23 | Demographic look-alike is never merged | A chart with the same first name, gender and birth year | Verify a profile matching those | Shown as similar charts to check, not as a confirmed match; registering is still possible | P1 | Functional | receptionist | Not run |
| ABDM-24 | One ABHA, one chart | ABDM-22 | Try to link the same ABHA to a second chart | 409 "This ABHA is already linked to UHID-…" | P1 | Negative | receptionist | Not run |
| ABDM-25 | Hand-editing un-verifies | A chart with a verified ABHA | Edit the ABHA number by hand and save | The verified marker disappears; the source reads manual | P1 | Functional | receptionist | Not run |
| ABDM-26 | Scan and Share arrival | ABDM-04 done; a PHR app, or a POST to the callback | Patient scans the facility QR | The profile appears at the desk within a few seconds and can be used | P1 | Functional | receptionist | Not run |
| ABDM-27 | Callback cannot enumerate hospitals | — | POST the callback with a facility id that does not exist | Identical `202 {"accepted": true}` — same status and body as a real facility | P1 | Security | none (public) | Not run |
| ABDM-28 | Tenant isolation | Two hospitals, both entitled | Hospital B checks its pending shares | B never sees A's shared profiles or verifications | P1 | Security | receptionist | Not run |
| ABDM-29 | No Aadhaar in logs or audit | An Aadhaar flow just run | Search the API log and the audit table for the 12 digits | Not present anywhere; only `XXXXXXXX1234` hints | P1 | Security | tester | Not run |
| ABDM-30 | No token reaches the browser | An Aadhaar flow just run | Inspect every ABDM network response in devtools | No linking token, no profile token, no Aadhaar echoed back | P1 | Security | tester | Not run |
| ABDM-35 | Profile update is not a front-desk action | Receptionist, default roles | Complete a verification and look for the ABDM correction control | Absent; a direct `PATCH /abdm/profile` returns 403. Verifying an identity and amending the register are different acts | P1 | Security | receptionist | Not run |
| ABDM-36 | An administrator can correct the profile at ABDM | org_admin, completed verification | Correct these details at ABDM → change the last name → Save at ABDM | Saved; the panel shows the profile as ABDM now holds it | P1 | Functional | org_admin | Not run |
| ABDM-37 | The copy says where the change lands | ABDM-36 | Open the correction panel | It states the change is at ABDM, not just at this hospital, and points at the form below for a local-only fix | P1 | Editorial | org_admin | Not run |
| ABDM-38 | An empty correction is refused | org_admin | Open the panel and save without changing anything | 422 — a PATCH that changes nothing is named, not silently accepted | P2 | Negative | org_admin | Not run |
| ABDM-39 | The audit records fields, never values | ABDM-36 | Check the audit log for `abdm.profile.updated` | It lists which fields changed and contains none of the new values | P1 | Security | org_admin | Not run |
| ABDM-31 | Expired verification | A verification older than `ABDM_TXN_TTL_SECONDS` | Try to continue it | 410 "This verification has expired. Please start again." | P2 | Negative | receptionist | Not run |
| ABDM-32 | Test mode is stated, never hidden | `ABDM_PROVIDER=mock` | Open the panel | A "Test mode" notice naming the fixed OTP; no claim that a real ABHA was created | P1 | Editorial | receptionist | Not run |
| ABDM-33 | Gateway unreachable | `ABDM_PROVIDER=gateway`, network blocked | Try to send an OTP | A clear failure that points at manual registration; nothing half-written | P1 | Negative | receptionist | Not run |
| ABDM-34 | Both themes and a tenant accent | — | Open the panel in Light and Dark under a non-default brand colour | Tabs, QR frame, badges and alerts all follow the tokens | P2 | Visual | any | Not run |

---

## 23a. ABDM / ABHA — Milestone 2, HIP (ADR-087…ADR-091)

**Read this before running any of it.** Every M2 flow is a round trip with the ABDM gateway, and the
gateway cannot reach us until the bridge URL is registered — which needs TLS on
`api-staging.nirogix.com` (`BACKLOG.md` I-5). Until then, run with `ABDM_PROVIDER=mock`, which
**records** each gateway call instead of sending it: what a tester verifies locally is *what we
decided and what we would have sent*, which is the half we control. Cases needing a live gateway are
marked **Blocked (I-5)** in Status and must not be recorded as passed on the mock.

Transfer additionally needs `FIDELIUS_CLI_PATH` and a JRE in gateway mode. Unset, transfer is
**disabled**, not degraded — every request is refused, which is the intended behaviour and is what
ABDM-M2-24 checks.

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| ABDM-M2-01 | A completed consultation becomes a care context | Tenant entitled to `abdm`; a verified ABHA on the chart | Sign an OPD consultation | One `abdm_care_contexts` row for that visit, status `pending`, HI type `OPConsultation` | P1 | Functional | doctor | Not run |
| ABDM-M2-02 | One context per visit, accumulating types | ABDM-M2-01 | Add a prescription and a verified lab result to the same visit | Still ONE row; `hi_types` grows to three; no duplicate reference number | P1 | Functional | doctor | Not run |
| ABDM-M2-03 | The label carries no clinical information | ABDM-M2-01 | Read `display_label` | Reads `OPD records from DD/MM/YYYY` — a date and a setting, never a diagnosis; the patient sees this string in their PHR app | P1 | Security | any | Not run |
| ABDM-M2-04 | An unverified ABHA is never linkable | A chart with a hand-typed ABHA address, never verified | Complete a visit and check the linkable list | The context is excluded; nothing is offered to the gateway | P1 | Security | receptionist | Not run |
| ABDM-M2-05 | A revoked consent is deleted, not flagged | A stored consent artefact | Trigger the revoke notification | The `abdm_consents` row is **gone**; an audit row records the revocation | P1 | Security | org_admin | Not run |
| ABDM-M2-06 | An expired consent is purged on schedule | An artefact whose `data_erase_at` has passed | Run the expiry sweep | The row is gone; the audit entry says expired, not revoked | P1 | Functional | org_admin | Not run |
| ABDM-M2-07 | Deleting a consent never deletes a record | ABDM-M2-05 | Open the patient chart | Every clinical record is intact — the consent is what expired, not the care (invariant #6) | P1 | Security | doctor | Not run |
| ABDM-M2-08 | A link token is encrypted at rest | Gateway mode, a delivered token | Read `abdm_link_tokens.token_enc` | Starts `v1.` and contains no readable JWT | P1 | Security | — | Not run |
| ABDM-M2-09 | A near-expiry token counts as absent | A token expiring within a day | Run the linking sweep | It asks for a fresh token instead of starting a link that would die mid-flight | P2 | Functional | — | Not run |
| ABDM-M2-10 | One notification per patient, not per record | A visit with three HI types | Run the linking sweep | ONE gateway call for that patient, its payload fanning out into per-type blocks | P2 | Functional | — | Not run |
| ABDM-M2-11 | The sweep is safe to run twice | ABDM-M2-10 | Run it again immediately | Nothing is re-sent; already-linked contexts are skipped | P1 | Functional | — | Not run |
| ABDM-M2-12 | A link failure returns to pending | A failure callback for a linked context | Post the failure, run the sweep | The context is `pending` again and retried; `linked_at` never drifts | P1 | Functional | — | Not run |
| ABDM-M2-13 | Linking round trip | Bridge URL registered | Sign a consultation, wait for the sweep | The care context appears in the patient's PHR app | P1 | Functional | doctor | **Blocked (I-5)** |
| ABDM-M2-14 | Discovery matches on a verified ABHA alone | A chart with a verified ABHA | Send a discovery request for that address | One patient, `matchedBy: HEALTH_ID`, care contexts listed by label only | P1 | Functional | — | Not run |
| ABDM-M2-15 | Demographics alone are not enough | A chart with that mobile only | Discovery with the mobile but no name or year of birth | No match | P1 | Security | — | Not run |
| ABDM-M2-16 | Ambiguity means no match | Two charts sharing a household mobile, name and birth year | Send that discovery | **Nobody** is returned — never a guess | P1 | Security | — | Not run |
| ABDM-M2-17 | A registration number cannot make a match | A chart whose UHID is known | Discovery with only that number | No match; it may only break a tie between demographic candidates | P1 | Security | — | Not run |
| ABDM-M2-18 | The OTP goes to the number on the chart | ABDM-M2-14 | Start a user-initiated link | The code is sent to the chart's mobile, never to an address supplied in the request; the code is never returned in any response | P1 | Security | — | Not run |
| ABDM-M2-19 | A wrong code answers rather than hangs | ABDM-M2-18 | Confirm with a wrong code | `on-confirm` is answered with an empty patient list; the attempt is audited | P1 | Negative | — | Not run |
| ABDM-M2-20 | Someone else's care context cannot be linked | A reference belonging to another patient | Init a link naming it | Refused — the request is intersected with what we hold for that patient | P1 | Security | — | Not run |
| ABDM-M2-21 | A records request is acknowledged at once | A stored consent artefact | Post a health-information request | `ACKNOWLEDGED` is sent back before any record is built; a transfer row exists with a deadline | P1 | Functional | — | Not run |
| ABDM-M2-22 | A consented request sends encrypted entries | ABDM-M2-21 | Let the transfer job run | Entries pushed to the HIU URL, each with a base64 MD5 checksum of the **plaintext**; `keyMaterial` names Curve25519; the gateway is notified `TRANSFERRED` | P1 | Functional | — | Not run |
| ABDM-M2-23 | Revoking between request and send stops it | ABDM-M2-21 | Revoke the consent, then let the job run | **Nothing is pushed**; the gateway is notified `ERRORED`; the audit names the reason | P1 | Security | org_admin | Not run |
| ABDM-M2-24 | Encryption unavailable means nothing is sent | Gateway mode, `FIDELIUS_CLI_PATH` unset | Let a transfer run | The transfer is `failed` and nothing leaves the building — never a plaintext fallback | P1 | Security | — | Not run |
| ABDM-M2-25 | A record type outside the consent is not sent | A consent for prescriptions only, a context holding a consultation | Let the transfer run | Nothing is pushed; the refusal is audited | P1 | Security | — | Not run |
| ABDM-M2-26 | A window outside the consented range is refused | A consent for this year | Request last year's records | Refused, with a reason naming the range — not silently truncated | P1 | Security | — | Not run |
| ABDM-M2-27 | A care context the consent does not name is refused | A consent naming one context | Request a different one | Nothing pushed; the reason says it is not covered | P1 | Security | — | Not run |
| ABDM-M2-28 | An expired consent is refused by its own name | An artefact past `data_erase_at` | Request records | The reason says expired — distinguishable in the log from "never granted" | P2 | Negative | — | Not run |
| ABDM-M2-29 | A request for an unknown facility is dropped | — | Post a request with an unregistered `X-HIP-ID` | No acknowledgement, no gateway call, nothing written | P1 | Security | — | Not run |
| ABDM-M2-30 | A late transfer is recorded as late | A transfer completing past its deadline | Check the audit | `abdm.transfer.completed` at severity `warning` with `withinSla: false` | P2 | Functional | — | Not run |
| ABDM-M2-31 | Full transfer round trip | Bridge URL registered, JRE + Fidelius on the host | Grant a consent from a PHR app and request records | The records arrive readable in the requesting app within twenty minutes | P1 | Functional | — | **Blocked (I-5)** |
| ABDM-M2-32 | Tenant isolation across every M2 flow | Two tenants, both ABDM-enabled | Repeat discovery and transfer against tenant B's facility id | Tenant A's contexts, consents and records are never reachable | P1 | Security | — | Not run |
---

## 24. Notifications & emails (ADR-086)

With `MSG91_API_KEY` unset the dev **log** provider records each send in `notification_log` without
sending — assert against that log locally. Emails are wired **per action**; a platform message
(toast) and an email are never both raised by default. SMS transactional stays blocked on DLT
(BACKLOG I-1) — these cases are email + in-app only.

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| NOTIF-01 | Onboarding welcome email | — | Onboard a hospital | The first org_admin gets a `onboarding_admin_welcome` email with a **set-your-password** link; `notification_log` shows the send; the operator still receives the temp password too | P1 | Functional | super_admin | Not run |
| NOTIF-02 | Staff welcome email | A hospital exists | Add a staff user | The user gets a `staff_welcome` email with a set-password link and their role name; `notification_log` shows the send | P1 | Functional | org_admin | Not run |
| NOTIF-03 | Set-password link works | NOTIF-01/02 done | Open the link from the email | The reset-password page loads, a new password can be set (link valid 7 days, once), then sign-in works | P1 | Functional | org_admin | Not run |
| NOTIF-04 | Password-changed confirmation | A user with a password | Change or reset the password | A `auth_password_changed` security confirmation email is sent to the account owner | P2 | Security | any | Not run |
| NOTIF-05 | Appointment confirmed — email present | A patient WITH an email | Book an appointment | An `appointment_confirmed` email is sent with doctor + DD/MM/YYYY, hh:mm AM/PM time | P1 | Functional | receptionist | Not run |
| NOTIF-05a | Appointment — no email on file | A patient with NO email | Book an appointment | No email is attempted; booking succeeds with no error | P1 | Functional | receptionist | Not run |
| NOTIF-06 | Appointment cancelled email | A booked appointment for a patient with email | Cancel it | An `appointment_cancelled` email is sent, including the reason when given | P2 | Functional | receptionist | Not run |
| NOTIF-07 | Payment receipt + no duplicate | An invoice, patient with email | Record a payment; then retry with the same idempotency key | One `payment_receipt` email (invoice number, ₹ amount, method, date); the retry sends nothing new | P1 | Functional | cashier | Not run |
| NOTIF-08 | Lab results email fires on VERIFY, not entry | A resulted lab order, patient with email | Enter a result, then verify it | No email on entry; on **verify** a `lab_results_ready` email is sent that contains **no result values** — only a "view in portal" prompt | P1 | Security | lab_tech | Not run |
| NOTIF-09 | Patient welcome | A patient registered WITH an email | Register the patient | A `patient_welcome` email with the UHID is sent | P2 | Functional | receptionist | Not run |
| NOTIF-10 | No notification spam | — | Check in a visit, sign an encounter, create an invoice, sign in | None of these send an email (`notification_log` shows nothing for them) | P1 | UX | any | Not run |
| NOTIF-11 | Idempotency / dedupe | — | Cause the same event to fire twice for one entity | Exactly one email is sent (per-entity idempotency key) | P1 | Functional | tester | Not run |
| NOTIF-12 | Email branding | A tenant with a custom accent | Trigger a patient email, then a platform email (reset) | The patient email uses the hospital's accent + name; the platform email uses the Nirogix default; no broken logo image | P2 | Visual | tester | Not run |
| NOTIF-13 | Backend message consistency | — | Onboard a hospital / add a user | The success toast shows the backend's own `message` (from `messages.ts`), identical wording in every frontend | P2 | UX | super_admin | Not run |
| EMAIL-PREVIEW-01 | Preview lists + renders every template | operator | Platform → Email templates | All templates listed by category; selecting one renders its subject + the email in a sandboxed iframe; no email is sent and no tenant data is shown | P1 | Functional | super_admin | Not run |
| EMAIL-PREVIEW-02 | Preview is operator-gated | A non-operator session | Open `/email-templates`; call `GET /admin/email-templates` | The nav item is absent and the API returns 403 | P1 | Security | org_admin | Not run |

---

## Coverage gaps (deliberate, tracked)

These are known and recorded in `BACKLOG.md` rather than silently missing:

- **Automated coverage now exists — see `docs/automated-testing.md` for the case-by-case mapping.** Unit + integration (vitest, real PostgreSQL), **API/HTTP boundary** (vitest + supertest: authentication, role/permission enforcement, module entitlement, cross-tenant read *and* write refusal), component (`@hms/ui`: DataTable, date fields, toasts, table actions) and **E2E** (Playwright: five-app smoke, Portal authentication and quick-login gating, protected-route redirects, marketing structure, route-change scroll). Run the lot with `npm run test:regression` before a staging handover.
- **Still manual-only:** `hms_frontend`, `marketing`, `admin`, `patient` and `aiportal` have no component suites of their own, and the clinical journey is automated at service/API level but **not yet through the UI** — the browser walk-through in `docs/manual-testing-guide.md` §10 remains a manual pass. Visual/branding, print/PDF, screen-reader, physical-device and editorial-honesty cases stay manual by design (`docs/automated-testing.md` §5).
- **Email invite / notifications now buildable** — see §24 (welcome + set-password-link emails, appointment/payment/lab/patient emails, the preview page). Real provider *send* (vs. the dev log provider) stays staging-only, blocked on `MSG91_*` + DLT for SMS (BACKLOG I-1).
- **Not yet buildable as cases:** MFA challenge, branch switching, break-glass — the features are not implemented.
- **Staging-only cases** (real SMS/WhatsApp send, deploy pipeline, backup restore drill) are blocked on infrastructure.
