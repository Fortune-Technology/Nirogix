# testcases.md — Nirogix manual QA checklist

The complete manual test pass for the platform, organised by module. A tester who has never seen the code should be able to execute any case here from the steps alone.

**This file is maintained with the code, not at the end.** A new page, workflow, endpoint, component, validation, permission, or behaviour adds its cases in the same change; changed behaviour updates them; removed behaviour deletes them; a change that can affect existing functionality adds regression cases (`resources/rules.md` → Manual Test Cases). Automated tests do not replace this file, and this file does not replace automated tests.

## How to read a case

| Field | Meaning |
|---|---|
| **ID** | `MODULE-nn`, stable — referenced from bug reports |
| **Priority** | P1 blocks release · P2 important · P3 cosmetic/edge |
| **Type** | Functional · Security · Validation · UI/UX · Responsive · Accessibility · Integration · Regression |
| **Role** | The user the case must be run as |
| **Status** | Not run · Pass · Fail · Blocked · N/A — reset each release |

## Test environment & accounts

- **Portal** `http://localhost:3000` · **Marketing** `http://localhost:3001` · **Platform admin** `http://localhost:3002` · **Patient portal** `http://localhost:3003` · **AI Portal** `http://localhost:3004` · **API** `http://localhost:4000/api/v1` (Swagger at `/api/v1/docs`). Five frontends, one backend (ADR-051).
- Seeded demo tenants: **CITYCARE**, **SUNRISE**, plus the vendor tenant **PLATFORM**.
- Accounts (seed, password `ChangeMe#123`): `owner@takoriya.example` (super_admin, PLATFORM) · `admin@citycare.example` (org_admin) · `reception@citycare.example` (receptionist) · plus doctor / pharmacist / lab / cashier users per the seed.
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

## 2. Authorization, roles & tenancy

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| RBAC-01 | Menu reflects permissions | — | Sign in as receptionist; compare with org_admin | Receptionist sees a reduced menu (no Users/Branches/Audit); org_admin sees the full permitted set | P1 | Security | receptionist | Not run |
| RBAC-02 | Direct URL to an unpermitted page | Signed in as receptionist | Open `/audit` directly | Standard Forbidden panel renders; **no** data request is made for that page | P1 | Security | receptionist | Not run |
| RBAC-03 | API refuses what the UI hides | Signed in as receptionist | Call `GET /api/v1/audit` with that token (Swagger/curl) | HTTP 403 with the canonical error shape — visibility is not the control | P1 | Security | receptionist | Not run |
| RBAC-04 | Explicit DENY beats a role grant | org_admin can manage overrides | Users → pick a user with `patient.view` via role → add DENY override for it → sign in as them | Patients is hidden and `/patients` 403s despite the role granting it | P1 | Security | org_admin | Not run |
| RBAC-05 | Temporary override window | — | Add a GRANT with `validUntil` in the past, then one valid now | Expired override grants nothing; current one grants immediately | P2 | Security | org_admin | Not run |
| TEN-01 | Tenant isolation in the UI | Two seeded tenants | Sign in to CITYCARE, note a patient UHID; sign in to SUNRISE and search for it | Not found — no cross-tenant record is reachable | P1 | Security | org_admin | Not run |
| TEN-02 | Tenant isolation at the API | Token for CITYCARE | Request a SUNRISE record id directly | 404/403, never another tenant's data | P1 | Security | org_admin | Not run |
| TEN-03 | Super admin sits outside customer tenants | — | Sign in as `owner@takoriya.example` | Platform surfaces (Tenants, platform branding) are available; no clinical menu for a hospital they do not belong to | P2 | Security | super_admin | Not run |

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
| TBL-11 | Overflow row actions | Any table using `MoreActions` | Open the "…" menu on a row | Same menu everywhere; only permitted actions appear; Esc closes; arrow keys move between items | P2 | Accessibility | any | Not run |
| ACT-01 | The Action column is identical everywhere | `/patients`, `/users`, `/branches`, `/appointments`, `/opd`, `/billing`, `/admin/tenants` | Compare the last column on each | Always last, right-aligned, headed "Actions", same icon size, spacing and hover treatment; never more than three inline icons | P1 | UI/UX | org_admin | Not run |
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
| TOAST-01 | Success feedback carries the API message | — | Settings → Save colours | Success toast reading the backend's message ("Branding saved.") | P1 | Functional | org_admin | Not run |
| TOAST-02 | Failure feedback | — | Open `/users/00000000-0000-0000-0000-000000000000` | Error toast "Not found — User not found"; persists until dismissed | P1 | Functional | org_admin | Not run |
| TOAST-03 | No duplicate stacking | — | Press Save colours three times quickly | One toast, refreshed — not three | P2 | UI/UX | org_admin | Not run |
| TOAST-04 | Server errors reveal nothing internal | Force a 500 | — | Generic copy; no stack trace, SQL, hostname, or PHI anywhere in the toast | P1 | Security | any | Not run |
| TOAST-05 | Offline / timeout | Disable the network → trigger any action | — | "Can't reach the server" (or timeout) toast; the app does not hang silently | P1 | Functional | any | Not run |
| TOAST-06 | Dismissal | Raise any toast | Press the close control, then Esc on another | Toast dismisses both ways; success ones auto-dismiss after ~5s; errors do not | P2 | UI/UX | any | Not run |
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

