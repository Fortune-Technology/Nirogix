import { cn } from '../cn';

export interface BrandMarkProps {
  /** Rendered square, in pixels. */
  size?: number;
  /**
   * Accessible name. Defaults to "Nirogix"; pass `""` when the mark sits next to
   * the wordmark, so a screen reader does not hear the name twice.
   */
  label?: string;
  className?: string;
}

/**
 * The Nirogix mark — an N monogram in a rounded tile, drawn from the design
 * tokens so it follows the brand, the theme, and a tenant accent with no asset to
 * maintain (rules.md → Branding & Multi-Tenant Customization).
 *
 * One implementation for every surface: the Portal shell and its login card, the
 * marketing header and footer, and both apps' favicons (`app/icon.svg`). Marketing
 * maps `--hms-brand` onto `--mk-accent` in its global stylesheet, so the same
 * component is on-brand there too (ADR-040).
 *
 * A tenant's own uploaded logo replaces this wherever one exists; this is what a
 * hospital without a logo, and the product itself, show.
 */
export function BrandMark({ size = 28, label = 'Nirogix', className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn('shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--hms-brand)" />
      <path d="M9 23V9h3.4l7.2 9.4V9H23v14h-3.4l-7.2-9.4V23H9Z" fill="var(--hms-brand-fg)" />
    </svg>
  );
}
