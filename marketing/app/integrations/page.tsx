import type { Metadata } from "next";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Container } from "../../components/ui/primitives";
import { INTEGRATION_GROUPS } from "../../lib/catalogue";
import { JsonLd } from "../../components/site/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "../../lib/seo";

// Topical intent (healthcare interoperability standards).
export const metadata: Metadata = pageMetadata({
  path: "/integrations",
  title: "Healthcare Integrations: FHIR, ABDM, DICOM & Payments",
  description:
    "Interoperability for hospital software: HL7 FHIR R4, ICD-10/11, SNOMED CT, LOINC, DICOM and PACS, ABDM and ABHA, DLT SMS and WhatsApp, UPI payments, and Tally export.",
});

export default function IntegrationsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Integrations", path: "/integrations" }])}
      />
      <PageHeader
        eyebrow="Integrations"
        title="Speaks the standards your systems already use."
        lede="The platform is built to interoperate: health data exchange over FHIR, standard clinical coding, imaging, India's digital health rails, and the communication and payment channels hospitals rely on."
      />

      {INTEGRATION_GROUPS.map((group, i) => (
        <section
          key={group.title}
          className={
            i % 2 === 1
              ? "border-t border-hairline bg-surface"
              : "border-t border-hairline bg-canvas"
          }
        >
          <Container className="py-16 sm:py-20">
            <h2 className="mk-heading text-2xl text-ink sm:text-3xl">{group.title}</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.name}
                    className="flex items-start gap-4 rounded-xl border border-hairline bg-surface p-6"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink">
                      <Icon size={22} strokeWidth={1.6} />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-ink">{item.name}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{item.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Container>
        </section>
      ))}

      <CtaSection secondaryLabel="See security" secondaryHref="/security" />
    </>
  );
}
