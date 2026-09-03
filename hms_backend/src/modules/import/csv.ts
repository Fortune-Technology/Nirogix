/**
 * A CSV reader and writer, to RFC 4180 (ADR-138).
 *
 * Written here rather than pulled in, because the whole of what this needs is quoting, escaped
 * quotes, embedded commas and newlines, and a BOM — about eighty lines — and a parser is a
 * dependency that reads every byte a hospital uploads. `resources/rules.md` asks that every new
 * dependency be justified; this one could not be.
 *
 * What it deliberately handles, because real exports from real systems contain all of it:
 *
 * - **A UTF-8 BOM.** Excel writes one, and without stripping it the first header becomes
 *   `﻿Medicine Name` and matches nothing — the failure looks like "your file is wrong".
 * - **CRLF, LF and a lone CR.** Windows, Unix, and old Mac exports.
 * - **Quoted fields containing commas, quotes and newlines.** A drug called
 *   `Paracetamol 500mg, dispersible` is one field, not two.
 * - **A trailing newline**, which is not an empty final row.
 */

/** Rows of raw string cells, exactly as they appeared. Trimming is the caller's decision. */
export type CsvRows = string[][];

export function parseCsv(text: string): CsvRows {
  // Excel's BOM. Strip before anything else looks at the first character.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: CsvRows = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i]!;

    if (inQuotes) {
      if (ch === '"') {
        // `""` inside a quoted field is one literal quote; a lone `"` ends the field.
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // CRLF or a lone CR both end the row.
      endRow();
      i += input[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // A file that does not end in a newline still has a final row; one that does, does not.
  if (field !== '' || row.length > 0) endRow();

  // A row of nothing but empty cells is blank spacing in a spreadsheet, not a record.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Quotes a cell only when it has to be quoted, so a template stays readable in a text editor. */
function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Writes CSV with a **BOM and CRLF**.
 *
 * Both are for Excel, which is what a hospital opens a template in: without the BOM it mangles
 * any non-ASCII character (a patient's name, a ₹ sign), and without CRLF some versions run the
 * whole file onto one line.
 */
export function toCsv(rows: CsvRows): string {
  return '﻿' + rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}
