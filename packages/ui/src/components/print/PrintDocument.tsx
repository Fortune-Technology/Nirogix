import type { ReactNode } from "react";
import { formatDateTime } from "@hms/utils";
import { cn } from "../../cn";

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

export interface DocumentBrand {
  /** The hospital's name. Falls back to the platform's when absent. */
  organizationName?: string | null;
  logoUrl?: string | null;
  /** Any CSS colour; drives the rules and headings. Defaults to the brand token. */
  accent?: string | null;
  /** Address / phone / email / website / registration lines, in order, when configured. */
  contactLines?: string[];
}

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
  children: ReactNode;
}

const DEFAULT_ORG = "Nirogix";

export function PrintDocument({
  brand,
  title,
  reference,
  meta,
  footerNote,
  computerGenerated = true,
  children,
}: PrintDocumentProps) {
  const org = brand.organizationName?.trim() || DEFAULT_ORG;
  const accent = brand.accent || "var(--hms-brand)";

  return (
    <article className="hms-doc" style={{ ["--doc-accent" as string]: accent }}>
      <header className="hms-doc__header">
        <div className="hms-doc__identity">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the print document is
            // rendered for paper/PDF, where next/image's optimizer and lazy loading only
            // get in the way; the logo must be present the instant the dialog opens.
            <img src={brand.logoUrl} alt="" className="hms-doc__logo" />
          ) : null}
          <div>
            <div className="hms-doc__org">{org}</div>
            {(brand.contactLines ?? []).map((line) => (
              <div key={line} className="hms-doc__contact">
                {line}
              </div>
            ))}
          </div>
        </div>
        <div className="hms-doc__title-block">
          <h1 className="hms-doc__title">{title}</h1>
          {reference ? <div className="hms-doc__reference">{reference}</div> : null}
        </div>
      </header>

      {meta ? <div className="hms-doc__meta">{meta}</div> : null}

      <main className="hms-doc__body">{children}</main>

      <footer className="hms-doc__footer">
        <div>{footerNote ?? "Confidential — contains patient health information."}</div>
        {computerGenerated ? (
          <div className="hms-doc__generated">
            Computer-generated document · {formatDateTime(new Date())}
          </div>
        ) : null}
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
    <section className={cn("hms-doc__section", breakBefore && "hms-doc__section--break", className)}>
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
  emptyMessage = "No items.",
}: {
  columns: Array<{ key: string; header: ReactNode; align?: "left" | "right"; cell: (row: Row) => ReactNode }>;
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
            <th key={c.key} style={{ textAlign: c.align ?? "left" }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={rowKey(row, i)}>
            {columns.map((c) => (
              <td key={c.key} style={{ textAlign: c.align ?? "left" }}>
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
        <div key={i} className={cn("hms-doc__total", l.strong && "hms-doc__total--strong")}>
          <span>{l.label}</span>
          <span>{l.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Signature lines. Kept together with whatever precedes them where possible. */
export function PrintSignatures({ signatures }: { signatures: Array<{ label: string; name?: string }> }) {
  return (
    <div className="hms-doc__signatures">
      {signatures.map((s) => (
        <div key={s.label} className="hms-doc__signature">
          <div className="hms-doc__signature-line" />
          <div className="hms-doc__signature-label">{s.label}</div>
          {s.name ? <div className="hms-doc__signature-name">{s.name}</div> : null}
        </div>
      ))}
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
