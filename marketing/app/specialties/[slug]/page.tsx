import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "../../../components/site/PageHeader";
import { CtaSection } from "../../../components/site/CtaSection";
import { Button } from "../../../components/ui/Button";
import { Container, SectionHeading } from "../../../components/ui/primitives";
import { JsonLd } from "../../../components/site/JsonLd";
import {
  SpecializationFeatureList,
  SpecializationGrid,
  SpecializationModules,
} from "../../../components/specialties";
import { FEATURED_SPECIALTIES, SPECIALTY_PROMISE, specialtyBySlug } from "../../../lib/specialties";
import { breadcrumbJsonLd, pageMetadata, softwareApplicationJsonLd } from "../../../lib/seo";

/**
 * A page per *featured* specialty only — those with genuinely differentiated
 * content (challenges, module mapping, configuration). Specialties without that
 * depth stay on the index rather than becoming thin, near-duplicate pages
 * (rules.md → SEO / AEO / GEO Rules).
 */
export function generateStaticParams() {
  return FEATURED_SPECIALTIES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const specialty = specialtyBySlug(slug);
  if (!specialty) return { title: "Specialty not found", robots: { index: false, follow: true } };
  return pageMetadata({
    path: `/specialties/${slug}`,
    title: `Hospital Management Software for ${specialty.name}`,
    description: `${specialty.summary} See how the HMS supports ${specialty.name.toLowerCase()} through configurable patient records, appointments, consultations, ${specialty.modules?.includes("Laboratory") ? "diagnostics, " : ""}billing and reporting.`,
  });
}

export default async function SpecialtyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const specialty = specialtyBySlug(slug);
  if (!specialty?.featured) notFound();

  const related = FEATURED_SPECIALTIES.filter((s) => s.slug !== specialty.slug);

  return (
    <>
      <JsonLd
        data={softwareApplicationJsonLd({
          name: `HMS for ${specialty.name}`,
          description: specialty.summary,
          path: `/specialties/${specialty.slug}`,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Specialties", path: "/specialties" },
          { name: specialty.name, path: `/specialties/${specialty.slug}` },
        ])}
      />

      <PageHeader
        eyebrow="Specialty"
        title={`Hospital management software for ${specialty.name.toLowerCase()}`}
        lede={specialty.summary}
        actions={
          <>
            <Button href="/contact" size="lg">
              Book a demo
            </Button>
            <Button href="/specialties" variant="secondary" size="lg">
              All specialties
            </Button>
          </>
        }
      />

      {specialty.challenges ? (
        <section className="bg-canvas">
          <Container className="py-20 sm:py-24">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <SpecializationFeatureList title="What makes this specialty operationally hard" items={specialty.challenges} />
              {specialty.support ? (
                <SpecializationFeatureList title="How the platform supports it" items={specialty.support} />
              ) : null}
            </div>
          </Container>
        </section>
      ) : null}

      {specialty.modules ? (
        <section className="bg-surface">
          <Container className="py-20 sm:py-24">
            <SectionHeading
              title="The modules a practice like this turns on"
              lede="Modules are entitlements: enable what you need now, add the rest when you are ready. Nothing is re-implemented per specialty."
            />
            <div className="mt-8">
              <SpecializationModules modules={specialty.modules} />
            </div>
            <Link
              href="/modules"
              className="mt-8 inline-flex items-center gap-1.5 text-[0.975rem] font-medium text-accent hover:underline"
            >
              See the full module catalogue <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </Container>
        </section>
      ) : null}

      {specialty.configuration ? (
        <section className="bg-canvas">
          <Container className="py-20 sm:py-24">
            <SectionHeading
              title="What gets configured for you"
              lede="Setup is data, not development, which is why a new specialty does not need a new build."
            />
            <div className="mt-8">
              <SpecializationModules modules={specialty.configuration} />
            </div>
            <p className="mt-10 max-w-3xl text-sm leading-relaxed text-ink-subtle">{SPECIALTY_PROMISE.disclaimer}</p>
          </Container>
        </section>
      ) : null}

      <section className="bg-surface">
        <Container className="py-20 sm:py-24">
          <SectionHeading title="Other specialties" />
          <div className="mt-10">
            <SpecializationGrid specialties={related} />
          </div>
        </Container>
      </section>

      <CtaSection />
    </>
  );
}
