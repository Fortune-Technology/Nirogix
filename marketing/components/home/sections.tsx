import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Button } from "../ui/Button";
import { Container, SectionHeading } from "../ui/primitives";
import { Reveal } from "../ui/Reveal";
import { ProductFrame } from "../product/ProductFrame";
import { EntitlementsPreview, AuditPreview } from "../product/previews";
import { AvailabilityBadge, ReleaseNote } from "../site/AvailabilityBadge";
import {
  CLINIC_MODULES,
  PLATFORM_CORE,
  ROLES,
  TRUST_FACTS,
  COUNTS,
  type ModuleEntry,
} from "../../lib/site";

/* -------------------------------------------------------------------------- */
/* Trust strip — honest, architecture-backed facts (no fake logos / customers) */
/* -------------------------------------------------------------------------- */
export function TrustStrip() {
  return (
    <section className="border-y border-hairline bg-surface">
      <Container className="py-8">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_FACTS.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-subtle">{f.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Modular story — the core differentiator, with a real entitlements preview   */
/* -------------------------------------------------------------------------- */
export function ModularSection() {
  return (
    <section className="bg-canvas">
      <Container className="py-20 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal className="order-2 min-w-0 lg:order-1">
            <ProductFrame path="portal.hms · admin · modules">
              <EntitlementsPreview />
            </ProductFrame>
          </Reveal>
          <div className="order-1 lg:order-2">
            <SectionHeading
              eyebrow="The model"
              title="Buy only what you need. Turn on the rest later."
              lede="Each module is installable and billable on its own. A single-doctor clinic can run just patients, appointments, and billing, while a hospital chain runs the full set, all from the same platform."
            />
            <ul className="mt-8 flex flex-col gap-3">
              {[
                "Modules are entitlements per hospital, not code forks.",
                "Entitlement and user access are separate levers.",
                "Add a module the day the hospital is ready for it.",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-ink">
                  <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                  <span className="text-[0.975rem] leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Button href="/modules" variant="secondary">
                Browse all modules
                <ArrowRight size={17} strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Modules bento — the seven clinic-core modules                               */
/* -------------------------------------------------------------------------- */
function ModuleCard({ module, className }: { module: ModuleEntry; className?: string }) {
  const Icon = module.icon;
  return (
    <Link
      href={`/modules/${module.slug}`}
      className={
        "group flex flex-col rounded-xl border border-hairline bg-surface p-6 transition-colors hover:border-accent-border " +
        (className ?? "")
      }
    >
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-ink transition-colors group-hover:bg-accent-subtle group-hover:text-accent">
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-medium tracking-tight text-ink">{module.name}</h3>
        <AvailabilityBadge status={module.status} />
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{module.tagline}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
        Learn more <ArrowRight size={15} strokeWidth={2} />
      </span>
    </Link>
  );
}

export function ModulesBento() {
  const bySlug = Object.fromEntries(CLINIC_MODULES.map((m) => [m.slug, m]));
  return (
    <section className="border-t border-hairline bg-canvas">
      <Container className="py-20 sm:py-24">
        <SectionHeading
          eyebrow="Modules"
          title="Everything a clinic needs on day one."
          lede="The seven core modules cover the full outpatient journey, from the front desk to the pharmacy counter. They are what we have built; the wider catalogue of twenty-five modules and two add-ons is planned scope from our product plan."
        />
        <ReleaseNote className="mt-8 max-w-[46rem]" />
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          {/* overview tile — tinted for bento diversity */}
          <div className="rounded-xl border border-accent-border bg-accent-subtle p-6 sm:col-span-2 lg:col-span-6">
            <p className="text-sm font-medium text-accent">The outpatient journey, end to end</p>
            <p className="mt-3 text-xl leading-snug tracking-tight text-ink">
              Register a patient, book the visit, run the consult, dispense, test, and bill, without
              leaving the platform or re-keying a name.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {CLINIC_MODULES.map((m) => (
                <span
                  key={m.slug}
                  className="rounded-full border border-accent-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted"
                >
                  {m.name.replace(" Management", "").replace(" & Check-in", "")}
                </span>
              ))}
            </div>
          </div>
          <ModuleCard module={bySlug.patients} className="lg:col-span-3" />
          <ModuleCard module={bySlug.appointments} className="lg:col-span-3" />

          <ModuleCard module={bySlug.opd} className="lg:col-span-4" />
          <ModuleCard module={bySlug.emr} className="lg:col-span-4" />
          <ModuleCard module={bySlug.pharmacy} className="lg:col-span-4" />

          <ModuleCard module={bySlug.laboratory} className="lg:col-span-4" />
          <ModuleCard module={bySlug.billing} className="lg:col-span-4" />
          {/* all-modules CTA tile */}
          <Link
            href="/modules"
            className="group flex flex-col justify-between rounded-xl border border-hairline bg-surface-2 p-6 transition-colors hover:border-ink sm:col-span-2 lg:col-span-4"
          >
            <p className="text-lg font-medium tracking-tight text-ink">
              See all {COUNTS.modules} modules
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">
              Nursing, radiology, IPD, OT, insurance, HR, and more, plus telemedicine and ABDM, each
              marked with what is built and what is planned.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
              Explore the catalogue
              <ArrowUpRight
                size={16}
                strokeWidth={2}
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </span>
          </Link>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Security — isolation + audit, with a real audit-trail preview               */
/* -------------------------------------------------------------------------- */
export function SecuritySection() {
  return (
    <section className="border-t border-hairline bg-surface">
      <Container className="py-20 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              title="One tenant can never see another's data."
              lede="Isolation is enforced at the database layer with PostgreSQL row-level security, and it is tested on every module, not assumed. Every meaningful action lands in an append-only audit trail."
            />
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "Row-level isolation per tenant",
                "Append-only, tamper-evident audit",
                "AES-256 at rest, TLS 1.2+ in transit",
                "Hosted in India, kept in-region",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-ink">
                  <Check size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                  <span className="text-sm leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Button href="/security" variant="secondary">
                How we keep data safe
                <ArrowRight size={17} strokeWidth={1.75} />
              </Button>
            </div>
          </div>
          <Reveal className="min-w-0">
            <ProductFrame path="portal.hms · admin · audit log">
              <AuditPreview />
            </ProductFrame>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Roles — horizontal scroll-snap (a different layout family)                  */
/* -------------------------------------------------------------------------- */
export function RolesSection() {
  return (
    <section className="bg-canvas">
      <Container className="py-20 sm:py-24">
        <SectionHeading
          title="Every role sees exactly its own work."
          lede="Permissions are checked on the server for every action. Staff see the modules, screens, and data their role allows, and nothing else."
        />
      </Container>
      {/* full-bleed scroller */}
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
          {ROLES.map((role) => {
            const Icon = role.icon;
            return (
              <div
                key={role.name}
                className="flex min-w-[15rem] max-w-[16rem] shrink-0 snap-start flex-col rounded-xl border border-hairline bg-surface p-5"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-ink">
                  <Icon size={20} strokeWidth={1.6} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{role.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{role.blurb}</p>
              </div>
            );
          })}
        </div>
      </div>
      <Container className="pt-8">
        <Button href="/solutions" variant="ghost">
          See solutions by role and facility
          <ArrowRight size={17} strokeWidth={1.75} />
        </Button>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Platform core — "included with every plan" (divided list, not cards)        */
/* -------------------------------------------------------------------------- */
export function PlatformCoreSection() {
  return (
    <section className="border-t border-hairline bg-canvas">
      <Container className="py-20 sm:py-24">
        <SectionHeading
          eyebrow="Included with every plan"
          title="The platform core, in every hospital."
          lede="These are never a line item. Whatever modules a hospital turns on, they sit on the same secure, multi-tenant foundation."
        />
        <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_CORE.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.name} className="border-t border-hairline pt-5">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface text-accent ring-1 ring-hairline">
                  <Icon size={20} strokeWidth={1.6} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{s.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{s.blurb}</p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
