# Nirogix — DLT & MSG91 SMS Onboarding Guide

**Last Updated:** 19/08/2026
**Owner of this task:** Engineering (developer) with company-owner sign-off where flagged 🔴
**Related:** `BACKLOG.md` I-1 · `CLAUDE.md` (Communication rule, ADR-016 / ADR-059) · `resources/domains.md` §8a

> **Purpose.** A single, self-contained guide to switch Nirogix SMS (OTP + transactional) from the
> dev **log provider** to **real sending** through MSG91. Real SMS in India cannot be turned on with
> a key alone — it requires **DLT (TRAI) registration** of the business, a **Sender ID (header)** and a
> **content template**. This document lists exactly what to collect from the owner and walks the whole
> process end to end.

> **Maintenance rule.** Living document. Update it in the same change that alters the SMS setup,
> the env variables, or the message wording. Tick the checkboxes as each step completes.

---

## 0. Where this fits (current status)

| Channel | Status | Blocker |
|---|---|---|
| **Email** (OTP + notifications) | ✅ **Ready** — sends the moment `MSG91_API_KEY` + `MSG91_EMAIL_*` are set | None. `mail.nirogix.com` verified at MSG91 (SPF/DKIM/CNAME), 17/08/2026 |
| **SMS** (OTP + transactional) | ⚠ **DLT done — MSG91 side remains** | Header `NIROGX` and the `Nirogix OTP` template are both **Active** on DLT (01/09/2026). Still needs `MSG91_OTP_TEMPLATE_ID` — the MSG91 flow id, minted only when the DLT template is added in the MSG91 panel — plus `MSG91_API_KEY` and a funded wallet |

