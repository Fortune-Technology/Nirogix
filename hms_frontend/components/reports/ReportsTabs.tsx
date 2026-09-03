'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The Reports registers' own navigation — one routed tab per register, so the URL
 * always names the open report (`/reports/collections`) and refresh, browser
 * back/forward and a shared link all land on the same view. Mirrors the
 * Hospital-setup tab bar (`SettingsTabs`).
 *
 * The EOD report is a separate destination — its own sidebar item at `/reports/eod`
 * — and deliberately not a tab here.
 */
const TABS = [
  { href: '/reports', label: 'OPD register' },
  { href: '/reports/collections', label: 'Collections' },
  { href: '/reports/pending-labs', label: 'Pending labs' },
] as const;

export function ReportsTabs() {
  const pathname = usePathname();
  // Carry the current query (the persisted `?range=…`) onto each tab, so switching
  // register keeps the selected period. This component re-renders inside ReportsView,
  // which owns the period, so the search string is fresh whenever the range changes.
  const search = typeof window !== 'undefined' ? window.location.search : '';
  return (
    <nav aria-label="Reports" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 border-b border-border px-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={`${tab.href}${search}`}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-b-2 border-brand font-medium text-brand'
                    : 'border-b-2 border-transparent text-fg-muted hover:text-fg',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
