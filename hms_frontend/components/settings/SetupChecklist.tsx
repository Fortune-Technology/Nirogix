"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, CircleDashed, Lock } from "lucide-react";
import { Alert, Badge, Card, ErrorState, Skeleton, UsageBar } from "@hms/ui";
import type { SetupStatus, SetupStep } from "@hms/types";
import * as api from "../../lib/api";
import { useCan } from "../../lib/auth";

/**
 * Hospital setup progress (ADR-049).
 *
 * Every tick is derived from the hospital's real data on each read — never a stored
 * "wizard finished" flag — so the console stays truthful when configuration changes
 * later. A step whose dependency is not met is shown as waiting, with the reason,
 * rather than hidden: the administrator can see the order the hospital comes up in.
 */
export function useSetupStatus(): { status: SetupStatus | null; error: string | null; reload: () => void } {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .getSetupStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Could not load the setup status."));
  }, []);

  useEffect(() => reload(), [reload]);

  return { status, error, reload };
}

function StepRow({ step, blockedBy }: { step: SetupStep; blockedBy: SetupStep[] }) {
  const allowed = useCan(step.permission ?? "");
  const permitted = step.permission === null || allowed;
  const waiting = !step.complete && blockedBy.length > 0;

  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-border py-3 last:border-b-0">
      <span
        aria-hidden
        className={[
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          step.complete
            ? "border-success bg-success/10 text-success"
            : waiting
              ? "border-border bg-surface-2 text-fg-subtle"
              : "border-border bg-surface text-fg-subtle",
        ].join(" ")}
      >
        {step.complete ? <Check size={14} strokeWidth={3} /> : waiting ? <Lock size={12} /> : <CircleDashed size={14} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-fg">{step.label}</span>
          {step.complete ? (
            <Badge tone="success">
              Done{step.count > 1 ? ` · ${step.count}` : ""}
            </Badge>
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
            Waiting on {blockedBy.map((b) => b.label.toLowerCase()).join(" and ")} first.
          </p>
        ) : null}
        {!permitted ? (
          <p className="mt-1 text-xs text-fg-subtle">Someone with the right permission needs to complete this step.</p>
        ) : null}
      </div>

      {permitted ? (
        <Link
          href={step.href}
          className="inline-flex shrink-0 items-center gap-1 self-center text-sm font-medium text-brand hover:underline"
        >
          {step.complete ? "Review" : "Configure"}
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
          blockedBy={step.dependsOn.map((k) => byKey.get(k)).filter((s): s is SetupStep => Boolean(s) && !s!.complete)}
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
        label={status.ready ? "Hospital setup complete" : "Hospital setup"}
        value={status.completedRequired}
        total={status.totalRequired}
        caption={`${status.completedRequired} / ${status.totalRequired}`}
      />
      {status.ready ? (
        <Alert tone="success" className="mt-4">
          <strong>{status.organization.name} is ready for operations.</strong> Everything the platform needs is
          configured. You can change any of it at any time — this console stays available under Hospital configuration.
        </Alert>
      ) : null}
    </>
  );
}

/**
 * The compact card for the dashboard: progress only, with a way in. Disappears once
 * setup is complete so it does not become permanent furniture on the dashboard.
 */
export function SetupProgressCard() {
  const { status, error } = useSetupStatus();

  if (error) return null; // A user without the permission simply does not see the card.
  if (!status) return <Skeleton height="6rem" />;
  if (status.ready) return null;

  const next = status.steps.find((s) => s.required && !s.complete);

  return (
    <Card header="Finish setting up your hospital">
      <UsageBar
        label="Setup progress"
        value={status.completedRequired}
        total={status.totalRequired}
        caption={`${status.completedRequired} / ${status.totalRequired}`}
      />
      {next ? (
        <p className="mt-3 text-sm text-fg-muted">
          Next: <span className="font-medium text-fg">{next.label}</span> — {next.description}
        </p>
      ) : null}
      <Link
        href="/settings"
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

  if (error) return <ErrorState title="Could not load the setup status" message={error} onRetry={reload} />;
  if (!status) return <Skeleton height="16rem" />;

  return (
    <Card header={`Setup — ${status.organization.name}`}>
      <SetupProgress status={status} />
      <SetupChecklist status={status} />
    </Card>
  );
}
