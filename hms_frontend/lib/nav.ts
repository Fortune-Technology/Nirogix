import { PERMISSIONS } from "@hms/permissions";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Palette,
  Users,
  CalendarDays,
  ClipboardList,
  Pill,
  FlaskConical,
  Receipt,
  BarChart3,
  Stethoscope,
  UserCog,
  UserCircle,
  GitBranch,
  ScrollText,
  Settings,
  Network,
} from "lucide-react";

// The Portal's primary navigation. Each item names the permission required to see
// it; the sidebar filters by the user's effective set. `perm: null` = always shown
// to an authenticated user. Keys come from @hms/permissions (shared with the backend),
// so the menu and the server's enforcement never drift apart.
export interface NavItem {
  label: string;
  href: string;
  perm: string | null;
  icon: LucideIcon;
}

/**
 * A labelled section of the sidebar. Sections are how the navigation absorbs new
 * platform capability without a redesign (ADR-043): a new screen joins an existing
 * group, and a genuinely new area of the product adds one group — the shell, the
 * mobile drawer, and the permission filtering all keep working unchanged.
 */
export interface NavGroup {
  /** Shown as a small caps label above the items. `null` renders the items unlabelled. */
  label: string | null;
  items: NavItem[];
}

/**
 * PLATFORM context (ADR-037) — the vendor's own operators, in the PLATFORM org.
 * Deliberately contains **no clinical navigation**: a System Admin does not get a
 * duplicate of every hospital's HMS. To work inside a hospital they enter that
 * tenant explicitly through a support session, which switches them to TENANT_NAV.
 *
 * Grouped by what an operator is doing, not by which table a screen reads
 * (ADR-043). Only routes that exist appear here — the platform areas we expect to
 * need later (plans and subscriptions, platform-wide reporting, integrations and
 * API keys, system configuration, support tickets) are recorded in
 * `resources/development-plan.md` and join a group below when they are built. A
 * navigation item is never a placeholder for an unbuilt screen.
 */
export const PLATFORM_NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/platform", perm: null, icon: LayoutDashboard }],
  },
  {
    label: "Customers",
    items: [
      { label: "Hospitals", href: "/admin/tenants", perm: PERMISSIONS.TENANTS_MANAGE, icon: Building2 },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Branding", href: "/admin/branding", perm: PERMISSIONS.PLATFORM_BRANDING_MANAGE, icon: Palette },
      { label: "Security & audit", href: "/audit", perm: PERMISSIONS.AUDIT_VIEW, icon: ScrollText },
    ],
  },
  {
    label: "Account",
    items: [{ label: "My profile", href: "/profile", perm: null, icon: UserCircle }],
  },
];

/** Flattened platform navigation — for the mobile bar and anything that wants a plain list. */
export const PLATFORM_NAV: NavItem[] = PLATFORM_NAV_GROUPS.flatMap((g) => g.items);

/**
 * TENANT context — a hospital's own staff, and what a support session shows.
 * Grouped the same way: the clinical day first, then the records a hospital runs
 * on, then administration. New clinical modules join "Clinical" as they ship.
 */
export const TENANT_NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", perm: null, icon: LayoutDashboard }],
  },
  {
    label: "Clinical",
    items: [
      { label: "Patients", href: "/patients", perm: PERMISSIONS.PATIENT_VIEW, icon: Users },
      { label: "Appointments", href: "/appointments", perm: PERMISSIONS.APPOINTMENT_VIEW, icon: CalendarDays },
      { label: "OPD queue", href: "/opd", perm: PERMISSIONS.OPD_VIEW, icon: ClipboardList },
      { label: "Pharmacy", href: "/pharmacy", perm: PERMISSIONS.PHARMACY_STOCK_VIEW, icon: Pill },
      { label: "Laboratory", href: "/laboratory", perm: PERMISSIONS.LAB_ORDER_VIEW, icon: FlaskConical },
    ],
  },
  {
    label: "Revenue",
    items: [
      { label: "Billing", href: "/billing", perm: PERMISSIONS.BILLING_VIEW, icon: Receipt },
      { label: "Reports", href: "/reports", perm: PERMISSIONS.REPORTS_VIEW, icon: BarChart3 },
    ],
  },
  {
    label: "Organization",
    items: [
      { label: "Departments", href: "/departments", perm: PERMISSIONS.DEPARTMENT_VIEW, icon: Network },
      { label: "Providers", href: "/providers", perm: PERMISSIONS.PROVIDER_VIEW, icon: Stethoscope },
      { label: "Users", href: "/users", perm: PERMISSIONS.USERS_VIEW, icon: UserCog },
      { label: "Branches", href: "/branches", perm: PERMISSIONS.BRANCHES_VIEW, icon: GitBranch },
      // The Hospital Configuration console (ADR-049) — where a hospital's administrator
      // sets the organization up and sees how far that has got.
      { label: "Hospital setup", href: "/settings", perm: PERMISSIONS.ORG_PROFILE_MANAGE, icon: Settings },
      { label: "Audit log", href: "/audit", perm: PERMISSIONS.AUDIT_VIEW, icon: ScrollText },
    ],
  },
  {
    label: "Account",
    items: [
      // Appearance is a per-user preference and lives on the profile, not in the
      // hospital's configuration — one person's dark mode is not a hospital setting.
      { label: "My profile", href: "/profile", perm: null, icon: UserCircle },
    ],
  },
];

