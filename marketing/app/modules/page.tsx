import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Container } from "../../components/ui/primitives";
import { MODULE_GROUPS, CATALOGUE_ADDONS } from "../../lib/catalogue";
import { COUNTS, type ModuleEntry } from "../../lib/site";
import { JsonLd } from "../../components/site/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "../../lib/seo";

// Primary intent: "HMS software for hospitals" — the catalogue page.
export const metadata: Metadata = pageMetadata({
  path: "/modules",
  title: "HMS Software Modules for Hospitals",
  description:
    "The full HMS module catalogue: patient management, appointments, OPD, EMR, pharmacy, laboratory, and hospital billing, plus the hospital-grade and operational modules and ABDM add-ons.",
});

function CatalogueCard({ module }: { module: ModuleEntry }) {
  const Icon = module.icon;
  const inner = (
    <>
      <span
        className={
          "grid h-11 w-11 place-items-center rounded-lg transition-colors " +
          (module.flagship
            ? "bg-surface-2 text-ink group-hover:bg-accent-subtle group-hover:text-accent"
            : "bg-surface-2 text-ink-muted")
        }
      >
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-ink">{module.name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{module.tagline}</p>
      {module.flagship && (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
          Learn more <ArrowRight size={15} strokeWidth={2} />
        </span>
      )}
    </>
  );

  const cardClass =
    "flex flex-col rounded-xl border border-hairline bg-surface p-6 transition-colors";

  return module.flagship ? (
    <Link href={`/modules/${module.slug}`} className={`group ${cardClass} hover:border-accent-border`}>
      {inner}
    </Link>
  ) : (
    <div className={cardClass}>{inner}</div>
  );
}

export default function ModulesPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Modules", path: "/modules" }])} />
      <PageHeader
        eyebrow="Modules"
        title={`${COUNTS.modules} modules. Turn on only what you need.`}
        lede="Every module installs and bills on its own, on top of the shared platform core. Start with one, or run the full set. The seven clinic-core modules are available now; hospital-grade and operational modules extend the platform as you grow."
      />

      {MODULE_GROUPS.map((group, i) => (
        <section
          key={group.id}
          id={group.id}
          className={
            i % 2 === 1
              ? "border-t border-hairline bg-surface"
              : "border-t border-hairline bg-canvas"
          }
        >
          <Container className="py-16 sm:py-20">
            <div className="max-w-2xl">
              <h2 className="mk-heading text-2xl text-ink sm:text-3xl">{group.title}</h2>
              <p className="mk-lede mt-3 text-lg leading-relaxed">{group.blurb}</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.modules.map((m) => (
                <CatalogueCard key={m.slug} module={m} />
              ))}
            </div>
          </Container>
        </section>
      ))}

      {/* Add-ons */}
      <section className="border-t border-hairline bg-canvas">
        <Container className="py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="mk-heading text-2xl text-ink sm:text-3xl">Add-ons</h2>
            <p className="mk-lede mt-3 text-lg leading-relaxed">
              Capabilities that layer onto the clinical modules when a hospital needs them.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {CATALOGUE_ADDONS.map((m) => (
              <CatalogueCard key={m.slug} module={m} />
            ))}
          </div>
        </Container>
      </section>

      <CtaSection secondaryLabel="See how pricing works" secondaryHref="/pricing" />
    </>
  );
}
