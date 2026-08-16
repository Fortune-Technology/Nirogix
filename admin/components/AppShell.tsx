"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, Moon, Sun } from "lucide-react";
import { BrandMark, Button, NavDrawer, NavDrawerItem, NavDrawerSection } from "@hms/ui";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { navGroupsFor } from "../lib/nav";

/**
 * The platform admin shell (ADR-051).
 *
 * Wears the Nirogix mark and accent, never a customer's — this app is the platform's
 * own surface, and a console that changes colour depending on whose data is on
 * screen is one you can misread under pressure. There is no tenant switcher and no
 * support-session banner here: entering a hospital hands the operator the *Portal*,
 * on the tenant's origin, where the banner belongs.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, can, logout } = useAuth();
  const { theme, toggle } = useTheme();
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
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <BrandMark size={28} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">Nirogix</div>
            <div className="truncate text-xs text-fg-subtle">Platform admin</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label ?? "root"} className="mb-4">
              {group.label && (
                <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                  {group.label}
                </div>
              )}
              <ul>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? "page" : undefined}
                        className={[
                          "flex items-center gap-2.5 rounded-token px-2.5 py-2 text-sm transition-colors",
                          isActive(item.href)
                            ? "bg-brand-subtle font-medium text-brand"
                            : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                        ].join(" ")}
                      >
                        <Icon size={16} strokeWidth={2} aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <button
            type="button"
            className="rounded-token p-2 text-fg-muted hover:bg-surface-2 md:hidden"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={18} strokeWidth={2} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-fg">{user?.fullName ?? "…"}</div>
            <div className="truncate text-xs text-fg-subtle">{user?.email}</div>
          </div>

          <Button variant="secondary" size="sm" onClick={toggle} aria-label="Switch theme">
            {theme === "dark" ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
          </Button>
          <Button variant="secondary" size="sm" onClick={signOut}>
            <LogOut size={16} strokeWidth={2} /> Sign out
          </Button>
        </header>

        <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">{children}</main>
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
