'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, cn } from '@hms/ui';
import { MODULE_CATEGORIES, PERMISSIONS } from '@hms/permissions';
import type { ModuleCatalogItem, OnboardTenantResponse } from '@hms/types';
import * as api from '../../../../lib/api';
import { RequirePermission } from '../../../../components/Can';
import { PageHeader } from '../../../../components/PageHeader';

const DEFAULT_MODULES = new Set([
  'patient',
  'appointment',
  'opd',
  'emr',
  'pharmacy',
  'laboratory',
  'billing',
]);

function Wizard() {
  const [catalog, setCatalog] = useState<ModuleCatalogItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_MODULES));
  // Deny-by-exception (ADR-085): a capability is ON unless the operator switches it off here.
  const [disabledCaps, setDisabledCaps] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<OnboardTenantResponse | null>(null);

  useEffect(() => {
    api
      .listModuleCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCap(key: string) {
    setDisabledCaps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.onboardTenant({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        modules: Array.from(selected),
        // Only capabilities of the modules actually being granted, and only the OFF ones.
        disabledCapabilities: Array.from(disabledCaps).filter((k) =>
          catalog.some((m) => selected.has(m.key) && m.capabilities.some((c) => c.key === k)),
        ),
        admin: { email: adminEmail.trim(), fullName: adminName.trim() },
        branches: branchCode.trim()
          ? [
              {
                code: branchCode.trim().toUpperCase(),
                name: branchName.trim() || branchCode.trim(),
              },
            ]
          : undefined,
      });
      setDone(res);
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : 'Onboarding failed.');
    } finally {
      setSubmitting(false);
    }
  }

  // Modules grouped by domain, in the canonical display order, skipping empty domains (ADR-085).
  const groups = MODULE_CATEGORIES.map((c) => ({
    key: c.key,
    name: c.name,
    items: catalog.filter((m) => m.category === c.key),
  })).filter((g) => g.items.length > 0);

  // Capabilities that will actually be ON: those of the selected modules, minus the ones
  // switched off above (deny-by-exception).
  const selectedCapCount = catalog
    .filter((m) => selected.has(m.key))
    .reduce((n, m) => n + m.capabilities.filter((c) => !disabledCaps.has(c.key)).length, 0);

  if (done) {
    return (
      <>
        <PageHeader
          title="Tenant onboarded"
          description={`${done.tenant.name} (${done.tenant.code}) is ready.`}
        />
        <Card header="First administrator: share these credentials securely">
          <Alert tone="success">
            This temporary password is shown <strong>once</strong>. The admin should change it after
            signing in.
          </Alert>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-muted">Organization code</dt>
              <dd className="font-medium text-fg">{done.tenant.code}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Admin email</dt>
              <dd className="font-medium text-fg">{done.admin.email}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Temporary password</dt>
              <dd className="font-mono font-medium text-fg">{done.admin.tempPassword}</dd>
            </div>
          </dl>
          <div className="mt-5 flex gap-2">
            <Link href={`/tenants/${done.tenant.id}`}>
              <Button>View tenant</Button>
            </Link>
            <Link href="/tenants">
              <Button variant="secondary">Back to list</Button>
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Onboard a tenant"
        description="Create an organization, entitle modules, and set up its first admin."
      />
      <form className="flex max-w-2xl flex-col gap-5" onSubmit={handleSubmit}>
        {error && <Alert tone="danger">{error}</Alert>}

        <Card header="Organization">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Org code"
              placeholder="e.g. GREENVALLEY"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <Field
              label="Name"
              placeholder="Green Valley Clinic"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        </Card>

        <Card header="Modules">
          <p className="mb-4 text-sm text-fg-muted">
            Entitlements this tenant starts with, by domain. Hard dependencies are added
            automatically, and each capability can be fine-tuned per hospital after onboarding.
            Modules marked <em>soon</em> have no screens yet — reserved in the roadmap.
          </p>
          {groups.length === 0 ? (
            <p className="text-sm text-fg-muted">Loading modules…</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
                    {g.name}
                  </div>
                  <ul className="flex flex-col divide-y divide-border rounded-token border border-border">
                    {g.items.map((m) => {
                      const on = selected.has(m.key);
                      const built = m.status === 'BUILT';
                      const open = expanded.has(m.key);
                      const capsOn = m.capabilities.filter((c) => !disabledCaps.has(c.key)).length;
                      return (
                        <li key={m.key} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => toggle(m.key)}
                              aria-pressed={on}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  'grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border text-[10px] font-bold',
                                  on
                                    ? 'border-brand bg-brand text-bg'
                                    : 'border-border bg-surface text-transparent',
                                )}
                              >
                                ✓
                              </span>
                              <span
                                className={cn('truncate text-sm', on ? 'text-fg' : 'text-fg-muted')}
                              >
                                {m.name}
                              </span>
                              {m.alwaysOn && <Badge tone="brand">Required</Badge>}
                              {!built && <Badge tone="warning">Coming soon</Badge>}
                            </button>
                            <div className="flex shrink-0 items-center gap-2">
                              {m.capabilities.length > 0 && (
                                <span className="text-xs text-fg-subtle">
                                  {on
                                    ? `${capsOn}/${m.capabilities.length} capabilities`
                                    : `${m.capabilities.length} capabilities`}
                                </span>
                              )}
                              {m.capabilities.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(m.key)}
                                  aria-expanded={open}
                                  aria-label={`${open ? 'Hide' : 'Show'} capabilities of ${m.name}`}
                                  className="grid h-7 w-7 place-items-center rounded-token text-fg-muted hover:bg-surface-2 hover:text-fg"
                                >
                                  {open ? (
                                    <ChevronDown size={15} strokeWidth={2} />
                                  ) : (
                                    <ChevronRight size={15} strokeWidth={2} />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {open && m.capabilities.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1.5 border-l border-border pl-3">
                              {m.capabilities.map((c) => {
                                const capOn = on && !disabledCaps.has(c.key);
                                return (
                                  <li
                                    key={c.key}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span
                                        className={cn(
                                          'truncate text-sm',
                                          capOn ? 'text-fg' : 'text-fg-subtle',
                                        )}
                                      >
                                        {c.name}
                                      </span>
                                      {c.status !== 'BUILT' && (
                                        <Badge tone="warning">Coming soon</Badge>
                                      )}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={!on}
                                      onClick={() => toggleCap(c.key)}
                                      aria-pressed={capOn}
                                      title={on ? undefined : 'Select the module first'}
                                      className={cn(
                                        'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                                        !on
                                          ? 'cursor-not-allowed border-border text-fg-subtle opacity-60'
                                          : capOn
                                            ? 'border-brand bg-brand-subtle text-brand'
                                            : 'border-border bg-surface text-fg-muted hover:bg-surface-2',
                                      )}
                                    >
                                      {capOn ? 'On' : 'Off'}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card header="First administrator">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Admin email"
              type="email"
              placeholder="admin@hospital.example"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
            <Field
              label="Admin full name"
              placeholder="Dr. …"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            A one-time temporary password is generated and shown after creation.
          </p>
        </Card>

        <Card header="Initial branch (optional)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Branch code"
              placeholder="HQ"
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
            />
            <Field
              label="Branch name"
              placeholder="Head Office"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
            />
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={submitting}>
            Onboard tenant
          </Button>
          <Link href="/tenants">
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </Link>
          <Badge tone="brand">
            {selected.size} modules · {selectedCapCount} capabilities
          </Badge>
        </div>
      </form>
    </>
  );
}

export default function NewTenantPage() {
  return (
    <RequirePermission perm={PERMISSIONS.TENANTS_MANAGE}>
      <Wizard />
    </RequirePermission>
  );
}
