import { and, desc, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { importRuns, users } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { parseCsv, toCsv } from './csv';
import {
  findImportModule,
  IMPORT_MODULES,
  normaliseHeader,
  type ImportField,
  type ImportModule,
} from './import.registry';

/**
 * The bulk-import engine (ADR-138) — one implementation, every module.
 *
 * A module contributes a description of its own data (`import.registry.ts`); everything a person
 * experiences happens here: the template they download, the automatic column mapping, the
 * validation, the preview that tells them what will happen *before* it happens, the duplicate
 * strategy, the commit, and the run record afterwards.
 *
 * ## Why preview and commit both take the file
 *
 * There is no server-side staging area. The browser holds the file and sends it twice — once to
 * be told what would happen, once to do it. Staging would mean a temp store, a lifecycle, a
 * cleanup job, and a window in which a hospital's patient register sits half-imported on a disk.
 * Sending eight hundred rows twice costs nothing by comparison.
 *
 * The consequence is deliberate and stated on the screen: **preview describes the file, not a
 * reservation.** If somebody else creates a matching record between the two calls, the commit
 * sees it and applies the chosen strategy. That is more honest than a preview that promises a
 * result the database has since made untrue.
 */

/** What to do with a row whose duplicate key already exists. */
export type DuplicateStrategy = 'skip' | 'update' | 'create_only';

export const DUPLICATE_STRATEGIES: readonly {
  value: DuplicateStrategy;
  label: string;
  description: string;
}[] = [
  {
    value: 'skip',
    label: 'Skip duplicates',
    description: 'Leave the existing record exactly as it is.',
  },
  {
    value: 'update',
    label: 'Update existing records',
    description: 'Overwrite the existing record with the row from your file.',
  },
  {
    value: 'create_only',
    label: 'Stop if anything is a duplicate',
    description: 'Import nothing unless every row is new.',
  },
];

/** A limit, because a preview holds every row in memory and a person cannot read 50,000 of them. */
const MAX_ROWS = 5000;

export interface ImportModuleSummary {
  key: string;
  label: string;
  description: string;
  permission: string;
  duplicateKey: { field: string; label: string };
  /** Whether `update` is offered — a module that must not be updated in bulk does not offer it. */
  supportsUpdate: boolean;
  fields: Array<{ key: string; label: string; required: boolean; hint?: string; example: string }>;
}

export function listImportModules(): ImportModuleSummary[] {
  return IMPORT_MODULES.map(summarise);
}

function summarise(m: ImportModule): ImportModuleSummary {
  return {
    key: m.key,
    label: m.label,
    description: m.description,
    permission: m.permission,
    duplicateKey: m.duplicateKey,
    supportsUpdate: Boolean(m.update),
    fields: m.fields.map((f) => ({
      key: f.key,
      label: f.label,
      required: Boolean(f.required),
      hint: f.hint,
      example: f.example,
    })),
  };
}

export function getImportModule(key: string): ImportModule {
  const m = findImportModule(key);
  if (!m) throw Errors.notFound('That import is not available');
  return m;
}

/**
 * The sample CSV (§10.2).
 *
 * Headers, then **two realistic rows** — not one, because a single row does not show a person
 * that the second row goes underneath rather than beside. Required columns are marked in the
 * header itself (`Name *`), which survives being opened in Excel; a notes block would not,
 * because Excel would read it as data.
 */
export function buildTemplate(m: ImportModule): string {
  const header = m.fields.map((f) => (f.required ? `${f.label} *` : f.label));
  const example = m.fields.map((f) => f.example);
  // A second row that is plausibly different, so the shape of the file is unambiguous.
  const second = m.fields.map((f) =>
    f.required ? f.example.replace(/\d+/, (n) => String(Number(n) + 1)) : '',
  );
  return toCsv([header, example, second]);
}

/** `Name *` in the template is the `Name` column. The asterisk is for the reader. */
function headerToField(header: string, fields: readonly ImportField[]): string | null {
  const cleaned = normaliseHeader(header.replace(/\*+\s*$/, ''));
  for (const f of fields) {
    if (normaliseHeader(f.label) === cleaned) return f.key;
    if (normaliseHeader(f.key) === cleaned) return f.key;
    if (f.aliases?.some((a) => normaliseHeader(a) === cleaned)) return f.key;
  }
  return null;
}

export interface PreviewRow {
  /** 1-based, counting the header as row 1 — the number the person sees in their spreadsheet. */
  line: number;
  values: Record<string, unknown>;
  /** The raw text of the duplicate key, for the message. */
  keyValue: string | null;
  status: 'ready' | 'duplicate' | 'error';
  /** Set when `status` is `duplicate` — what it matched. */
  matched?: { id: string; label: string };
  errors: Array<{ field: string | null; message: string }>;
}

export interface PreviewResult {
  module: ImportModuleSummary;
  /** The headers found in the file, in order. */
  columns: string[];
  /** Column header → system field. Detected automatically, overridable by the caller. */
  mapping: Record<string, string | null>;
  /** Required fields no column maps to. A non-empty list is why an import cannot proceed. */
  missingRequired: Array<{ key: string; label: string }>;
  totals: { rows: number; ready: number; duplicates: number; errors: number };
  rows: PreviewRow[];
}

/**
 * Reads the file and says what would happen, without changing anything (§10.4).
 *
 * `mappingOverride` lets a person correct a column the detection got wrong or could not guess —
 * the case the brief calls out, where a hospital's export uses its own words.
 */
export async function previewImport(
  tenantId: string,
  moduleKey: string,
  csvText: string,
  mappingOverride?: Record<string, string | null>,
): Promise<PreviewResult> {
  const m = getImportModule(moduleKey);
  const table = parseCsv(csvText);
  if (table.length === 0) throw Errors.validation(undefined, 'That file has no rows');

  const columns = (table[0] ?? []).map((c) => c.trim());
  const mapping: Record<string, string | null> = {};
  const used = new Set<string>();
  for (const col of columns) {
    const override = mappingOverride?.[col];
    // `null` in the override is "ignore this column", which is different from "not mentioned".
    const field = override !== undefined ? override : headerToField(col, m.fields);
    // A field can only be filled from one column; a second match is ignored rather than racing.
    mapping[col] = field && !used.has(field) ? field : null;
    if (mapping[col]) used.add(mapping[col]!);
  }

  const missingRequired = m.fields
    .filter((f) => f.required && !used.has(f.key))
    .map((f) => ({ key: f.key, label: f.label }));

  const body = table.slice(1);
  if (body.length > MAX_ROWS) {
    throw Errors.validation(
      { rows: body.length, max: MAX_ROWS },
      `That file has ${body.length} rows. Import up to ${MAX_ROWS} at a time`,
    );
  }

  const rows: PreviewRow[] = [];
  // Duplicates *within the file itself* — two rows with the same code is a mistake in the
  // spreadsheet, and it must be caught here rather than as a confusing half-import.
  const seenKeys = new Map<string, number>();

  for (let i = 0; i < body.length; i++) {
    const cells = body[i]!;
    const line = i + 2; // Header is line 1.
    const values: Record<string, unknown> = {};
    const errors: PreviewRow['errors'] = [];

    columns.forEach((col, idx) => {
      const fieldKey = mapping[col];
      if (!fieldKey) return;
      const field = m.fields.find((f) => f.key === fieldKey)!;
      const raw = (cells[idx] ?? '').trim();
      if (field.parse) {
        const parsed = field.parse(raw);
        if ('error' in parsed)
          errors.push({ field: field.key, message: `${field.label}: ${parsed.error}` });
        else if (parsed.value !== undefined) values[field.key] = parsed.value;
      } else if (raw !== '') {
        values[field.key] = raw;
      }
    });

    for (const f of m.fields) {
      if (
        f.required &&
        values[f.key] === undefined &&
        !missingRequired.some((mr) => mr.key === f.key)
      ) {
        errors.push({ field: f.key, message: `${f.label} is required` });
      }
    }

    const keyValue =
      values[m.duplicateKey.field] === undefined ? null : String(values[m.duplicateKey.field]);

    let status: PreviewRow['status'] = errors.length > 0 ? 'error' : 'ready';
    let matched: PreviewRow['matched'];

    if (status === 'ready' && keyValue) {
      const earlier = seenKeys.get(keyValue.toLowerCase());
      if (earlier !== undefined) {
        errors.push({
          field: m.duplicateKey.field,
          message: `Same ${m.duplicateKey.label} as row ${earlier} of this file`,
        });
        status = 'error';
      } else {
        seenKeys.set(keyValue.toLowerCase(), line);
        const existing = await m.findExisting(tenantId, keyValue);
        if (existing) {
          matched = existing;
          status = 'duplicate';
        }
      }
    }

    rows.push({ line, values, keyValue, status, matched, errors });
  }

  return {
    module: summarise(m),
    columns,
    mapping,
    missingRequired,
    totals: {
      rows: rows.length,
      ready: rows.filter((r) => r.status === 'ready').length,
      duplicates: rows.filter((r) => r.status === 'duplicate').length,
      errors: rows.filter((r) => r.status === 'error').length,
    },
    rows,
  };
}

export interface CommitResult {
  runId: string;
  totals: { rows: number; created: number; updated: number; skipped: number; failed: number };
  errors: Array<{ line: number; message: string }>;
}

/**
 * Does it (§10.5).
 *
 * **Row by row, not one transaction.** Eight hundred medicines where row 412 has a bad price
 * should import 799 and tell you about 412 — rolling the whole thing back would mean a hospital
 * fixing one cell and re-uploading everything, repeatedly. The run record is what makes that
 * safe: it says exactly what landed. The one exception is `create_only`, which is chosen
 * *because* the operator wants all-or-nothing on duplicates, so it refuses before writing
 * anything rather than stopping halfway.
 */
export async function commitImport(
  tenantId: string,
  moduleKey: string,
  input: {
    csvText: string;
    filename: string;
    mapping?: Record<string, string | null>;
    duplicateStrategy: DuplicateStrategy;
  },
  actorUserId?: string,
): Promise<CommitResult> {
  const m = getImportModule(moduleKey);
  if (input.duplicateStrategy === 'update' && !m.update) {
    throw Errors.validation(
      { module: moduleKey },
      `${m.label} cannot be updated by import. Choose "skip duplicates" instead`,
    );
  }

  const preview = await previewImport(tenantId, moduleKey, input.csvText, input.mapping);
  if (preview.missingRequired.length > 0) {
    throw Errors.validation(
      { missing: preview.missingRequired },
      `Map a column to: ${preview.missingRequired.map((f) => f.label).join(', ')}`,
    );
  }
  // Refused before anything is written, which is the whole point of choosing this strategy.
  if (input.duplicateStrategy === 'create_only' && preview.totals.duplicates > 0) {
    throw Errors.conflict(
      `${preview.totals.duplicates} of ${preview.totals.rows} rows already exist. Nothing was imported`,
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ line: number; message: string }> = [];

  for (const row of preview.rows) {
    if (row.status === 'error') {
      errors.push({ line: row.line, message: row.errors.map((e) => e.message).join('; ') });
      continue;
    }
    try {
      if (row.status === 'duplicate') {
        if (input.duplicateStrategy === 'skip') {
          skipped += 1;
          continue;
        }
        await m.update!(tenantId, row.matched!.id, row.values, actorUserId);
        updated += 1;
        continue;
      }
      await m.create(tenantId, row.values, actorUserId);
      created += 1;
    } catch (e) {
      // A create that fails on a rule the preview could not know — a unique constraint, a
      // cross-module reference — is one bad row, reported with its line, not a failed import.
      errors.push({
        line: row.line,
        message: e instanceof Error ? e.message : 'Could not import this row',
      });
    }
  }

  const failed = errors.length;
  const run = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(importRuns)
      .values({
        tenantId,
        module: m.key,
        filename: input.filename.slice(0, 255),
        duplicateStrategy: input.duplicateStrategy,
        totalRows: preview.totals.rows,
        created,
        updated,
        skipped,
        failed,
        importedBy: actorUserId ?? null,
        // Capped: a run record is for reconciling, and a thousand identical messages is not more
        // useful than the first fifty plus the count, which the totals already carry.
        errors: errors.slice(0, 50),
      })
      .returning({ id: importRuns.id });
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'import.run',
    resourceType: 'import_run',
    resourceId: run.id,
    metadata: {
      module: m.key,
      filename: input.filename,
      duplicateStrategy: input.duplicateStrategy,
      created,
      updated,
      skipped,
      failed,
    },
  });

  return {
    runId: run.id,
    totals: { rows: preview.totals.rows, created, updated, skipped, failed },
    errors: errors.slice(0, 50),
  };
}