/** Flattened tenant navigation — the mobile bar and permission checks use this. */
export const NAV_ITEMS: NavItem[] = TENANT_NAV_GROUPS.flatMap((g) => g.items);

/**
 * The day-to-day destinations that earn a slot in the mobile bottom bar
 * (ADR-033), most-used first. The bar shows the first four the user is actually
 * permitted to see — Dashboard is always one of them — and everything else stays
 * reachable through the hamburger drawer. Ordering is deliberate: a receptionist
 * lands on Patients/Appointments/OPD, a pharmacist on Pharmacy, and a
 * super-admin (who has no clinical permissions in a customer tenant) falls
 * through to Tenants and Branding.
 */
export const MOBILE_PRIMARY_ORDER = [
  "/dashboard",
  "/opd",
  "/appointments",
  "/patients",
  "/billing",
  "/pharmacy",
  "/laboratory",
  "/admin/tenants",
  "/users",
] as const;

/** The bottom bar's items for this user: permitted, in priority order, capped by the caller. */
export function mobilePrimaryNav(can: (perm: string) => boolean, source: NavItem[] = NAV_ITEMS): NavItem[] {
  const permitted = source.filter((item) => item.perm === null || can(item.perm));
  const ranked = [...permitted].sort((a, b) => {
    const ia = MOBILE_PRIMARY_ORDER.indexOf(a.href as (typeof MOBILE_PRIMARY_ORDER)[number]);
    const ib = MOBILE_PRIMARY_ORDER.indexOf(b.href as (typeof MOBILE_PRIMARY_ORDER)[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return ranked;
}

/**
 * Which application context this user belongs in (ADR-037).
 *
 * A platform operator is identified by `platform.tenants.manage`, which only the
 * vendor's super_admin resolves (via WILDCARD in the PLATFORM org, ADR-020/022) —
 * never a hospital's org_admin. This is UX routing only: every endpoint still
 * re-checks permissions server-side.
 */
export function isPlatformOperator(can: (perm: string) => boolean): boolean {
  return can(PERMISSIONS.TENANTS_MANAGE);
}

/**
 * The sidebar for the context the user is in. A System Admin gets platform
 * navigation and **no clinical menu** — to work inside a hospital they enter that
 * tenant explicitly through a support session, which is an audited transition
 * rather than a silently broader sidebar.
 */
export function navForContext(can: (perm: string) => boolean, inTenantContext: boolean): NavItem[] {
  return isPlatformOperator(can) && !inTenantContext ? PLATFORM_NAV : NAV_ITEMS;
}

/**
 * The same decision, grouped — what the sidebar and the mobile drawer render.
 * Groups whose every item is denied to this user disappear entirely, so a section
 * heading never sits above nothing.
 */
export function navGroupsForContext(
  can: (perm: string) => boolean,
  inTenantContext: boolean,
): NavGroup[] {
  const groups = isPlatformOperator(can) && !inTenantContext ? PLATFORM_NAV_GROUPS : TENANT_NAV_GROUPS;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.perm === null || can(i.perm)) }))
    .filter((g) => g.items.length > 0);
}
