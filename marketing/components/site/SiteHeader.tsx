"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { Button } from "../ui/Button";
import { Container } from "../ui/primitives";
import { NAV_LINKS, SITE } from "../../lib/site";
import { MarketingMenuButton } from "./MobileNav";
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

          {/* Below `lg`: the wordmark plus this hamburger. Primary destinations
              live in the bottom bar (ADR-033), secondary ones in the drawer. */}
          <MarketingMenuButton />
        </div>
      </Container>
    </header>
  );
}
