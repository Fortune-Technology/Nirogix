"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { BrandMark, Button, NavDrawer, NavDrawerItem, NavDrawerSection, cn } from "@hms/ui";
import { useAuth } from "../lib/auth";
import { navGroupsFor } from "../lib/nav";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The platform admin shell (ADR-051).
 *
 * Wears the Nirogix mark and accent, never a customer's — this app is the platform's
 * own surface, and a console that changes colour depending on whose data is on
 * screen is one you can misread under pressure. There is no tenant switcher and no
 * support-session banner here: entering a hospital hands the operator the *Portal*,
 * on the tenant's origin, where the banner belongs.
 *
 * The shell mirrors the Portal's (`hms_frontend/components/AppShell.tsx`): a sticky
 * sidebar that owns its own scroll and a sticky topbar, so only the main content
 * region scrolls rather than the whole viewport. Admin has no bottom bar (an
 * operator tool has few destinations); the hamburger drawer is its mobile nav.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const groups = navGroupsFor(can);

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    // Window-scroll shell like the Portal: sticky sidebar + topbar, one scrollbar, no
    // trailing gap. Uses `dvh` rather than `vh` — in this environment `h-screen`
    // (100vh) failed to give the sidebar a height, collapsing it to its content and
    // leaving `min-h-screen` to stretch `main` past its content into a bottom gap.
    <div className="flex min-h-dvh">
      {/* Sticks for the full viewport height and scrolls INSIDE itself only when the
          menu is longer than the screen — otherwise it never shows its own scrollbar.
          `data-lenis-prevent` keeps the document smooth-scroll off it, so a wheel over
          the menu scrolls the menu, not the page (matches the Portal). */}
      <aside
        data-lenis-prevent
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-border bg-surface md:flex"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
          <BrandMark size={24} label="" />
          <span className="font-semibold text-fg">Nirogix Admin</span>
        </div>

        <nav className="flex flex-1 flex-col gap-4 p-3">
          {groups.map((group, gi) => (
            <div
              key={group.label ?? `group-${gi}`}
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
        {/* Sticks while the page scrolls, so the account details and the theme toggle
            are always one click away — the sidebar does the same on its side. */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-5">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-token text-fg-muted hover:bg-surface-2 hover:text-fg md:hidden"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={20} strokeWidth={1.75} aria-hidden />
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-fg">{user?.fullName ?? "…"}</div>
            <div className="truncate text-xs text-fg-subtle">{user?.email}</div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="secondary" size="sm" onClick={signOut}>
              <LogOut size={16} strokeWidth={2} /> Sign out
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-5 bg-bg p-5">{children}</main>
      </div>

      {/* Mobile drawer — the shared component, so focus trapping and scroll locking
          behave exactly as they do in every other Nirogix app (ADR-033). */}
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Platform admin">
        {groups.map((group) => (
          <NavDrawerSection key={group.label ?? "root"} title={group.label ?? undefined}>
            {group.items.map((item) => (
              <NavDrawerItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                active={isActive(item.href)}
                linkAs={Link}
                onClick={() => setDrawerOpen(false)}
              >
                {item.label}
              </NavDrawerItem>
            ))}
          </NavDrawerSection>
        ))}
      </NavDrawer>
    </div>
  );
}
