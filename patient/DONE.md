# patient — DONE.md

Append-only implementation log for the Nirogix patient portal.

## 2026-08-16 — The patient portal (ADR-052, BACKLOG F-3)

**What:** `patient/` went from an empty scaffold to a working portal on `:3003`, against the identity model shipped the same day. Two-step sign-in (contact → one-time code), a hospital picker, and per-hospital records: the patient's own details, appointments, bills, and resulted laboratory reports. Read-only throughout — the portal writes nothing.

**Its own session context, not the shared one.** `@hms/client`'s `AuthProvider` is built for staff: organization code, password, and an effective permission set from `/rbac/permissions`. A patient has none of those. Reusing it would have meant putting the difference between two principals inside a component that is about neither, so the portal has a small `SessionProvider` and still shares the HTTP core, error classification and feedback rules.

**Copy decisions that are really security decisions:**
- The sign-in screen advances to the code step **whether or not the contact is registered**, because the server answers uniformly. "We don't recognise that number" would turn sign-in into a way to ask who is a patient somewhere.
- It states plainly that **there is no signup** and that the hospital grants access, rather than leaving someone hunting for a button that does not exist.
- Lab results carry a line saying a value outside the usual range is not a diagnosis. The portal shows the lab's own flag and interprets nothing.

**In the Portal:** a **Portal access** card on the patient screen, which is the only way a link is ever created. Its copy is careful that granting access is not the same as signing someone in — the patient still has to verify the contact. Withdrawing uses the same permission as granting.

**Known limitation, stated rather than hidden:** a reload signs the patient out. Verification mints an access token and no refresh cookie, because `sessions` is foreign-keyed to `users` and a patient identity is not a user. Recorded as `BACKLOG.md` F-8, and the portal tells the patient their session ends with the tab instead of appearing to fail at random.

**Testing status:** typecheck and `next build` clean (`/`, `/login`, `/h/[tenantId]`). Sign-in renders with the shared `BrandMark`, `Field` and toast region; the backend answers a CORS preflight from `http://localhost:3003` with that exact origin. The flow behind the screens was verified end to end at the API level (see `hms_backend/DONE.md`): grant → code → verify → read own record → **403** at an unlinked hospital → replay **401** → patient token **401** on staff routes → staff token **401** on patient routes. Manual cases PAT-01…PAT-24 in `testcases.md`.

## 2026-08-16 — The session survives a reload (BACKLOG F-8)

**What:** The known limitation is gone. `SessionProvider` now exchanges an httpOnly refresh cookie for a new access token on mount, so a reload keeps the patient signed in. The access token still lives **in memory only** — never `localStorage`, which is the right default for a surface carrying medical records — and the cookie is scoped to `/api/v1/patient/auth`, so it is not even sent to a staff endpoint.

**The layout had to learn to wait.** It previously redirected the moment `signedIn` was false, which after this change would have bounced every reload to sign-in before the restore attempt finished — undoing the whole point. It now distinguishes *restoring* from *signed out* and only redirects on the latter.

Signing out calls the server, so the refresh token is **revoked** rather than merely dropped by the browser.

The hospital picker's note changed with the behaviour: it no longer says the session ends with the tab, and instead reminds the patient to sign out on a shared computer — which is now the thing that actually matters.

**Testing status:** typecheck and `next build` clean. The flow was verified end to end against the API (see `hms_backend/DONE.md`), including that replaying a previous refresh cookie returns 401.

## 2026-08-16 — The public registration form (ADR-056)

**What:** `/register/[token]` in a new `(public)` route group — deliberately outside `(app)`, so nothing here mounts the session provider or the portal navigation and a public page cannot accidentally render something that assumes a signed-in patient.

The URL carries an opaque token and nothing else. The hospital's name comes back from the backend, which resolved it from that token; the form never sends a hospital identifier, because there is no field for one. An unknown token, a regenerated one and a hospital with registration switched off all render the same "this link is not active" screen — the page must not reveal which it was.

The copy does the work the security model needs it to do. Submitting sends details to the front desk; it does not create an account, book an appointment, or grant access to records, and the success screen says so rather than leaving the person to assume they are registered. Date of birth uses `DateField` (ADR-048) — never a native date input, which renders in the browser's locale — and the free-text note asks the person **not** to put medical details in it.

**Testing status:** typecheck and `next build` clean. Verified end to end against CityCare's real token: the submission appeared in that hospital's queue and nowhere else, and became patient `UHID-000005` only after reception approved it.

## 2026-08-20 — Content-Security-Policy and idle sign-out in the patient portal (ADR-082)

**What:** `proxy.ts` + a nonced root layout, and idle sign-out wired into this app’s own `SessionProvider` through the shared `useIdleSignOut` hook. The session model stays separate (ADR-052) — only the policy is shared, because this portal is opened on borrowed phones and hospital kiosks as often as on a personal device.

**Testing status:** verified live — the sign-in screen renders under the policy with no violations, and the idle timer starts only once a session exists. Build and typecheck green.
