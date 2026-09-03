# Nirogix — Manual User-Journey & Workflow Testing Guide

**Last Updated:** 01/09/2026

> **Maintenance rule (binding).** This is a **living** document and the single manual user-journey
> regression checklist. It must be updated in the *same change* that alters any user-facing
> workflow — a new module, a new role or permission, a changed workflow, onboarding, patient flow,
> pharmacy/lab flow, a new payment method, or a new master-data type. Do not let the product and
> this guide drift apart. If a step here no longer matches the product, fix the guide.

## How to use this guide

- Follow it top to bottom for a full end-to-end pass, or jump to a role section for a focused test.
- Every step is **Action → Expected → Verify**. Tick the checkbox when a step passes.
- Where a feature is **not built** or **partial**, it is marked **⚠ Not Ready / Partial** with what
  is missing. Do not test those as if they work.
- You should be able to follow this without reading the code or the database.

**Legend:** ✅ built & testable · ⚠ partial / not ready · 🔒 security/isolation check · 💵 uses Cash (the only payment method today).

## Before you start: run the automated suite

```bash
npm run test:regression
```

Do not begin a manual pass against a red suite — fix the failure first, or you will spend the
day rediscovering it by hand. The automated safety net already covers **authentication, roles
and permissions, module entitlement, tenant isolation (cross-tenant read *and* write), the
clinical workflow's state transitions (check-in → payment gate → consultation → prescription →
dispense → lab result), and five-app smoke**. `docs/automated-testing.md` maps every area to the
suite that covers it.

What that means for this guide: the stages below stay valuable for what a machine cannot judge —
**visual and branding fidelity, print/PDF output, screen-reader behaviour, physical-device
checks (scanning a printed QR), and exploratory judgement**. Where a stage is already covered
automatically, spot-check it rather than re-running every permutation by hand. §10 (the full
browser walk-through) is **not** yet automated end to end and still needs a real manual pass.

---

## 0. Prerequisites — start from a fresh environment

### 0.1 Environments & URLs

The product is **five separate web apps + one API**. The platform has exactly three environments:
**development**, **staging**, **production**. This guide targets **staging** before a production release.

| Surface | Who uses it | Local (development) | Staging |
|---|---|---|---|
| Marketing site | Public | `http://localhost:3000` | `https://staging.nirogix.com` |
| **Nirogix Portal** (hospital staff) | Org admin, doctors, reception, pharmacy, lab, cashier | `http://localhost:3001` | `https://portal-staging.nirogix.com` |
| Patient portal | Verified patients | `http://localhost:3002` | `https://patient-staging.nirogix.com` |
| **Admin console** (platform operators) | Platform Super Admins | `http://localhost:3003` | `https://admin-staging.nirogix.com` |
| AI Portal | Authorised staff/operators | `http://localhost:3004` | `https://ai-staging.nirogix.com` |
| REST API | — | `http://localhost:4000` | `https://api-staging.nirogix.com` |

> Platform-operator screens (tenant onboarding) live on the **Admin console**, *not* the Portal (ADR-051).

### 0.2 Required configuration (staging)

- [ ] All six staging hosts resolve and serve over HTTPS.
- [ ] `NEXT_PUBLIC_ENVIRONMENT=staging` on every frontend (enables Test Credentials; sets marketing `noindex`).
- [ ] `NODE_ENV=staging` on the API; `DATABASE_URL` points at the **staging** DB (never production).
- [ ] Email deliverable via MSG91 (`MSG91_*` set). **⚠ SMS is not deliverable yet** — blocked on DLT template registration (BACKLOG I-1); email OTP/notifications work, SMS does not.
- [ ] The database has been migrated and the **staging seeder** has run (`npm run db:seed:staging`) — it is what puts a testable dataset on every screen (ADR-114, `docs/seed-data.md`).

### 0.3 Seeded accounts & the Test Credentials helper

- The staging/dev seeder creates the **Nirogix** platform-operator org (`NIROGIX`) with two Platform
  Super Admins, plus demo hospital(s) with one user per role.
- **You should not have to create records before testing a screen (ADR-114).** The development and
  staging seeders build a hospital that has been open for a while: roughly six weeks of completed
  traffic, a live OPD queue this morning with a patient in every stage, appointments ahead, invoices
  in every status, lab orders at every step, low stock, and public form submissions waiting to be
  reviewed. If a screen you are testing is empty, check `docs/seed-data.md` before assuming a bug —
  a few states (uploaded files, ABDM exchanges, support sessions) are deliberately not seeded.
- **Development also seeds a clinic with Pharmacy and Laboratory switched off (`LOTUS`) and a
  suspended tenant (`GREENLEAF`)**, so module entitlement and tenant status can be checked against
  real rows rather than by imagination.
- **Starting over.** `npm run db:seed -w hms_backend -- --reset` rebuilds the development dataset from
  empty. On **staging** the same flag additionally needs `CONFIRM_SEED_RESET=yes` — it destroys
  whatever anyone else is part-way through, so tell them first. Re-running **without** `--reset` is
  always safe: it creates what is missing and never replays the clinical history.
- **Platform Super Admins:** `jaivik@thefortunetech.com`, `nishant@thefortunetech.com` (org code `NIROGIX`).
- **Test Credentials / Quick Login** (**Portal only**; development & staging, never production —
  ADR-077, ADR-080): a **Test credentials** button on the **Portal** sign-in (`:3001`) opens a modal
  of seeded accounts as cards; clicking one fills the login form so you sign in without typing. The
  list is **environment-true** and contains **hospital roles only — never a platform operator, in
  any environment** (ADR-080): a development build shows the dev seeder's CityCare roles, a staging
  build the **staging** seeder's QA General Hospital / `QAHOSP` roles including its Branch Admin
  (`seed.staging.ts`). It folds out of a production build entirely.
- **The Admin console has NO quick-login, in any environment** (ADR-077). Operator accounts are real
  platform credentials; sign in by typing org code `NIROGIX` + your operator email + password.
- **Organization codes are case-insensitive.** Type `nirogix`, `Nirogix` or `NIROGIX` — all resolve the
  same operator org; likewise for the hospital codes.
- **Do not put real passwords in this document.** Seeded test-account passwords live with their
  seeders (dev default via `TESTING_CREDENTIALS.md` — git-ignored guidance — and the staging QA
  password in `seed.staging.ts`); real operator passwords live only with the operators.

> **⚠ Production:** Test Credentials is **absent** from production builds by construction. In production,
> use only real accounts and run **safe smoke tests only** — never destructive/demo data.

### Forgot password (both consoles — ADR-081)

Available on the **Portal** (`:3001/login`) and the **Admin console** (`:3003/login`) via the
**Forgot password?** link. In development the email is not sent — the log provider prints it (with
the link) to the backend log.

- [ ] Request a link with a real org code + staff email → the page shows the uniform "If an account
      matches…" message inline (no toast).
- [ ] Request with an unknown email and with an unknown org code → the **same** message both times
      (no account enumeration).
- [ ] Open the emailed link → set a new password (min 10 chars, entered twice) → success → sign in
      with the new password works; the old password is refused.
- [ ] Open the same link again → "Invalid or expired reset link" (single-use).
- [ ] A link older than 30 minutes → same uniform refusal (expiry).
- [ ] A session signed in elsewhere is signed out by the reset (all sessions revoked).
- [ ] From the Admin console, the emailed link opens the **admin** app's reset page, not the Portal's.

### Account security: lockout, password policy, idle sign-out (ADR-082)

These are the controls a real hospital meets on day one — a mistyped password at a busy front
desk, a weak password on a new account, a workstation left open in a corridor. Run them on a
THROWAWAY account, not on an account someone else is about to use.

- [ ] **Lockout.** Sign in with a wrong password **5 times**. **Verify:** each attempt says only
      "Invalid credentials" — the 5th does not announce a lock.
- [ ] **The lock is real, and only the real user is told.** Now sign in with the **correct**
      password. **Verify:** refused with "Too many failed sign-in attempts. Try again in N
      minute(s)." (🔒 a stranger guessing passwords never sees this message).
- [ ] **A wrong password during the lock.** **Verify:** the same generic "Invalid credentials" —
      the lock is not a way to discover that an account exists.
- [ ] **Nobody else is affected.** Sign in as a different user in the same hospital.
      **Verify:** normal sign-in — a lock is per account, never per hospital or per branch (🔒).
- [ ] **It lifts by itself.** Wait out the stated window and sign in with the right password.
      **Verify:** you are back in; no administrator had to do anything.
- [ ] **The defender can see it.** As an org_admin, open **Audit log** and filter to
      Warning/Critical. **Verify:** `auth.login.locked` and `auth.login.blocked` entries, with the
      attempt count; a sustained attempt appears as **Critical**.
- [ ] **Password policy.** My profile → Password. Try `password1234`, then `Short#1a`, then your
      own name plus a year. **Verify:** each is refused with a specific reason, and a genuinely
      unrelated 12+ character password with mixed classes is accepted.
- [ ] **No exemption for admin-created accounts.** As org_admin, create a user and supply a weak
      password. **Verify:** refused with the same policy message.
- [ ] **Temporary passwords.** Create two users with **no** password. **Verify:** each temp
      password is long, mixed, and the two share no common prefix.
- [ ] **Idle sign-out.** Sign in, then leave the tab completely untouched for **15 minutes**.
      **Verify:** you are signed out with an info toast naming inactivity, and the back button
      does not restore the session (it was revoked server-side, 🔒).
- [ ] **Two tabs.** Open the Portal in two tabs and work in one for 20 minutes.
      **Verify:** neither tab signs out — activity is shared across tabs.
- [ ] **Patient portal.** Repeat the idle check on the patient app (`:3002`). **Verify:** same
      behaviour — that portal is opened on borrowed phones and kiosks.

---

## 1. Platform Admin journey (Admin console)

Open the **Admin console** (`:3003` / `admin-staging.nirogix.com`).

- [ ] **1.1 Login (both admins).** Sign in as `jaivik@thefortunetech.com` (org `NIROGIX`).
  **Verify:** you reach the operator dashboard; the **Tenants** area is available. Sign out; repeat as
  `nishant@thefortunetech.com`. **Verify:** both authenticate and see the same operator surfaces.
- [ ] **1.2 No hospital data.** **Verify:** the Platform Admin sees platform-level surfaces (Tenants,
  platform branding, audit, EOD platform activity) but **no** clinical hospital menus — they operate the
  platform, not a hospital (🔒).
- [ ] **1.3 Invalid login is refused.** Try a wrong password. **Verify:** rejected with a clear message,
  no token issued.

---

## 2. Onboard a new organization / hospital

Still on the Admin console, as a Platform Admin.

- [ ] **2.1 Start onboarding.** Tenants → **Onboard tenant** (Create-Tenant wizard).
- [ ] **2.2 Organization.** Enter org code (e.g. `NDEMO`) and name **`Nirogix Demo Hospital`**.
  **Verify:** the code is required and normalised; a duplicate code is refused.
- [ ] **2.3 Modules.** Select the modules the hospital gets (e.g. patient, appointment, opd, emr,
  pharmacy, laboratory, billing). **Verify:** only chosen modules are granted.
- [ ] **2.4 First Hospital Admin.** Provide the first `org_admin`'s email + name.
  **Action → Expected:** on success a **one-time temporary password** is shown **once**.
  **Verify:** copy it now; it is not shown again.