## 9. Pharmacy

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| PHR-01 | Add a drug | `pharmacy.manage` | Stock → Add drug → fill → Save | Drug listed with price and reorder level; success toast | P1 | Functional | pharmacist | Not run |
| PHR-02 | Receive stock | Existing drug | Receive → quantity, batch, expiry | On-hand increases by exactly that quantity; success toast | P1 | Functional | pharmacist | Not run |
| PHR-03 | Low-stock indication | Stock below reorder level | View stock | Low badge shows; the Stock level filter finds it | P2 | UI/UX | pharmacist | Not run |
| PHR-04 | Dispense against a prescription | Signed prescription | Pharmacy → dispense | Stock decreases; charge is added to the patient's bill; toast names the drug, quantity and amount added | P1 | Integration | pharmacist | Not run |
| PHR-05 | Dispense more than stock | Quantity > on hand | Attempt it | Rejected with a clear message; stock unchanged | P1 | Validation | pharmacist | Not run |
| PHR-06 | Invalid quantity | — | Enter 0 or a negative number | Client-side validation message; no request sent | P2 | Validation | pharmacist | Not run |

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

## 12. Reports

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| RPT-01 | OPD register | Visits in range | Reports → OPD register → set dates | Rows match the visits in that range; dates read `DD/MM/YYYY` | P1 | Functional | org_admin | Not run |
| RPT-02 | Collections | Payments in range | Collections tab | Totals reconcile with the payments recorded | P1 | Functional | org_admin | Not run |
| RPT-03 | Pending labs | Outstanding orders | Pending labs tab | Only unfinished orders appear | P2 | Functional | org_admin | Not run |
| RPT-04 | CSV export | Any report | Export | File downloads; contents match what is on screen | P2 | Functional | org_admin | Not run |
| RPT-05 | Empty range | Range with no data | — | Shared empty state, not an error | P3 | UI/UX | org_admin | Not run |
| RPT-06 | Permission gate | Role without `reports.view` | Open `/reports` | Forbidden panel | P1 | Security | receptionist | Not run |

## 12b. Frontend separation (ADR-051)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| FE-01 | Admin console is its own app | — | Open `http://localhost:3002` | The platform admin sign-in renders, on the shared design system, with no hospital branding | P1 | Functional | super_admin | Not run |
| FE-02 | Platform routes are gone from the Portal | — | Open `/platform`, `/admin/tenants`, `/admin/branding` on `:3000` | All 404 — the operator surface no longer exists in the Portal | P1 | Regression | super_admin | Not run |
| FE-03 | Hospital admin cannot use the admin console | org_admin credentials | Sign in at `:3002` | Forbidden panel, not an empty console; the API refuses the same calls independently | P1 | Security | org_admin | Not run |
| FE-04 | Operator has no clinical menu | super_admin | Sign in at `:3002` | Overview, Hospitals, Support, Platform, Account — no patients, appointments, OPD, pharmacy, laboratory or billing | P1 | Security | super_admin | Not run |
| FE-05 | Support session crosses origins | super_admin at `:3002` | Hospitals → a hospital → start a support session | A **Portal** tab opens at `:3000/support/enter`, claims the session, and lands on the hospital's dashboard with the support banner | P1 | Functional | super_admin | Not run |
| FE-06 | Token never appears in a URL | Same as FE-05 | Watch the address bar and browser history | The token is never in a URL, a query string or history — it travels only by `postMessage` | P1 | Security | super_admin | Not run |
| FE-07 | Only the admin origin may hand over a session | — | Open `:3000/support/enter` directly, and post a fake `hms:support-session` from another origin | The page fails to claim anything; a message from any origin other than `NEXT_PUBLIC_ADMIN_ORIGIN` is ignored | P1 | Security | — | Not run |
| FE-08 | Sessions are not shared between apps | Signed in at `:3002` | Open `:3000` in the same browser | The Portal does not inherit the admin session — each origin holds its own | P1 | Security | super_admin | Not run |
| FE-09 | CORS is per origin | — | Preflight `/api/v1/admin/stats` with `Origin: http://localhost:3002` | 204, `Access-Control-Allow-Origin: http://localhost:3002`, `Allow-Credentials: true` | P2 | Security | — | Not run |
| FE-10 | Portal still applies the platform branding default | Platform "hms" branding set | Sign in to the Portal | The default palette applies, then tenant branding on top — the Portal keeps the public read | P2 | Regression | org_admin | Not run |
| FE-11 | No development credentials in any bundle | — | Search the built output of every frontend for the seed email and password | No match in any app | P1 | Security | — | Not run |
| FE-12 | Patient portal is not usable | — | Open `http://localhost:3003` | A scaffold only — no login, no patient data. Nothing claims otherwise | P1 | Functional | — | Not run |
| FE-13 | AI Portal is not usable | — | Open `http://localhost:3004` | A scaffold only — no AI capability, and no claim that one exists | P1 | Functional | — | Not run |

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
| PP-01 | Sign-in screen | — | Open `http://localhost:3003` | Two-step sign-in; a line stating there is **no signup** and that the hospital grants access | P1 | UI/UX | patient | Not run |
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
| PP-20 | Patient origin CORS | — | Preflight `/patient/hospitals` from `http://localhost:3003` | 204 with that exact origin allowed | P2 | Security | — | Not run |

