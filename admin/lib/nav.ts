import { PERMISSIONS } from '@hms/permissions';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CalendarCheck,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Palette,
  ScrollText,
  UserCircle,
} from 'lucide-react';

/**
 * Platform administration navigation (ADR-037, ADR-051).
 *
 * Deliberately contains **no clinical navigation**. A platform operator does not get
 * a duplicate of every hospital's HMS; to work inside a hospital they open an audited
 * support session, which hands them the *Portal* on the tenant's own origin.
 *
 * Only routes that exist appear here. The platform areas we expect to need later —
 * subscriptions and revenue, platform users, system health, feature flags,
 * integrations, platform settings — are recorded in `resources/development-plan.md`
 * and `BACKLOG.md`, and each needs its own data source before it can be honest
 * (ADR-043: no metric without a source). **A navigation item is never a placeholder
 * for an unbuilt screen.**
 */
export interface NavItem {
  label: string;
  href: string;
  /** Permission required to see it; `null` = any authenticated operator. */
  perm: string | null;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', perm: null, icon: LayoutDashboard },
      // A daily companion to the dashboard, built from the audit trail — the only
      // thing the platform records per-day. Shares the audit permission.
      { label: 'EOD report', href: '/eod', perm: PERMISSIONS.AUDIT_VIEW, icon: CalendarCheck },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Hospitals', href: '/tenants', perm: PERMISSIONS.TENANTS_MANAGE, icon: Building2 },
    ],
  },
  {
    label: 'Support',
    items: [
      {
        label: 'Support sessions',
        href: '/support',
        perm: PERMISSIONS.PLATFORM_SUPPORT_IMPERSONATE,
        icon: LifeBuoy,
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        label: 'Branding',
        href: '/branding',
        perm: PERMISSIONS.PLATFORM_BRANDING_MANAGE,
        icon: Palette,
      },
      // Read-only preview of the platform's email templates, rendered from sample data.
      {
        label: 'Email templates',
        href: '/email-templates',
        perm: PERMISSIONS.TENANTS_MANAGE,
        icon: Mail,
      },
      { label: 'Security & audit', href: '/audit', perm: PERMISSIONS.AUDIT_VIEW, icon: ScrollText },
    ],
  },
  {
    label: 'Account',
    items: [
      // Any authenticated operator: their own account + password change (the same
      // /auth/change-password the Portal uses; the user id comes from the token).
      { label: 'My profile', href: '/profile', perm: null, icon: UserCircle },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Groups whose every item is denied disappear, so a heading never sits above nothing. */
export function navGroupsFor(can: (perm: string) => boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.perm === null || can(i.perm)),
  })).filter((g) => g.items.length > 0);
}
