'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Check, CircleDashed, Lock, X } from 'lucide-react';
import { Alert, Badge, Card, ErrorState, Skeleton, UsageBar } from '@hms/ui';
import type { SetupStatus, SetupStep } from '@hms/types';
import * as api from '../../lib/api';
import { useAuth, useCan } from '../../lib/auth';

/**
 * Hospital setup progress (ADR-049).
 *
 * Every tick is derived from the hospital's real data on each read — never a stored
 * "wizard finished" flag — so the console stays truthful when configuration changes
 * later. A step whose dependency is not met is shown as waiting, with the reason,
 * rather than hidden: the administrator can see the order the hospital comes up in.
 */
export function useSetupStatus(): {
  status: SetupStatus | null;
  error: string | null;
  reload: () => void;
} {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .getSetupStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof api.ApiRequestError ? e.message : 'Could not load the setup status.'),
      );
  }, []);

  useEffect(() => reload(), [reload]);

  return { status, error, reload };
}

function StepRow({ step, blockedBy }: { step: SetupStep; blockedBy: SetupStep[] }) {
  const allowed = useCan(step.permission ?? '');
  const permitted = step.permission === null || allowed;
  const waiting = !step.complete && blockedBy.length > 0;

  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-border py-3 last:border-b-0">
      <span
        aria-hidden
        className={[
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
          step.complete
            ? 'border-success bg-success/10 text-success'
            : waiting
              ? 'border-border bg-surface-2 text-fg-subtle'
              : 'border-border bg-surface text-fg-subtle',
        ].join(' ')}
      >
        {step.complete ? (
          <Check size={14} strokeWidth={3} />
        ) : waiting ? (
          <Lock size={12} />
        ) : (
          <CircleDashed size={14} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-fg">{step.label}</span>
          {step.complete ? (
            <Badge tone="success">Done{step.count > 1 ? ` · ${step.count}` : ''}</Badge>
          ) : step.required ? (
            <Badge tone="warning">Needed</Badge>
          ) : (
            <Badge>Optional</Badge>
          )}
          {step.module ? <Badge tone="brand">{step.module}</Badge> : null}
        </div>
        <p className="mt-0.5 text-sm text-fg-muted">{step.description}</p>
        {waiting ? (
          <p className="mt-1 text-xs text-fg-subtle">
            Waiting on {blockedBy.map((b) => b.label.toLowerCase()).join(' and ')} first.
          </p>
        ) : null}
        {!permitted ? (
          <p className="mt-1 text-xs text-fg-subtle">
            Someone with the right permission needs to complete this step.
          </p>
        ) : null}
      </div>

      {permitted ? (
        <Link
          href={step.href}
          className="inline-flex shrink-0 items-center gap-1 self-center text-sm font-medium text-brand hover:underline"
        >
          {step.complete ? 'Review' : 'Configure'}
          <ArrowRight size={14} strokeWidth={2} />
        </Link>
      ) : null}
    </li>
  );
}

export function SetupChecklist({ status }: { status: SetupStatus }) {
  const byKey = new Map(status.steps.map((s) => [s.key, s]));

  return (
    <ul className="mt-1">
      {status.steps.map((step) => (
        <StepRow
          key={step.key}
          step={step}
          blockedBy={step.dependsOn
            .map((k) => byKey.get(k))
            .filter((s): s is SetupStep => Boolean(s) && !s!.complete)}
        />
      ))}
    </ul>
  );
}

/** The progress bar + headline, shared by the console and the dashboard. */
export function SetupProgress({ status }: { status: SetupStatus }) {
  return (
    <>
      <UsageBar
        label={status.ready ? 'Hospital setup complete' : 'Hospital setup'}
        value={status.completedRequired}
        total={status.totalRequired}
        caption={`${status.completedRequired} / ${status.totalRequired}`}
      />
      {status.ready ? (
        <Alert tone="success" className="mt-4">
          <strong>{status.organization.name} is ready for operations.</strong> Everything the
          platform needs is configured. You can change any of it at any time. This console stays
          available under Hospital configuration.
        </Alert>
      ) : null}
    </>
  );
}

/**
 * Remembering that this person hid the setup reminder.
 *
 * **Keyed by user id**, because a shared reception machine is the normal case in a
 * hospital — one person dismissing a nudge must not hide it from whoever signs in next.
 * `localStorage` is the right store precisely because this is *not* hospital
 * configuration: it is one person's view preference on one device, it changes nothing
 * anyone else can see, and it is not worth a row in the database or a call on every
 * dashboard load. The same reasoning the theme preference already uses.
 */
const DISMISS_KEY = 'hms:setup-nudge-dismissed';

function keyFor(userId: string): string {
  return `${DISMISS_KEY}:${userId}`;
}

/**
 * Dismissed in this tab, whether or not it could be written down. Without this, a
 * browser with storage disabled would swallow the click entirely — the user presses
 * close and the card stays, which is worse than not offering the button.
 */
const dismissedThisSession = new Set<string>();

function readDismissed(userId: string | undefined): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  if (dismissedThisSession.has(userId)) return true;
  try {
    return window.localStorage.getItem(keyFor(userId)) === '1';
  } catch {
    // Private browsing, or storage disabled. Showing the nudge is the safe failure.
    return false;
  }
}

