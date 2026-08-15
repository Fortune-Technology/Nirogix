import type { Metadata } from "next";
import { Check, Plus } from "lucide-react";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Button } from "../../components/ui/Button";
import { Container, SectionHeading } from "../../components/ui/primitives";
import { PACKAGES, PRICING_FAQ } from "../../lib/catalogue";
import { JsonLd } from "../../components/site/JsonLd";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata } from "../../lib/seo";

// Primary intent: "hospital management software price / India". No numbers are
// published (content guardrail), so no Offer/price markup is emitted either.
export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "Hospital Management Software Pricing in India",
  description:
    "HMS pricing follows the modules you enable. Start with a single module, take the clinic bundle, or run the full set, and talk to us for a quote tailored to your hospital.",
});

export default function PricingPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }])} />
      {/* Marks up the FAQ that is rendered further down this page — nothing else. */}
      <JsonLd data={faqJsonLd(PRICING_FAQ)} />
      <PageHeader
        eyebrow="Pricing"
        title="Pay for the modules you turn on."
        lede="There is no one-size plan. Because modules are billed independently, a single-doctor clinic and a hospital group pay very differently. Pick a starting point and we will tailor a quote."
      />

      {/* Packages */}
      <section className="bg-canvas">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-5 lg:grid-cols-3">
            {PACKAGES.map((pkg) => {
              const Icon = pkg.icon;
              const featured = pkg.featured;
              return (
                <div
                  key={pkg.name}
                  className={
                    "flex flex-col rounded-xl p-7 " +
                    (featured
                      ? "bg-surface-ink text-ink-inverse"
                      : "border border-hairline bg-surface text-ink")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        "grid h-11 w-11 place-items-center rounded-lg " +
                        (featured ? "bg-white/10 text-white" : "bg-accent-subtle text-accent")
                      }
                    >
                      <Icon size={22} strokeWidth={1.6} />
                    </span>
                    {featured && (
                      <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-ink">
                        Most popular
                      </span>
                    )}
                  </div>
                  <h3 className="mt-5 text-xl font-medium tracking-tight">{pkg.name}</h3>
                  <p
                    className={
                      "mt-2 text-sm leading-relaxed " +
                      (featured ? "text-white/70" : "text-ink-subtle")
                    }
                  >
                    {pkg.summary}
                  </p>
                  <ul className="mt-6 flex flex-1 flex-col gap-3">
                    {pkg.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5">
                        <Check
                          size={18}
                          strokeWidth={2}
                          className={"mt-0.5 shrink-0 " + (featured ? "text-accent" : "text-accent")}
                        />
                        <span
                          className={
                            "text-sm leading-relaxed " + (featured ? "text-white/85" : "text-ink")
                          }
                        >
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <Button
                      href="/contact"
                      variant={featured ? "accent" : "secondary"}
                      className="w-full"
                    >
                      Talk to sales
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-xl border border-hairline bg-surface p-5">
            <Plus size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-sm leading-relaxed text-ink-muted">
              Every package includes the platform core: tenant isolation, role-based access, audit
              logging, notifications, and financial infrastructure. Add or remove modules at any
              time as your hospital grows.
            </p>
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="border-t border-hairline bg-surface">
        <Container className="py-20 sm:py-24">
          <SectionHeading title="Questions about pricing" />
          <div className="mt-10 flex flex-col gap-3">
            {PRICING_FAQ.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-lg border border-hairline bg-canvas p-6 [&_summary]:cursor-pointer"
              >
                <summary className="flex items-center justify-between gap-4 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="shrink-0 text-ink-faint transition-transform group-open:rotate-45">
                    <Plus size={20} strokeWidth={2} />
                  </span>
                </summary>
                <p className="mt-3 text-[0.975rem] leading-relaxed text-ink-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      <CtaSection
        title="Tell us your modules. We will price it."
        body="Share which modules and how many branches you need, and we will put together a quote and a walkthrough."
        secondaryLabel="Browse modules"
        secondaryHref="/modules"
      />
    </>
  );
}
