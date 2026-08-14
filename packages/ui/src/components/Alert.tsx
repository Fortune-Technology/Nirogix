import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

type Tone = 'neutral' | 'danger' | 'success';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

export function Alert({ tone = 'neutral', className, children, ...rest }: AlertProps) {
  return (
    <div role="alert" className={cn('hms-alert', tone !== 'neutral' && `hms-alert--${tone}`, className)} {...rest}>
      {children}
    </div>
  );
}
