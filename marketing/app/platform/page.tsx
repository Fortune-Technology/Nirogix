import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Button } from "../../components/ui/Button";
import { Container, SectionHeading } from "../../components/ui/primitives";
import { Reveal } from "../../components/ui/Reveal";
import { ProductFrame } from "../../components/product/ProductFrame";
import { EntitlementsPreview } from "../../components/product/previews";
import { PlatformCoreSection, TrustStrip } from "../../components/home/sections";
import { PLATFORM_PILLARS } from "../../lib/catalogue";
import { PORTAL_LOGIN_URL } from "../../lib/portal";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "One multi-tenant platform: isolated per hospital, modular and independently sellable, multi-branch, and configurable per tenant without code forks.",
};

export default function PlatformPage() {
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Build the core once. Sell the modules independently."
        lede="Every hospital runs on the same secure, multi-tenant platform. What changes per hospital is which modules are turned on, how many branches exist, and how each one is configured."
        actions={
          <>
            <Button href="/contact" size="lg">
              Book a demo
            </Button>
            <Button href={PORTAL_LOGIN_URL} variant="secondary" size="lg">
              Go to the Portal
            </Button>
          </>
        }
      />

      {/* Pillars */}
      <section className="bg-canvas">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-4 sm:grid-cols-2">
            {PLATFORM_PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="rounded-xl border border-hairline bg-surface p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent-subtle text-accent">
                    <Icon size={22} strokeWidth={1.6} />
                  </span>
                  <h3 className="mt-5 text-xl font-medium tracking-tight text-ink">{p.title}</h3>
                  <p className="mt-2 text-[0.975rem] leading-relaxed text-ink-subtle">{p.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Entitlements in practice */}
      <section className="border-t border-hairline bg-surface">
        <Container className="py-20 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionHeading
                title="Entitlements, not forks."
                lede="A module is switched on for a hospital as an entitlement. Enforcement is automatic from the first request: the server checks that the tenant is entitled, then that the user is permitted, before any data is touched."
              />
              <div className="mt-8">
                <Button href="/modules" variant="secondary">
                  Browse the module catalogue
                  <ArrowRight size={17} strokeWidth={1.75} />
                </Button>
              </div>
            </div>
            <Reveal className="min-w-0">
              <ProductFrame path="portal.hms · admin · modules">
                <EntitlementsPreview />
              </ProductFrame>
            </Reveal>
          </div>
        </Container>
      </section>

      <TrustStrip />
      <PlatformCoreSection />
      <CtaSection secondaryLabel="See security" secondaryHref="/security" />
    </>
  );
}
