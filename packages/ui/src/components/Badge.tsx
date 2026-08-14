import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn('hms-badge', tone !== 'neutral' && `hms-badge--${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}
