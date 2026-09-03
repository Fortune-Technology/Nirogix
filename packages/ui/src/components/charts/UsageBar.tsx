'use client';

import { cn } from '../../cn';

export interface UsageBarProps {
  label: string;
  value: number;
  /** The 100% reference. A bar with no denominator is meaningless, so this is required. */
  total: number;
  /** Right-hand readout. Defaults to `value / total`. */
  caption?: string;
  color?: string;
  className?: string;
}

/**
 * A labelled proportion bar — module adoption, share of tenants, capacity
 * (ADR-043). Renders as a real `progressbar` so the value is announced rather
 * than implied by width, and takes its colour from a token like everything else.
 */
export function UsageBar({ label, value, total, caption, color, className }: UsageBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className={cn('hms-usage', className)}>
      <div className="hms-usage__head">
        <span className="hms-usage__label">{label}</span>
        <span className="hms-usage__value">{caption ?? `${value} / ${total}`}</span>
      </div>
      <div
        className="hms-usage__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        <div
          className="hms-usage__fill"
          style={{ width: `${pct}%`, background: color ?? 'var(--hms-brand)' }}
        />
      </div>
    </div>
  );
}
