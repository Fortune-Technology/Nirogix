import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, Compass } from 'lucide-react';
import { Container } from '../components/ui/primitives';
import { Button } from '../components/ui/Button';
import { NAV_LINKS } from '../lib/site';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

/**
 * The marketing 404. Branded and useful rather than apologetic: it offers the
 * real navigation, so a mistyped or retired URL becomes a way back into the site
 * instead of a dead end. `noindex, follow` keeps it out of search while letting
 * crawlers follow the links out.
 */
export default function NotFound() {
  return (
    <section className="bg-canvas">
      <Container className="flex flex-col items-center py-24 text-center sm:py-32">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-subtle text-accent">
          <Compass size={30} strokeWidth={1.5} aria-hidden />
        </span>

        <p className="mt-8 font-mono text-sm tracking-wide text-accent">404</p>
        <h1 className="mk-display mt-3 max-w-2xl text-ink">
          This page has moved, or never existed
        </h1>
        <p className="mk-lede mt-4 max-w-xl text-ink-muted">
          The link may be out of date. Everything about the platform, its modules and the
          specialties it supports is still a click away.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button href="/" size="lg">
            Back to home
          </Button>
          <Button href="/contact" variant="secondary" size="lg">
            Book a demo
          </Button>
        </div>

        <nav
          aria-label="Site sections"
          className="mt-14 w-full max-w-3xl border-t border-hairline pt-8"
        >
          <p className="text-sm font-medium text-ink-subtle">Or jump straight to</p>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-4 py-2 text-sm text-ink-muted transition-colors hover:border-accent-border hover:text-accent"
                >
                  {link.label}
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </section>
  );
}
