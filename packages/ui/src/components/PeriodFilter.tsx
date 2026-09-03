'use client';

import { useMemo, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CalendarRange, ChevronDown } from 'lucide-react';
import {
  formatDateRange,
  parseDate,
  resolveDateRange,
  toApiDate,
  todayApiDate,
  type DateRange,
  type DateRangePreset,
} from '@hms/utils';
import { cn } from '../cn';
import { Calendar } from './datetime/Calendar';

/** The current selection: which preset, plus the inclusive ISO range it resolves to. */
export interface PeriodValue {
  preset: DateRangePreset;
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

export interface PeriodFilterProps {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  /**
   * Which presets to offer, in the order the caller wants them. They are grouped
   * automatically. Omit to offer the full set. `custom` is always available unless
   * the caller drops it from this list.
   */
  presets?: DateRangePreset[];
  /** Short prefix on the trigger, e.g. "Period" → "Period: Last 30 days". */
  label?: string;
  /** Which edge the panel aligns to. */
  align?: 'start' | 'end';
  /** Latest selectable day for a custom range (default today) — the platform has no future data. */
  maxDate?: string;
  disabled?: boolean;
  className?: string;
}

const PRESET_META: Record<DateRangePreset, { label: string; group: string }> = {
  today: { label: 'Today', group: 'Quick select' },
  yesterday: { label: 'Yesterday', group: 'Quick select' },
  thisWeek: { label: 'This week', group: 'Quick select' },
  lastWeek: { label: 'Last week', group: 'Quick select' },
  thisMonth: { label: 'This month', group: 'Quick select' },
  lastMonth: { label: 'Last month', group: 'Quick select' },
  last7Days: { label: 'Last 7 days', group: 'Rolling' },
  last30Days: { label: 'Last 30 days', group: 'Rolling' },
  last90Days: { label: 'Last 90 days', group: 'Rolling' },
  last3Months: { label: 'Last 3 months', group: 'Months' },
  last6Months: { label: 'Last 6 months', group: 'Months' },
  last12Months: { label: 'Last 12 months', group: 'Months' },
  last24Months: { label: 'Last 24 months', group: 'Months' },
  thisFinancialYear: { label: 'This financial year', group: 'Financial year' },
  lastFinancialYear: { label: 'Last financial year', group: 'Financial year' },
  thisYear: { label: 'This year', group: 'Calendar year' },
  lastYear: { label: 'Last year', group: 'Calendar year' },
  custom: { label: 'Custom range', group: 'Custom' },
};

const GROUP_ORDER = [
  'Quick select',
  'Rolling',
  'Months',
  'Financial year',
  'Calendar year',
  'Custom',
] as const;

const DEFAULT_PRESETS: DateRangePreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'last7Days',
  'last30Days',
  'last90Days',
  'last3Months',
  'last6Months',
  'last12Months',
  'last24Months',
  'thisFinancialYear',
  'lastFinancialYear',
  'thisYear',
  'lastYear',
  'custom',
];

/** Build a `PeriodValue` from a preset — the easy way to seed a page's default. */
export function makePeriod(preset: Exclude<DateRangePreset, 'custom'>): PeriodValue {
  const r = resolveDateRange(preset)!;
  return { preset, start: r.start, end: r.end };
}

/** The label shown on the trigger for the current value. */
function triggerLabel(value: PeriodValue): string {
  return value.preset === 'custom'
    ? formatDateRange(value.start, value.end)
    : PRESET_META[value.preset].label;
}

/**
 * The one Date/Period range filter (ADR-046). A single "Date range ▾" popover with
 * grouped presets and a custom range picker, so every dashboard, report and analytics
 * screen filters time the same way across the Portal and the platform console instead
 * of hand-rolling day/month button rows.
 *
 * It owns only the *selection*; it emits a normalized inclusive ISO `{ start, end }`
 * (plus the preset key) and the parent maps that onto whatever its API expects. The
 * date arithmetic lives in `@hms/utils` (`resolveDateRange`), so "Last 6 months" means
 * the same thing everywhere.
 */
export function PeriodFilter({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  label,
  align = 'start',
  maxDate,
  disabled,
  className,
}: PeriodFilterProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'presets' | 'custom'>('presets');
  // Draft custom range while the calendar is open; committed only on Apply.
  const [draft, setDraft] = useState<{ from?: Date; to?: Date }>({});

  const max = maxDate ?? todayApiDate();

  // Group the requested presets under their section headers, in canonical order.
  const groups = useMemo(() => {
    const wanted = new Set(presets);
    return GROUP_ORDER.map((group) => ({
      group,
      items: presets.filter((p) => wanted.has(p) && PRESET_META[p].group === group),
    })).filter((g) => g.items.length > 0);
  }, [presets]);

  function pickPreset(preset: DateRangePreset) {
    if (preset === 'custom') {
      const from = parseDate(value.start) ?? undefined;
      const to = parseDate(value.end) ?? undefined;
      setDraft({ from, to });
      setView('custom');
      return;
    }
    const r = resolveDateRange(preset) as DateRange;
    onChange({ preset, start: r.start, end: r.end });
    setOpen(false);
  }

  function applyCustom() {
    if (!draft.from || !draft.to) return;
    onChange({ preset: 'custom', start: toApiDate(draft.from)!, end: toApiDate(draft.to)! });
    setOpen(false);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setView(value.preset === 'custom' ? 'custom' : 'presets');
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        type="button"
        disabled={disabled}
        className={cn('hms-period__trigger', className)}
      >
        <CalendarRange size={15} strokeWidth={1.75} aria-hidden />
        <span className="hms-period__trigger-label">
          {label ? <span className="hms-period__trigger-prefix">{label}:</span> : null}
          {triggerLabel(value)}
        </span>
        <ChevronDown size={15} strokeWidth={2} aria-hidden className="hms-period__trigger-caret" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="hms-popover-positioner" sideOffset={6} align={align}>
          <Popover.Popup className="hms-popover hms-period__panel" data-lenis-prevent>
            {view === 'presets' ? (
              <div className="hms-period__presets" role="listbox" aria-label="Date range presets">
                {groups.map((g) => (
                  <div key={g.group} className="hms-period__group">
                    <div className="hms-period__group-label">{g.group}</div>
                    {g.items.map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="option"
                        aria-selected={value.preset === p}
                        className={cn(
                          'hms-period__item',
                          value.preset === p && 'hms-period__item--active',
                        )}
                        onClick={() => pickPreset(p)}
                      >
                        {PRESET_META[p].label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="hms-period__custom">
                <Calendar
                  mode="range"
                  selected={draft.from ? { from: draft.from, to: draft.to } : undefined}
                  defaultMonth={draft.from ?? parseDate(value.start) ?? undefined}
                  onSelect={(r) => setDraft({ from: r?.from, to: r?.to })}
                  disabled={{ after: parseDate(max)! }}
                  endMonth={parseDate(max) ?? undefined}
                  autoFocus
                />
                <div className="hms-period__custom-footer">
                  <span className="hms-period__custom-range">
                    {draft.from
                      ? formatDateRange(
                          toApiDate(draft.from),
                          draft.to ? toApiDate(draft.to) : null,
                        )
                      : 'Pick a start and end date'}
                  </span>
                  <div className="hms-period__custom-actions">
                    <button
                      type="button"
                      className="hms-btn hms-btn--ghost hms-btn--sm"
                      onClick={() => setView('presets')}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="hms-btn hms-btn--primary hms-btn--sm"
                      disabled={!draft.from || !draft.to}
                      onClick={applyCustom}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
