import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  /**
   * Actions that belong at the **end** of the card's content rather than above it.
   *
   * A page's primary action stays in `PageHeader` (ADR-128) — this is for the action a
   * card-scoped *form* earns once it has been filled: **Add another prescription**, **Add
   * another test**. Putting those in the header asks the user to reach back up past a row
   * they have not finished; putting them here is where their eye already is. Row-repeating
   * cards use it; a card that only displays does not need one.
   */
  footer?: ReactNode;
}

export function Card({ header, footer, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('hms-card', className)} {...rest}>
      {header && <div className="hms-card__header">{header}</div>}
      <div className="hms-card__body">{children}</div>
      {footer && <div className="hms-card__footer">{footer}</div>}
    </div>
  );
}