- [ ] **2.5 Optional branch.** Add a first branch/hospital if offered.
- [ ] **2.6 Tenant appears.** **Verify:** the new tenant is listed with its status and granted modules.
- [ ] **2.7 🔒 Isolation from the start.** **Verify** (later, once you have two tenants) that this tenant's
  data is never visible to another tenant.

**⚠ Note:** onboarding is **operator-driven** (a Platform Admin creates the hospital). There is **no public
hospital self-signup** — that is deliberate and deferred (Enterprise track).

- [ ] **2.8 Switch accounts.** Sign out of the Admin console. Open the **Portal** (`:3001`) and sign in as
  the new `org_admin` using the org code + email + the temporary password from **2.4**.
  **Verify:** first sign-in works; you land on the hospital dashboard.

---

## 3. Hospital Admin journey (Portal)

Sign in to the **Portal** as the hospital's `org_admin` (for a quick pass on the demo hospital, use
**Test credentials → Org Admin**).

For **every** configuration item below, run the **persistence protocol**:
1. Create/configure → 2. Save → 3. Refresh the page → 4. Verify it persists → 5. Sign out & back in →
6. Verify still there → 7. 🔒 Verify it belongs to *this* hospital only.

- [ ] **3.1 Hospital information.** Settings → *Hospital information*: fill legal name, address, city,
  state, PIN, phone, email, registration number, GSTIN. Save. **Verify:** persists; **Verify:** the header
  preview shows the same details that print on documents.
- [ ] **3.2 Letterhead.** Settings → *Letterhead*: header line, footer, default signatory, page size,
  optional letterhead image. Save. **Verify:** the preview updates; persists across reload.
- [ ] **3.3 Branding.** Settings → *Branding*: set the accent colour and logo/favicon. **Verify:** the
  Portal re-tints (buttons, links) in Light and Dark; persists.
- [ ] **3.4 Branches.** Add at least **two** branches (needed for per-hospital availability, §4 and §12).
  **Verify:** listed; deactivating is a toggle (not a delete).
- [ ] **3.5 Departments.** Departments → **New department**: use **Choose from catalogue** to pre-fill a
  common department (e.g. Cardiology), set code/name, save. **Verify:** listed; deactivate is a toggle.
- [ ] **3.6 Providers (doctors).** Providers → **Add doctor**: name, qualification, fee, first specialty,
  optionally link a login. **Verify:** the doctor appears; assign a specialty; set a weekly schedule
  (roster) if testing slot booking.
- [ ] **3.7 Staff users.** Users → create a **receptionist**, **pharmacist**, **lab technician**,
  **cashier** (and any additional org_admin). **Action → Expected:** each gets a **one-time temporary
  password** shown once. **Verify:** each user is listed with the correct role. **⚠ There is no separate
  "Nurse" role today** — clinical recording is by the doctor; front-desk by the receptionist.
- [ ] **3.8 Services catalogue.** Services → **Add service** (use **Choose from catalogue** to pre-fill a
  common service like *General Consultation*; you set the price + tax). **Verify:** listed; editable.
- [ ] **3.9 Enabled modules.** Settings → *Enabled modules*. **Verify:** shows exactly the modules the
  Platform Admin granted (read-only; entitlements are granted by Nirogix).
- [ ] **3.9-rbac The administrator can work the hospital (ADR-125, ADR-126).** As org_admin:
  Patients → a row shows **View, Edit and Deactivate**; **Register patient** opens; Appointments
  shows **Book appointment** with **Check in** and **Cancel** on a row; `/opd/check-in` opens;
  Billing can raise an invoice and collect a payment. **Verify:** every module the hospital has is
  fully usable, and a module it does **not** have refuses with the module message rather than a
  permission one.
- [ ] **3.9a0-pre Patient self-service is one screen (ADR-124).** Settings → **Patient self-service**.
  **Verify:** one tab, holding all three QR surfaces — *Patient self-registration*, *Online
  appointment booking* and *Patient self check-in* — with an explainer stating that none of them
  writes to the hospital's records. **Verify:** the three old URLs
  (`/hospital-setup/patient-registration`, `/hospital-setup/online-booking`,
  `/hospital-setup/self-check-in`) each redirect here rather than 404. Everything below in §3.9a0
  and §3.9a0b–d is done in the matching section of this one screen.
- [ ] **3.9a0 Self check-in (ADR-118).** Settings → **Patient self-service** → *Patient self check-in*.
  **Verify:** it is **off** by default, and the explainer says plainly that scanning announces an
  arrival and checks nobody in. Turn it on.
  **Verify:** a link and a QR preview appear, and the QR actually scans with a phone camera.
- [ ] **3.9a0b** Print the poster (**Print**). **Verify:** it carries the hospital branding and the
  copy tells the patient the desk will call them through — not that they are checked in.
- [ ] **3.9a0c 🔒 Regenerating retires the old poster.** Note the current link, regenerate, then
  open the **old** link. **Verify:** it no longer works. This is the only way to retire a poster
  that has been photographed or altered.
- [ ] **3.9a0d Consultation and case types (ADR-121).** Settings → **Workflow** →
  **Consultation and case types**.
  **Verify:** both lists are **empty**, and nothing anywhere asks for a type. That is the default,
  and a hospital that stops here sees no change of any kind.
- [ ] **3.9a0e** Add consultation types **Teleconsultation**, **Procedure** and **Review**, and
  case types **Corporate** and **Insurance**. Try adding **Review** again.
  **Verify:** the duplicate is refused before it can be added, and each entry is its own chip with
  its own remove button — not a comma-separated line.
- [ ] **3.9a1 Fee schedule (ADR-117).** Settings → **Fee schedule**.
  **Verify:** it opens with **no rules**, explaining that every consultation is charged the
  doctor's own configured fee. That is the platform behaviour and is not an error state.
- [ ] **3.9a2** Add a rule: **any doctor / any department / Follow-up / ₹200**, labelled
  &ldquo;Follow-up rate&rdquo;. Then add **any doctor / Cardiology / any visit type / ₹600**, and
  then **Dr <your doctor> / any / any / ₹800**.
  **Verify:** the list orders them **most specific first** — the named doctor, then the
  department, then the blanket follow-up rate. That is the order the server applies them in, and
  the screen must show it.
- [ ] **3.9a3 A contradiction is refused.** Add a second rule for **any doctor / Cardiology / any
  visit type**. **Verify:** refused — two rules matching exactly the same things would make the
  price a coin toss.
- [ ] **3.9a4 Pricing on the two types (ADR-121 — needs §3.9a0e).** Add **any / any /
  Teleconsultation / ₹300** and **any / any / Corporate case / ₹0**, then **Dr <your doctor> /
  Corporate case / ₹450**.
  **Verify:** the **Case type** and **Consultation type** dropdowns are present now that the
  vocabularies exist (they were absent at §3.9a1), each rule row shows only the dimensions it
  actually names, and the list still reads most-specific first.
- [ ] **3.9a5 The same doctor with a different type is not a duplicate.** Add **Dr <your doctor> /
  Insurance case / ₹700**. **Verify:** accepted.
- [ ] **3.9a6 A word cannot be removed while it is priced.** Go back to Settings → **Workflow**,
  remove **Teleconsultation**, and save.
  **Verify:** refused, and the message **names Teleconsultation**. A price that can never match
  again would still be sitting in the price list looking like policy.
- [ ] **3.9a4 Retiring keeps history.** Retire the ₹800 doctor rule, then tick **Show retired**.
  **Verify:** it is still listed, marked retired, and no longer applies. A rule explains the
  invoices it priced, so it is never deleted.
- [ ] **3.9a5 🔒 Who may set prices.** As a **receptionist**, open the tab. **Verify:** the price
  list is readable but there is no **Add a rule** control, and `POST /api/v1/fee-rules` returns
  403. As a **doctor**, **verify** the tab is absent entirely.
- [ ] **3.9a** Settings → **Workflow**. **Verify:** the page opens on the
  **Whole organization** scope and says nothing has been configured yet — vitals in the consultation,
  fee settled before the consultation. That is the platform default, and it is what the product did
  before this screen existed.
- [ ] **3.9b** Switch the scope to one of your branches. **Verify:** it says that hospital is following
  the organization default, and that saving would create an override for it alone.
- [ ] **3.9c** Set **Where vitals are recorded** to *At the front desk, during check-in*, set **Blood
  pressure** to **Required** and **Pulse**, **Temperature** and **Weight** to **Offered**, and save.
  **Verify:** it persists across a reload and a sign-out (the §3 persistence protocol), and
  🔒 a *different* hospital does not inherit it.
- [ ] **3.10 🔒 Everything is this hospital's.** After each of the above, **Verify** the record does not
  appear when signed into a *different* hospital (cross-check in §12).

> **Who adds drugs and lab tests?** The **drug master** is managed by the **Pharmacist** (§8) and the
> **lab test master** by the **Lab Technician** (§9) — not the org_admin. Set those up in their sections.

---

## 4. Master data & per-hospital availability

### 4.1 Predefined master data (ADR-072)

Predefined catalogues let staff pick a standardised item instead of re-typing it; the hospital keeps its
own price. Test in the relevant screens:

- [ ] **Lab tests** (Lab test master, as Lab Technician): **Add test → Choose from catalogue** → pick e.g.
  *Complete Blood Count (CBC)*. **Verify:** name/sample/unit/reference range pre-fill; **you** set the
  price; save creates the test.
- [ ] **Medicines** (Pharmacy stock, as Pharmacist): **Add drug → Choose from catalogue** → pick e.g.
  *Paracetamol 500 mg*. **Verify:** name/form/strength pre-fill; you set price + reorder; save.
- [ ] **Services** (as Org Admin): **Add service → Choose from catalogue**. **Verify:** code/name pre-fill.
- [ ] **Vaccinations** (Patient record → **Immunisations**, as Doctor/Receptionist): **Record** → pick a
  vaccine from the India schedule; add a **custom vaccine** if needed. **Verify:** recorded with date/dose.
- [ ] **Search works** in every catalogue picker (type "glucose", "amox", etc.).
- [ ] **Custom still works:** ignore the catalogue and type a name/price by hand → saves as a pure custom
  item.
- [ ] **🔒 System data is read-only to the hospital:** you can *select* a system catalogue item but there
  is no control to edit/delete the shared system list.
- [ ] **🔒 Custom values don't leak:** a custom vaccine added at Hospital A is not visible at Hospital B
  (verify in §12).

### 4.2 Per-hospital availability (ADR-073)

Settings → **Hospital availability** (Org Admin). Requires two branches (§3.4) and some items (§4.1).

- [ ] **4.2.1** Pick **Hospital 1** and item type **Medicines**. **Verify:** the org's drugs list, each with
  an **Offered here / Not offered** toggle.
- [ ] **4.2.2** Turn one drug **Not offered** at Hospital 1. Refresh. **Verify:** it persists as Not offered.
- [ ] **4.2.3** Switch to **Hospital 2**. **Verify:** the same drug is still **Offered here** — disabling at
  one hospital does not affect the other.
- [ ] **4.2.4 🔒 Enforced in the workflow:** when prescribing/dispensing *for Hospital 1* (branch passed),
  the disabled drug is **absent** from the picker; at Hospital 2 it is present. (The backend filters by
  branch — it is not just hidden.)
- [ ] **4.2.5 History-safe:** an item already used on a past invoice/prescription still shows correctly on
  that record after you disable it for new use.

