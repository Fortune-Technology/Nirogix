"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useScrollLock } from "@hms/ui";
import { Button } from "../ui/Button";
import { Container } from "../ui/primitives";
import { NAV_LINKS, SITE } from "../../lib/site";
import { PORTAL_LOGIN_URL } from "../../lib/portal";
import { useTheme } from "../../lib/theme";

// Light/Dark toggle. `full` renders the labelled row used inside the mobile panel;
// otherwise an icon-only button for the desktop bar.
function ThemeToggle({ full = false }: { full?: boolean }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  const Icon = dark ? Sun : Moon;

  if (full) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="flex items-center justify-between rounded-md border border-hairline px-3 py-3 text-base text-ink hover:bg-surface-2"
      >
        <span>{dark ? "Light mode" : "Dark mode"}</span>
        <Icon size={20} strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title="Toggle light / dark"
      className="grid h-9 w-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <Icon size={18} strokeWidth={1.75} />
    </button>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${SITE.wordmark} home`}>
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-semibold text-accent-ink">
        H
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-ink">{SITE.wordmark}</span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile panel on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll (and Lenis) while the mobile panel is open.
  useScrollLock(open);

  return (
    <header className="sticky top-0 z-50 border-b border-hairline/70 bg-canvas/85 backdrop-blur-md">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Wordmark />

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    "rounded-md px-3 py-2 text-sm transition-colors " +
                    (active
                      ? "text-ink"
                      : "text-ink-muted hover:text-ink hover:bg-surface-2")
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-1.5 lg:flex">
            <ThemeToggle />
            <a
              href={PORTAL_LOGIN_URL}
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Sign in
            </a>
            <Button href={SITE.primaryCta.href} size="md">
              {SITE.primaryCta.label}
            </Button>
          </div>

          {/* mobile trigger */}
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-md text-ink lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
          </button>
        </div>
      </Container>

      {/* mobile panel */}
      {open && (
        <div className="border-t border-hairline bg-canvas lg:hidden">
          <Container>
            <nav className="flex flex-col gap-1 py-4" aria-label="Mobile">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-3 text-base text-ink hover:bg-surface-2"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-hairline pt-4">
                <ThemeToggle full />
                <Button href={PORTAL_LOGIN_URL} variant="secondary" size="lg">
                  Sign in
                </Button>
                <Button href={SITE.primaryCta.href} size="lg">
                  {SITE.primaryCta.label}
                </Button>
              </div>
            </nav>
          </Container>
        </div>
      )}
    </header>
  );
}
