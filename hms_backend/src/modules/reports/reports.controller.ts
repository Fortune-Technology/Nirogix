import type { Request, Response } from 'express';
import { z } from '../../openapi/registry';
import { Errors } from '../../http/error';
import * as svc from './reports.service';

/** Longest span a report may cover. Beyond this the query stops being interactive. */
const MAX_RANGE_DAYS = 366;

const RangeQuery = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * Validated date range. Previously the raw query string went straight to the
 * query, so a multi-year span was a single unbounded scan (SECURITY-AUDIT.md M-2).
 */
function range(req: Request): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const parsed = RangeQuery.parse(req.query);
  const from = parsed.from ?? today;
  const to = parsed.to ?? today;

  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end))
    throw Errors.validation(undefined, 'Invalid date range');
  if (end < start) throw Errors.validation(undefined, '"to" must not be earlier than "from"');
  if (end - start > MAX_RANGE_DAYS * 86_400_000) {
    throw Errors.validation(undefined, `Report range is limited to ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

export async function opdRegister(req: Request, res: Response): Promise<void> {
  const { from, to } = range(req);
  res.json(await svc.opdRegister(req.auth!.tenantId, from, to));
}

export async function collections(req: Request, res: Response): Promise<void> {
  const { from, to } = range(req);
  res.json(await svc.collections(req.auth!.tenantId, from, to));
}

export async function pendingLabs(req: Request, res: Response): Promise<void> {
  res.json(await svc.pendingLabs(req.auth!.tenantId));
}