**⚠ Not Ready / Partial:** per-hospital **stock and inventory** is deferred — stock is currently **one pool
per organisation** (a branch does not have its own stock count yet). Per-hospital *availability* and a
*price override* work; per-hospital *inventory* does not. Departments are per-hospital natively (they carry
their own branch) and are intentionally not in this screen.

---

## 5. Receptionist journey — registration & visit

Sign in as the **Receptionist** (Test credentials → Receptionist).

### 5.0e The desk can read the workflow that draws its form (ADR-129)

- [ ] **5.0e.1** Sign in as the **receptionist** and open **Appointments → Book appointment**.
  **Verify:** the form renders and **no toast appears**. (It used to show *Not permitted* beside a
  form that then worked.)
- [ ] **5.0e.2** Open **Check in** and the **Vitals queue** as the same user. **Verify:** both load
  cleanly, and the vitals fields appear exactly where the hospital's workflow says they should.
- [ ] **5.0e.3 🔒** As that receptionist, open `/hospital-setup/workflow`. **Verify:** refused —
  reading how the hospital runs is not permission to change it.

### 5.0d The primary action is always in the same place (ADR-128)

- [ ] **5.0d.1** Open **Patients**, **Appointments**, **OPD queue**, **Billing**, **Services**,
  **Providers**, **Departments**, **Branches** and **Staff** in turn. **Verify:** on every one the
  primary action (*Register patient*, *Book appointment*, *Check in*, *New invoice*, …) is
  **top-right in the page header**, level with the page title — never in the filter row beside
  **Columns**.
- [ ] **5.0d.2** **Verify:** the filter row itself holds only search, filters, sort, column
  visibility and pagination.
- [ ] **5.0d.3** Sign in as a role without `patient.record.create` and open Patients.
  **Verify:** the header has no action at all — not a greyed-out button, and not one moved
  somewhere else.

### 5.0c Typing and scrolling in a form (ADR-127)

- [ ] **5.0c.1** Hospital configuration → **Fee schedule** → **Add a rule** → click **Fee (₹)** and
  type `500`. **Verify:** all three digits land in the field and the caret never leaves it. (It used
  to jump to the Doctor dropdown after the first digit.)
- [ ] **5.0c.2** With `500` in the field, scroll the wheel up and then down with the pointer over
  it. **Verify:** the value is still `500`, and the page or dialog scrolled normally.
- [ ] **5.0c.3** Repeat 5.0c.2 on the services price and on the patient-registration form.
  **Verify:** the same — one listener covers the whole application.
- [ ] **5.0c.4** In any number field, use ↑/↓ and type a decimal. **Verify:** arrows still step and
  decimals are still accepted; only the wheel was taken away.
- [ ] **5.0c.5** In any dialog, Tab past the last control and Shift-Tab past the first, then press
  Esc. **Verify:** focus wraps inside the dialog, Esc closes it, and focus returns to whatever
  opened it — the trap still traps.

### 5.0b What a refused user is told (ADR-126)

Two refusals, two different answers. Run both — the point of the change is that they do not read
the same.

- [ ] **5.0b.1 A permission the role lacks.** Sign in as the **receptionist** and open `/audit`.
  **Verify:** *You don't have access to this page*, and below it **Permission required: View the
  audit log · `audit.log.view`** and **Roles with this access: Super Admin, Organization Admin**.
  **Verify:** no toast appears — the panel is already reporting the failure.
