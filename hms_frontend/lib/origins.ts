/**
 * The other Nirogix applications' origins, from configuration (ADR-042, ADR-051).
 *
 * Five frontends means the Portal occasionally has to name one of the others. Every
 * such host lives here and nowhere else, so a deployment points them at
 * `https://admin.nirogix.com` / `https://patient.nirogix.com` without touching code —
 * the rule `resources/domains.md` exists to enforce.
 *
 * The two are used for opposite purposes, which is worth keeping visible:
 * - `ADMIN_ORIGIN` **restricts** who may hand this tab a support session. It is never
 *   used to reach out to the admin console.
 * - `PATIENT_ORIGIN` **composes** the public registration link a hospital prints on its
 *   QR poster (ADR-056). The link is public by design; the token in it is what the
 *   backend resolves, and this app never sees a patient's session.
 */

const clean = (value: string) => value.replace(/\/$/, "");

export const ADMIN_ORIGIN = clean(process.env.NEXT_PUBLIC_ADMIN_ORIGIN ?? "http://localhost:3002");

export const PATIENT_ORIGIN = clean(process.env.NEXT_PUBLIC_PATIENT_URL ?? "http://localhost:3003");
