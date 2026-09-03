'use client';

import { Download, Printer, X } from 'lucide-react';
import { cn } from '../../cn';

/**
 * The only screen-side control on a print page (ADR-047), and it is `.hms-print-hide`
 * — it exists on screen and is gone from the paper.
 *
 * Print and "Save as PDF" are the *same* dialog on every current browser, driven by
 * the same document markup, which is exactly why the two outputs cannot drift. A
 * server-rendered PDF, if one is ever needed for emailing or archiving, renders this
 * same template headlessly rather than a second definition of the document.
 */
export function PrintToolbar({
  onBack,
  backLabel = 'Back',
  className,
}: {
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('hms-print-toolbar hms-print-hide', className)}>
      {onBack ? (
        <button type="button" className="hms-btn hms-btn--ghost hms-btn--sm" onClick={onBack}>
          <X size={15} strokeWidth={2} aria-hidden /> {backLabel}
        </button>
      ) : (
        <span />
      )}
      <div className="hms-print-toolbar__actions">
        <span className="hms-print-toolbar__hint">
          <Download size={14} strokeWidth={1.75} aria-hidden />
          Choose “Save as PDF” in the dialog to export
        </span>
        <button
          type="button"
          className="hms-btn hms-btn--primary hms-btn--sm"
          onClick={() => window.print()}
        >
          <Printer size={15} strokeWidth={2} aria-hidden /> Print
        </button>
      </div>
    </div>
  );
}
