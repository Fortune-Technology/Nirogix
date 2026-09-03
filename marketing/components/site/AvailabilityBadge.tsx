import { cn } from '@hms/ui';
import { AVAILABILITY, RELEASE_NOTE, type Availability } from '../../lib/availability';

/**
 * States plainly whether a capability exists today or is planned scope
 * (rules.md → Marketing Content & Claim Accuracy). Colour comes from the
 * marketing tokens only, so it follows the brand and both themes.
 */
export function AvailabilityBadge({
  status,
  className,
}: {
  status: Availability;
  className?: string;
}) {
  const { label, note } = AVAILABILITY[status];
  return (
    <span
      title={note}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        status === 'built'
          ? 'border border-accent-border bg-accent-subtle text-accent'
          : 'border border-hairline bg-surface-2 text-ink-muted',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'built' ? 'bg-accent' : 'bg-ink-faint',
        )}
      />
      {label}
    </span>
  );
}

/** The honest framing for any page that shows the catalogue. */
export function ReleaseNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'rounded-lg border border-hairline bg-surface px-4 py-3 text-sm leading-relaxed text-ink-muted',
        className,
      )}
    >
      {RELEASE_NOTE}
    </p>
  );
}
