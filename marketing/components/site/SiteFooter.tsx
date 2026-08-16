import Link from "next/link";
import { BrandMark } from "@hms/ui";
import { Container } from "../ui/primitives";
import { SITE } from "../../lib/site";
import { PORTAL_LOGIN_URL } from "../../lib/portal";

const GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Platform", href: "/platform" },
      { label: "Modules", href: "/modules" },
      { label: "Solutions", href: "/solutions" },
      { label: "Integrations", href: "/integrations" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Security", href: "/security" },
      { label: "Data residency", href: "/security#residency" },
      { label: "Audit trail", href: "/security#audit" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Book a demo", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
    ],
  },
];

export function SiteFooter() {
  const year = 2026; // build-time constant; avoids hydration drift from new Date()
  return (
    <footer className="border-t border-hairline bg-canvas">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <BrandMark size={28} label="" />
              <span className="text-[17px] font-semibold tracking-tight text-ink">
                {SITE.wordmark}
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-subtle">{SITE.tagline}</p>
            <a
              href={PORTAL_LOGIN_URL}
              className="mt-5 inline-block text-sm font-medium text-accent hover:text-accent-hover"
            >
              Go to the Portal
            </a>
          </div>

          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-ink">{group.title}</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-subtle transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-hairline pt-6 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} {SITE.legalName}. All rights reserved.
          </span>
          <span>Built and hosted in India.</span>
        </div>
      </Container>
    </footer>
  );
}
