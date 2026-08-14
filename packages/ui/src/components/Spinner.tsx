import { cn } from '../cn';

export interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label = 'Loading' }: SpinnerProps) {
  return <span className={cn('hms-spinner', className)} role="status" aria-label={label} />;
}
