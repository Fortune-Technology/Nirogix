import type { Metadata } from "next";
import { CalendarClock, Route, Headset } from "lucide-react";
import { Container } from "../../components/ui/primitives";
import { ContactForm } from "../../components/site/ContactForm";
import { PORTAL_LOGIN_URL } from "../../lib/portal";
import { JsonLd } from "../../components/site/JsonLd";
import { COMPANY, breadcrumbJsonLd, localBusinessJsonLd, pageMetadata } from "../../lib/seo";

// Location intent: hospital software buyers searching locally (Ahmedabad / Gujarat).
export const metadata: Metadata = pageMetadata({
  path: "/contact",
  title: `Book a Demo: Hospital Software in ${COMPANY.city}`,
  description: `Book a walkthrough of Nirogix with our team in ${COMPANY.city}, ${COMPANY.region}. We map your clinic or hospital onto the platform module by module. Onboarding is guided, not self-serve.`,
});

const STEPS = [
  {
    icon: CalendarClock,
    title: "A walkthrough, not a sales pitch",
    body: "We show the platform running the modules that fit your facility, with your workflows in mind.",
  },
  {
    icon: Route,
    title: "A mapping of your hospital",
    body: "Branches, roles, and modules, laid out so you can see exactly what your setup would look like.",
  },
  {
    icon: Headset,
    title: "Guided onboarding",
    body: "If it is a fit, our team sets up your tenant, branches, users, and modules with you.",
  },
];

export default function ContactPage() {
  return (
    <section className="bg-canvas">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])} />
      {/* Rendered only once a verified postal address + phone exist (lib/seo.ts). */}
      <JsonLd data={localBusinessJsonLd()} />
      <Container className="py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* info */}
          <div className="max-w-lg">
            <p className="text-sm font-medium text-accent">Book a demo</p>
            <h1 className="mk-display mt-4 text-[2.25rem] text-ink sm:text-[2.75rem]">
              See the platform with your own hospital in mind.
            </h1>
            <p className="mk-lede mt-5 text-lg leading-relaxed">
              Tell us a little about your facility and we will set up a walkthrough. Onboarding is
              guided by our team, so there is no self-serve setup to get wrong.
            </p>

            <ul className="mt-10 flex flex-col gap-6">
              {STEPS.map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.title} className="flex items-start gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-accent ring-1 ring-hairline">
                      <Icon size={20} strokeWidth={1.6} />
                    </span>
                    <div>
                      <p className="font-semibold text-ink">{s.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-subtle">{s.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-10 border-t border-hairline pt-6">
              <p className="text-sm text-ink-subtle">
                Already a customer?{" "}
                <a href={PORTAL_LOGIN_URL} className="font-medium text-accent hover:text-accent-hover">
                  Sign in to the Portal
                </a>
                .
              </p>
            </div>
          </div>

          {/* form */}
          <div>
            <ContactForm />
          </div>
        </div>
      </Container>
    </section>
  );
}
