import { PERMISSIONS } from "@hms/permissions";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Palette,
  Users,
  UserPlus,
  CalendarDays,
  ClipboardList,
  Pill,
  FlaskConical,
  Receipt,
  BarChart3,
  CalendarCheck,
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
 * The Portal's navigation — a hospital's own staff, and what a support session shows.
 *
 * There is no platform context here any more (ADR-051): the vendor's operator screens
 * moved to their own application on their own origin, so operator code is no longer
 * in a hospital's bundle. An operator working inside a hospital arrives through a
 * support session and sees exactly this navigation, which is the point.
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
      // Visible to anyone who may see patients; only the front desk can act on a request.
      { label: "Registration requests", href: "/patients/registrations", perm: PERMISSIONS.PATIENT_VIEW, icon: UserPlus },
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
      // Sits with Reports — a day's operating picture is a report, and shares its
      // permission. Nested under /reports so it highlights on its own route (the
      // longest-match rule in `activeNavHref`) without stealing Reports' highlight.
      { label: "EOD report", href: "/reports/eod", perm: PERMISSIONS.REPORTS_VIEW, icon: CalendarCheck },
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
 * Which nav item the current route belongs to — **the longest matching href wins**.
 *
 * A prefix match alone is not enough once one destination lives under another’s path.
 * `/patients/registrations` is a prefix match for both *Patients* and *Registration
 * requests*, and highlighting both tells the user nothing about where they are. The
 * longest match is the specific one, while `/patients/{id}` — which has no nav item of
 * its own — still resolves to *Patients*, which is the behaviour a detail page wants.
 *
 * Returns the winning href, or `null` on a route no nav item covers.
 */
export function activeNavHref(pathname: string, items: NavItem[] = NAV_ITEMS): string | null {
  let best: string | null = null;
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}

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
 * The Portal's sidebar for this user, grouped. Groups whose every item is denied
 * disappear entirely, so a section heading never sits above nothing.
 *
 * There is no longer a context decision to make (ADR-051). The Portal renders tenant
 * navigation for everyone who reaches it, including a platform operator inside a
 * support session — which is exactly right: they are working as a hospital user, and
 * the support banner says so.
 */
export function navGroupsForUser(can: (perm: string) => boolean): NavGroup[] {
  return TENANT_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.perm === null || can(i.perm)),
  })).filter((g) => g.items.length > 0);
}
