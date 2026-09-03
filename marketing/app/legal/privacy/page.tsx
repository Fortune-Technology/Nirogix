import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '../../../components/site/LegalPage';
import { SITE } from '../../../lib/site';
import { pageMetadata } from '../../../lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/legal/privacy',
  title: 'Privacy Policy',
  description:
    'How Nirogix handles data: what is collected, how it is used, India data residency, security, and data-subject rights aligned with the DPDP Act.',
});

const SECTIONS: LegalSection[] = [
  {
    heading: 'Who this covers',
    body: [
      `This summary describes how ${SITE.legalName} handles data on Nirogix. Each hospital is the controller of its patients' health data; we process that data on the hospital's behalf as its technology provider.`,
    ],
  },
  {
    heading: 'What we collect',
    body: [
      'Account and contact details for the staff who use the platform, and operational data entered by hospitals in the course of running their modules. Patient health data is entered and owned by the hospital.',
      'We collect basic technical logs needed to run and secure the service.',
    ],
  },
  {
    heading: 'How data is used',
    body: [
      'To provide the platform, keep it secure, and support the hospitals that use it. Access follows least privilege, and personal data is masked in logs and outside production.',
    ],
  },
  {
    heading: 'Where data is stored',
    body: [
      'In India. The platform runs on India-headquartered infrastructure, and health data is kept in-region. Files are stored in India-pinned object storage.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'Data is encrypted at rest and in transit. Tenants are isolated at the database layer, and every meaningful action is written to an append-only audit trail.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'The platform is designed to support data-subject rights consistent with the Digital Personal Data Protection Act, 2023, including access and correction, exercised through the hospital that holds the data.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      `To ask about privacy, contact ${SITE.legalName} through the demo request form and we will route your query to the right team.`,
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy"
      intro="A plain-language summary of how data is handled on the platform. Hospitals own their patients' health data; we process it on their behalf."
      sections={SECTIONS}
    />
  );
}
