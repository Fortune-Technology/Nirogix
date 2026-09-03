import { writeAudit } from '../audit/audit.service';

/**
 * The AI Portal's access boundary (ADR-053).
 *
 * **There is no AI capability behind this.** Nothing in the PRD, the architecture or any
 * phase authorises one, and `resources/phases.md` puts AI on the postponed list with a
 * condition attached: a CDSCO classification check before any diagnostic-support
 * feature is built. What ships here is the door, tested, so that when a capability is
 * scoped it lands behind a boundary that already exists.
 *
 * `capabilities` is therefore an empty list, and that is the honest answer rather than
 * an oversight. A client that renders whatever this returns will render nothing.
 */

export type AiPortalSession = {
  /** Deliberately empty. A capability appears here only when one is actually built. */
  capabilities: string[];
  /** Shown by the portal so a user is told why the screen is empty, not left guessing. */
  notice: string;
};

const NOTICE =
  'No AI capability is enabled on this platform yet. This portal exists so that access to one is ' +
  'controlled from the day it arrives.';

/**
 * Records that an authorised user entered the AI Portal, and returns what it can do.
 *
 * Audited at `notice`, because a surface that would process clinical information is one
 * where "who opened it, and when" has to be answerable later — before there is anything
 * to open, not after.
 */
export async function enterAiPortal(
  tenantId: string,
  actorUserId: string,
): Promise<AiPortalSession> {
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'ai.portal.enter',
    severity: 'notice',
    resourceType: 'ai_portal',
    resourceId: actorUserId,
  });

  return { capabilities: [], notice: NOTICE };
}
