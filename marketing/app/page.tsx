import type { Metadata } from "next";
import { Hero } from "../components/home/Hero";
import {
  TrustStrip,
  ModularSection,
  ModulesBento,
  SecuritySection,
  RolesSection,
  PlatformCoreSection,
} from "../components/home/sections";
import { CtaSection } from "../components/site/CtaSection";
import { JsonLd } from "../components/site/JsonLd";
import { pageMetadata, softwareApplicationJsonLd } from "../lib/seo";

// Primary intent: "hospital management system" / "hospital management software".
export const metadata: Metadata = pageMetadata({
  path: "/",
  absoluteTitle: true,
  title: "Hospital Management System Software for Hospitals & Clinics",
  description:
    "A modular, multi-tenant hospital management system built for India: patients, appointments, OPD, EMR, pharmacy, laboratory and billing. Turn on only the modules your hospital needs.",
});

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplicationJsonLd()} />
      <Hero />
      <TrustStrip />
      <ModularSection />
      <ModulesBento />
      <SecuritySection />
      <RolesSection />
      <PlatformCoreSection />
      <CtaSection />
    </>
  );
}
