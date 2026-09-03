'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Dialog } from '@hms/ui';
import { Search } from 'lucide-react';
import { getCatalog, type CatalogCategory, type CatalogItem } from '../../lib/api';

// Reusable picker for the system master-data catalogue (ADR-072). Searchable list of predefined
// items (and this hospital's custom ones, where the category supports them), tagged System/Custom.
// Selecting an item hands it back so a form can pre-fill from it — the caller never re-types a
// standardised value, and always keeps its own price/branch/etc.

/** A short one-line summary of an item's attributes for the second row of a card. */
function attrSummary(item: CatalogItem): string {
  const a = item.attributes ?? {};
  const parts = [a.sampleType, a.form, a.strength, a.unit, a.schedule, a.specialtyCode].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return parts.join(' · ');
}

export function CatalogPicker({
  category,
  onPick,
  footer,
}: {
  category: CatalogCategory;
  onPick: (item: CatalogItem) => void;
  footer?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    getCatalog(category, q)
      .then((res) => {
        if (id === reqId.current) {
          setItems(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [category, q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
        />
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the catalogue…"
          aria-label="Search the catalogue"
          className="w-full rounded-token border border-border bg-surface py-2 pl-9 pr-3 text-sm text-fg outline-none focus:border-brand"
        />
      </div>

      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {loading && <li className="px-3 py-6 text-center text-sm text-fg-subtle">Loading…</li>}
        {!loading && items.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-fg-subtle">
            No matches in the catalogue.
          </li>
        )}
        {items.map((item) => {
          const summary = attrSummary(item);
          return (
            <li key={`${item.source}:${item.code}`}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="flex w-full items-center gap-2 rounded-token border border-border px-3 py-2 text-left text-sm transition-colors hover:border-brand hover:bg-surface-2 focus-visible:border-brand focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{item.name}</span>
                  {summary && (
                    <span className="block truncate text-xs text-fg-subtle">{summary}</span>
                  )}
                </span>
                {item.source === 'custom' && <Badge tone="brand">Custom</Badge>}
              </button>
            </li>
          );
        })}
      </ul>

      {footer}
    </div>
  );
}

/**
 * A "Choose from catalogue" button that opens the picker in a modal. On pick, it hands the item to
 * `onPick` and closes — the consuming form pre-fills from it. `footer` can carry an "add custom"
 * affordance for categories that support one.
 */
export function CatalogPickerButton({
  category,
  title,
  description,
  onPick,
  label = 'Choose from catalogue',
  footer,
  disabled,
  variant = 'secondary',
}: {
  category: CatalogCategory;
  title: string;
  description?: string;
  onPick: (item: CatalogItem) => void;
  label?: string;
  footer?: (close: () => void) => ReactNode;
  disabled?: boolean;
  variant?: 'secondary' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {label}
      </Button>
      <Dialog open={open} onClose={close} title={title} description={description} size="md">
        <CatalogPicker
          category={category}
          onPick={(item) => {
            onPick(item);
            close();
          }}
          footer={footer?.(close)}
        />
      </Dialog>
    </>
  );
}
