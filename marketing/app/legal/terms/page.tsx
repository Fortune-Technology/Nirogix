import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../../../components/site/LegalPage";
import { SITE } from "../../../lib/site";
import { pageMetadata } from "../../../lib/seo";

export const metadata: Metadata = pageMetadata({
  path: "/legal/terms",
  title: "Terms of Use",
  description:
    "A plain-language summary of the terms for using the HMS platform: accounts, acceptable use, availability, and how changes are communicated.",
});

const SECTIONS: LegalSection[] = [
  {
    heading: "Using the platform",
    body: [
      `The HMS platform is provided by ${SITE.legalName} to hospitals and clinics under an agreement made during onboarding. Access is for authorised staff of a subscribing hospital.`,
    ],
  },
  {
    heading: "Accounts and access",
    body: [
      "Each user is responsible for keeping their credentials secure. Hospitals manage their own users, roles, and branches, and control who can access which modules.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "The platform must be used lawfully and only for legitimate healthcare operations. Attempting to access another tenant's data, probe the system, or disrupt the service is prohibited.",
    ],
  },
  {
    heading: "Availability",
    body: [
      "We aim for high availability and communicate planned maintenance in advance. Specific service levels are set out in the agreement with each hospital.",
    ],
  },
  {
    heading: "Data ownership",
    body: [
      "Hospitals own the data they enter. We process it to provide the service and do not use patient data for any purpose beyond running the platform for that hospital.",
    ],
  },
  {
    heading: "Changes",
    body: [
      "We may update the platform and these terms. Material changes are communicated to subscribing hospitals before they take effect.",
    ],
  },
  {
    heading: "Contact",
    body: [
      `For questions about these terms, contact ${SITE.legalName} through the demo request form.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms"
      intro="A plain-language summary of the terms for using the platform. The binding agreement is made with each hospital during onboarding."
      sections={SECTIONS}
    />
  );
}
