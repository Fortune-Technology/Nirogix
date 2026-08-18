import type { Metadata } from "next";
import {
  DatabaseZap,
  Building2,
  ScrollText,
  Lock,
  KeyRound,
  ShieldAlert,
  HardDriveDownload,
  EyeOff,
  CreditCard,
} from "lucide-react";
import { PageHeader } from "../../components/site/PageHeader";
import { CtaSection } from "../../components/site/CtaSection";
import { Container, SectionHeading } from "../../components/ui/primitives";
import { Reveal } from "../../components/ui/Reveal";
import { ProductFrame } from "../../components/product/ProductFrame";
import { AuditPreview } from "../../components/product/previews";
import { JsonLd } from "../../components/site/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "../../lib/seo";

// Topical intent (data protection / residency) — no location or commercial terms here.
export const metadata: Metadata = pageMetadata({
  path: "/security",
  title: "Security, Tenant Isolation & India Data Residency",
  description:
    "How Nirogix protects hospital data: PostgreSQL row-level tenant isolation, India-resident hosting, an immutable audit trail, encryption in transit and at rest, and least-privilege access.",
});

// Split deliberately (rules.md → Marketing Content & Claim Accuracy): `enforced` is
// what the product does today; `commitment` is a standard from resources/architecture.md
// that becomes verifiable at deployment, and is never written as already proven.
const PRACTICES: { name: string; icon: typeof Lock; body: string; commitment?: boolean }[] = [
  {
    name: "Role-based access",
    icon: KeyRound,
    body: "Fine-grained permissions, per-user overrides, and time-bound grants. Explicit deny always wins, and every endpoint re-checks on the server.",
  },
  {
    name: "Validated and rate-limited",
    icon: ShieldAlert,
    body: "Every request is schema-validated at the server boundary, and credential routes are rate-limited tighter than ordinary reads.",
  },
  {
    name: "Encryption everywhere",
    icon: Lock,
    commitment: true,
    body: "AES-256 at rest and TLS 1.2+ in transit is the platform's encryption standard, applied at deployment.",
  },
  {
    name: "Backups and recovery",
    icon: HardDriveDownload,
    commitment: true,
    body: "Automated backups with defined recovery objectives. The restore drill runs against real infrastructure before go-live.",
  },
  {
    name: "PII masking",
    icon: EyeOff,
    commitment: true,
    body: "Personal data masked in logs and outside production, on a least-privilege architecture.",
  },
  {
    name: "PCI-aligned payments",
    icon: CreditCard,
    commitment: true,
    body: "The payment gateway is planned scope. When it ships, card data is never stored on the platform and handling follows PCI DSS-aligned practice.",
  },
];

const ALIGNED = [
  "Digital Personal Data Protection Act (DPDP), 2023",
  "Ayushman Bharat Digital Mission (ABDM)",
  "GST and e-invoicing for billing",
  "Telemedicine Practice Guidelines, 2020",
];

export default function SecurityPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Security", path: "/security" }])} />
      <PageHeader
        eyebrow="Security & trust"
        title="Health data, protected at the layer that matters."
        lede="Security is built into the platform, not added on. Isolation is enforced in the database, every action is auditable, and data stays in India."
      />

      {/* Isolation */}
      <section id="isolation" className="bg-canvas">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-accent-subtle text-accent">
                <DatabaseZap size={24} strokeWidth={1.6} />
              </span>
              <h2 className="mk-heading mt-5 text-2xl text-ink sm:text-3xl">
                One tenant can never reach another.
              </h2>
            </div>
            <div className="lg:col-span-2">
              <p className="text-lg leading-relaxed text-ink-muted">
                Tenant isolation is enforced with PostgreSQL row-level security. A hospital’s data is
                unreachable from any other tenant, and that isolation is tested on every module, not
                assumed. Tenant context comes only from the authenticated session, never from client
                input, so a request cannot ask for another hospital’s data.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Residency */}
      <section id="residency" className="border-t border-hairline bg-surface">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-accent-subtle text-accent">
                <Building2 size={24} strokeWidth={1.6} />
              </span>
              <h2 className="mk-heading mt-5 text-2xl text-ink sm:text-3xl">Data stays in India.</h2>
            </div>
            <div className="lg:col-span-2">
              <p className="text-lg leading-relaxed text-ink-muted">
                The platform is built to run on E2E Networks, an India-headquartered,
                MeitY-empanelled cloud provider, with health data kept in-region and file storage
                pinned to an India jurisdiction. Residency is a deliberate design decision for
                hospitals that need their patient data to stay in the country, taken ahead of any
                legal requirement rather than in response to one.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Audit */}
      <section id="audit" className="border-t border-hairline bg-canvas">
        <Container className="py-20 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-accent-subtle text-accent">
                <ScrollText size={24} strokeWidth={1.6} />
              </span>
              <h2 className="mk-heading mt-5 text-2xl text-ink sm:text-3xl">
                Every meaningful action is on the record.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-muted">
                Security-relevant events are written to an append-only, tamper-evident audit trail.
                Entitlement, permission-override, and audit records are never physically deleted, so
                you can always answer who did what, and when.
              </p>
            </div>
            <Reveal className="min-w-0">
              <ProductFrame path="portal.hms · admin · audit log">
                <AuditPreview />
              </ProductFrame>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Practices */}
      <section className="border-t border-hairline bg-surface">
        <Container className="py-20 sm:py-24">
          <SectionHeading
            title="Security practices"
            lede="What the product enforces today, and what is a standard we hold ourselves to at deployment. We label which is which."
          />
          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {PRACTICES.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.name} className="border-t border-hairline pt-5">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface text-accent ring-1 ring-hairline">
                    <Icon size={20} strokeWidth={1.6} />
                  </span>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{p.name}</h3>
                    <span
                      className={
                        "rounded-full px-2.5 py-0.5 text-xs font-medium " +
                        (p.commitment
                          ? "border border-hairline bg-surface-2 text-ink-muted"
                          : "border border-accent-border bg-accent-subtle text-accent")
                      }
                    >
                      {p.commitment ? "Commitment" : "Enforced today"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{p.body}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* Designed for (honest, no certification claims) */}
      <section className="border-t border-hairline bg-canvas">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-x-16 gap-y-8 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <h2 className="mk-heading text-2xl text-ink sm:text-3xl">
                Designed for India’s regulatory landscape.
              </h2>
            </div>
            <div className="lg:col-span-2">
              <p className="text-lg leading-relaxed text-ink-muted">
                The platform is built to align with the frameworks that matter to Indian healthcare:
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {ALIGNED.map((item) => (
                  <li
                    key={item}
                    className="rounded-lg border border-hairline bg-surface px-4 py-3 text-sm text-ink"
                  >
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm leading-relaxed text-ink-subtle">
                These describe how the platform is designed and aligned. They are not claims of
                formal certification, audit, or accreditation, and no third party has certified them.
                We are happy to walk your compliance team through our controls during onboarding.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <CtaSection secondaryLabel="See the platform" secondaryHref="/platform" />
    </>
  );
}
