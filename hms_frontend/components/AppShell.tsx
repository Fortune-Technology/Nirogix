"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, cn } from "@hms/ui";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { NAV_ITEMS } from "../lib/nav";
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

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-6 w-6 rounded-token object-contain" />
          ) : (
            <span className="inline-block h-6 w-6 rounded-token bg-brand" aria-hidden />
          )}
          <span className="font-semibold text-fg">HMS Portal</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-token px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-brand-subtle text-brand" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
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

        <main className="flex flex-1 flex-col gap-5 bg-bg p-5">{children}</main>
      </div>
    </div>
  );
}
