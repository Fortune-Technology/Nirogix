import type { ReactNode } from 'react';
import { formatDateTime } from '@hms/utils';
import { cn } from '../../cn';

/**
 * The document/print layer (ADR-047).
 *
 * **Print prints the document, not the application.** These components render a
 * standalone, hospital-branded document — no sidebar, no navigation, no filters, no
 * action buttons — and the same markup is what the browser's print dialog turns
 * into paper or a PDF, so the two can never drift apart.
 *
 * A module supplies its document's *content*; everything structural lives here:
 * the branded header, the page geometry, repeating table headers across pages,
 * page-break control, the signature block, the confidentiality notice and the
 * footer. Adding a new printable document is a template, never a new print system.
 *
 * Branding is passed in, never assumed: the hospital's own name, logo and accent
 * when it has configured them, and the platform default when it has not.
 */

/** The paper a document targets (ADR-065). Maps to a sheet width and a CSS `@page size`. */
export type DocumentPageSize = 'A4' | 'A5' | 'LETTER' | 'LEGAL';

export interface DocumentBrand {
  /** The hospital's name. Falls back to the platform's when absent. */
  organizationName?: string | null;
  logoUrl?: string | null;
  /** Any CSS colour; drives the rules and headings. Defaults to the brand token. */
  accent?: string | null;
  /** Address / phone / email / website / registration lines, in order, when configured. */
  contactLines?: string[];
  /** Letterhead line printed under the hospital's name — tagline, accreditation (ADR-056). */
  headerLine?: string | null;
  /** Letterhead strip along the foot of every page. Replaces the default note when set. */
  footerLine?: string | null;
  /** Who signs by default, and their designation. */
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  /**
   * A pre-designed letterhead image (ADR-065). When set it becomes the document's header —
   * the constructed name/logo/contact block is replaced, because a hospital that has uploaded
   * a full letterhead strip has already put its identity in the image.
   */
  letterheadImageUrl?: string | null;
  /** The configured page size. `PrintDocument`'s own `pageSize` prop overrides it. */
  pageSize?: DocumentPageSize | null;
}

// Each size → the sheet width shown on screen and the keyword a print `@page size` uses.
// A single reusable table, never an A4 special case: adding a size is one row here.
const PAGE_GEOMETRY: Record<DocumentPageSize, { width: string; page: string }> = {
  A4: { width: '210mm', page: 'A4' },
  A5: { width: '148mm', page: 'A5' },
  LETTER: { width: '216mm', page: 'letter' },
  LEGAL: { width: '216mm', page: 'legal' },
};

export interface PrintDocumentProps {
  brand: DocumentBrand;
  /** "Tax invoice", "Laboratory report", "Prescription" — the document's own name. */
  title: string;
  /** The document's own number: invoice number, order id, prescription reference. */
  reference?: ReactNode;
  /** Right-hand header block: issue date, status, anything identifying this copy. */
  meta?: ReactNode;
  /** Shown at the foot of every page. Defaults to the confidentiality notice. */
  footerNote?: ReactNode;
  /** Adds "Computer-generated…" under the footer rule. On by default. */
  computerGenerated?: boolean;
  /** Overrides the hospital's configured page size for this one document type. */
  pageSize?: DocumentPageSize;
  children: ReactNode;
}

const DEFAULT_ORG = 'Nirogix';