- [ ] **5.0b.2 A module the hospital does not have.** Sign in as the **org_admin of a hospital
  without Pharmacy** (the development dataset's `LOTUS`) and open `/pharmacy/stock`.
  **Verify:** *This feature is not available for your hospital*, naming the **Pharmacy** module and
  saying plainly that this is not a permission the administrator can grant. **Verify:** no role
  list — there is nothing to ask anyone for.
- [ ] **5.0b.3 The module answer wins.** That same administrator **does** hold
  `pharmacy.stock.view` (ADR-125). **Verify:** the screen still says module, not permission.
- [ ] **5.0b.4 A custom role is named.** Create a role with `audit.log.view`, then repeat 5.0b.1.
  **Verify:** the custom role appears in *Roles with this access* — the list is this hospital's own,
  not a hard-coded set.
- [ ] **5.0b.5 The dashboard ends where the shell ends.** Open `/dashboard` on a wide screen and
  scroll to the bottom. **Verify:** no blank strip below the sidebar and content (ADR-126). Repeat
  on the admin console at `:3003`.

### 5.0a Missing values read as words, not dashes (ADR-123)

Quick cross-cutting pass. Do it once, here, with a seeded database in front of you.

- [ ] **5.0a.1** Open **Services**. **Verify:** the Department column shows real department names,
  not `—`. Exactly one seeded service (the retired one) reads **Not assigned**.
- [ ] **5.0a.2** Filter Department by **Not assigned**. **Verify:** it is offered as a filter value
  and returns only the unfiled services — the empty state is searchable, not invisible.
- [ ] **5.0a.3** Walk **Patients**, **Providers**, **Users**, **Audit**, the **OPD queue**, the
  **Vitals queue**, **Arrivals**, **Booking requests**, **Patient registrations**, **Laboratory**,
  **Pharmacy stock** and **Reports**. **Verify:** no cell anywhere reads `—`. Every absence reads a
  phrase, and the phrase fits the field: a walk-in with no doctor is *Not assigned*, an optional
  form field left blank is *Not specified*, an audit row written by a job is *Not applicable*, a
  doctor with no personal fee is *Not configured*, a user with no roles is *None*.
- [ ] **5.0a.4** Print an invoice paid in **cash**, a **qualitative** lab result, and a prescription
  with blank dose fields. **Verify:** they read *Not applicable* / *Not specified*, never a dash.
- [ ] **5.0a.5** **Verify:** a numeric reference range still prints as `4000–11000`. That dash is
  typography and stays.

### 5.1 Patient registration

There are two routes to a chart: the full **Register patient** screen, and registration **inside**
check-in for the walk-in who has never been here before (ADR-112). Both are tested.

- [ ] **5.1.1** Patients → **Register patient**: enter name, gender, DOB, phone, etc. Save.
  **Verify:** a **UHID** is generated automatically and shown.
- [ ] **5.1.2** Search the patient by name/phone/UHID. **Verify:** found.
- [ ] **5.1.2a The chart reads top-down in priority order (ADR-127).** Open a patient with history.
  **Verify:** an identity strip first — initials, name, UHID, **age**, gender, date of birth, blood
  group, status — then Contact, Emergency contact, National health ID (ABDM), Treatment cases,
  Immunisations, History, History from other hospitals, and Patient portal access last.
  **Verify:** a patient with no blood group reads *Blood group not recorded* rather than blank.
  **Verify:** the age matches what `/patients` showed for the same person.
  **Verify:** at 375px wide the page does not scroll sideways and long emails wrap inside the card.
- [ ] **5.1.3 Duplicate handling:** register the *same* person again (same phone + name/DOB).
  **Verify:** a duplicate dialog appears — **Use this patient** (open the existing chart) or **Register
  anyway** — rather than silently creating a second chart.
- [ ] **5.1.4 Register from inside check-in:** OPD → **Check in** → type a name that matches nobody.
  **Verify:** a panel says no patient matches and offers **Register new patient**; the page does not
  navigate away.
- [ ] **5.1.5** Open that dialog. **Verify:** the name you typed is already filled in. Add gender, date
  of birth and phone, then **Register & continue**.
  **Verify:** the dialog closes, a UHID is assigned, the new patient is **already selected** on the
  check-in form, and anything you had already chosen below (department, provider, fee, complaint) is
  still there.
- [ ] **5.1.6** Repeat with a **10-digit mobile** typed into the search instead of a name.
  **Verify:** the dialog opens with the *phone* filled and the name blank.
- [ ] **5.1.7 Duplicate, from the dialog:** register a person who already exists.
  **Verify:** the dialog switches to the matching charts. **Use this patient** selects the existing
  chart and closes; **Back to the form** returns without losing what you typed.

### 5.1a ABHA verification at the desk (ABDM Milestone 1 — ADR-084)

Only appears when the hospital is entitled to the **abdm** module and the signed-in role holds
`abdm.verification.perform`. On a default development environment `ABDM_PROVIDER=mock`: no ABDM call
is made, the OTP is always `123456`, and the scenario is chosen by the **last digit of the Aadhaar**
(`0` already has an ABHA, `1` no linked mobile, `5` two ABHA accounts, `9` OTP rejected, anything
else a clean creation). The panel says so on screen — if that notice is missing while the mock is
active, stop and report it.

- [ ] **5.1a.0 Not entitled:** at a hospital without the module, open **Register patient**.
  **Verify:** no ABHA panel at all, the form is unchanged, and no error toast appears.
- [ ] **5.1a.1 Facility first (org_admin):** Hospital configuration → **ABDM / ABHA** → enter the
  HFR **facility ID**, paste the **QR payload**, tick Scan & Share, Save.
  **Verify:** the QR preview renders and actually scans in a phone camera.
- [ ] **5.1a.2** Back as the receptionist, open **Register patient**.
  **Verify:** the **Scan & Share** tab leads and is marked *Fastest*. Without a QR configured it is
  disabled with a tooltip and the other two tabs still work.
- [ ] **5.1a.3 Consent gate:** on **Create a new ABHA**, type an Aadhaar but leave consent unticked.
  **Verify:** *Send OTP* stays disabled. Consent is not a formality — an OTP reaches a real phone.
- [ ] **5.1a.4 Create an ABHA:** tick consent, Aadhaar `111122223333`, Send OTP, enter `123456`, Verify.
  **Verify:** the profile appears with name, gender, date of birth and address, badged *New ABHA created*.
- [ ] **5.1a.5 The form fills itself.** **Verify:** the moment verification succeeds the registration
  form is already populated, with a note saying so and naming anything ABDM did not send. The
  receptionist's remaining job is to press **Register patient** — that is the point of the feature.
- [ ] **5.1a.5a Prefill is a suggestion, not an overwrite:** type a first name **before** verifying.
  **Verify:** what you typed survives; only empty fields fill; every field is still editable.
- [ ] **5.1a.5b A returning patient does NOT auto-fill.** Verify an ABHA that is already on a chart
  here. **Verify:** the form is left alone and the existing chart is offered instead. Auto-filling
  there would put a duplicate chart one button away, which is the one thing this feature must not do.
- [ ] **5.1a.5c ABHA number intact:** **Verify** the number shows in full (`XX-XXXX-XXXX-XXXX`),
  not partially masked.
- [ ] **5.1a.6** Register the patient. **Verify:** the chart is created and the ABHA now reads as
  **verified** on it. Audit log holds `abdm.abha.linked`.
- [ ] **5.1a.7 Returning patient:** run the same Aadhaar again.
  **Verify:** it is flagged **Already registered here** with a link to the existing chart — the point
  of the feature is that a second chart is not created.
- [ ] **5.1a.8 Look-alike is not a match:** verify a profile whose name, gender and birth year match a
  different existing patient. **Verify:** shown as *similar charts to check*, never merged for you.
- [ ] **5.1a.9 Existing ABHA:** on **Patient has an ABHA**, verify by ABHA number, then by ABHA address,
  then by mobile, then by Aadhaar. **Verify:** each returns a profile; the OTP hint shows a masked
  number only. A mobile ending in `5` should offer an **account picker**.
- [ ] **5.1a.10 Scan & Share:** have the patient scan the facility QR in their ABHA app (or POST to
  `/api/v3/hip/patient/share`, with the facility in `metaData.hipId`). **Verify:** the profile appears under
  *Shared just now* within a few seconds and can be used with no OTP at all.
- [ ] **5.1a.11 Failure is not a dead end:** use Aadhaar `111122223339` (OTP rejected) and
  `111122223331` (no linked mobile). **Verify:** the message names the real cause, and you can close
  the panel and register by hand with nothing lost. **This is the case that matters most** — the desk
  must never be blocked by ABDM being unavailable.
- [ ] **5.1a.12 Nothing leaks:** with devtools open, run one Aadhaar flow. **Verify:** no response body
  contains the Aadhaar number or any ABDM token. Then search the API log — only `XXXXXXXX…` hints.

- [ ] **5.1a.13 Correcting the record at ABDM (org_admin only).** As the receptionist, **verify** there
  is no ABDM correction control. Sign in as the org_admin, complete a verification, open
  **Correct these details at ABDM**, change the last name and save. **Verify:** it saves, the panel
  shows what ABDM now holds, and the copy makes clear the change lands at ABDM rather than only at
  this hospital. The audit log records which fields changed and none of the values.

**⚠ Production access** additionally needs NHA functional testing, a WASA certificate and HTC
approval. **M3 (fetching records from other providers) is not built.** M2 is — see 5.1b.

### 5.1b Sharing records with ABDM (ABDM Milestone 2 — ADR-087…ADR-091)

**This section has no clicking, and that is not an oversight.** M1 is *outbound* — the desk calls
ABDM, so you can watch it happen in the Portal. M2 is *inbound*: ABDM calls **us**, on webhooks, and
it has no screens by design. Nobody at a hospital ever operates M2; it answers requests from the
patient's own app and from other providers. Until the bridge URL is registered (TLS is done as of 27/08/2026; registration is the remaining step — `BACKLOG.md` I-5) the
gateway cannot reach us at all, so the honest way to verify M2 is to **play the gateway ourselves**.

One command does that. It drives the real services through the whole chain against your local
database and deletes its own scratch tenant afterwards:

```bash
npm run abdm:m2check
```

- [ ] **5.1b.1 The chain works end to end.** Run it. **Verify:** it finishes with *"M2 is working end
  to end locally"* and no `✗`. Any failure is a real defect — the script asserts behaviour, not
  wiring.
- [ ] **5.1b.2 Read what we would actually send ABDM.** Run `npm run abdm:m2check -- --payloads`.
  **Verify:** the linking payload's care-context `display` reads like *"OPD records from
  27/08/2026"* — a **date and a setting, never a diagnosis**. The patient reads that string in their
  PHR app, so a condition appearing there is a disclosure that cannot be taken back.
- [ ] **5.1b.3 Linking waits rather than failing.** In the output, **verify** step 5 first reports
  *"Waiting for a link token"* and only links after the token is delivered. That deferral is correct:
  a consultation must never fail to save because NHA was slow.
- [ ] **5.1b.4 Revocation stops a transfer that was already accepted.** **Verify** step 9 reports the
  consent artefact **deleted** (not flagged), the clinical records **untouched**, nothing pushed to
  the HIU, and the gateway told the flow errored. **This is the most important check in M2** — a run
  that sends records after a revoke is a failed run.
- [ ] **5.1b.5 Nothing goes out unencrypted.** **Verify** step 8 reports the mock payload marked
  `MOCK-NOT-ENCRYPTED`. That marker is what stops a test envelope ever being mistaken for real
  ciphertext. In gateway mode the same path produces Fidelius output — there is no third option and
  no plaintext fallback.
- [ ] **5.1b.6 It cleans up after itself.** Run it twice. **Verify:** the second run passes
  identically and no `ZZM2CHECK` tenant is left in the database.

**What this cannot prove, and what remains outstanding.** That ABDM can reach us (needs TLS —
the bridge URL still points at NHA's placeholder — `BACKLOG.md` I-5); that the four **unverified** inbound paths are correct; and that Fidelius encrypts
correctly, since mock mode marks rather than encrypts. **No health record has been exchanged with
ABDM in any environment.** Do not record 5.1b as evidence of a live integration — it is evidence that
our half is correct.

### 5.2 Visit / check-in — one workflow, two timings (ADR-115)

`/opd/check-in` and `/appointments/new` are **the same form**. The only real difference is *when*
the patient is being seen, which is a control inside it. If the two ever look different, that is a
defect worth reporting.

- [ ] **5.2.1** From the patient (or Appointments), **check in** to create a visit: select **department**
  and **doctor**. **Verify:** a visit + token is created and appears in the OPD queue.
- [ ] **5.2.2** **Verify:** a **draft consultation-fee invoice** is opened automatically at check-in (the
  fee defaults from the doctor's configured fee).
- [ ] **5.2.3 Verify** the visit is associated with the correct patient and doctor.
- [ ] **5.2.4 Chief complaint takes a paragraph.** Type several sentences into **Reason for visit /
  chief complaint**. **Verify:** a multi-line box with a character counter up to 2000, and the whole
  text reaches the doctor on the visit (check in §7.3).
- [ ] **5.2.5 Visit type.** **Verify** a **Visit type** control offering *Walk-in*, *First visit* and
  *Follow-up*, defaulting to **Walk-in** on the check-in route.

### 5.2h1 The patient record beside the check-in form (ADR-119)

The panel answers "have we seen this before, and what for?" without leaving a half-filled form.
**Run §5.2h1.4 as two different roles** — that check is the point of the section.

- [ ] **5.2h1.1** As the receptionist, open **Check in** on a wide screen and choose a patient who
  has some history.
  **Verify:** the form stays a readable width on the left and the patient&rsquo;s record appears on
  the **right**, with an **Open full record** link. Before a patient is chosen there is no panel.
- [ ] **5.2h1.2** Narrow the window (or use a phone). **Verify:** the panel moves **below** the
  form rather than squeezing it.
- [ ] **5.2h1.3** **Verify** the panel shows **Treatment cases**, **Visits**, **Invoices** and
  **Documents**, each with the newest few rather than everything &mdash; it is a glance, with the
  full chart one click away.
- [ ] **5.2h1.4 🔒 The panel is not the same for everyone.** As the **receptionist**, **verify**
  there is **no Consultations block** &mdash; that block carries chief complaints and ICD-10
  diagnoses and needs `emr.encounter.view`, which the front desk does not hold. Now open the same
  patient as a **doctor**: **verify** the Consultations block **is** there.
  **This is the check that matters.** A receptionist reading diagnoses at the counter is the
  failure this gating exists to prevent.
- [ ] **5.2h1.5 🔒 And the server agrees.** As the receptionist, call
  `GET /api/v1/patients/<id>/encounters` directly. **Verify:** **403**. The missing block is not
  the boundary.
- [ ] **5.2h1.6 No other hospital&rsquo;s records appear.** **Verify** the panel shows only this
  hospital&rsquo;s own visits and consultations. Records held elsewhere are ABDM territory, need the
  patient&rsquo;s consent, and are requested by a named doctor from the chart (§5.1b / ADR-092) —
  they must never appear here just because somebody walked up to the desk.

### 5.2h1b Consent status at the desk (ADR-120)

Only where the hospital is entitled to **ABDM** and the **external health history** capability. The
card is silent otherwise — it must not advertise a feature this hospital does not have.

- [ ] **5.2h1b.1** As the receptionist, open check-in for a patient with **no** verified ABHA.
  **Verify:** a **Records at other hospitals** card saying nothing can be requested, and pointing
  at ABHA verification.
- [ ] **5.2h1b.2** Now a patient **with** a verified ABHA and no request yet.
  **Verify:** it says nothing has been requested, and that **a doctor** can ask — naming that the
  request carries the doctor&rsquo;s name and registration number.
- [ ] **5.2h1b.3** As a **doctor**, request the history from the patient&rsquo;s record. Return to
  check-in as the **receptionist**.
  **Verify:** the card now reads **Waiting for the patient**.
- [ ] **5.2h1b.4 🔒 The desk sees a state, never a record.** Inspect the network response for
  `/consent-status`.
  **Verify:** it contains **no source hospital name**, **no record count**, and **not the
  requesting doctor&rsquo;s name or registration number** — only states, counts and a date.
  A hospital name is a diagnosis by implication; a record count is a proxy for how ill somebody has
  been. **This is the check that matters in this section.**
- [ ] **5.2h1b.5 🔒 And the desk cannot go further.** As the receptionist, call
  `GET /api/v1/abdm/history/<patientId>` and `GET /api/v1/abdm/history/<patientId>/timeline`, then
  `POST /api/v1/abdm/history/request`.
  **Verify:** **403** on all three. Seeing that something is pending is not a way to read it, and
  not a way to ask.
- [ ] **5.2h1b.6** As the **doctor**, open the same patient&rsquo;s record.
  **Verify:** the full **External history** card is there, with the requesting clinician visible —
  the fuller view the desk deliberately does not get.
- [ ] **5.2h1b.7 A decline is a decision.** With a declined request, **verify** the card says the
  patient declined and does not present it as an error to retry.
- [ ] **5.2h1b.8 🔒 Switchable per hospital.** As a platform operator, disable the
  **External Health History (M3, HIU)** capability for this hospital.
  **Verify:** the consent card disappears from check-in, and the status, request-list and timeline
  APIs all return **403** together. A hospital using ABDM only for ABHA verification must not have
  a national records pull.

### 5.2h2 Attaching a document at the desk

- [ ] **5.2h2.1** In the panel&rsquo;s **Documents** block, choose a file (a photo or PDF of a
  referral letter). **Verify:** a type selector appears and the title is pre-filled from the
  filename.
- [ ] **5.2h2.2** Pick **Referral letter** and attach.
  **Verify:** it appears in the list immediately, and again on the patient&rsquo;s full record.
- [ ] **5.2h2.3** Click the document title. **Verify:** it opens in a new tab. (The link is a
  short-lived signed URL fetched at the moment of opening, so an old tab will stop working &mdash;
  that is intended.)
- [ ] **5.2h2.4 Archiving keeps it.** Archive the document. **Verify:** a reason is **required**;
  once given it disappears from the list, and reappears with an **Archived** badge and the reason
  when you tick **Show archived**. Nothing is deleted.
- [ ] **5.2h2.5 🔒 A document cannot be filed against the wrong person.** Upload a file, note its
  id, then `POST /api/v1/patients/<PATIENT-B>/documents` with a `visitId` or `caseId` belonging to
  **patient A**. **Verify:** **422**, naming a different patient.
- [ ] **5.2h2.6 🔒 Nor from another hospital.** Upload a file as Hospital B, then attach it to a
  Hospital A patient using its id. **Verify:** **404** &mdash; the file store is shared
  infrastructure and the id alone proves nothing.
- [ ] **5.2h2.7 🔒 Role check.** As a **pharmacist** (no file permissions), call
  `GET /api/v1/patients/<id>/documents`. **Verify:** 403.

### 5.2i Patient self check-in (ADR-118 — needs §3.9a0)

Scanning **announces an arrival**. It does not check anybody in — a visit carries a queue token and
opens a bill, and no public page may create one (ADR-056). The desk confirming is one click, and is
also the identity check.

**Set up:** book an appointment for **today** for a patient whose mobile number you know.

- [ ] **5.2i.1** Open the check-in link on a phone (or paste it into a browser).
  **Verify:** the hospital name, one field for a mobile number, and copy saying the front desk will
  confirm. Nothing asks for a name, a date of birth or an appointment reference.
- [ ] **5.2i.2** Enter that patient&rsquo;s number and submit.
  **Verify:** a thank-you saying the front desk has been told. **It must not name the patient, the
  doctor or the appointment time.**
- [ ] **5.2i.3 🔒 The reply is the same for a stranger.** Submit a mobile number that belongs to
  nobody at this hospital.
  **Verify:** **exactly the same screen and wording.** A different message would answer "is this
  number a patient here, and are they due in today?" for anyone who picked up the poster.
  **This is the most important check in this section.**
- [ ] **5.2i.4 🔒 And the same when the feature is off.** Turn self check-in off (§3.9a0), submit a
  number that WOULD have matched, and turn it back on.
  **Verify:** the same screen again, and no new arrival on the board. "Off" must not be
  discoverable either.
- [ ] **5.2i.5 🔒 A bad link says nothing useful.** Open the check-in URL with a few characters
  changed, and again with a completely made-up token.
  **Verify:** both give the same "not a valid link" page. A typo and a well-formed-but-unknown
  token must be indistinguishable.

### 5.2j The Arrivals board

- [ ] **5.2j.1** As the receptionist, open **Arrivals**.
  **Verify:** the matched patient is listed with their name, UHID, doctor and appointment time,
  marked **Ready to check in** — and the unmatched submission from §5.2i.3 is **also there**, marked
  **Needs a human**, showing only the number that was typed.
- [ ] **5.2j.2** **Verify** an unmatched arrival has **no** check-in action — there is nobody to
  check in — and that the page explains to go to the check-in screen and search.
- [ ] **5.2j.3** Check the matched patient in from the board.
  **Verify:** they appear in the **OPD queue** with a token, an invoice priced from the fee
  schedule (§5.2g), and `arrivalType` = appointment. It is an ordinary visit in every respect.
- [ ] **5.2j.4** Try to confirm the same arrival again. **Verify:** refused.
- [ ] **5.2j.5 Someone beat the kiosk to it.** Have a patient announce, then check them in by hand
  from the check-in screen before touching the board.
  **Verify:** the board marks that arrival **Already checked in** and offers no second check-in —
  a double entry turned into an obvious dismissal.
- [ ] **5.2j.6** Dismiss an arrival. **Verify:** a reason is required, and the arrival is kept
  rather than deleted.
- [ ] **5.2j.7 🔒 The public path is not a shortcut past a permission.** As a **doctor** (no
  `opd.visit.checkin`), try to confirm an arrival. **Verify:** 403. Then call `GET
  /api/v1/self-check-ins` with **no session**. **Verify:** 401.
- [ ] **5.2j.8** As org_admin, open the **audit log**.
  **Verify:** a `self_checkin.announced` entry **with no actor** (nobody was signed in — a name
  there would be a fabrication), and a `self_checkin.confirmed` entry naming the receptionist.

### 5.2g The fee comes from the price list (ADR-117 — needs §3.9a2)

- [ ] **5.2g.1** Open **Check in** and pick the doctor who has an ₹800 rule.
  **Verify:** the **Consultation fee** shows **₹800** as a stated amount, not an empty box, with a
  badge naming the rule it came from. There is **no field to type a number into**.
- [ ] **5.2g.2** Change **Visit type** to **Follow-up** and pick a doctor with no rule of their own,
  in no department. **Verify:** the fee changes to **₹200** without a page reload. The desk quotes
  from the screen rather than remembering the policy.
- [ ] **5.2g.3** Pick a doctor with no rule at all and clear the department.
  **Verify:** the fee falls back to that doctor&rsquo;s own configured fee, badged as such.
- [ ] **5.2g.4** Check the patient in. **Verify:** the invoice is raised for exactly the amount
  shown, and nobody typed it.

### 5.2f2 Pricing on consultation type and case type (ADR-121 — needs §3.9a4)

- [ ] **5.2f2.1** Open **Check in**. **Verify:** the **Visit** card now offers **Consultation
  type**, and it is optional.
- [ ] **5.2f2.2** Pick a doctor with no rule of their own and set **Consultation type** to
  **Teleconsultation**. **Verify:** the fee changes to **₹300**, badged with the rule that decided
  it. Clear the type again and **verify** it goes back.
- [ ] **5.2f2.3** Under **Treatment case**, choose **Start a new case**, title it and set
  **Case type** to **Corporate**.
  **Verify:** the fee becomes **₹450** — the rule naming *this doctor and a corporate case*, not
  the blanket ₹0 and not the doctor&rsquo;s own rate. The case type is asked **once, here**, and
  not on the visit.
- [ ] **5.2f2.4** Check the patient in, then check the same patient in again a few minutes later
  under **that same case** (mark the first visit completed first).
  **Verify:** the second visit is **₹450 again without anyone being asked**, and the picker says
  *&ldquo;This is a Corporate case, and that is what prices this visit.&rdquo;* A corporate case
  does not stop being corporate on its second visit.
- [ ] **5.2f2.5 🔒 A client cannot claim a cheaper case type.** Call
  `POST /api/v1/visits/check-in` with `"caseType": "Corporate"` in the body and no `caseId`.
  **Verify:** the visit is created at the **ordinary** price and its case type is null. The price
  comes from the case row; a body cannot buy a discount. **This is the check that matters here.**
- [ ] **5.2f2.6 🔒 A type this hospital does not use is refused.** Call the same endpoint with
  `"consultationType": "Home visit"`.
  **Verify:** **422**, and **no visit, case or invoice is created** — the vocabulary is checked
  before anything is written.
- [ ] **5.2f2.7 History is not rewritten.** Remove **Procedure** from the vocabulary (retiring any
  rule that prices it first) and open a visit already recorded as a procedure.
  **Verify:** it still reads **Procedure**. Configuration changed; what happened did not.

### 5.2h Charging something else is a named decision

- [ ] **5.2h.1** As a plain **receptionist**, **verify** there is **no** &ldquo;Charge a different
  amount&rdquo; control at all.
- [ ] **5.2h.2 🔒 The server refuses it too.** Call `POST /api/v1/visits/check-in` as that
  receptionist with a `consultationFeePaise` different from the calculated fee.
  **Verify:** **403**. The missing button is not the boundary.
- [ ] **5.2h.3 Echoing the same number is not an override.** Repeat with the fee **equal** to the
  calculated amount. **Verify:** accepted — a form sending back what it was shown has overridden
  nothing.
- [ ] **5.2h.4** As org_admin, grant that receptionist the **`billing.fee.override`** permission
  (Users → the user → permission overrides). Sign back in as them.
  **Verify:** the **Charge a different amount** control now appears.
- [ ] **5.2h.5 A reason is required.** Enter a different amount, leave the reason blank, submit.
  **Verify:** refused. &ldquo;₹200 instead of ₹800&rdquo; with no explanation is indistinguishable
  from a mistake.
- [ ] **5.2h.6** Give a reason and check in.
  **Verify:** the invoice carries the **charged** amount, and the visit keeps the **calculated**
  one alongside the reason. Both halves are needed — the gap between them is what the override is.
- [ ] **5.2h.7** As org_admin, open the **audit log** and filter to **Warning**.
  **Verify:** a `billing.fee.overridden` entry naming both amounts, the reason and who did it.
  Charging other than the price list should be something a reviewer stops on.
- [ ] **5.2.6** Check a patient in as a **Follow-up**. **Verify** the visit records it — the OPD
  queue and `GET /api/v1/visits/:id` both report `arrivalType: follow_up`.

### 5.2e Treatment cases (ADR-116)

A case groups the visits belonging to one course of treatment. **Most visits do not need one** —
a one-off consultation is not an episode, and the picker defaults to *Not part of a case*. That
default is deliberate; do not report it as a bug.

- [ ] **5.2e.1** Open **Check in** and choose a patient with no cases.
  **Verify:** a **Treatment case** section appears, set to *Not part of a case*, saying nothing is
  currently open for this patient.
- [ ] **5.2e.2** Choose **Start a new case**, give it a title ("Fracture right tibia"), and check
  the patient in.
  **Verify:** the check-in succeeds, the OPD queue shows the case title and its `C-` number on the
  row, and the case appears on the patient's chart under **Treatment cases**.
- [ ] **5.2e.3 An untitled case is refused.** Choose *Start a new case*, leave the title blank and
  submit. **Verify:** refused with a message — an untitled case is unpickable at a desk three weeks
  later, which defeats the point of having one.
- [ ] **5.2e.4 The open case is impossible to miss.** Complete that visit, then start another
  check-in for the same patient.
  **Verify:** before you choose anything, a panel names the open case and its number and says to
  check them in under it rather than starting another. **This is the duplicate guard** — the
  product surfaces what is open rather than refusing a second case.
- [ ] **5.2e.5** Pick that existing case and check in.
  **Verify:** the visit is filed under it, and the **department and doctor from the case are filled
  in for you** — a desk that picked the case should not have to re-pick where it is being run.
- [ ] **5.2e.6 Follow-up preselects the case.** Set **Visit type** to *Follow-up* on a patient with
  an open case. **Verify:** the most recent open case is selected for you, and you can still change
  it.
- [ ] **5.2e.7 A second open case is allowed.** From the chart, open a second case ("Diabetes
  management") for the same patient. **Verify:** allowed, with a warning that one is already open.
  A long-term condition and a fresh injury are genuinely separate episodes.
- [ ] **5.2e.8 🔒 Another patient's case cannot be used.** Call `POST /api/v1/visits/check-in` with
  a `caseId` belonging to a different patient. **Verify:** **422** — it would file the visit under
  a stranger's episode.

### 5.2f Closing and reopening a case

On the patient chart, under **Treatment cases**.

- [ ] **5.2f.1 A live visit blocks closing.** Check the patient in under a case, then try to close
  it. **Verify:** refused, naming the visit that is still open. Closing an episode with the patient
  in the waiting room would let a doctor open a consultation on a case already declared finished.
- [ ] **5.2f.2** Complete that visit, then close the case. **Verify:** a **reason is required**;
  once given, the case reads closed with that reason and its date, and **every visit under it is
  still counted**.
- [ ] **5.2f.3** Try to check the patient in under the closed case. **Verify:** refused — a closed
  episode must not quietly come back to life.
- [ ] **5.2f.4** Reopen it. **Verify:** it returns to open, the visit count is unchanged, and the
  close reason is cleared from the card.
- [ ] **5.2f.5** As org_admin, check the **audit log**. **Verify:** `case.opened`, `case.closed`
  (carrying the reason) and `case.reopened` (carrying the *previous* close reason — reopening
  erases it from the record, so the audit entry is the only place it survives).
- [ ] **5.2f.6 Nothing is ever deleted.** **Verify** there is no delete control anywhere on a case,
  and `DELETE /api/v1/cases/:id` is not a route.

### 5.2c The two forms are one form

Run this as a **receptionist**, who holds both the check-in and the booking permission.

- [ ] **5.2c.1** Open **Check in**. **Verify:** a **When** card at the top with **Right now**
  selected and **Future appointment** beside it.
- [ ] **5.2c.2** Fill in the patient, department, doctor and a long chief complaint. Now press
  **Future appointment**.
  **Verify:** **everything you typed is still there** — patient, department, doctor, complaint. Only
  the half that no longer applies changes: the consultation fee and any vitals fields disappear, and
  a date/time (or the doctor's slot chips) appear. **This is the point of the change**; losing the
  form on switching would defeat it entirely.
- [ ] **5.2c.3** **Verify** the page title and the submit button follow the choice — *Check in* /
  *Book appointment* — and that **Visit type** drops **Walk-in** on the future side, because a
  booking is never a walk-in.
- [ ] **5.2c.4** Switch back to **Right now**. **Verify** nothing shared was lost on the way back.
- [ ] **5.2c.5** Open **Appointments → Book appointment** (`/appointments/new`). **Verify** it is the
  same form, starting on **Future appointment**.
- [ ] **5.2c.6 Book with a department.** Book an appointment choosing a **department**, then open the
  appointments list. **Verify** the department is stored and shown. (Before ADR-115 an appointment
  had no department at all — this is the field that made one form possible.)
- [ ] **5.2c.7 🔒 The toggle follows permissions.** Sign in as a role holding **only** appointment
  creation (a doctor). **Verify** the **When** card is **absent** and the form is booking-only — no
  control is offered that would lead to a 403.
- [ ] **5.2c.8 The toggle is hidden where it cannot work.** Open check-in from a **booked**
  appointment (`?appointmentId=`) or from the **referral** worklist (`?referralId=`).
  **Verify:** no **When** card, and the patient cannot be changed — both are fixed by the record you
  came from.

### 5.2d A booked follow-up is still a follow-up a week later

- [ ] **5.2d.1** Book an appointment for tomorrow with **Visit type = Follow-up**.
- [ ] **5.2d.2** From **Appointments**, check that patient in **without touching the visit type** —
  as a desk that never saw the booking would.
  **Verify:** the visit records **follow_up**, not walk-in, and the **department from the booking**
  has carried across. The intent travels on the appointment precisely so nobody has to remember it.
- [ ] **5.2d.3** Check a **referred** patient in from the referral worklist. **Verify:** recorded as
  a **follow-up** — a patient sent on from another department did not arrive off the street.

### 5.2a Vitals at the front desk (ADR-113 — needs §3.9c)

Only appears when this hospital is configured for **vitals during check-in**. If §3.9c has not been
done, there is no vitals section on the check-in form, and that is correct — do not report it.

- [ ] **5.2a.1** Open **Check in**. **Verify:** a **Vitals** section is present, showing exactly the
  parameters configured in §3.9c and no others. Blood pressure is marked required with an asterisk.
- [ ] **5.2a.2 The required vital is enforced on the server.** Fill in only the pulse and submit.
  **Verify:** refused with a message naming **Blood pressure** — and, critically, **no visit and no
  invoice were created**. Check the OPD queue and Billing to confirm nothing was left behind. A
  half-made check-in is the failure this check exists to catch.
- [ ] **5.2a.3 A typo is refused, a real emergency is not.** Enter `1200/80`. **Verify:** refused.
  Now enter `200/110` — a genuine hypertensive emergency. **Verify:** **accepted**. The bounds reject
  impossible numbers, never alarming ones.
- [ ] **5.2a.4 Half a blood pressure.** Enter only the systolic. **Verify:** refused.
- [ ] **5.2a.5** Enter a complete set and check the patient in. **Verify:** the check-in succeeds and
  the readings are on the visit.
- [ ] **5.2a.6 Blood sugar needs its type.** Turn **Blood sugar** on in §3.9c, then enter a value and
  leave the fasting / post-prandial / random selector blank. **Verify:** refused — a sugar reading
  nobody can interpret is worse than no reading.

### 5.2b The vitals queue (ADR-113 — the "after check-in" workflow)

Change §3.9c to **In a separate vitals step, after check-in** first.

- [ ] **5.2b.1** **Verify:** the check-in form no longer shows a vitals section, and a **Vitals queue**
  item appears in the navigation.
- [ ] **5.2b.2** Check a patient in, then open **Vitals queue**. **Verify:** they are listed in token
  order, marked **Waiting**.
- [ ] **5.2b.3** Record their vitals. **Verify:** the row changes to **Recorded** with the readings, who
  took them and when — and it **stays on the list**. The nurse has to be able to see what they
  finished, and to re-take a reading they doubt.
- [ ] **5.2b.4 A re-take does not overwrite.** Record a second, different set for the same patient.
  **Verify:** the queue shows the newer one. The earlier reading is **kept** — confirm both appear on
  the consultation screen in §7.3a.
- [ ] **5.2b.5** Start the consultation for that patient. **Verify:** they leave the vitals queue.
- [ ] **5.2b.6 The wrong hospital gets an explanation, not an empty table.** Set the mode back to
  *In the consultation* and open **Vitals queue**. **Verify:** it explains that this hospital records
  vitals in the consultation and links to the setting, rather than showing a blank list.

**⚠ Appointment reminders (SMS/WhatsApp) are not wired** — booking works, automatic reminders do not.

---

## 6. Cashier — payment 💵

Sign in as the **Cashier** (Test credentials → Cashier). Payment method today is **Cash only**.

> **Billing model:** there is **one invoice per visit**. The consultation fee is on it from check-in;
> pharmacy and lab charges are **added to the same invoice** as they happen; the cashier settles it, and
> **part payments** are supported. There are not separate independent "pharmacy payment" and "lab payment"
> screens — they are lines on the one visit invoice.

- [ ] **6.1** Open the visit's invoice. **Verify:** the consultation-fee line is present with the balance.
- [ ] **6.2** Record a **Cash** payment for the consultation fee; mark it collected.
  **Verify:** the invoice status updates (paid / partially paid) and the balance reduces.
- [ ] **6.3 Verify payment history:** the payment appears with method = Cash, who/when.
- [ ] **6.4 Gate satisfied:** **Verify** the visit is now eligible for consultation (the doctor is no longer
  blocked — see §7.1).
- [ ] **6.5 Over/duplicate payment:** try to collect **more than the balance**. **Verify:** refused with a
  clear message (you cannot overpay).

### 6a. The receptionist collects, too (ADR-110)

Check-in is what raises the consultation invoice, so the front desk can now read and settle it. Sign
back in as the **Receptionist** and run this against a freshly checked-in patient.

- [ ] **6a.1** OPD queue → follow the **Bill** link on the row.
  **Verify:** the invoice opens (it must **not** be a 403 or a Forbidden page), and the balance matches
  the fee shown against the visit.
- [ ] **6a.2** Record a **Cash** payment for the full balance.
  **Verify:** accepted; the invoice reads **paid** and the balance is zero.
- [ ] **6a.3** **Verify** the doctor is no longer blocked from starting the consultation (§7.1) — the
  whole point of the change is that the workflow can be completed at the desk.
- [ ] **6a.4 The boundary that still holds:** Billing → try to create a **new invoice** as the
  receptionist.
  **Verify:** there is no create control, and calling `POST /api/v1/invoices` directly returns **403
  FORBIDDEN**. Reception collects what the workflow raised; it does not invent charges.
- [ ] **6a.5** As org_admin, check the **audit log**.
  **Verify:** the payment is recorded against the receptionist who took it, not the cashier.

### 6b. When the fee has to be settled is configurable (ADR-113)

Settings → **Workflow** → *When the consultation fee must be settled*.

- [ ] **6b.1** Leave it at **Before the consultation starts** (the default) and confirm §7.1 still
  blocks the doctor on an unpaid visit. **This is the case that must never break.**
- [ ] **6b.2** Set it to **After the consultation**, then check a patient in and — **without paying** —
  open the consultation as the doctor. **Verify:** it opens.
- [ ] **6b.3 Nothing was written off.** **Verify** the invoice still exists with the full balance
  outstanding, on the visit and in Billing. The setting moves *when* the money is collected, never
  *whether* it is owed.
- [ ] **6b.4** Set it back to **Before the consultation starts**. Check another patient in and try to
  open the consultation unpaid. **Verify:** blocked again.
- [ ] **6b.5 🔒 The gate is on the server.** With the gate on and the fee unpaid, call
  `POST /api/v1/encounters/open` directly. **Verify:** **409**, not a hidden button.

**⚠ Not Ready / Partial:** only **Cash** is implemented. Card / net-banking / UPI / payment-gateway and GST
e-invoice are **not built**.

---

## 7. Doctor journey — consultation, prescription, lab order

Sign in as the **Doctor** (Test credentials → Doctor).

- [ ] **7.1 Queue & the payment gate.** OPD queue → open the checked-in patient's visit.
  **Verify:** if the consultation fee is **unpaid**, a *Payment pending* panel blocks the consultation and
  links to collect payment (this is enforced on the **server**, not just hidden). After §6, the
  consultation opens.
- [ ] **7.2 🔒 Own patients / own hospital.** **Verify:** the doctor sees their queue (and can filter to
  "my patients only"); they cannot see another hospital's patients or queues.
- [ ] **7.3 Consultation.** Record chief complaint, notes/SOAP, vitals where supported, an **ICD-10
  diagnosis** (type-ahead), and follow-up instructions. Save. **Verify:** persists on refresh; a *Past
  consultations* panel shows earlier signed encounters.
- [ ] **7.3b Save is always reachable, and says what it knows.** Scroll to the very bottom of a
  consultation carrying several prescriptions and lab orders. **Verify:** the title bar stays pinned
  under the app bar with **Save**, the sign action, and a plain statement of state — *Unsaved changes*
  while you are typing, *All changes saved* after saving. Type something and undo it by hand: it goes
  back to *All changes saved*, because the state is what the note says, not what you touched.
- [ ] **7.3c One click, one save.** Click **Save** twice as fast as you can. **Verify:** one success
  toast and the version advances once. Two saves, two toasts, or a duplicated row is a defect.
- [ ] **7.3d Unsaved work is not lost silently.** With an unsaved edit on screen, reload the tab.
  **Verify:** the browser asks before discarding, and cancelling keeps what you typed.

#### 7.3a Vitals in the consultation (ADR-113)

- [ ] **7.3a.1** Open a consultation for a patient whose vitals were taken earlier (§5.2a or §5.2b).
  **Verify:** the **Vitals** card is already filled in with the latest reading, and above it a short
  list shows each earlier reading with **where** it was taken (*At check-in* / *Vitals room* /
  *In consultation*), **who** took it and **when**.
- [ ] **7.3a.2 The doctor is not held to the hospital's required list.** **Verify** no vital is marked
  required here, even where the desk was required to record one, and that changing a single number
  and saving works. The required list exists so the *desk* cannot skip a reading; forcing a clinician
  to re-enter five numbers to correct one would be its own kind of error.
- [ ] **7.3a.3 Re-saving does not multiply the record.** Save the consultation twice without changing
  a reading. **Verify:** the vitals list does **not** gain a duplicate entry.
- [ ] **7.3a.4** Now change one reading and save. **Verify:** a new entry appears, attributed to the
  doctor, and the earlier one is still there.
- [ ] **7.3a.5** Where the hospital has vitals switched off entirely, **verify** the Vitals card is
  absent from the consultation.
- [ ] **7.4 Prescription.** Use **Add medicine** — it is in the **card footer**, at the end of the list it
  extends, not in the card header. Fill the line: **medicine**, dose, frequency, route, duration,
  instructions. **Verify:** the medicine field is the shared searchable picker — type three letters and
  the list filters, showing strength, price and stock; arrow keys move, Enter selects, Esc closes.
  Now type a medicine that is **not** in the master. **Verify:** it is accepted, with *Not in the drug
  master; pharmacy will match it by hand* beneath it. Save. **Verify:** linked to the correct patient and
  encounter.
- [ ] **7.4a Alignment.** With one matched and one free-text medicine on screen, look along the row.
  **Verify:** labels and inputs sit on one baseline, a row carrying a hint does not stretch its
  neighbours taller than themselves, and the page never scrolls sideways — at desktop, tablet and
  mobile widths.
- [ ] **7.4b Deleting a line.** Remove a prescription you have **already saved**. **Verify:** the
  application's own *Delete prescription?* dialog appears, naming the medicine, with Cancel and Delete —
  never the browser's grey box. Cancel keeps it. Now add a fresh row and remove it before saving:
  **verify** it just goes, with no dialog. Nothing was in the record to destroy.
- [ ] **7.5 Lab order.** Use **Add test** in the card footer. **Verify:** the test field behaves exactly
  like the medicine field — same control, same keyboard, same free-text fallback — and picking a test
  from the master fills the code and shows the price. **Verify:** the order is linked to the patient +
  encounter and becomes visible to lab staff (§9).
- [ ] **7.6 Referral (optional).** Refer to a department; **Verify** it appears in the referrals worklist and
  the front desk can check the patient in against it.
- [ ] **7.7 Sign-off.** Press **Sign & complete**. **Verify:** the application's own confirmation appears
  first — *Sign this consultation?*, saying the note locks and the visit is marked completed — and that it
  is **not** the browser's dialog (no *localhost says*, and it follows Light/Dark). Cancel, then do it
  again and confirm. **Verify:** the record locks for editing, the visit completes, and **Print
  prescription** produces a branded Rx document.

#### 7.8 Correcting a signed consultation (ADR-134)

The rule being tested is that the signed note is **never overwritten**. Everything below is about what
the record looks like afterwards, not about whether the edit went through.

- [ ] **7.8.1 A signed note is closed.** On the consultation you just signed, **verify** every field is
  read-only and the header offers *Signed …*, *Print prescription* and **Amend consultation**.
- [ ] **7.8.2 🔒 Without the permission, the screen says which one.** Sign in as the **Receptionist** and
  open the same consultation (they hold `emr.encounter.view`). **Verify:** there is **no** Amend button,
  and a panel names the missing permission in words *and* as `emr.encounter.amend`, and says who can
  grant it. A dead or disabled button here is a defect.
- [ ] **7.8.3 A reason is required.** Back as the **Doctor**, press **Amend consultation**. **Verify:** the
  dialog says the signed note is preserved and that your name, the time, the reason and the changed
  fields will be recorded. Submit with the reason empty, then with one word. **Verify:** both are refused
  in place and the consultation is still signed.
- [ ] **7.8.4 Reopening.** Give a real reason ("Cough is productive, not dry — the subjective note was
  wrong"). **Verify:** the fields become editable, a banner names the reason, its author and the original
  signing time, and the header now offers **Save**, **Sign amendment** and **Discard amendment**.
- [ ] **7.8.5 The note has not left the hospital.** While it is open for amendment, **verify** it is still
  listed in the patient's clinical history, and (as the **Pharmacist**) that its undispensed prescription
  is **still waiting** at the counter. A correction upstairs does not take a patient's medicine off the
  counter.
- [ ] **7.8.6 🔒 The amendment belongs to whoever opened it.** As the **Org Admin** — who holds every
  permission — try to save a change to this consultation. **Verify:** refused with *Another user is
  amending this consultation*. Try **Amend** again: refused, because one is already open. Exactly one
  amendment is on the record.
- [ ] **7.8.7 Discarding, before and after.** As the **Doctor**, press **Discard amendment** before
  changing anything. **Verify:** it returns to signed, the note is untouched, and the discarded attempt
  is still listed in the trail — reopening a signed record is worth knowing about even when nothing came
  of it. Now amend again, change the **Subjective** text, and try to discard. **Verify:** refused, telling
  you to sign it instead.
- [ ] **7.8.8 Re-signing records what changed.** Save, then **Sign amendment** and confirm. **Verify:** the
  record locks again, and the **Amendments** card lists this amendment as *Recorded*, with the author, the
  time, the reason, and *Changed: Subjective* — naming **only** the field you actually changed. If it
  claims fields you did not touch, that is a defect.
- [ ] **7.8.9 Changing nothing is still an answer.** As the **Org Admin**, amend with a reason
  ("Reviewed after a complaint"), change nothing, and sign. **Verify:** it is recorded as *Reopened and
  re-signed without changing anything* — not as a blank or missing entry.
- [ ] **7.8.10 The visit completed once.** **Verify** the visit is still *completed* with its original
  completion time, and in the **Audit log** (§13) that the encounter has exactly **one**
  `encounter.sign` alongside `encounter.amend_open` and `encounter.amend_sign`. An amendment is a
  correction, not a second consultation.
- [ ] **7.8.11 The trail is append-only.** **Verify** the Amendments card lists every amendment — the
  recorded one, the unchanged one and the discarded one — newest first, each with its own status, author,
  time and reason, and that nothing in the UI removes one.

**⚠ AI draft:** a *Draft with AI* control appears **only** on deployments where the AI key is configured;
otherwise it is absent by design. When present, drafted lines land in the same editable form and the
doctor signs everything. Do not test it if the control is not shown.

---

## 8. Pharmacist journey — stock & dispensing

Sign in as the **Pharmacist** (Test credentials → Pharmacist).

- [ ] **8.1 Drug master & stock.** Add drugs (§4.1); **receive stock** by batch + expiry (FEFO); add a
  **supplier**; make a signed **stock adjustment** with a reason. **Verify:** on-hand and low-stock flags
  update; the correction is ledgered.
- [ ] **8.2 🔒 Correct pending prescription only.** Pharmacy → **Verify** the pharmacist sees the pending
  prescription for *this* hospital's patient with the correct drug/quantity, and no unrelated hospital data.
- [ ] **8.3 Dispense.** Dispense against the prescription. **Verify:** the prescribed drug is pre-matched
  (when master-linked); the quantity is correct; stock is deducted; a **pharmacy line is added to the
  visit invoice** (settled by the cashier, §6).
- [ ] **8.4 No double dispense.** Try to dispense the **same** prescription again. **Verify:** refused (it is
  locked against double-processing).
- [ ] **8.5 History reflects it.** **Verify** the patient/encounter shows the dispense.

---

## 9. Lab technician journey — order to verified report

Sign in as the **Lab Technician** (Test credentials → Lab Technician).

- [ ] **9.1 Worklist.** Laboratory → **Verify** the doctor's lab order (§7.5) appears with the correct
  patient and test; no unrelated hospital data (🔒).
- [ ] **9.2 Collect.** Mark the sample **collected**. **Verify:** the lab charge is **added to the visit
  invoice at collection** (settled by the cashier, §6).
- [ ] **9.3 Enter result.** Enter a value; **Verify** an out-of-range value is auto-flagged
  (low/high/critical) against the reference range. Optionally **attach a report file**.
- [ ] **9.4 Verify (sign-off).** **Verify** the report (holders of `laboratory.result.verify`). **Verify:**
  a verified badge appears; only **verified** results are released to the patient portal.
- [ ] **9.5 Doctor access.** **Verify** the doctor can see the result on the patient's record (per
  permissions).
- [ ] **9.6 Patient access.** **Verify** the patient can see the **verified** report in the patient portal
  (§once portal access is granted).

---

## 10. Complete end-to-end patient journey

Run this once as a single continuous flow. Optional steps are marked *(optional)*.

- [ ] Platform Admin creates the organization/hospital (§2)
- [ ] Hospital Admin sets up the hospital + staff + services (§3, §4)
- [ ] Receptionist registers the patient (§5.1)
- [ ] Receptionist creates the visit / check-in (§5.2)
- [ ] Cashier collects the **Cash** consultation payment (§6) 💵
- [ ] Doctor sees the patient in the queue (§7.1)
- [ ] Doctor completes the consultation (§7.3)
- [ ] Doctor creates a prescription (§7.4)
- [ ] Doctor creates a lab order *(optional)* (§7.5)
- [ ] Pharmacist dispenses the medicine (§8.3); charge on the visit invoice
- [ ] Lab collects, results and **verifies** the report *(optional)* (§9)
- [ ] Cashier settles the final invoice (consultation + pharmacy + lab) with **Cash** part-payments (§6) 💵
- [ ] Doctor signs off the encounter (§7.7)
- [ ] **Verify** the patient record's history shows the completed visit, prescription, dispense, lab report
  and the paid invoice.

---

## 11. Test multiple patients (data separation) 🔒

Register **Patient A** and **Patient B** (different details) at the same hospital, then run different flows:
- **Patient A:** consultation → prescription → pharmacy → lab order → lab report.
- **Patient B:** consultation → a *different* prescription → **no** lab order.

- [ ] **Verify** Patient A's data never appears under Patient B and vice-versa.
- [ ] **Verify** payments, prescriptions, lab orders and records stay separate per patient.

---

## 12. Test multiple hospitals / tenant isolation 🔒

Have at least **two hospitals** (the demo `CITYCARE` and `SUNRISE`, or onboard a second in §2).

- [ ] Sign in as Hospital A's staff. Note a patient, a doctor, a drug, a custom vaccine, an availability
  config.
- [ ] Sign in as Hospital B's staff. **Verify** none of Hospital A's patients, doctors, staff,
  prescriptions, lab reports, payments, pharmacy records, **custom master data**, or **per-hospital
  availability config** are visible.
- [ ] **Direct-navigation check:** while signed into Hospital B, paste a URL for a *Hospital A* record id
  (e.g. `/patients/<A-id>`). **Verify** it is **not** returned (403 / not found) — the backend enforces
  tenant scope, not just the menu.
- [ ] **Verify** an org can never edit the shared **system** catalogue, and one org's custom items never
  appear for another.

---

## 13. Role & permission testing

For each role, verify **Can access → view → create → edit → delete → cannot access unauthorized**. Do **not**
rely on a hidden button — attempt the action (and a direct URL) to confirm the **server** refuses it.

| Role | Should be able to | Should NOT be able to |
|---|---|---|
| Platform Super Admin | Onboard tenants, manage entitlements, platform branding, platform audit | Open a hospital's clinical screens as if staff |
| Org Admin | Hospital config, branches, departments, providers, users, services, per-hospital availability, the consultation fee schedule | Dispense, enter lab results, collect payments (unless also granted) |
| Receptionist | Register patients, book/check-in, front-desk queue, record vitals, open and read treatment cases, view and collect on the visit invoice | See clinical notes, dispense, verify labs, raise a new invoice, change the workflow configuration, platform screens |
| Doctor | Own queue, consult, prescribe, order labs, refer, sign, record vitals, book a future appointment | Another hospital's patients; **checking a patient in** (no "Right now" option in the visit workflow); platform screens |
| Pharmacist | Drug master, stock, dispense | Consultations, lab results, platform screens |
| Lab Technician | Test master, worklist, results, verify | Consultations, dispensing, platform screens |
| Cashier | Raise/settle invoices, record Cash payments, EOD collections | Clinical notes, dispensing, platform screens |

- [ ] For each role, sign in (Test credentials) and confirm the **navigation** matches the table.
- [ ] For at least three roles, attempt an **unauthorized action via direct URL** and confirm a 403/hidden
  result (🔒). E.g. a receptionist opening a consultation write, a doctor opening the Users admin.

**⚠ Note:** `branch_admin` exists as a role but is **effectively org-wide today** (per-branch permission
pinning is not implemented). Do not expect a branch admin to be limited to a single branch yet.

---

## 14. Negative testing

Document expected behaviour for each:

- [ ] **Invalid login** → refused with a clear message; no token.
- [ ] **Access a page without authentication** → redirected to sign-in.
- [ ] **Access another hospital's record** (direct URL) → 403 / not found (🔒).
- [ ] **Duplicate patient registration** → duplicate dialog (use existing / register anyway).
- [ ] **Duplicate/over payment** → refused (cannot exceed the balance).
- [ ] **Proceed without required payment** → consultation blocked until the fee is paid (server-enforced).
- [ ] **Dispense an already-dispensed prescription** → refused.
- [ ] **Invalid workflow state** (e.g. enter a lab result before collection) → refused with a clear message.
- [ ] **Submit an incomplete form** → inline validation; the request is not sent.
- [ ] **Refresh mid-workflow** → no data loss for saved steps; unsaved input behaves predictably.
- [ ] **Back/forward navigation** → the app stays consistent; no stale/incorrect data shown.
- [ ] **Open an old / deactivated / invalid record** → a clear empty/not-found state, not a crash.
- [ ] **Repeated wrong passwords on one account** → locked with backoff; other accounts unaffected (🔒 ADR-082).
- [ ] **Upload a renamed binary** (e.g. an `.exe` renamed `.png`) as a logo or report attachment →
      refused: "contents do not match its declared type"; nothing is stored (🔒).
- [ ] **Weak password anywhere it can be set** (self-service, reset link, admin-created user) → refused
      with the same policy message in every place.
- [ ] **Browser console during a full journey** → no Content-Security-Policy violations on any of the
      five apps; logos, report images and print previews still render (🔒).

---

## 15. Navigation & UI verification (run throughout)

### 15.0 Scrolling and dropdowns (ADR-111, ADR-112)

The four staff-facing apps now use the browser's **own** scrolling; only the public marketing site
smooth-scrolls. Check this in **every** app, not just the one you happen to be in.

- [ ] **15.0.1** Open the longest page you can find in each of **portal, admin, patient, aiportal**
  (a patient with a long history is a good one) and reach the bottom three ways: wheel, scrollbar drag,
  and Page Down. **Verify:** all three get there, and the motion is instant rather than eased.
- [ ] **15.0.2** Wheel over the **sidebar** menu, then over the page.
  **Verify:** the sidebar scrolls on its own, stops at its end, and does not drag the page with it.
- [ ] **15.0.3** Open any **dialog** on a scrollable page.
  **Verify:** the page behind does not scroll, and does not **jump sideways** as the scrollbar is
  removed. A tall dialog scrolls inside its own body.
- [ ] **15.0.4** Scroll past ~600px and click **Back to top**. **Verify:** the button appears while
  scrolled and returns the page to the top.
- [ ] **15.0.5** Scroll the **marketing** site. **Verify:** the motion there is still eased — that one
  keeps its smooth scroll deliberately.
- [ ] **15.0.6** Open the **Provider** dropdown on check-in at a hospital with several doctors.
  **Verify:** it has a search box, each row shows the speciality under the name and the fee on the
  right, and typing a surname and a speciality word **in either order** finds the doctor.
- [ ] **15.0.7** Open the **Service** dropdown on the last line of a scrolled **new invoice** dialog.
  **Verify:** the list renders in full above the dialog and is not cut off by the dialog body.
- [ ] **15.0.8** Open a dropdown near the **bottom** of a tall page. **Verify:** it opens upwards and
  stays on screen.
- [ ] **15.0.9** Drive a dropdown by **keyboard only**: Enter to open, arrows to move, Enter to select,
  Esc to close. **Verify:** opening lands on the current selection and Esc returns focus to the trigger.
- [ ] **15.0.10** Repeat one dropdown check in **Dark** and under a **non-default brand colour**.
  **Verify:** the tick, the highlighted row and the focus ring all follow the tenant accent.

- [ ] Pages load without broken links.
- [ ] No visible runtime/console errors on the main flows.
- [ ] Forms validate; **success toasts** appear top-right; error messages are understandable (no stack traces).
- [ ] Loading and **empty states** render (e.g. an empty queue, an empty catalogue).
- [ ] Tables: search, filters, sort, column visibility and pagination work; large lists filter server-side.
- [ ] Dates show as **DD/MM/YYYY** and times as **hh:mm AM/PM**.
- [ ] Light and Dark themes both look correct; the tenant's accent applies.
- [ ] **Mobile/responsive:** the bottom nav + hamburger drawer work below the breakpoint.
- [ ] **Scroll position:** navigating between routes starts at the **top** of the new page (no carry-over,
  no page parked mid-section).

---

## 16. Environment-specific testing

| Environment | What to test here |
|---|---|
| **development** | Local developer verification, seed data, the Test Credentials helper, dev-only utilities. |
| **staging** | The **full** end-to-end journey (this guide), real deployment config, role & tenant isolation, integration (email OTP), demo/QA. |
| **production** | **Safe smoke tests only** after deploy (sign-in reachable, a page loads, health check green). **Never** use destructive/demo data or development shortcuts. Test Credentials is absent by design. |

---

## 17. Test Credentials / Quick Login

- Available in **development** and **staging**; **unavailable in production** (the account list is dropped
  from the production build entirely).
- On the Portal sign-in, click **Test credentials** → a modal of seeded hospital accounts as cards → click a
  card to fill the form → **Sign in**. Use it to switch between roles quickly.
- **Never write real passwords into this or any committed document.** The dev/staging default password lives
  in the git-ignored testing guidance only.

---

## 18. Regression checklist (quick pass before a release)

- [ ] Platform Admin login (both admins) ✅
- [ ] Onboard a new organization/hospital ✅
- [ ] Hospital Admin: profile, branches, departments, providers, staff, services persist ✅
- [ ] Master data pickers (lab/drug/service/vaccine) pre-fill; custom values work ✅
- [ ] Per-hospital availability toggles and is enforced in the picker ✅
- [ ] Patient registered; duplicate detection works ✅
- [ ] Visit created; consultation-fee invoice opened ✅
- [ ] Cash payment collected; over-payment refused 💵 ✅
- [ ] Payment-before-consultation gate enforced (and configurable, §6b) ✅
- [ ] Vitals recorded where the hospital configured them (desk / vitals queue / consultation) ✅
- [ ] Check-in and booking are one form; switching timing keeps every shared answer ✅
- [ ] An appointment stores its department, and it carries across at check-in ✅
- [ ] A booked follow-up is still recorded as a follow-up when the patient arrives ✅
- [ ] A visit can be filed under an existing open case, and the open ones are surfaced first ✅
- [ ] A case cannot be closed with a live visit under it, and closing needs a reason ✅
- [ ] 🔒 Another patient's case is refused at check-in ✅
- [ ] The consultation fee is calculated from the schedule and shown before check-in ✅
- [ ] The most specific fee rule wins (doctor > department > visit type) ✅
- [ ] 🔒 Charging a different amount needs the override permission **and** a reason, and is audited ✅
- [ ] Self check-in announces an arrival; the desk confirms it into a real visit ✅
- [ ] 🔒 The self check-in reply is identical for a match, a stranger and a disabled hospital ✅
- [ ] The patient's record shows beside the check-in form, and stacks on a narrow screen ✅
- [ ] 🔒 Reception sees no Consultations block; a doctor does; the API refuses reception either way ✅
- [ ] A document can be attached at the desk, and archived with a reason rather than deleted ✅
- [ ] 🔒 A case type sent in the check-in body changes no price — the case decides ✅
- [ ] 🔒 A consultation type the hospital has not configured is refused, and creates nothing ✅
- [ ] 🔒 The desk sees ABDM consent **state** only — no records, no source hospitals, no clinician ✅
- [ ] 🔒 Disabling the external-history capability removes status, requests and timeline together ✅
- [ ] A required vital is refused **before** the visit and invoice are created ✅
- [ ] A re-taken reading is added, never overwriting the earlier one ✅
- [ ] Doctor consultation + prescription + lab order saved & linked ✅
- [ ] Pharmacy dispense; no double dispense; charge on the invoice ✅
- [ ] Lab collect → result → **verify**; released to patient portal ✅
- [ ] Final invoice settled; encounter signed ✅
- [ ] 🔒 Multiple patients isolated; multiple hospitals isolated (incl. direct-URL) ✅
- [ ] 🔒 Role permissions enforced on the server (not just hidden) ✅
- [ ] Negative tests behave as documented ✅
- [ ] Dates/toasts/empty states/scroll-to-top correct ✅

---

## Appendix — Not Ready / Partial (do not test as functional)

- **Payments:** only **Cash** (record + part payments). No card/UPI/net-banking/gateway; no GST e-invoice.
- **SMS:** blocked on DLT template registration (email works). No SMS/WhatsApp reminders.
- **Per-hospital stock/inventory:** stock is one pool per organisation; per-branch inventory and a
  server-side "current branch" (branch switcher) are deferred. Per-hospital *availability* + *price
  override* do work (§4.2).
- **AI Portal:** an authorization boundary only (no AI capability) unless a deployment configures the AI
  key, which enables the in-consultation **AI draft** (doctor signs everything). Never claimed as
  diagnosis/prescribing.
- **Roles:** no distinct **Nurse** role — vitals are recorded by whoever holds `emr.vitals.record`
  (receptionist and doctor by default; grant it to a custom role for a dedicated vitals assistant).
  **Branch Admin** is effectively org-wide (no per-branch pinning yet).
- **Workflow configuration** covers vitals placement and payment timing only (ADR-113). Self check-in,
  payment before check-in, and walk-in policy are **not built**; the table is their home when they are.
- **Cases can only be chosen at check-in.** A visit filed under the wrong case (or under none) cannot
  be moved afterwards — `visits.case_id` is set once (ADR-116). The correction path is not built.
- **A case affects pricing only through its *type*** (ADR-121). A fee rule can key on "Corporate"
  or "Insurance", so every visit under such a case is priced the same — but not on the case's
  history, so "the third visit of this episode is free" still cannot be expressed.
- **Fee rules have no effective dates.** Changing a price changes it from that moment; the old value
  survives only in the audit log and in the invoices it already priced. There is no "from 1 April".
- **The fee schedule covers the consultation fee only.** Pharmacy, laboratory and the services
  catalogue keep their own pricing and are unaffected.
- **Auth:** no MFA challenge, no self-service password reset / email invite, no branch switching.
- **Public hospital self-signup:** deliberately not built (onboarding is operator-driven).
- **Self check-in does not check anybody in.** It announces an arrival; the desk confirms (ADR-118).
  Fully automatic check-in with no desk step is **not built** and would need ADR-056 amended, because
  it means a public endpoint writing a clinical record. Do not test for it.
- **Self check-in has no OTP** and no identification by patient ID, QR or appointment reference. The
  mobile number is the only input; the desk verifies identity in person. A patient with **no**
  appointment today is told to go to the desk — there is nothing for the announcement to match.
- **A document attached during check-in is linked to the patient, not to the visit being created**
  — the visit does not exist while the form is open (ADR-119). Attach from the patient record
  afterwards if the visit link matters.
- **Documents have no in-app preview.** Opening one is a new browser tab through a short-lived
  signed URL; an old tab stops working, which is intended.

> When any of the above ships, move it out of this appendix into the relevant journey section **in the same
> change**, and update **Last Updated** at the top.
