import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Puzzle } from "lucide-react";
import { PageHeader } from "../../../components/site/PageHeader";
import { CtaSection } from "../../../components/site/CtaSection";
import { Button } from "../../../components/ui/Button";
import { Container, Pill, SectionHeading } from "../../../components/ui/primitives";
import { Reveal } from "../../../components/ui/Reveal";
import { ProductFrame } from "../../../components/product/ProductFrame";
import { AppointmentsPreview } from "../../../components/product/previews";
import { CLINIC_MODULES } from "../../../lib/site";

const bySlug = Object.fromEntries(CLINIC_MODULES.map((m) => [m.slug, m]));

export function generateStaticParams() {
  return CLINIC_MODULES.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const mod = bySlug[slug];
  if (!mod) return { title: "Module not found" };
  return {
    title: mod.name,
    description: `${mod.name} — ${mod.tagline} Part of the modular HMS platform.`,
  };
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mod = bySlug[slug];
  if (!mod) notFound();

  const related = CLINIC_MODULES.filter((m) => m.slug !== mod.slug);

  return (
    <>
      <PageHeader
        eyebrow="Module"
        title={mod.name}
        lede={mod.tagline}
        actions={
          <>
            <Button href="/contact" size="lg">
              Book a demo
            </Button>
            <Button href="/modules" variant="secondary" size="lg">
              All modules
            </Button>
          </>
        }
      />

      {/* Capabilities */}
      <section className="bg-canvas">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              {mod.standalone && (
                <Pill icon={<Puzzle size={15} strokeWidth={1.75} className="text-accent" />}>
                  Available as a standalone module
                </Pill>
              )}
              <h2 className="mk-heading mt-5 text-2xl text-ink sm:text-3xl">What it does</h2>
              <ul className="mt-6 flex flex-col gap-4">
                {mod.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                    <span className="text-[0.975rem] leading-relaxed text-ink">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {slug === "appointments" ? (
              <Reveal className="min-w-0">
                <ProductFrame path={`portal.hms · ${mod.slug}`}>
                  <AppointmentsPreview />
                </ProductFrame>
              </Reveal>
            ) : (
              <div className="rounded-xl border border-accent-border bg-accent-subtle p-8">
                <p className="text-sm font-medium text-accent">On the platform core</p>
                <p className="mt-3 text-lg leading-relaxed text-ink">
                  {mod.name} runs on the shared platform: tenant isolation, role-based access, audit
                  logging, and notifications are already there. You enable the module and it works
                  with the rest of the hospital's data.
                </p>
                <Button href="/platform" variant="secondary" className="mt-6">
                  See the platform core
                  <ArrowRight size={17} strokeWidth={1.75} />
                </Button>
              </div>
            )}
          </div>
        </Container>
      </section>

      {/* Related */}
      <section className="border-t border-hairline bg-surface">
        <Container className="py-16 sm:py-20">
          <SectionHeading title="Works with the rest of the journey" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((m) => {
              const Icon = m.icon;
              return (
                <Link
                  key={m.slug}
                  href={`/modules/${m.slug}`}
                  className="group flex items-center gap-3 rounded-xl border border-hairline bg-surface p-4 transition-colors hover:border-accent-border"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink transition-colors group-hover:bg-accent-subtle group-hover:text-accent">
                    <Icon size={19} strokeWidth={1.6} />
                  </span>
                  <span className="text-sm font-medium text-ink">{m.name}</span>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      <CtaSection secondaryLabel="Browse all modules" secondaryHref="/modules" />
    </>
  );
}
