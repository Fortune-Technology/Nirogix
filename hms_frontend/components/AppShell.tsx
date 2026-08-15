"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { BOTTOM_NAV_MAX_ITEMS, BottomNav, Button, NavDrawer, NavDrawerItem, NavDrawerSection, cn } from "@hms/ui";
import { Menu } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { NAV_ITEMS, mobilePrimaryNav } from "../lib/nav";
import { ThemeToggle } from "./ThemeToggle";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// The authenticated shell: a permission-filtered sidebar + a topbar. The nav only
// shows items the user's effective permissions allow (UX mirror of server enforcement).
export function AppShell({ children }: { children: ReactNode }) {
  const { user, can, logout } = useAuth();
  const { logoUrl } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const visibleNav = NAV_ITEMS.filter((item) => item.perm === null || can(item.perm));
  // Mobile (ADR-033): five primary destinations in the bottom bar, everything else
  // in the drawer. Both derive from the same permission-filtered list as the
  // sidebar, so the phone never offers a route the user cannot open.
  const [menuOpen, setMenuOpen] = useState(false);
  const ranked = mobilePrimaryNav(can);
  const primary = ranked.slice(0, BOTTOM_NAV_MAX_ITEMS);
  const secondary = visibleNav.filter((item) => !primary.some((p) => p.href === item.href));
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
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
            <span className="inline-block h-6 w-6 rounded-token bg-brand" aria-hidden />
          )}
          <span className="font-semibold text-fg">HMS Portal</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
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
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-5">
          <div className="flex items-center gap-2 text-sm text-fg-muted md:hidden">
            <span className="inline-block h-5 w-5 rounded-token bg-brand" aria-hidden />
            <span className="font-semibold text-fg">HMS</span>
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
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand"
                  title={user.email}
                >
                  {initials(user.fullName)}
                </span>
                <span className="hidden text-sm text-fg sm:inline">{user.fullName}</span>
              </div>
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
        <NavDrawerSection title="All modules">
          {visibleNav.map((item) => (
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
        {secondary.length === 0 ? null : (
          <p className="px-2 pt-2 text-xs text-fg-subtle">
            The bar below shows your most-used destinations; the rest live here.
          </p>
        )}
      </NavDrawer>
    </div>
  );
}
