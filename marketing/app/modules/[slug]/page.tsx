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
import { JsonLd } from "../../../components/site/JsonLd";
import { breadcrumbJsonLd, pageMetadata, softwareApplicationJsonLd } from "../../../lib/seo";

const bySlug = Object.fromEntries(CLINIC_MODULES.map((m) => [m.slug, m]));

/**
 * Per-module search intent. Each module page targets the term people actually
 * search for that capability — mapped once here, used in the title and the
 * description, and matching what the page renders (marketing/KNOWLEDGE.md).
 */
const MODULE_SEO: Record<string, { title: string; description: string }> = {
  patients: {
    title: "Patient Management System",
    description:
      "Patient management software for hospitals and clinics: one record per patient with UHID, duplicate detection, family linking, and a complete medical timeline.",
  },
  appointments: {
    title: "Hospital Appointment Management Software",
    description:
      "Hospital appointment management: slot and availability control per doctor, multi-channel booking, reminders, rescheduling, waitlists, and no-show tracking.",
  },
  opd: {
    title: "OPD Management & Patient Check-in Software",
    description:
      "OPD software from check-in to consult: token queues, live waiting lists, doctor-wise flow, and a consultation bill opened automatically at check-in.",
  },
  emr: {
    title: "EMR Software — Clinical Workflow & E-Prescriptions",
    description:
      "EMR for outpatient care: structured SOAP notes, ICD-10 coding, e-prescriptions, and lab orders raised from the consultation itself.",
  },
  pharmacy: {
    title: "Pharmacy Management Software for Hospitals",
    description:
      "Hospital pharmacy management: dispensing against prescriptions, batch and expiry-aware stock, reorder levels, and GST-correct pharmacy billing.",
  },
  laboratory: {
    title: "Laboratory Management System (LIS)",
    description:
      "Laboratory management for hospitals and diagnostic centres: order to signed report, sample tracking, reference ranges, and lab charges on the patient's bill.",
  },
  billing: {
    title: "Hospital Billing Software",
    description:
      "Hospital billing software: one invoice across consultation, pharmacy, and lab, with part payments, GST handling, receipts, and a complete collections trail.",
  },
};

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
  if (!mod) return { title: "Module not found", robots: { index: false, follow: true } };
  const seo = MODULE_SEO[slug];
  return pageMetadata({
    path: `/modules/${slug}`,
    title: seo?.title ?? mod.name,
    description: seo?.description ?? `${mod.name} — ${mod.tagline} Part of the modular HMS platform.`,
  });
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mod = bySlug[slug];
  if (!mod) notFound();

  const related = CLINIC_MODULES.filter((m) => m.slug !== mod.slug);
  const seo = MODULE_SEO[slug];

  return (
    <>
      <JsonLd
        data={softwareApplicationJsonLd({
          name: seo?.title ?? mod.name,
          description: seo?.description ?? mod.tagline,
          path: `/modules/${slug}`,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Modules", path: "/modules" },
          { name: mod.name, path: `/modules/${slug}` },
        ])}
      />
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
