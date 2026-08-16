import type { Metadata } from "next";
import { Target, ShieldCheck, Layers, MapPin } from "lucide-react";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Container, SectionHeading } from "../../components/ui/primitives";
import { SITE } from "../../lib/site";
import { JsonLd } from "../../components/site/JsonLd";
import { COMPANY, breadcrumbJsonLd, localBusinessJsonLd, pageMetadata } from "../../lib/seo";

// Company intent, including where the team is based.
export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: `About ${SITE.legalName}`,
  description: `${SITE.legalName} builds a multi-tenant, India-resident hospital management system from ${COMPANY.city}, ${COMPANY.region}, so hospitals buy and run only the modules they need.`,
});

const PRINCIPLES = [
  {
    icon: Layers,
    title: "Buy what you need",
    body: "Modules are independently sellable. A clinic should not pay for a hospital's feature set, and a hospital should not be held back by a clinic's.",
  },
  {
    icon: ShieldCheck,
    title: "Isolation is not optional",
    body: "One tenant can never see another's data. We test that on every module, because in healthcare it is the whole promise.",
  },
  {
    icon: MapPin,
    title: "Built for India",
    body: "India-resident hosting, Indian clinical coding and compliance frameworks, and rupee billing built around how Indian hospitals collect, with room to expand later.",
  },
  {
    icon: Target,
    title: "One platform, many hospitals",
    body: "We build the core once and let each hospital configure it, so improvements reach everyone from the same codebase.",
  },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])} />
      {/* Rendered only once a verified postal address + phone exist (lib/seo.ts). */}
      <JsonLd data={localBusinessJsonLd()} />
      <PageHeader
        eyebrow="About"
        title="A hospital platform that scales by the module."
        lede={`${SITE.legalName} builds a multi-tenant hospital management system for Indian healthcare, so a single-doctor clinic and a multi-branch hospital can run on the same platform and pay only for what they use.`}
      />

      {/* Mission */}
      <section className="bg-canvas">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-x-16 gap-y-8 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <h2 className="mk-heading text-2xl text-ink sm:text-3xl">Why we build it</h2>
            </div>
            <div className="lg:col-span-2">
              <p className="text-lg leading-relaxed text-ink-muted">
                Hospital software has usually meant a choice between rigid all-in-one suites that
                clinics cannot afford and thin tools that hospitals outgrow. We think there is a
                better shape: a single, secure, multi-tenant platform where every capability is a
                module a hospital can turn on when it is ready. That way a clinic starts small, a
                hospital runs the full set, and both get the same isolation, audit, and security
                underneath.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Principles */}
      <section className="border-t border-hairline bg-surface">
        <Container className="py-20 sm:py-24">
          <SectionHeading title="What we hold to" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="rounded-xl border border-hairline bg-surface p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent-subtle text-accent">
                    <Icon size={22} strokeWidth={1.6} />
                  </span>
                  <h3 className="mt-5 text-lg font-medium tracking-tight text-ink">{p.title}</h3>
                  <p className="mt-2 text-[0.975rem] leading-relaxed text-ink-subtle">{p.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Company */}
      <section className="border-t border-hairline bg-canvas">
        <Container className="py-16 sm:py-20">
          <div className="rounded-2xl border border-hairline bg-surface p-8 sm:p-10">
            <p className="text-sm font-medium text-accent">The company</p>
            <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink">
              The platform is built by {SITE.legalName}. We are a product team focused on healthcare
              software for the Indian market. To talk to us about a pilot at your hospital, book a
              demo and we will take it from there.
            </p>
          </div>
        </Container>
      </section>

      <CtaSection secondaryLabel="Explore the platform" secondaryHref="/platform" />
    </>
  );
}
