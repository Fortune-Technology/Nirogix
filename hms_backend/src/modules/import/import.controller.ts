import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import { checkPermission } from '../../http/requirePermission';
import * as svc from './import.service';
import { DUPLICATE_STRATEGIES, type DuplicateStrategy } from './import.service';

/**
 * Bulk import (ADR-138).
 *
 * The permission is **the module's own** — importing medicines needs the same key as adding one
 * by hand, because it is the same act at a different scale. It is checked here rather than in
 * the route table because the route is generic over the module in its path; a fixed
 * `requirePermission` there could only have named one.
 */

function moduleFromPath(req: Request): ReturnType<typeof svc.getImportModule> {
  return svc.getImportModule(req.params.module!);
}

/** Reads the uploaded CSV as text. Rejects anything that is not text before parsing it. */
function csvFromRequest(req: Request): { text: string; filename: string } {
  const file = req.file;
  if (!file) throw Errors.validation(undefined, 'No file was uploaded');
  const text = file.buffer.toString('utf8');
  // A NUL byte in the first kilobyte means this is a spreadsheet binary (.xlsx) or an image
  // renamed to .csv — a clearer message than a parser producing one enormous nonsense column.
  if (text.slice(0, 1024).includes('\u0000')) {
    throw Errors.validation(
      { filename: file.originalname },
      'That looks like an Excel or binary file. Save it as CSV and upload again',
    );
  }
  return { text, filename: file.originalname };
}

export async function listModules(req: Request, res: Response): Promise<void> {
  // Every import this caller may actually perform. A module they cannot create records in is
  // absent rather than present-and-refusing (ADR-126).
  const all = svc.listImportModules();
  const permitted = await Promise.all(all.map((m) => checkPermission(req, m.permission)));
  const allowed = all.filter((_, i) => permitted[i]);
  res.json({ modules: allowed, duplicateStrategies: DUPLICATE_STRATEGIES });
}

export async function template(req: Request, res: Response): Promise<void> {
  const m = moduleFromPath(req);
  if (!(await checkPermission(req, m.permission)))
    throw Errors.forbidden('You cannot import this data');
  const csv = svc.buildTemplate(m);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="nirogix-${m.key}-template.csv"`);
  res.send(csv);
}

export async function preview(req: Request, res: Response): Promise<void> {
  const m = moduleFromPath(req);
  if (!(await checkPermission(req, m.permission)))
    throw Errors.forbidden('You cannot import this data');
  const { text } = csvFromRequest(req);
  const mapping = parseMapping(req.body?.mapping);
  res.json(await svc.previewImport(req.auth!.tenantId, m.key, text, mapping));
}

export async function commit(req: Request, res: Response): Promise<void> {
  const m = moduleFromPath(req);
  if (!(await checkPermission(req, m.permission)))
    throw Errors.forbidden('You cannot import this data');
  const { text, filename } = csvFromRequest(req);
  const strategy = String(req.body?.duplicateStrategy ?? 'skip') as DuplicateStrategy;
  if (!DUPLICATE_STRATEGIES.some((s) => s.value === strategy)) {
    throw Errors.validation({ duplicateStrategy: strategy }, 'Choose what to do about duplicates');
  }
  res.json(
    await svc.commitImport(
      req.auth!.tenantId,
      m.key,
      {
        csvText: text,
        filename,
        mapping: parseMapping(req.body?.mapping),
        duplicateStrategy: strategy,
      },
      req.auth!.userId,
    ),
  );
}

export async function history(req: Request, res: Response): Promise<void> {
  const moduleKey = typeof req.query.module === 'string' ? req.query.module : undefined;
  res.json(await svc.listImportRuns(req.auth!.tenantId, moduleKey));
}

/**
 * The mapping arrives as a JSON string in a multipart field, because the file travels beside it.
 * Malformed JSON is treated as "no mapping" — the detection then runs, which is a working import
 * rather than a 422 about a field the person never typed.
 */
function parseMapping(raw: unknown): Record<string, string | null> | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      out[k] = typeof v === 'string' && v !== '' ? v : null;
    }
    return out;
  } catch {
    return undefined;
  }
}