## 12e. AI Portal — the boundary (ADR-053)

There is **no AI capability**. These cases prove the door, and that the room behind it is empty.

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| AI-01 | Sign-in screen | — | Open `http://localhost:3004` | Staff sign-in; a line saying access is granted per person and patients cannot sign in | P1 | UI/UX | — | Not run |
| AI-02 | No role grants access | Hospital admin credentials | Sign in | Forbidden panel explaining access is granted per person — **not** an empty console | P1 | Security | org_admin | Not run |
| AI-03 | A doctor is refused too | Doctor credentials | Sign in | Same refusal — no clinical role carries AI access | P1 | Security | doctor | Not run |
| AI-04 | API refuses without the permission | org_admin token | `POST /api/v1/ai/portal/session` | 403 | P1 | Security | org_admin | Not run |
| AI-05 | Platform owner reaches it | super_admin | Sign in | Landing screen loads (WILDCARD covers the permission) | P2 | Functional | super_admin | Not run |
| AI-06 | **A patient can never sign in** | A patient token | `POST /api/v1/ai/portal/session` with it | **401** — refused by principal type, before the permission is read | P1 | Security | patient | Not run |
| AI-07 | Knowing the URL achieves nothing | No token | Same call | 401 | P1 | Security | — | Not run |
| AI-08 | Nothing is offered | super_admin | Read the landing screen | States plainly that no AI capability is enabled. **No disabled input, no model picker, no "coming soon"** | P1 | Functional | super_admin | Not run |
| AI-09 | Capabilities are empty | super_admin | Inspect the session response | `capabilities: []` | P1 | Functional | super_admin | Not run |
| AI-10 | Entry is audited | super_admin | Open the portal, then check the audit trail | An `ai.portal.enter` entry at **notice**, naming the actor | P1 | Security | super_admin | Not run |
| AI-11 | Granting access per person works | An override granting `ai.portal.access` | Grant it to a named user, then sign in as them | They reach the landing screen; removing the override refuses them again | P1 | Security | org_admin | Not run |
| AI-12 | Origin is allowed | — | Preflight `/ai/portal/session` from `http://localhost:3004` | 204 with that exact origin | P2 | Security | — | Not run |
| AI-13 | Nothing markets AI | — | Search all five frontends and the marketing site for AI claims | None — the capability reference keeps every AI phrase on the never-claim list | P1 | Regression | — | Not run |

## 13. Platform administration (super admin)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| ADM-01 | Onboard a tenant | — | Tenants → Create → org details → modules → first admin → branch | Tenant created; temporary password shown **once**; the new admin can sign in | P1 | Functional | super_admin | Not run |
| ADM-02 | Duplicate org code | Existing code | Reuse it | Rejected with a clear message | P2 | Validation | super_admin | Not run |
| ADM-03 | Grant / revoke a module | Existing tenant | Toggle a module | Entitlement changes; the tenant's menu reflects it after re-login; hard dependencies are enforced | P1 | Functional | super_admin | Not run |
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
| DEPT-20 | Setup step | No departments | Open Hospital configuration | *Departments* shows as needed; *Doctors & specialties* says it is waiting on branches and departments | P2 | Functional | org_admin | Not run |
| DEPT-21 | Existing visits keep their department | A visit checked in before this release | Open it | The old free-text department still displays | P1 | Regression | receptionist | Not run |

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

---

## Coverage gaps (deliberate, tracked)

These are known and recorded in `BACKLOG.md` rather than silently missing:

- **Automated frontend tests do not exist yet** — no unit, component or end-to-end suites in `hms_frontend`, `marketing`, `@hms/ui`, or `@hms/utils`. The backend has Vitest suites (auth, RBAC, tenancy, audit, admin, appointments, branding, events, jobs). Until the frontend suites exist, every UI case above is manual-only, which is a risk this file makes visible rather than hides.
- **Not yet buildable as cases:** password reset / email invite, MFA challenge, branch switching, break-glass — the features are not implemented.
- **Staging-only cases** (real SMS/WhatsApp send, deploy pipeline, backup restore drill) are blocked on infrastructure.
