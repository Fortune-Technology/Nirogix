import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { db } from '../../db/client';
import { abdmConsents } from '../../db/schema';
import { purgeExpiredHiuConsents } from './hiuConsent.service';
import { purgeExpiredConsents } from './consent.service';

/**
 * The scheduled destruction of borrowed records (ADR-092).
 *
 * ABDM's certification test `HIU_FLOW_301` checks that an **expired** consent's records are gone.
 * Nothing else in the system guarantees that: expiry is a date passing, not an event anybody sends
 * us. ABDM does usually notify, but "usually" is not a compliance position — a notification that is
 * delayed, dropped, or sent while we are redeploying would otherwise leave another hospital's
 * clinical data on our disk indefinitely.
 *
 * Deliberately an in-process interval rather than a BullMQ repeatable job. The queue is the right
 * home for work that must happen *once* across a cluster; this is the opposite — it must happen
 * *at all*, and every purge is an idempotent `DELETE`, so several instances running it concurrently
 * costs a little duplicated work and buys independence from Redis being up. A deletion obligation
 * should not be one dependency away from silently not happening.
 *
 * It sweeps the M2 consent store too. Same reasoning, same shape, one timer.
 */

let timer: NodeJS.Timeout | null = null;

/** How often to look. Frequent enough that "expired" means minutes, cheap enough to ignore. */
const INTERVAL_MS = 15 * 60_000;

/**
 * One pass. Exported so a test — and an operator — can run it without waiting for the clock.
 *
 * Never throws: a sweep that dies on one tenant's bad row must still sweep the rest, and must run
 * again next interval rather than taking the timer down with it.
 */
export async function sweepOnce(): Promise<{ consents: number; records: number }> {
  try {
    const hiu = await purgeExpiredHiuConsents();

    // M2's own artefact expiry, which had no scheduler until this existed. That purge is
    // tenant-scoped (it runs under RLS), so the tenants holding consents are enumerated first —
    // only those, because a sweep over every tenant on the platform would be mostly empty work.
    const tenants = await db.selectDistinct({ tenantId: abdmConsents.tenantId }).from(abdmConsents);
    let hip = 0;
    for (const row of tenants) hip += await purgeExpiredConsents(row.tenantId);

    if (hiu.consents > 0 || hip > 0) {
      logger.info(
        { hiuConsents: hiu.consents, hiuRecords: hiu.records, hipConsents: hip },
        'ABDM consent sweep purged',
      );
    }
    return hiu;
  } catch (err) {
    logger.error(
      { err },
      'ABDM consent sweep failed — records may still be held past their erase date',
    );
    return { consents: 0, records: 0 };
  }
}

/** Starts the timer. Idempotent, and a no-op under test so suites do not race a background delete. */
export function startHiuSweeper(): void {
  if (timer || env.NODE_ENV === 'test') return;
  // Once at boot: a process that was down over an erase date must not wait a further interval.
  void sweepOnce();
  timer = setInterval(() => void sweepOnce(), INTERVAL_MS);
  timer.unref();
  logger.info({ intervalMinutes: INTERVAL_MS / 60_000 }, 'ABDM consent expiry sweeper started');
}

export function stopHiuSweeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