- The **MSG91 account** is under the company **takoriya**.
- The **authkey** (`Nirogix`, rule `Nirogix Backend`) is created and active. Copy it into `MSG91_API_KEY`.
- The **code is already wired**: `sendOtp()` passes `env.MSG91_OTP_TEMPLATE_ID` and the provider sends
  it as `template_id` on the MSG91 `/flow` call ([communication.service.ts:86](../hms_backend/src/modules/notification/communication.service.ts#L86),
  [msg91Provider.ts:39](../hms_backend/src/modules/notification/providers/msg91Provider.ts#L39)).
  Nothing more to build — this is purely a **provisioning** task.

---

## 1. What to collect from the company owner

Hand this list to the owner. Items marked 🔴 **only the owner can provide/do**; the rest a developer can handle once collected.

### 1A. Company legal documents (scanned PDF/JPG)
- [ ] Company **PAN** card
- [ ] **GST** certificate (showing GSTIN)
- [ ] **Certificate of Incorporation** (Pvt Ltd) / **LLP Incorporation + LLP agreement** (LLP) / registration proof (proprietorship/partnership)
- [ ] **Business address proof** — recent utility bill or company letterhead
- [ ] **CIN / LLPIN** number, if a registered company/LLP

### 1B. Authorized signatory details
DLT registers against one named person who receives all verification OTPs.
- [ ] Full name + designation
- [ ] Their **PAN** card
- [ ] Their **Aadhaar** card
- [ ] **Official email** (company-domain email strongly preferred)
- [ ] 🔴 **Mobile number that is reachable during registration** — every DLT step (entity, header, template) sends an OTP to it. Either the owner stays available to forward OTPs, or gives the developer temporary access to that phone/inbox.

### 1C. Brand decisions (owner sign-off)
- [ ] 🔴 **Exact registered legal company name** — must match DLT records character-for-character
- [ ] 🔴 **Sender ID (6 characters)** — approve 2–3 options that reflect the brand (DLT rejects headers unrelated to the entity name). Suggested: `NRGIXP`, `NIROGX`, `TAKORI`
- [ ] 🔴 **Approve the OTP / transactional message wording** — drafts are in §4 below; owner just approves or edits

### 1D. Authorizations (owner must sign) 🔴
- [ ] **Letter of Authorization (LOA)** on **company letterhead**, signed — authorizes the DLT registration and names MSG91 as the aggregator (MSG91 provides a template)
- [ ] **Board resolution** — only if the operator/registrar asks (common for larger Pvt Ltd)

### 1E. Billing / account 🔴
- [ ] **GST details** for MSG91 invoices
- [ ] **Approve funding the MSG91 wallet** — SMS credits are real money and must be topped up before any live send
- [ ] Confirm developer has owner-level access to the **takoriya MSG91 account** (already true — the authkey was created there)

---

## 2. Guided step-by-step — the full process

Budget **2–4 working days**, most of it waiting on DLT/operator approvals. Do the phases in order.

### Phase A — Register as a Principal Entity (PE) on a DLT portal — *one-time*
Register on **one** operator's portal; it syncs to the national registry.

1. [ ] Choose one and sign up as **Principal Entity**:
   - Jio → `trueconnect.jio.com`
   - Airtel → `dlt.airtel.in`
   - Vodafone-Idea → `vilpower.in`
   - BSNL → `ucc-bsnl.co.in`
2. [ ] Upload the §1A documents; verify the §1B email + mobile via OTP 🔴
3. [ ] On approval, record the **19-digit Entity ID**: `____________________`

> MSG91 has a DLT onboarding/support team — raise a ticket from the panel; they advise operator choice and can speed approvals.

### Phase B — Register the Header (Sender ID) → becomes `MSG91_SMS_SENDER_ID` — **DONE 01/09/2026**
4. [x] In the DLT portal: **Headers → Add Header**
5. [x] Enter the approved **6-char** ID (§1C), type **Transactional / Service** (for OTP — **not** Promotional)
6. [x] Submit → approval usually **1–2 days**
7. [x] Record the approved header: **`NIROGX`** → this is **`MSG91_SMS_SENDER_ID`** (Permanent, Active, valid to 31/12/2026; `TAKORI` is also active)

> **It took four attempts.** Three were rejected with *“The domain website is not working properly and
> entity name is not mention in the website”* — one root cause: `nirogix.com` served the default nginx
> page with no valid certificate, so the verifier found no site and therefore no entity name. A DLT
> verifier opens the public website; **do not submit a header while the site is down** (`BACKLOG.md` I-7).

### Phase C — Register the OTP content template on DLT — **APPROVED 01/09/2026, 10:28**
8. [x] In the DLT portal: **Content Templates → Add Template**
9. [x] Type = **Service Implicit** (typical for OTP); link to the Phase B header — **NIROGX** (one header per template)
10. [x] Paste the approved wording (§4), keeping the variable slot `{#var#}`. Filed as: Template Name `Nirogix OTP`, Communication Type SMS, Category **Health**, Content Type Text, one **NUMBER (OTP, Amount, Serial Number, Reference IDs)** variable with sample `483920`, 92 characters
11. [x] Submitted 10:11, **Active** at 10:28 (STPL: Active). Record the **19-digit DLT Template ID** here: `____________________` — read it from the panel's **Tagging** / template-details view, or **Download Report**. MSG91 asks for it in Phase D.
12. [ ] Repeat 8–11 for each transactional template you need (§4)

> **One template per distinct message text.** DLT matches the delivered SMS against a registered
> template, so an approved OTP template covers the OTP and nothing else. Any new SMS wording —
> appointment confirmation, reminder, anything — is its own Phase C + Phase D pass before it can send.
> Today the OTP is the only SMS the product actually sends; the generic `sendSms` paths
> (`notification.controller.ts`, the `notification.send` job) carry no registered template and will be
> refused by the operator until one exists for whatever text they carry.

### Phase D — Create the Flow in MSG91 → becomes `MSG91_OTP_TEMPLATE_ID`
13. [ ] MSG91 panel: **SMS → Templates / Flows**
14. [ ] Add the DLT template: paste the **content**, the **DLT Template ID** (Phase C), select the **Sender ID** (Phase B). MSG91 validates it against DLT.
15. [ ] MSG91 generates its own **Flow / Template ID** (alphanumeric). Record it: `____________________`
    → this MSG91 id is **`MSG91_OTP_TEMPLATE_ID`** (it's what the code sends as `template_id`).

### Phase E — Fund, configure, and go live
16. [ ] Top up the MSG91 **Wallet** with SMS credits (Settings → Wallet) 🔴
17. [ ] Set the values on the box that runs the backend (never commit; `.env` is gitignored):
    ```bash
    MSG91_API_KEY=<the Nirogix authkey>
    MSG91_SMS_SENDER_ID=NIROGX                        # Phase B (approved 01/09/2026)
    MSG91_OTP_TEMPLATE_ID=<msg91 flow id>             # Phase D step 15
    MSG91_OTP_TEMPLATE_VAR=<the flow's variable name>  # Phase D — blank falls back to var1
    # (email, already working:)
    MSG91_EMAIL_FROM=noreply@mail.nirogix.com
    MSG91_EMAIL_DOMAIN=mail.nirogix.com
    ```
18. [ ] Restart the backend and run the verification in §5

---

## 3. Environment variable reference

| Variable | What it is | Source | Needed for |
|---|---|---|---|
| `MSG91_API_KEY` | Account **AuthKey** (turns on real sending) | MSG91 → Authkey (`Nirogix`) | Email **and** SMS |
| `MSG91_EMAIL_FROM` | Verified sender address | Fixed | Email |
| `MSG91_EMAIL_DOMAIN` | Verified sending domain | `mail.nirogix.com` | Email |
| `MSG91_SMS_SENDER_ID` | DLT-approved 6-char header | DLT Phase B | SMS |
| `MSG91_OTP_TEMPLATE_ID` | MSG91 Flow id (references the DLT template) | MSG91 Phase D | SMS OTP + transactional |
| `MSG91_OTP_TEMPLATE_VAR` | The variable name inside that flow, which MSG91 assigns. Blank = `var1` | MSG91 Phase D | SMS OTP |

Any of these unset → that channel stays on the **log provider** (messages logged, not sent). Email and SMS are independent: email can be live while SMS is still on the log provider.

---

## 4. Message templates to register (owner approves wording)

DLT requires the exact text up front, with variables written as `{#var#}`. Nirogix generates and hashes
the OTP itself (ADR-059), so the OTP template is an ordinary transactional SMS with one variable.

**OTP (Service Implicit) — required first:**
```
Your Nirogix verification code is {#var#}. Valid for 10 minutes. Do not share it with anyone.
```

**Appointment confirmation (transactional) — optional, add when workflow notifications ship (BACKLOG E-8):**
```
Your appointment at {#var#} is confirmed for {#var#}. - Nirogix
```

**Appointment reminder (transactional) — optional:**
```
Reminder: your appointment at {#var#} is on {#var#}. - Nirogix
```

> Keep sender-name references consistent with the approved header. Every template must be linked to the
> Phase B header on DLT before it can be used.

---

## 5. Verification (after Phase E)

- [ ] Backend log shows the MSG91 (not `log`) provider is active for SMS
- [ ] Trigger an OTP send to a real Indian number → SMS arrives from **NIROGX**, reading **exactly** the registered text: `Your Nirogix verification code is <code>. Valid for 10 minutes. Do not share it with anyone.`
- [ ] MSG91 Transaction Logs shows the flow carrying **one variable holding just the code** — not the whole message. A wrong `MSG91_OTP_TEMPLATE_VAR` surfaces here as a blank or rejected variable
- [ ] `verifyOtp` accepts the received code
- [ ] MSG91 → **Transaction Logs** shows the delivered message and cost
- [ ] No `MSG91 sms failed:` errors in the backend logs ([msg91Provider.ts:44](../hms_backend/src/modules/notification/providers/msg91Provider.ts#L44))
- [ ] Add the passing run to `testcases.md` (notifications module) and update `BACKLOG.md` I-1

---

## 6. Who is blocked on whom (summary)

| Step | Owner (🔴) | Developer |
|---|---|---|
| DLT documents (§1A) | Provide | — |
| Signatory + reachable mobile (§1B) | Provide, forward OTPs | — |
| Sender ID + wording approval (§1C, §4) | Approve | Draft |
| LOA / board resolution (§1D) | Sign | Prepare from MSG91 template |
| Wallet funding (§1E) | Approve/pay | — |
| DLT portal forms, header, templates (Phase A–C) | (OTPs only) | Do |
| MSG91 Flow + env wiring (Phase D–E) | — | Do |

**Bottom line:** collect §1 from the owner → the developer can drive Phases A–E, pausing only for the
owner's OTPs, signatures, and wallet funding. Email works today regardless; SMS goes live at the end of Phase E.
