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
  Stethoscope,
  UserCog,
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

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", perm: null, icon: LayoutDashboard },
  { label: "Tenants", href: "/admin/tenants", perm: PERMISSIONS.TENANTS_MANAGE, icon: Building2 },
  { label: "Branding", href: "/admin/branding", perm: PERMISSIONS.PLATFORM_BRANDING_MANAGE, icon: Palette },
  { label: "Patients", href: "/patients", perm: PERMISSIONS.PATIENT_VIEW, icon: Users },
  { label: "Appointments", href: "/appointments", perm: PERMISSIONS.APPOINTMENT_VIEW, icon: CalendarDays },
  { label: "OPD Queue", href: "/opd", perm: PERMISSIONS.OPD_VIEW, icon: ClipboardList },
  { label: "Billing", href: "/billing", perm: PERMISSIONS.BILLING_VIEW, icon: Receipt },
  { label: "Pharmacy", href: "/pharmacy", perm: PERMISSIONS.PHARMACY_STOCK_VIEW, icon: Pill },
  { label: "Laboratory", href: "/laboratory", perm: PERMISSIONS.LAB_ORDER_VIEW, icon: FlaskConical },
  { label: "Providers", href: "/providers", perm: PERMISSIONS.PROVIDER_VIEW, icon: Stethoscope },
  { label: "Users", href: "/users", perm: PERMISSIONS.USERS_VIEW, icon: UserCog },
  { label: "Branches", href: "/branches", perm: PERMISSIONS.BRANCHES_VIEW, icon: GitBranch },
  { label: "Audit Log", href: "/audit", perm: PERMISSIONS.AUDIT_VIEW, icon: ScrollText },
  { label: "Settings", href: "/settings", perm: null, icon: Settings },
];
