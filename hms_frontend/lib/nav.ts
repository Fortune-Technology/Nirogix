import { PERMISSIONS } from "@hms/permissions";

// The Portal's primary navigation. Each item names the permission required to see
// it; the sidebar filters by the user's effective set. `perm: null` = always shown
// to an authenticated user. Keys come from @hms/permissions (shared with the backend),
// so the menu and the server's enforcement never drift apart.
export interface NavItem {
  label: string;
  href: string;
  perm: string | null;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", perm: null },
  { label: "Tenants", href: "/admin/tenants", perm: PERMISSIONS.TENANTS_MANAGE },
  { label: "Providers", href: "/providers", perm: PERMISSIONS.PROVIDER_VIEW },
  { label: "Users", href: "/users", perm: PERMISSIONS.USERS_VIEW },
  { label: "Branches", href: "/branches", perm: PERMISSIONS.BRANCHES_VIEW },
  { label: "Audit Log", href: "/audit", perm: PERMISSIONS.AUDIT_VIEW },
  { label: "Settings", href: "/settings", perm: null },
];
