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
