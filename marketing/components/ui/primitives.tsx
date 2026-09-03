import type { ReactNode } from 'react';
import { cn } from '@hms/ui';

/** Centered max-width content column. One container width across the whole site. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1400px] px-5 sm:px-6 lg:px-10', className)}>
      {children}
    </div>
  );
}

/** Small sentence-case label above a section headline. Use sparingly (rationed). */
export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('text-sm font-medium text-accent', className)}>{children}</p>;
}

/**
 * Section header: eyebrow (optional) + headline + lede, stacked vertically.
 * Never the "big headline left / small paragraph right" split pattern.
 */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' && 'items-center text-center',
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        className={cn(
          'mk-heading text-3xl text-ink sm:text-4xl md:text-[2.75rem]',
          align === 'center' ? 'max-w-3xl' : 'max-w-2xl',
        )}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            'mk-lede text-lg leading-relaxed',
            align === 'center' ? 'max-w-2xl' : 'max-w-[46rem]',
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

/** A small tinted chip for a trust mark / capability tag. */
export function Pill({
  icon,
  children,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-muted',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
