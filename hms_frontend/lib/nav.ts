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
 * PLATFORM context (ADR-037) — the vendor's own operators, in the PLATFORM org.
 * Deliberately contains **no clinical navigation**: a System Admin does not get a
 * duplicate of every hospital's HMS. To work inside a hospital they enter that
 * tenant explicitly through a support session, which switches them to TENANT_NAV.
 */
export const PLATFORM_NAV: NavItem[] = [
  { label: "Dashboard", href: "/platform", perm: null, icon: LayoutDashboard },
  { label: "Tenants", href: "/admin/tenants", perm: PERMISSIONS.TENANTS_MANAGE, icon: Building2 },
  { label: "Branding", href: "/admin/branding", perm: PERMISSIONS.PLATFORM_BRANDING_MANAGE, icon: Palette },
  { label: "Security & Audit", href: "/audit", perm: PERMISSIONS.AUDIT_VIEW, icon: ScrollText },
  { label: "My Profile", href: "/profile", perm: null, icon: UserCircle },
];

/** TENANT context — a hospital's own staff, and what a support session shows. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", perm: null, icon: LayoutDashboard },
  { label: "Patients", href: "/patients", perm: PERMISSIONS.PATIENT_VIEW, icon: Users },
  { label: "Appointments", href: "/appointments", perm: PERMISSIONS.APPOINTMENT_VIEW, icon: CalendarDays },
  { label: "OPD Queue", href: "/opd", perm: PERMISSIONS.OPD_VIEW, icon: ClipboardList },
  { label: "Billing", href: "/billing", perm: PERMISSIONS.BILLING_VIEW, icon: Receipt },
  { label: "Pharmacy", href: "/pharmacy", perm: PERMISSIONS.PHARMACY_STOCK_VIEW, icon: Pill },
  { label: "Laboratory", href: "/laboratory", perm: PERMISSIONS.LAB_ORDER_VIEW, icon: FlaskConical },
  { label: "Reports", href: "/reports", perm: PERMISSIONS.REPORTS_VIEW, icon: BarChart3 },
  { label: "Providers", href: "/providers", perm: PERMISSIONS.PROVIDER_VIEW, icon: Stethoscope },
  { label: "Users", href: "/users", perm: PERMISSIONS.USERS_VIEW, icon: UserCog },
  { label: "Branches", href: "/branches", perm: PERMISSIONS.BRANCHES_VIEW, icon: GitBranch },
  { label: "Audit Log", href: "/audit", perm: PERMISSIONS.AUDIT_VIEW, icon: ScrollText },
  { label: "My Profile", href: "/profile", perm: null, icon: UserCircle },
  { label: "Settings", href: "/settings", perm: null, icon: Settings },
];

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
