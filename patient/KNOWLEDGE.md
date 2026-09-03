# patient — KNOWLEDGE.md

The Nirogix **patient portal**. Read after root `CLAUDE.md` and `patient/AGENTS.md`.

## Purpose

Patients, on their own origin (`:3002` → `patient.nirogix.com`, ADR-051). Read-only access to the records the hospitals they are registered with already hold for them.

A patient is a **different principal from staff** (ADR-052), not a staff user with fewer permissions. This app shares the design system through `@hms/ui` and the HTTP core through `@hms/client`, and nothing else — a patient must never be one route away from a clinical screen.

## What is built

```
app/
  layout.tsx                 Fonts, @hms/ui styles, no-flash theme, <Providers>, <Toaster>
  providers.tsx              ThemeProvider + SessionProvider
  (auth)/login/page.tsx      Two-step sign-in: contact → one-time code
  (app)/layout.tsx           Session gate + header
  (app)/page.tsx             Hospital picker
  (app)/h/[tenantId]/page.tsx  One hospital: profile, appointments, bills, lab reports
  (public)/layout.tsx        Shell for pages reached WITHOUT a session — no session provider
  (public)/register/[token]/  A hospital’s own registration form (ADR-056)
lib/
  api.ts                     Eight calls. Two sign-in, four reads, two public registration.
  session.tsx                In-memory patient session (NOT the shared staff AuthProvider)
  theme.tsx                  Light/Dark, Nirogix accent — never a hospital's
```

## Rules specific to this app

- **No signup, and the screen says so.** There is no route that links a patient to a record; the hospital does it. The sign-in screen explains that in plain words rather than leaving someone hunting for a button that does not exist.
- **The screen must not reveal who is a patient.** `request-code` answers identically whether or not a contact is registered, so the UI advances to the code step either way. "We don't recognise that number" would undo the server's uniform response.
- **Its own session context, deliberately.** The shared `AuthProvider` in `@hms/client` is built for staff — organization code, password, and an effective permission set. A patient has none of those. Bending it to cover both would put the difference between the two principals inside a component that is about neither.
- **The tenant in the URL is not trusted.** Every read re-checks it against an active link server-side, so editing the address bar reaches nothing.
- **Nothing is stored on the device except the httpOnly refresh cookie.** The access token is in memory only, and the cookie is unreadable from JavaScript and path-scoped to the patient auth routes.
- **The portal never interprets a clinical value.** Abnormal flags are shown as the lab recorded them, next to a line saying a result outside the usual range is not a diagnosis.
- **The public registration form is outside `(app)` on purpose (ADR-056).** Nothing in `(public)` mounts the session provider or the portal navigation, so a page served to a stranger cannot accidentally render something that assumes a signed-in patient. The hospital is named by the backend, resolved from the opaque token in the path — the form never sends a hospital identifier, because there is no field for one. An unknown token, a regenerated one and a hospital with registration switched off all render the same “this link is not active” screen.
- **Submitting the form is not signing up, and the copy says so.** It sends details to the hospital’s front desk; it creates no account, books no appointment and grants no access to records. This is the same rule as the sign-in screen, on the one page most likely to be misread.

## Sessions

**A reload keeps the patient signed in** (F-8). The access token lives in memory only — never `localStorage` — and on mount the portal exchanges an httpOnly refresh cookie for a new one. The cookie is scoped to `/api/v1/patient/auth`, so it is never sent to a staff endpoint, and a staff refresh token is refused on the patient refresh route.

Sessions are stored in their own `patient_sessions` table, rotate on every refresh, and are revoked server-side on sign-out. Signing in on a second device does **not** end the first session — a patient may reasonably use a phone and a laptop.

The signed-in layout distinguishes _restoring_ from _signed out_, and redirects only on the latter; redirecting during the restore attempt would bounce every reload to sign-in.

## Browser security headers (ADR-082)

`proxy.ts` (Next 16’s replacement for `middleware.ts`) mints a per-request nonce and sends the Content-Security-Policy built by `@hms/utils` — `strict-dynamic`, no `unsafe-inline` — plus `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a `Permissions-Policy` that leaves only the microphone (dictation, ADR-070). The root layout is async so it can read that nonce from the `x-nonce` header and stamp it on the one inline script this app owns (the no-flash theme script); **any new inline script needs the same nonce, or it will not run**. Sessions also end after 15 minutes without interaction: this app’s own `SessionProvider` uses the shared `useIdleSignOut` hook from `@hms/client`, because the portal is opened on borrowed phones and hospital kiosks as often as on a personal device. The session model itself stays separate (ADR-052) — only the policy is shared.

## Verify

`npm run dev --workspace=patient`, then `http://localhost:3002`. `npm run typecheck --workspace=patient` and `npm run build --workspace=patient` must pass.
