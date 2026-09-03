'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarCheck, Home, Layers, Menu, Stethoscope, Tag } from 'lucide-react';
import { BottomNav, NavDrawer, NavDrawerItem, NavDrawerSection } from '@hms/ui';
import { Button } from '../ui/Button';
import { NAV_LINKS, SITE } from '../../lib/site';
import { PORTAL_LOGIN_URL } from '../../lib/portal';

/**
 * App-like mobile navigation for the marketing site (ADR-033). Desktop keeps the
 * header's horizontal nav; below `lg` this bottom bar + top-right drawer take over.
 *
 * The five destinations are chosen from *this* site's information architecture —
 * the journey is discover → what it does → who it is for → what it costs → talk to
 * us — not copied from the Portal's clinical menu.
 */
const PRIMARY = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Modules', href: '/modules', icon: Layers },
  { label: 'Specialties', href: '/specialties', icon: Stethoscope },
  { label: 'Pricing', href: '/pricing', icon: Tag },
  { label: 'Demo', href: '/contact', icon: CalendarCheck },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** The bottom bar: five primary destinations, mounted once in the root layout. */
export function MarketingMobileNav() {
  const isActive = useIsActive();
  return (
    <div className="lg:hidden">
      <BottomNav
        linkAs={Link}
        items={PRIMARY.map((item) => ({ ...item, active: isActive(item.href) }))}
      />
    </div>
  );
}

/** The top-right hamburger + slide-out drawer, rendered by the header. */
export function MarketingMenuButton() {
  const pathname = usePathname();
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);

  // Close the drawer on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="grid h-10 w-10 place-items-center rounded-md text-ink hover:bg-surface-2"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={22} strokeWidth={1.75} aria-hidden />
      </button>

      <NavDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Menu"
        footer={<MarketingMobileActions />}
      >
        <NavDrawerSection title="Explore">
          {NAV_LINKS.map((link) => (
            <NavDrawerItem
              key={link.href}
              linkAs={Link}
              href={link.href}
              active={isActive(link.href)}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </NavDrawerItem>
          ))}
        </NavDrawerSection>
        <NavDrawerSection title="Legal">
          <NavDrawerItem linkAs={Link} href="/legal/privacy" onClick={() => setOpen(false)}>
            Privacy
          </NavDrawerItem>
          <NavDrawerItem linkAs={Link} href="/legal/terms" onClick={() => setOpen(false)}>
            Terms
          </NavDrawerItem>
        </NavDrawerSection>
      </NavDrawer>
    </div>
  );
}

/** The drawer's footer actions, kept out of the bar so the five slots stay navigational. */
export function MarketingMobileActions() {
  return (
    <div className="flex flex-col gap-2">
      <Button href={PORTAL_LOGIN_URL} variant="secondary" size="lg">
        Sign in
      </Button>
      <Button href={SITE.primaryCta.href} size="lg">
        {SITE.primaryCta.label}
      </Button>
    </div>
  );
}