export interface ImportRunView {
  id: string;
  module: string;
  moduleLabel: string;
  filename: string;
  duplicateStrategy: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ line: number; message: string }>;
  importedByName: string | null;
  createdAt: string;
}

/** The history (§10.7) — every run this hospital has performed, newest first. */
export async function listImportRuns(
  tenantId: string,
  moduleKey?: string,
): Promise<ImportRunView[]> {
  const rows = await runWithTenant(tenantId, (tx) => {
    const conds = [eq(importRuns.tenantId, tenantId)];
    if (moduleKey) conds.push(eq(importRuns.module, moduleKey));
    return tx
      .select({ run: importRuns, importerName: users.fullName })
      .from(importRuns)
      .leftJoin(users, eq(users.id, importRuns.importedBy))
      .where(and(...conds))
      .orderBy(desc(importRuns.createdAt))
      .limit(100);
  });
  return rows.map((r) => ({
    id: r.run.id,
    module: r.run.module,
    moduleLabel: findImportModule(r.run.module)?.label ?? r.run.module,
    filename: r.run.filename,
    duplicateStrategy: r.run.duplicateStrategy,
    totalRows: r.run.totalRows,
    created: r.run.created,
    updated: r.run.updated,
    skipped: r.run.skipped,
    failed: r.run.failed,
    errors: (r.run.errors as Array<{ line: number; message: string }> | null) ?? [],
    importedByName: r.importerName ?? null,
    createdAt: r.run.createdAt.toISOString(),
  }));
}
