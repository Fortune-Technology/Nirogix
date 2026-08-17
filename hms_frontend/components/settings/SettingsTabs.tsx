"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarPlus, FileText, ListChecks, Palette, Layers, QrCode, type LucideIcon } from "lucide-react";
import { PERMISSIONS } from "@hms/permissions";
import { useCan } from "../../lib/auth";

/**
 * The Hospital Configuration console's own navigation (ADR-049).
 *
 * Only tabs backed by a real configuration area exist. Areas the product does not
 * have — departments, sub-departments, procedures, services, packages, treatment
 * plans, wards, rooms, beds — deliberately get no tab: a tab that opens an empty
 * screen is a promise the product cannot keep. They are tracked in BACKLOG.md.
 *
 * Configuration areas that already have their own screen (branches, providers,
 * users, the lab and pharmacy catalogues) are linked from the console overview
 * rather than duplicated here, so each one has a single implementation.
 */
type Tab = { href: string; label: string; icon: LucideIcon; perm: string | null };

const TABS: Tab[] = [
  { href: "/settings", label: "Setup overview", icon: ListChecks, perm: null },
  { href: "/settings/organization", label: "Hospital information", icon: Building2, perm: PERMISSIONS.ORG_PROFILE_MANAGE },
  { href: "/settings/documents", label: "Letterhead", icon: FileText, perm: PERMISSIONS.ORG_PROFILE_MANAGE },
  { href: "/settings/branding", label: "Branding", icon: Palette, perm: PERMISSIONS.BRANDING_MANAGE },
  { href: "/settings/registration", label: "Patient registration", icon: QrCode, perm: PERMISSIONS.ORG_PROFILE_MANAGE },
  { href: "/settings/booking", label: "Online booking", icon: CalendarPlus, perm: PERMISSIONS.ORG_PROFILE_MANAGE },
  { href: "/settings/modules", label: "Enabled modules", icon: Layers, perm: null },
];

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  // `useCan` is called unconditionally; the tab is dropped after the fact. A tab the
  // user may not use is not rendered at all (ADR-039's rule, applied to navigation).
  const allowed = useCan(tab.perm ?? PERMISSIONS.USERS_VIEW);
  if (tab.perm !== null && !allowed) return null;

  const Icon = tab.icon;
  return (
    <li>
      <Link
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={[
          "flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm transition-colors",
          active
            ? "border-b-2 border-brand font-medium text-brand"
            : "border-b-2 border-transparent text-fg-muted hover:text-fg",
        ].join(" ")}
      >
        <Icon size={16} strokeWidth={2} />
        {tab.label}
      </Link>
    </li>
  );
}

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hospital configuration" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 border-b border-border px-1">
        {TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={pathname === tab.href} />
        ))}
      </ul>
    </nav>
  );
}
