import type { Metadata } from "next";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Container } from "../../components/ui/primitives";
import { INTEGRATION_GROUPS } from "../../lib/catalogue";
import { AvailabilityBadge, ReleaseNote } from "../../components/site/AvailabilityBadge";
import { JsonLd } from "../../components/site/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "../../lib/seo";

// Topical intent (healthcare interoperability standards).
export const metadata: Metadata = pageMetadata({
  path: "/integrations",
  title: "Healthcare Integrations: FHIR, ABDM, DICOM & Payments",
  description:
    "Where our interoperability stands: ICD-10 coding and DLT-compliant SMS and email today, with HL7 FHIR R4, SNOMED CT, LOINC, DICOM and PACS, ABDM and ABHA, WhatsApp, payment gateways, and Tally export planned.",
});

export default function IntegrationsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Integrations", path: "/integrations" }])}
      />
      <PageHeader
        eyebrow="Integrations"
        title="Built for the standards your systems already use."
        lede="Interoperability is a design commitment, and this page is explicit about where it stands: ICD-10 coding and transactional SMS and email work today; FHIR APIs, ABDM, imaging, WhatsApp, payment gateways, and accounting export are planned scope from our product plan."
      />

      <Container className="pt-2">
        <ReleaseNote />
      </Container>

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
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-ink">{item.name}</h3>
                        <AvailabilityBadge status={item.status} />
                      </div>
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
