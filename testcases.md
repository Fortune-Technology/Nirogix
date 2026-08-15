# testcases.md — HMS manual QA checklist

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

- **Portal** `http://localhost:3000` · **Marketing** `http://localhost:3001` · **API** `http://localhost:4000/api/v1` (Swagger at `/api/v1/docs`).
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
| TBL-11 | Row actions | `/patients` | Open the "…" menu on a row | Same action menu everywhere; only permitted actions appear; Esc closes; arrow keys move between items | P2 | Accessibility | any | Not run |
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

## 13. Platform administration (super admin)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| ADM-01 | Onboard a tenant | — | Tenants → Create → org details → modules → first admin → branch | Tenant created; temporary password shown **once**; the new admin can sign in | P1 | Functional | super_admin | Not run |
| ADM-02 | Duplicate org code | Existing code | Reuse it | Rejected with a clear message | P2 | Validation | super_admin | Not run |
| ADM-03 | Grant / revoke a module | Existing tenant | Toggle a module | Entitlement changes; the tenant's menu reflects it after re-login; hard dependencies are enforced | P1 | Functional | super_admin | Not run |
| ADM-04 | Suspend a tenant | Active tenant | Set status suspended | Its users can no longer sign in | P1 | Security | super_admin | Not run |
| ADM-05 | Platform branding scopes | — | Admin → Branding → change marketing, then HMS | Each scope changes only its own surface; the other is untouched | P2 | Functional | super_admin | Not run |
| ADM-06 | Non-super-admin is refused | org_admin token | Open `/admin/tenants`; call the API directly | Forbidden panel; API 403 | P1 | Security | org_admin | Not run |

## 14. Org administration (users, roles, branches, branding)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| ORG-01 | Create a user | `platform.users.manage` | Users → Create | User created; temporary password revealed once; they can sign in | P1 | Functional | org_admin | Not run |
| ORG-02 | Duplicate email | Existing user email | Reuse it | Rejected with a clear message | P2 | Validation | org_admin | Not run |
| ORG-03 | Assign / remove a role | Existing user | Assign, then remove | Effective permissions change accordingly | P1 | Functional | org_admin | Not run |
| ORG-04 | Add a GRANT / DENY override | Existing user | Add each | Effective permission list updates; DENY wins over the role | P1 | Security | org_admin | Not run |
| ORG-05 | Deactivate a user | Active user | Set inactive | They can no longer sign in | P1 | Security | org_admin | Not run |
| ORG-06 | Create a branch | `platform.branches.manage` | Branches → New | Branch listed and selectable where branch scoping applies | P2 | Functional | org_admin | Not run |
| ORG-07 | Tenant branding | `platform.branding.manage` | Settings → pick a colour → Save; upload a logo; Reset | Accent applies across the Portal in both themes; logo shows in the shell; reset restores the default | P2 | UI/UX | org_admin | Not run |
| ORG-08 | Branding is per tenant | Two tenants | Set a colour in one | The other tenant is unaffected | P1 | Security | org_admin | Not run |

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
| MKT-07 | Content guardrails | — | Read pricing, security, home | No prices, no certification claims, no invented customers or testimonials | P1 | Functional | anonymous | Not run |
| MKT-08 | Theme toggle | — | Switch Light/Dark; reload | Choice persists; no flash of the wrong theme on load | P2 | UI/UX | anonymous | Not run |
| MKT-09 | Contact form | — | Submit the demo form | Confirmation state shown. **Known limitation: the form does not transmit yet** (`BACKLOG.md` U-2) | P1 | Functional | anonymous | Not run |
| MKT-10 | Back to top & smooth scroll | Long page | Scroll down, press Back to top | Smooth return to top; routes always open scrolled to the top | P3 | UI/UX | anonymous | Not run |

## 17. Specializations (marketing)

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| SPC-01 | Index lists every specialty | — | Open `/specialties` | All specialties render; the six featured ones link to their own page | P1 | Functional | anonymous | Not run |
| SPC-02 | Featured specialty page | — | Open `/specialties/cardiology` | Challenges, platform support, modules, configuration and related specialties all render | P1 | Functional | anonymous | Not run |
| SPC-03 | Non-featured specialty has no page | — | Open `/specialties/oncology` | 404 — no thin auto-generated page exists | P2 | Functional | anonymous | Not run |
| SPC-04 | Specialty SEO | — | Check title/description/canonical on a specialty page | Intent-matched ("Hospital Management Software for Cardiology"), unique per specialty | P2 | Functional | anonymous | Not run |
| SPC-05 | Honest claims | — | Read any specialty page | States that specialties differ in configuration, not code; no claim of a specialty-specific module | P1 | Functional | anonymous | Not run |
| SPC-06 | Navigation entry | — | Desktop nav and mobile bar | Specialties is reachable from both | P2 | UI/UX | anonymous | Not run |

## 18. Cross-cutting: accessibility, theming, performance

| ID | Case | Preconditions | Steps | Expected result | Priority | Type | Role | Status |
|---|---|---|---|---|---|---|---|---|
| A11Y-01 | Keyboard-only operation | — | Complete sign-in → patient search → open a record using only the keyboard | Every control is reachable, focus is always visible, no trap outside dialogs | P1 | Accessibility | any | Not run |
| A11Y-02 | Screen-reader announcements | Screen reader on | Trigger a success and an error toast | Success announces politely, error assertively | P2 | Accessibility | any | Not run |
| A11Y-03 | Contrast | — | Check text on surfaces in both themes | Meets WCAG AA | P2 | Accessibility | any | Not run |
| A11Y-04 | Reduced motion | OS setting on | Navigate, open drawers and toasts | Animations collapse to static; nothing becomes unusable | P3 | Accessibility | any | Not run |
| THEME-01 | Dark mode across the app | — | Toggle Dark and walk the main screens | Every surface, table, toast, drawer and dialog is readable; no white flash | P1 | UI/UX | any | Not run |
| THEME-02 | Tenant accent | Custom brand colour set | Walk the Portal | Buttons, links, badges, active nav and table accents all follow the tenant colour | P2 | UI/UX | org_admin | Not run |
| PERF-01 | Core Web Vitals | Throttled mid-range mobile | Lighthouse on the marketing home and a Portal list page | LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. **Not yet measured — see `BACKLOG.md`** | P2 | Functional | any | Not run |

---

## Coverage gaps (deliberate, tracked)

These are known and recorded in `BACKLOG.md` rather than silently missing:

- **Automated frontend tests do not exist yet** — no unit, component or end-to-end suites in `hms_frontend`, `marketing`, `@hms/ui`, or `@hms/utils`. The backend has Vitest suites (auth, RBAC, tenancy, audit, admin, appointments, branding, events, jobs). Until the frontend suites exist, every UI case above is manual-only, which is a risk this file makes visible rather than hides.
- **Not yet buildable as cases:** password reset / email invite, MFA challenge, branch switching, break-glass — the features are not implemented.
- **Staging-only cases** (real SMS/WhatsApp send, deploy pipeline, backup restore drill) are blocked on infrastructure.