// `localStorage` is an external store, so it is read through `useSyncExternalStore`
// rather than copied into state inside an effect. That keeps the server render honest
// (it has no storage, and says so), and it means dismissing in one tab hides the card
// in the others — which is what someone with the dashboard open twice expects.
const listeners = new Set<() => void>();

function subscribeToDismissal(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function setDismissedFor(userId: string): void {
  dismissedThisSession.add(userId);
  try {
    window.localStorage.setItem(keyFor(userId), '1');
  } catch {
    // Storage unavailable — the card is still hidden for this session by the set above.
    // Persisting is a convenience, and a nudge that returns on the next visit is not a
    // failure worth interrupting anyone about.
  }
  listeners.forEach((notify) => notify());
}

/**
 * The compact card for the dashboard: progress only, with a way in.
 *
 * It disappears on its own once setup is complete, and can be dismissed before then —
 * an administrator who has decided to finish later should not be nagged every morning.
 * Dismissing hides the *reminder*, never the work: the full checklist stays under
 * Hospital configuration, which is in the sidebar, and the card says so on its way out.
 */
export function SetupProgressCard() {
  const { status, error } = useSetupStatus();
  const { user } = useAuth();
  const dismissed = useSyncExternalStore(
    subscribeToDismissal,
    () => readDismissed(user?.id),
    () => false, // The server has no storage; it renders the card as not dismissed.
  );

  if (error) return null; // A user without the permission simply does not see the card.
  if (!status) return <Skeleton height="6rem" />;
  if (status.ready || dismissed) return null;

  const next = status.steps.find((s) => s.required && !s.complete);

  return (
    <Card
      header={
        <div className="flex items-center justify-between gap-3">
          <span>Finish setting up your hospital</span>
          <button
            type="button"
            onClick={() => user?.id && setDismissedFor(user.id)}
            aria-label="Hide this reminder"
            title="Hide this reminder. Setup stays available under Hospital configuration"
            className="-my-1 -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-token text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      }
    >
      <UsageBar
        label="Setup progress"
        value={status.completedRequired}
        total={status.totalRequired}
        caption={`${status.completedRequired} / ${status.totalRequired}`}
      />
      {next ? (
        <p className="mt-3 text-sm text-fg-muted">
          Next: <span className="font-medium text-fg">{next.label}</span>, {next.description}
        </p>
      ) : null}
      <Link
        href="/hospital-setup"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
      >
        Open hospital configuration
        <ArrowRight size={14} strokeWidth={2} />
      </Link>
    </Card>
  );
}

/** Full console body: progress, then the checklist. */
export function SetupOverview() {
  const { status, error, reload } = useSetupStatus();

  if (error)
    return <ErrorState title="Could not load the setup status" message={error} onRetry={reload} />;
  if (!status) return <Skeleton height="16rem" />;

  return (
    <Card header={`Setup: ${status.organization.name}`}>
      <SetupProgress status={status} />
      <SetupChecklist status={status} />
    </Card>
  );
}
