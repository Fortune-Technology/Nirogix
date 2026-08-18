import type { ReactNode } from "react";
import { PageHeader } from "../../../components/PageHeader";
import { SettingsTabs } from "../../../components/settings/SettingsTabs";

/**
 * Hospital Configuration console (ADR-049).
 *
 * One place a hospital's administrator configures their own hospital, with the
 * setup progress in view rather than a pile of unrelated settings screens. Every
 * area here is tenant-scoped: an administrator configures their hospital and no
 * other, which the backend enforces per request rather than trusting this shell.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Hospital configuration"
        description="Set up and maintain your hospital: information, branding, structure, people and access."
      />
      <SettingsTabs />
      {children}
    </>
  );
}
