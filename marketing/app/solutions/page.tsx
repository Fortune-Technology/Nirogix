import type { Metadata } from "next";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Container, SectionHeading } from "../../components/ui/primitives";
import { ROLES, FACILITIES } from "../../lib/site";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "HMS by role and by facility: receptionists, doctors, pharmacists, lab technicians, cashiers, and admins, across clinics, nursing homes, hospitals, diagnostic centres, and pharmacies.",
};

export default function SolutionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Solutions"
        title="Built around how your team actually works."
        lede="The platform maps to real roles and real facilities. Each person sees the work their role allows, and each facility runs the modules that fit its size."
      />

      {/* By role */}
      <section id="by-role" className="bg-canvas">
        <Container className="py-20 sm:py-24">
          <SectionHeading
            title="By role"
            lede="Permissions are enforced on the server for every action. Staff see only the modules, screens, and data their role permits."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <div key={role.name} className="rounded-xl border border-hairline bg-surface p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-ink">
                    <Icon size={22} strokeWidth={1.6} />
                  </span>
                  <h3 className="mt-4 text-lg font-medium tracking-tight text-ink">{role.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{role.blurb}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* By facility */}
      <section id="by-facility" className="border-t border-hairline bg-surface">
        <Container className="py-20 sm:py-24">
          <SectionHeading
            title="By facility"
            lede="From a single-doctor clinic to a multi-branch hospital group, the same platform scales by turning modules on."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FACILITIES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.name} className="rounded-xl border border-hairline bg-surface p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent-subtle text-accent">
                    <Icon size={22} strokeWidth={1.6} />
                  </span>
                  <h3 className="mt-4 text-lg font-medium tracking-tight text-ink">{f.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{f.blurb}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      <CtaSection secondaryLabel="Explore modules" secondaryHref="/modules" />
    </>
  );
}
