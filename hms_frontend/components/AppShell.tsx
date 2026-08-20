"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { BOTTOM_NAV_MAX_ITEMS, BottomNav, BrandMark, Button, HeaderUser, NavDrawer, NavDrawerItem, NavDrawerSection, cn } from "@hms/ui";
import { formatRoleNames } from "@hms/permissions";
import { Menu, ShieldAlert } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { NAV_ITEMS, activeNavHref, mobilePrimaryNav, navGroupsForUser } from "../lib/nav";
import { ThemeToggle } from "./ThemeToggle";

// The authenticated shell: a permission-filtered sidebar + a topbar. The nav only
// shows items the user's effective permissions allow (UX mirror of server enforcement).
export function AppShell({ children }: { children: ReactNode }) {
  const { user, can, logout } = useAuth();
  const { logoUrl } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  // One navigation, always the hospital's (ADR-051). The platform operator screens
  // live in their own application on their own origin, so there is no context to
  // switch between here any more. An operator inside a support session sees the
  // hospital's own sidebar — which is the point — and the banner below makes it
  // impossible to forget which hospital you are acting in.
  const inTenantContext = Boolean(user?.impersonatedBy);
  const visibleNav = NAV_ITEMS.filter((item) => item.perm === null || can(item.perm));
  // The sidebar renders the same items in labelled sections, so a new capability
  // joins a group instead of lengthening one flat list (ADR-043).
  const navGroups = navGroupsForUser(can);
  // Mobile (ADR-033): five primary destinations in the bottom bar, everything else
  // in the drawer. Both derive from the same permission-filtered list as the
  // sidebar, so the phone never offers a route the user cannot open.
  const [menuOpen, setMenuOpen] = useState(false);
  const ranked = mobilePrimaryNav(can);
  const primary = ranked.slice(0, BOTTOM_NAV_MAX_ITEMS);
  const secondary = visibleNav.filter((item) => !primary.some((p) => p.href === item.href));
  // The longest matching nav href wins, so a destination nested under another’s path
  // (`/patients/registrations` under `/patients`) highlights one item, not two — while
  // `/patients/{id}`, which has no item of its own, still highlights Patients.
  const active = activeNavHref(pathname);
  const isActive = (href: string) => active === href;

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/*
       * The sidebar owns its own scroll: it sticks to the top for the full viewport
       * height, and a long menu scrolls INSIDE it rather than with the page.
       * `data-lenis-prevent` keeps the shared smooth-scroll off it, so a wheel over
       * the menu moves the menu (DESIGN.md §9.3).
       */}
      <aside
        data-lenis-prevent
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-surface md:flex"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
          {logoUrl ? (
            // Tenant-uploaded asset: the origin is per-deployment object storage, so it
            // cannot be enumerated in `images.remotePatterns` — `unoptimized` keeps
            // next/image's sizing/CLS discipline without the optimizer round-trip.
            <Image
              src={logoUrl}
              alt="Organization logo"
              width={24}
              height={24}
              unoptimized
              className="h-6 w-6 rounded-token object-contain"
            />
          ) : (
            <BrandMark size={24} label="" />
          )}
          <span className="font-semibold text-fg">Nirogix Portal</span>
        </div>
        <nav className="flex flex-1 flex-col gap-4 p-3">
          {navGroups.map((group, gi) => (
            <div
              key={group.label ?? `group-${gi}`}
              // A hairline above every group but the first draws the section boundary
              // without adding a heavy divider to a narrow column.
              className={cn("flex flex-col gap-1", gi > 0 && "border-t border-border pt-4")}
            >
              {group.label ? (
                <span className="px-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
                  {group.label}
                </span>
              ) : null}
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-token px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-brand-subtle text-brand" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    <Icon size={17} strokeWidth={1.75} className="shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {inTenantContext ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-warning-subtle px-5 py-2.5 text-sm">
            <span className="flex items-center gap-2 font-medium text-warning">
              <ShieldAlert size={16} strokeWidth={2} aria-hidden />
              Support session: you are acting as {user?.fullName} and every action is audited in this tenant.
            </span>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Exit support session
            </Button>
          </div>
        ) : null}
        {/* Sticks while the page scrolls, so the account menu and the theme toggle
            are always one click away — the sidebar does the same on its side. */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-5">
          <div className="flex items-center gap-2 text-sm text-fg-muted md:hidden">
            <BrandMark size={20} label="" />
            <span className="font-semibold text-fg">Nirogix</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-token text-fg-muted hover:bg-surface-2 hover:text-fg md:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} strokeWidth={1.75} aria-hidden />
            </button>
            {user && (
              // The account block is the entry point to My Profile (ADR-035).
              <HeaderUser
                name={user.fullName}
                email={user.email}
                role={formatRoleNames(user.roles)}
                href="/profile"
                linkAs={Link}
                className="max-w-[16rem]"
              />
            )}
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </header>

        <main className="hms-bottomnav-offset flex flex-1 flex-col gap-5 bg-bg p-5">{children}</main>
      </div>

      {/* Mobile only — desktop keeps the sidebar (ADR-033). */}
      <div className="md:hidden">
        <BottomNav
          linkAs={Link}
          items={primary.map((item) => ({
            label: item.label,
            href: item.href,
            icon: item.icon,
            active: isActive(item.href),
          }))}
        />
      </div>

      <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        {navGroups.map((group, gi) => (
          <NavDrawerSection key={group.label ?? `group-${gi}`} title={group.label ?? "Overview"}>
            {group.items.map((item) => (
              <NavDrawerItem
                key={item.href}
                linkAs={Link}
                href={item.href}
                icon={item.icon}
                active={isActive(item.href)}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </NavDrawerItem>
            ))}
          </NavDrawerSection>
        ))}
        {secondary.length === 0 ? null : (
          <p className="px-2 pt-2 text-xs text-fg-subtle">
            The bar below shows your most-used destinations; the rest live here.
          </p>
        )}
      </NavDrawer>
    </div>
  );
}
