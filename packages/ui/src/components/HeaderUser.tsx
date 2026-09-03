import type { ElementType } from 'react';
import { cn } from '../cn';

export interface HeaderUserProps {
  /** The signed-in user's full name. */
  name: string;
  /** Email address, shown on the secondary line. */
  email?: string | null;
  /** Role label(s), already formatted for display (e.g. "Doctor"). */
  role?: string | null;
  /**
   * The user's own profile route. When set the whole block becomes a link with a
   * hover state; omit it for a static identity readout.
   */
  href?: string;
  /** Link component to render as (e.g. Next's `Link`); falls back to a plain `<a>`. */
  linkAs?: ElementType;
  className?: string;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * The signed-in user's identity in an app's top bar — avatar, name, and a secondary
 * line carrying role and email.
 *
 * One implementation so every Nirogix app shows the account the same way (same
 * hierarchy: name, then role · email). When `href` is given the block links to that
 * user's profile with a hover state and the browser's focus outline; otherwise it is
 * a plain readout. The role string is passed in already formatted — the caller maps
 * role keys to display names (`formatRoleNames` in `@hms/permissions`).
 */
export function HeaderUser({ name, email, role, href, linkAs, className }: HeaderUserProps) {
  const secondary = [role, email].filter(Boolean) as string[];
  const title = secondary.length > 0 ? `${name} · ${secondary.join(' · ')}` : name;

  const inner = (
    <>
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-subtle text-xs font-semibold text-brand"
      >
        {initials(name)}
      </span>
      {/* Below `sm` only the avatar shows — the header is crowded on a phone; the
          full identity returns from the small breakpoint up. */}
      <span className="hidden min-w-0 flex-col leading-tight sm:flex">
        <span className="truncate text-sm font-medium text-fg">{name}</span>
        {secondary.length > 0 ? (
          <span className="truncate text-xs text-fg-subtle">
            {role ? <span className="font-medium text-fg-muted">{role}</span> : null}
            {role && email ? <span aria-hidden> · </span> : null}
            {email ? <span>{email}</span> : null}
          </span>
        ) : null}
      </span>
    </>
  );

  const classes = cn(
    'flex min-w-0 items-center gap-2.5 rounded-token px-1.5 py-1',
    href && 'transition-colors hover:bg-surface-2',
    className,
  );

  if (href) {
    const Link = (linkAs ?? 'a') as ElementType;
    return (
      <Link href={href} className={classes} title={title}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={classes} title={title}>
      {inner}
    </div>
  );
}
