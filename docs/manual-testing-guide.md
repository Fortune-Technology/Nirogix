# Nirogix — Manual User-Journey & Workflow Testing Guide

**Last Updated:** 18/08/2026

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
- [ ] The database has been migrated and the **staging seeder** has run (`npm run db:seed:staging`).

### 0.3 Seeded accounts & the Test Credentials helper

- The staging/dev seeder creates the **Nirogix** platform-operator org (`NIROGIX`) with two Platform
  Super Admins, plus demo hospital(s) with one user per role.
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

### 5.1 Patient registration

- [ ] **5.1.1** Patients → **Register patient**: enter name, gender, DOB, phone, etc. Save.
  **Verify:** a **UHID** is generated automatically and shown.
- [ ] **5.1.2** Search the patient by name/phone/UHID. **Verify:** found.
- [ ] **5.1.3 Duplicate handling:** register the *same* person again (same phone + name/DOB).
  **Verify:** a duplicate dialog appears — **Use this patient** (open the existing chart) or **Register
  anyway** — rather than silently creating a second chart.

### 5.2 Visit / check-in

- [ ] **5.2.1** From the patient (or Appointments), **check in** to create a visit: select **department**
  and **doctor**. **Verify:** a visit + token is created and appears in the OPD queue.
- [ ] **5.2.2** **Verify:** a **draft consultation-fee invoice** is opened automatically at check-in (the
  fee defaults from the doctor's configured fee).
- [ ] **5.2.3 Verify** the visit is associated with the correct patient and doctor.

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
- [ ] **7.4 Prescription.** Add a prescription line: **medicine** (from the drug master picker; free text is
  allowed), dosage, frequency, duration, quantity, instructions. Save. **Verify:** linked to the correct
  patient and encounter.
- [ ] **7.5 Lab order.** Add at least one **lab order** (from the test master picker). **Verify:** linked to
  the patient + encounter; it becomes visible to lab staff (§9).
- [ ] **7.6 Referral (optional).** Refer to a department; **Verify** it appears in the referrals worklist and
  the front desk can check the patient in against it.
- [ ] **7.7 Sign-off.** Sign the encounter. **Verify:** it locks for editing; **Print prescription** produces
  a branded Rx document.

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
| Org Admin | Hospital config, branches, departments, providers, users, services, per-hospital availability | Dispense, enter lab results, collect payments (unless also granted) |
| Receptionist | Register patients, book/check-in, front-desk queue | See clinical notes, dispense, verify labs, platform screens |
| Doctor | Own queue, consult, prescribe, order labs, refer, sign | Another hospital's patients; platform screens |
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
- [ ] Payment-before-consultation gate enforced ✅
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
- **Roles:** no distinct **Nurse** role; **Branch Admin** is effectively org-wide (no per-branch pinning yet).
- **Auth:** no MFA challenge, no self-service password reset / email invite, no branch switching.
- **Public hospital self-signup:** deliberately not built (onboarding is operator-driven).

> When any of the above ships, move it out of this appendix into the relevant journey section **in the same
> change**, and update **Last Updated** at the top.
