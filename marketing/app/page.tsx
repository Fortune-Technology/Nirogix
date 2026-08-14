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

export default function Home() {
  return (
    <>
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