export function PrintDocument({
  brand,
  title,
  reference,
  meta,
  footerNote,
  computerGenerated = true,
  pageSize,
  children,
}: PrintDocumentProps) {
  const org = brand.organizationName?.trim() || DEFAULT_ORG;
  const accent = brand.accent || 'var(--hms-brand)';
  const size: DocumentPageSize = pageSize ?? brand.pageSize ?? 'A4';
  const geometry = PAGE_GEOMETRY[size] ?? PAGE_GEOMETRY.A4;
  const hasLetterhead = Boolean(brand.letterheadImageUrl);

  // The document's own name + number. Sits on the right of the constructed header, or in a
  // full-width bar under the letterhead image when one is configured.
  const titleBlock = (
    <>
      <h1 className="hms-doc__title">{title}</h1>
      {reference ? <div className="hms-doc__reference">{reference}</div> : null}
    </>
  );

  return (
    <article
      className="hms-doc"
      data-page-size={size}
      style={{ ['--doc-accent' as string]: accent, ['--doc-width' as string]: geometry.width }}
    >
      {/* Drive the printed sheet size. `@page` cannot be scoped by selector, so it is set
          here rather than in the shared stylesheet — this component is only ever rendered
          one-per-page, in a print route. */}
      <style>{`@page { size: ${geometry.page}; margin: 12mm; }`}</style>

      {hasLetterhead ? (
        <header className="hms-doc__header hms-doc__header--image">
          {/* eslint-disable-next-line @next/next/no-img-element -- print document: next/image's
              optimizer/lazy-loading only get in the way; the letterhead must be present the
              instant the dialog opens. */}
          <img src={brand.letterheadImageUrl!} alt="" className="hms-doc__letterhead" />
        </header>
      ) : (
        <header className="hms-doc__header">
          <div className="hms-doc__identity">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- see above.
              <img src={brand.logoUrl} alt="" className="hms-doc__logo" />
            ) : null}
            <div>
              <div className="hms-doc__org">{org}</div>
              {brand.headerLine ? <div className="hms-doc__tagline">{brand.headerLine}</div> : null}
              {(brand.contactLines ?? []).map((line) => (
                <div key={line} className="hms-doc__contact">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="hms-doc__title-block">{titleBlock}</div>
        </header>
      )}

      {/* With a letterhead image the identity IS the image, so the document title needs its
          own row beneath it. */}
      {hasLetterhead ? <div className="hms-doc__title-bar">{titleBlock}</div> : null}

      {meta ? <div className="hms-doc__meta">{meta}</div> : null}

      <main className="hms-doc__body">{children}</main>

      <footer className="hms-doc__footer">
        {/* The hospital's own footer line, when it has written one, above the notice —
            both print: one is the hospital speaking, the other is the platform's
            confidentiality statement, and neither should silence the other. */}
        {brand.footerLine ? <div className="hms-doc__letterfoot">{brand.footerLine}</div> : null}
        <div className="hms-doc__footer-row">
          <div>{footerNote ?? 'Confidential. Contains patient health information.'}</div>
          {computerGenerated ? (
            <div className="hms-doc__generated">
              Computer-generated document · {formatDateTime(new Date())}
            </div>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

/** A titled block of the document. `break` starts it on a fresh page. */
export function PrintSection({
  title,
  children,
  breakBefore = false,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  breakBefore?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn('hms-doc__section', breakBefore && 'hms-doc__section--break', className)}
    >
      {title ? <h2 className="hms-doc__section-title">{title}</h2> : null}
      {children}
    </section>
  );
}

/** Label/value pairs — patient details, invoice dates, order identifiers. */
export function PrintFields({ fields }: { fields: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="hms-doc__fields">
      {fields.map((f) => (
        <div key={f.label} className="hms-doc__field">
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A document table. The header repeats on every printed page (`display:
 * table-header-group`) and rows are kept whole across a page break, so a
 * multi-page bill never orphans a line item under a headerless table.
 */
export function PrintTable<Row>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'No items.',
}: {
  columns: Array<{
    key: string;
    header: ReactNode;
    align?: 'left' | 'right';
    cell: (row: Row) => ReactNode;
  }>;
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) return <p className="hms-doc__empty">{emptyMessage}</p>;
  return (
    <table className="hms-doc__table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={{ textAlign: c.align ?? 'left' }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={rowKey(row, i)}>
            {columns.map((c) => (
              <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                {c.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The money block: a right-aligned ladder of lines with one emphasised total. */
export function PrintTotals({
  lines,
}: {
  lines: Array<{ label: ReactNode; value: ReactNode; strong?: boolean }>;
}) {
  return (
    <div className="hms-doc__totals">
      {lines.map((l, i) => (
        <div key={i} className={cn('hms-doc__total', l.strong && 'hms-doc__total--strong')}>
          <span>{l.label}</span>
          <span>{l.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Signature lines. Kept together with whatever precedes them where possible.
 *
 * A line marked `useDefaultSignatory` prints the hospital's configured signatory and
 * designation (ADR-056) — opt-in, never automatic, because a page usually has a
 * patient's line beside the hospital's and printing the Medical Superintendent's name
 * over the patient's signature would be worse than printing nothing.
 */
export interface PrintSignatureLine {
  label: string;
  name?: string;
  useDefaultSignatory?: boolean;
  /**
   * The signer's uploaded signature image, printed above the line (ADR-137).
   *
   * **An image, not a cryptographic signature.** The caller passes the URL of the version that
   * signed *this* document, resolved from what the record pinned at signing — never "the
   * signer's current signature", which would silently change what an old document shows.
   *
   * Absent is the normal case and always safe: the line prints blank, exactly as it did before
   * signatures existed, for a hospital that configures none and for every record signed before.
   */
  imageUrl?: string | null;
  /** What the image is of, for a screen reader and for a failed image load. */
  imageAlt?: string;
  /** When it was signed. Printed under the name, because a signature without a date says less. */
  signedAt?: ReactNode;
}

export function PrintSignatures({
  signatures,
  brand,
}: {
  signatures: PrintSignatureLine[];
  brand?: DocumentBrand;
}) {
  return (
    <div className="hms-doc__signatures">
      {signatures.map((s) => {
        const fallback = s.useDefaultSignatory ? brand : undefined;
        const name = s.name || fallback?.signatoryName || null;
        const designation = s.name ? null : (fallback?.signatoryDesignation ?? null);
        return (
          <div key={s.label} className="hms-doc__signature">
            {/* Sits ABOVE the rule, in a fixed-height box: with an image the line is signed, and
                without one the box still reserves its space so a page with one signed line and
                one blank line does not step down the middle. */}
            <div className="hms-doc__signature-mark">
              {s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imageUrl} alt={s.imageAlt ?? `Signature of ${name ?? s.label}`} />
              ) : null}
            </div>
            <div className="hms-doc__signature-line" />
            <div className="hms-doc__signature-label">{s.label}</div>
            {name ? <div className="hms-doc__signature-name">{name}</div> : null}
            {designation ? <div className="hms-doc__signature-name">{designation}</div> : null}
            {s.signedAt ? <div className="hms-doc__signature-meta">{s.signedAt}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/** A boxed note — terms, dosage instructions, a regulatory statement. */
export function PrintNote({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="hms-doc__note">
      {title ? <div className="hms-doc__note-title">{title}</div> : null}
      <div>{children}</div>
    </div>
  );
}
