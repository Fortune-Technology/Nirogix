import type { Metadata } from "next";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Container, SectionHeading } from "../../components/ui/primitives";
import { JsonLd } from "../../components/site/JsonLd";
import { SpecializationGrid } from "../../components/specialties";
import { FEATURED_SPECIALTIES, SPECIALTIES, SPECIALTY_PROMISE } from "../../lib/specialties";
import { breadcrumbJsonLd, pageMetadata } from "../../lib/seo";

// Primary intent: hospital software buyers searching for their own specialty.
export const metadata: Metadata = pageMetadata({
  path: "/specialties",
  title: "Hospital Management Software by Specialty",
  description:
    "One platform, configured per specialty: cardiology, dentistry, pediatrics, gynecology, physiotherapy, radiology and more. See how configurable modules, templates, schedules and billing map to each specialty's workflow.",
});

const others = SPECIALTIES.filter((s) => !s.featured);

export default function SpecialtiesPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Specialties", path: "/specialties" },
        ])}
      />
      <PageHeader eyebrow={SPECIALTY_PROMISE.eyebrow} title={SPECIALTY_PROMISE.title} lede={SPECIALTY_PROMISE.lede} />

      <section className="bg-canvas">
        <Container className="py-20 sm:py-24">
          <SectionHeading
            title="Specialties with a detailed workflow breakdown"
            lede="Each of these has its own page explaining the operational challenge and the modules that answer it."
          />
          <div className="mt-10">
            <SpecializationGrid specialties={FEATURED_SPECIALTIES} />
          </div>
        </Container>
      </section>

      <section className="bg-surface">
        <Container className="py-20 sm:py-24">
          <SectionHeading
            title="Also supported"
            lede="The same platform, configured differently. Ask for a walkthrough of any of these and we will show the actual setup rather than a slide."
          />
          <div className="mt-10">
            <SpecializationGrid specialties={others} />
          </div>
          <p className="mt-10 max-w-3xl text-sm leading-relaxed text-ink-subtle">{SPECIALTY_PROMISE.disclaimer}</p>
        </Container>
      </section>

      <CtaSection />
    </>
  );
}
