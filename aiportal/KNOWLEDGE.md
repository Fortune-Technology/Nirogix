# aiportal — KNOWLEDGE.md

The Nirogix **AI Portal**. Read after root `CLAUDE.md` and `aiportal/AGENTS.md`.

## Read this first

**There is no AI capability behind this portal.** Nothing in the PRD, the architecture or any phase authorises one, and `resources/phases.md` puts AI on the postponed list with a condition attached: a CDSCO classification check before any diagnostic-support feature is built (ADR-053).

What exists is the **access boundary**, built first and tested, so that when a capability is scoped it lands behind a door that already works. The landing screen says so in the product's own words. Nothing about AI is marketed — the capability reference keeps every AI phrase on its never-claim list.

## What is built

```
app/
  layout.tsx                Fonts, @hms/ui styles, no-flash theme, <Providers>, <Toaster>
  providers.tsx             ThemeProvider + the SHARED AuthProvider (sign-in is ordinary staff auth)
  (auth)/login/page.tsx     Staff sign-in — no signup, no credential hints
  (app)/layout.tsx          Session gate + `ai.portal.access` gate
  (app)/page.tsx            Landing: states that no capability is enabled
lib/
  api.ts                    One call: POST /ai/portal/session
  auth.ts / theme.tsx       Re-export of the shared session; Light/Dark
components/
  Can.tsx / Forbidden.tsx   Guards with this app's own 403 copy
```

## Three access states

| State | Screen |
|---|---|
| Signed out | `(auth)/login` — the AI Portal landing: what it is, who it is for, the form, **no sign-up**, links back to the Portal and the public site |
| Signed in, not authorised | `components/AccessRestricted` — names the account, explains access is per-account not per-role, offers *Return to Nirogix Portal* and *Sign out* |
| Signed in, authorised | `(app)/page` — states that no AI capability is enabled |

There is deliberately **no "forgot password" link**: self-service reset is not built, so the password field says an administrator issues a new one instead of linking to a route that does not exist.

Outbound links come from `lib/links.ts` (`NEXT_PUBLIC_PORTAL_URL`, `NEXT_PUBLIC_SITE_URL`) — no host in source.

## The boundary

- **A patient can never sign in here.** The backend refuses a patient principal **by type**, before any permission is read (ADR-052) — so this holds even if a patient were later granted a permission by mistake. Frontend route guards are not the control and never will be.
- **`ai.portal.access` is held by every staff role** (ADR-055). The portal is for the whole hospital team plus platform operators — everyone except patients. The key still exists so a hospital can **DENY** it for an individual, and an explicit deny beats the role grant; the *Access restricted* screen now means a deliberate denial rather than the default state.
- **Entry is audited** at notice level. A surface that would process clinical information needs "who opened it, and when" answerable from the start.
- **The gate in `(app)/layout.tsx` is UX.** The single endpoint re-checks the permission server-side, so a user who somehow rendered the shell still gets nothing.

## Why the screen is empty

Deliberately. A disabled "Ask" box, a greyed-out model picker or a "coming soon" panel would be a promise, and this platform's binding rule is that unbuilt work is never presented as product (ADR-038). The screen renders whatever `capabilities` the server returns; that list is empty, and the copy explains why rather than leaving a blank page.

A backend test asserts the list stays empty. **If it fails, an AI capability has been added** — the failure is the prompt to check it went through scope approval, and the CDSCO review if it touches diagnosis or treatment.

## Domain

`nirogix.ai` in production — a separate registrable domain, so its cookie scope is separate by construction rather than by configuration (ADR-051). **The domain is not registered yet** (`BACKLOG.md` F-6), so this portal is development-only regardless of what is built.

## Verify

`npm run dev --workspace=aiportal`, then `http://localhost:3004`. `npm run typecheck --workspace=aiportal` and `npm run build --workspace=aiportal` must pass.
