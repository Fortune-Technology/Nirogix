'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Skeleton } from '@hms/ui';
import type { AccessExplanation } from '@hms/types';
import * as api from '../lib/api';

/**
 * The refusal panel — and what it has to be able to say (ADR-126).
 *
 * A bare "you don't have access to this" leaves a person with no next move. Three things turn it
 * into one, and the third is the one that used to be missing entirely:
 *
 * 1. **Which permission**, in words *and* as a key — the sentence is for them, the key is for
 *    whoever they forward it to.
 * 2. **Who already has it**, read from this hospital's own roles rather than the shipped
 *    defaults, so a hospital that renamed or cloned a role sees its own answer and a custom role
 *    appears without anybody hard-coding it.
 * 3. **Whether the hospital even has the module.** "Your role is missing a permission" and "your
 *    hospital has not bought this" are different problems with different owners; saying the first
 *    when the second is true sends somebody to argue with an administrator who cannot help.
 *
 * The explanation is fetched, because only the server knows the tenant's roles and entitlements.
 * Until it arrives the panel already states the refusal — the page is refused either way, and a
 * spinner where the headline should be is worse than a headline.
 */
export function Forbidden({ perm }: { perm?: string }) {
  const [explanation, setExplanation] = useState<AccessExplanation | null>(null);
  const [loading, setLoading] = useState(Boolean(perm));

  useEffect(() => {
    if (!perm) return;
    let live = true;
    api
      .explainAccess(perm)
      .then((e) => live && setExplanation(e))
      // A failed explanation is not a second failure to report: the panel below still refuses
      // the page, it just does so in the general terms it always used.
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [perm]);

  const moduleMissing = explanation?.reason === 'module_not_enabled';

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="max-w-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className={`hms-badge ${moduleMissing ? 'hms-badge--warning' : 'hms-badge--danger'}`}
          >
            {moduleMissing ? 'Module not enabled' : '403 · Forbidden'}
          </span>

          {moduleMissing ? (
            <>
              <h1 className="text-lg font-semibold text-fg">
                This feature is not available for your hospital
              </h1>
              <p className="text-sm text-fg-muted">
                Your hospital does not currently have the{' '}
                <strong className="font-medium text-fg">{explanation?.module?.name}</strong> module.
                This is not a permission your administrator can grant — the module is enabled for
                the whole hospital by Nirogix. Speak to your organization administrator if you
                believe it should be switched on.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-fg">
                You don&apos;t have access to this page
              </h1>
              <p className="text-sm text-fg-muted">
                Your role doesn&apos;t include the permission required for this page. If you believe
                this is a mistake, contact your organization administrator.
              </p>
            </>
          )}

          {loading && perm ? <Skeleton height="4rem" /> : null}

          {explanation && !moduleMissing ? (
            <dl className="w-full rounded-token border border-border bg-surface-2 px-4 py-3 text-left text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <dt className="text-fg-muted">Permission required</dt>
                <dd className="text-fg">
                  <span className="font-medium">{explanation.permission.label}</span>{' '}
                  <code className="font-mono text-xs text-fg-subtle">
                    {explanation.permission.key}
                  </code>
                </dd>
              </div>
              {explanation.module ? (
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <dt className="text-fg-muted">Module</dt>
                  <dd className="text-fg">{explanation.module.name}</dd>
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <dt className="text-fg-muted">Roles with this access</dt>
                <dd className="text-fg">
                  {explanation.grantedByRoles.length > 0
                    ? explanation.grantedByRoles.map((r) => r.name).join(', ')
                    : 'No role in your hospital currently holds it'}
                </dd>
              </div>
            </dl>
          ) : null}

          {explanation && !moduleMissing ? (
            <p className="text-xs text-fg-subtle">
              Your administrator can add this to your role, or grant it to your account on its own —
              a grant can be time-limited, and every change is recorded in the audit log.
            </p>
          ) : null}

          <Link href="/dashboard">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
