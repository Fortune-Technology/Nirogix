import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@hms/ui';

type Variant = 'primary' | 'secondary' | 'accent' | 'ghost';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-md ' +
  'transition-[transform,background-color,border-color,color] duration-150 ease-out ' +
  'active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:opacity-55 disabled:pointer-events-none';

const sizes: Record<Size, string> = {
  md: 'text-[15px] px-[18px] py-2.5 leading-none',
  lg: 'text-base px-6 py-3 leading-none',
};

// The deep-teal accent is the system primary (resources/DESIGN.md §5). `accent` is
// an alias kept for existing call sites. `secondary` is the white-on-canvas action.
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover hover:-translate-y-px',
  secondary: 'bg-surface text-ink border border-hairline hover:bg-surface-2 hover:-translate-y-px',
  accent: 'bg-accent text-accent-ink hover:bg-accent-hover hover:-translate-y-px',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentProps<'button'>, 'className' | 'children'> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<ComponentProps<typeof Link>, 'className' | 'children' | 'href'> & {
    href: string;
  };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = 'primary', size = 'md', className, children, href, ...rest } = props;
  const classes = cn(base, sizes[size], variants[variant], className);

  if (href !== undefined) {
    const external = /^https?:\/\//.test(href) || href.startsWith('mailto:');
    if (external) {
      return (
        <a href={href} className={classes} {...(rest as ComponentProps<'a'>)}>
          {children}
        </a>
      );
    }
    return (
      <Link
        href={href}
        className={classes}
        {...(rest as Omit<ComponentProps<typeof Link>, 'href'>)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ComponentProps<'button'>)}>
      {children}
    </button>
  );
}
