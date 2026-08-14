import { Button } from "@hms/ui";
import { PORTAL_LOGIN_URL } from "../lib/portal";

const FEATURES: Array<{ title: string; body: string }> = [
  {
    title: "Multi-tenant by design",
    body: "Every hospital's data is isolated at the database layer (PostgreSQL row-level security). One tenant can never see another's records.",
  },
  {
    title: "Role-based access",
    body: "Fine-grained permissions per role, with per-user overrides and time-bound grants. Every action is re-checked on the server.",
  },
  {
    title: "The modules you need",
    body: "Patients, appointments, OPD/EMR, pharmacy, laboratory, and billing — turned on per hospital as entitlements, not forks.",
  },
  {
    title: "India-resident & auditable",
    body: "Data stays in India, and every security-relevant event is written to an immutable, append-only audit trail.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 py-20 text-center sm:py-28">
        <span className="hms-badge hms-badge--brand">For hospitals & clinics</span>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          The hospital management system built for multi-tenant scale
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-fg-muted">
          Run patient records, appointments, pharmacy, lab, and billing in one secure platform — with
          per-hospital isolation, role-based access, and an immutable audit trail.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href={PORTAL_LOGIN_URL}>
            <Button>Go to the Portal</Button>
          </a>
          <a href="#features">
            <Button variant="secondary">Explore features</Button>
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-5xl gap-5 px-5 py-16 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="hms-card">
              <div className="hms-card__body">
                <h2 className="font-semibold text-fg">{f.title}</h2>
                <p className="mt-1.5 text-sm text-fg-muted">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 py-16 text-center">
        <h2 className="text-2xl font-semibold text-fg">Already have an account?</h2>
        <p className="mt-2 text-fg-muted">Sign in to your hospital&apos;s workspace.</p>
        <a href={PORTAL_LOGIN_URL} className="mt-5 inline-block">
          <Button>Staff sign in</Button>
        </a>
      </section>
    </>
  );
}
