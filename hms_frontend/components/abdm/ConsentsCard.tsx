'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Card, DateDisplay, DateTimeDisplay, EmptyState, Spinner } from '@hms/ui';
import { FileCheck } from 'lucide-react';
import * as api from '../../lib/api';

/**
 * Consents other providers hold over this hospital's records (ADR-100).
 *
 * Exists because three certification cases — `HIP_INIT_GRANT_CONSENT`, `HIP_INIT_REVOKE_CONSENT`
 * and `HIP_INIT_EXPIRE_CONSENT` — state their expected result as **"seen in HMIS"**. The
 * requirement is that somebody can *look*, not merely that the system behaves correctly, and until
 * this screen existed we could revoke a consent properly and had no way to show it happening.
 *
 * The two lists answer different questions and that separation is the point:
 *
 * - **Current permissions** is what we hold right now. A revoked consent leaves it immediately,
 *   because the artefact is destroyed rather than flagged (ADR-087).
 * - **What has happened** is drawn from the audit trail, which is metadata only and is never
 *   deleted. So a revoked consent appears *here* after it disappears from above — which is exactly
 *   what an assessor needs to watch, and what makes the deletion provable rather than merely
 *   claimed.
 */

const EVENT_LABEL: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  granted: { label: 'Granted', tone: 'success' },
  revoked: { label: 'Revoked by patient', tone: 'danger' },
  expired: { label: 'Expired', tone: 'warning' },
  erased: { label: 'Erased on opt-out', tone: 'warning' },
};

export function ConsentsCard() {
  const [data, setData] = useState<{
    consents: api.AbdmHeldConsent[];
    history: api.AbdmConsentEvent[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await api.listAbdmConsents().catch(() => null);
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card header="Consents from other providers">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  const consents = data?.consents ?? [];
  const history = data?.history ?? [];

  return (
    <Card
      header={
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <FileCheck className="size-4 text-fg-muted" aria-hidden />
            Consents from other providers
          </span>
          <Badge tone="neutral">{consents.length} current</Badge>
        </div>
      }
    >
      <Alert>
        When a patient allows another hospital or clinic to read records held here, ABDM sends us a
        consent. These are the permissions currently in force. Withdrawing one deletes it and the
        records shared under it &mdash; that is why a withdrawn consent leaves this list and appears
        in the history below.
      </Alert>

      {consents.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No consents in force"
            description="Nobody currently has permission to read this hospital's records for a patient."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {consents.map((c) => (
            <li key={c.consentId} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-fg">{c.hiuId ?? 'A requesting provider'}</span>
                <Badge tone="success">In force</Badge>
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                {c.hiTypes.join(', ') || 'No record types named'}
                {c.dataEraseAt && (
                  <>
                    {' '}
                    &middot; expires <DateDisplay value={c.dataEraseAt} />
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-fg">What has happened</h3>
        <p className="mt-1 text-xs text-fg-muted">
          Kept even after a consent is deleted, so there is always a record that one existed and how
          it ended. It holds no clinical information.
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">Nothing yet.</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {history.slice(0, 20).map((h, i) => {
              const event = EVENT_LABEL[h.event] ?? { label: h.event, tone: 'neutral' as const };
              return (
                <li
                  key={`${h.consentId}-${h.event}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 text-sm last:border-b-0"
                >
                  <span className="flex items-center gap-2">
                    <Badge tone={event.tone}>{event.label}</Badge>
                    <span className="text-fg-muted">{h.hiuId ?? 'requesting provider'}</span>
                  </span>
                  <span className="text-xs text-fg-muted">
                    <DateTimeDisplay value={h.recordedAt} />
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}
