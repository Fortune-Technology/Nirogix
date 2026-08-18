import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
}

export function Card({ header, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('hms-card', className)} {...rest}>
      {header && <div className="hms-card__header">{header}</div>}
      <div className="hms-card__body">{children}</div>
    </div>
  );
}
