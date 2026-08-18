import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn('hms-btn', `hms-btn--${variant}`, size === 'sm' && 'hms-btn--sm', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="hms-spinner" aria-hidden />}
      {children}
    </button>
  );
}
