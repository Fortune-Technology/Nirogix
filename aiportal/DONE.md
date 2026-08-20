# aiportal — DONE.md

Append-only implementation log for the Nirogix AI Portal.

## 2026-08-16 — The access boundary, and nothing behind it (ADR-053, BACKLOG F-4)

**What:** `aiportal/` went from an empty scaffold to a working application on `:3004` — staff sign-in, a permission gate, and a landing screen that states plainly that no AI capability is enabled. That is the whole product, on purpose.

**Why ship a door with no room behind it.** There is no AI capability in approved scope. Building the boundary first means that when one is scoped it arrives behind access control that already exists and has already been tested — rather than the usual order, where the capability ships and the controls follow.

**What the boundary actually enforces:**
- A **patient principal is refused by type** before any permission is read (ADR-052). Knowing the URL achieves nothing, and that holds even if a patient were later granted a permission by mistake.
- **`ai.portal.access` is held by no role.** Only `super_admin`'s WILDCARD reaches it; anyone else needs it granted per person. Signing in successfully is not the same as getting in, and the 403 panel says so instead of showing an empty console.
- **Entry is audited** at notice level, from the start rather than once there is something worth auditing.

**Why the screen is empty rather than suggestive.** A disabled "Ask" box, a greyed-out model picker or a "coming soon" panel would be a promise, and the binding rule is that unbuilt work is never presented as product (ADR-038). The page renders whatever `capabilities` the server returns — an empty list — and the copy explains why. A backend test asserts it stays empty, so adding a capability has to be a conscious change that trips a failing test rather than a quiet edit.

**Uses the shared session provider**, unlike the patient portal: sign-in here is ordinary staff authentication against the same backend, so there is nothing about the session that differs. What differs is the gate, and that lives on the route.

**Testing status:** typecheck and `next build` clean (`/`, `/login`). Backend: 4 tests (99 total). Verified live — hospital admin **403**, doctor **403**, platform owner **200** with `capabilities: []`, patient token **401**, no token **401**, `ai.portal.enter` audit rows at notice severity, and CORS allowed from `http://localhost:3004`.

**Not usable in production regardless:** `nirogix.ai` is not registered (`BACKLOG.md` F-6).

## 2026-08-16 — A real front door, and a real refusal

**What:** The portal previously answered every unauthorised visit with a bare "You don't have AI Portal access" — on an origin with no navigation, so the person was simply stuck. There are three different situations here and one message cannot serve them, so there are now three screens.

**Signed out** — a proper AI Portal landing: what it is, who it is for, the sign-in form, and a link back to the Portal and the public site. **No sign-up**, and the page says so rather than leaving someone hunting for a button. **No "forgot password" link either**: self-service reset is not built, and a link to a route that does not exist is worse than none, so the field states what actually happens — an administrator issues a new password.

**Signed in but not authorised** — a dedicated *Access restricted* screen. It names the account they used (so they can tell whether they signed in with the wrong one), explains that AI access is granted **per account rather than by role** — which is why an administrator account does not include it — says who to ask, and offers **Return to Nirogix Portal** and **Sign out**.

**Signed in and authorised** — the landing screen that states no AI capability is enabled. Unchanged.

None of these is a security control, and the code says so: the backend refuses every unauthorised request regardless, and a patient principal reaches none of them (refused by principal type, ADR-052).

**Also:** the sign-in copy is careful that signing in successfully is not the same as getting in — access is a separate permission held by no role. Better to say that before someone tries than after.

**Kit change:** `PasswordField` gained `hint`, which `Field` already had. The two now behave identically, including `error` replacing `hint` so a field never shows two competing messages.

**Testing status:** typecheck and `next build` clean. Verified live at `:3004/login` — heading, the authorised-users-only explanation, the form, the password hint, the no-sign-up notice, and both outbound links resolving to the configured Portal and marketing origins.


## 2026-08-16 — Access widened to every staff role (ADR-055)

**What:** `ai.portal.access` moved from "no role by default, granted per person" to **held by every system role**. The AI Portal is for the whole hospital team plus platform operators — everyone except patients.

**Why the original default was wrong in practice:** it made the portal unreachable for exactly the people it is for. Every seeded role landed on the *Access restricted* screen, and only `super_admin` got in, incidentally via WILDCARD. It also mis-placed the risk: what must never happen is a **patient** reaching AI tooling, and that is enforced by the principal-type check, not by this permission. The narrow key bought nothing against the real threat while guaranteeing a refusal on first use.

**Unchanged:** patients refused by type, entry audited, `capabilities` empty with a test asserting it stays empty, and a hospital can still DENY the key for one account.

The *Access restricted* screen is still worth having — it now means a deliberate denial rather than the default, which is what a screen like that should mean.

**Testing status:** verified live — all seven hospital roles and the platform owner get **200**; a patient token gets **401** and no token gets **401**. 103 backend tests pass.

## 2026-08-20 — Content-Security-Policy and idle sign-out in the AI Portal (ADR-082)

**What:** the same `proxy.ts` + nonced layout and shared idle sign-out as the other authenticated apps. This app is still a boundary with no capability behind it (ADR-053); it is hardened on the same schedule as the rest rather than being left as the one app without a policy.

**Testing status:** verified live — the landing screen renders under the policy with no violations. Build and typecheck green.
