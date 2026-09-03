'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, ChevronRight, Layers, Lock, Search, X } from 'lucide-react';
import { Alert, Badge, Button, Card, ConfirmDialog, Spinner } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { ModuleConfigModule, TenantDetail, TenantModuleConfig } from '@hms/types';
import * as api from '../../../../../lib/api';
import { RequirePermission } from '../../../../../components/Can';
import { PageHeader } from '../../../../../components/PageHeader';

type FilterKey = 'all' | 'enabled' | 'disabled' | 'soon';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'enabled', label: 'Enabled' },
  { key: 'disabled', label: 'Disabled' },
  { key: 'soon', label: 'Coming soon' },
];

function Manager({ id }: { id: string }) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [config, setConfig] = useState<TenantModuleConfig | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<{
    module: ModuleConfigModule;
    dependents: string[];
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, c] = await Promise.all([api.getTenant(id), api.getTenantModuleConfig(id)]);
      setTenant(t);
      setConfig(c);
      setActiveCat((prev) => prev ?? c.categories[0]?.key ?? null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const modules = useMemo(() => config?.modules ?? [], [config]);
  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const passesFilter = useCallback(
    (m: ModuleConfigModule) =>
      filter === 'all' ||
      (filter === 'enabled' && m.entitled) ||
      (filter === 'disabled' && !m.entitled && m.status === 'BUILT') ||
      (filter === 'soon' && m.status !== 'BUILT'),
    [filter],
  );

  // Level 2 list: while searching, span every domain and match capabilities too.
  const visibleModules = useMemo(
    () =>
      modules
        .filter((m) =>
          searching
            ? m.name.toLowerCase().includes(q) ||
              m.key.toLowerCase().includes(q) ||
              m.capabilities.some(
                (c) => c.name.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
              )
            : m.category === activeCat,
        )
        .filter(passesFilter),
    [modules, searching, q, activeCat, passesFilter],
  );

  const catMeta = useMemo(() => {
    const map: Record<string, { total: number; enabled: number }> = {};
    for (const m of modules) {
      const e = (map[m.category] ??= { total: 0, enabled: 0 });
      e.total += 1;
      if (m.entitled) e.enabled += 1;
    }
    return map;
  }, [modules]);

  const enabledModules = modules.filter((m) => m.entitled);
  const totalCaps = modules.reduce((n, m) => n + m.capabilities.length, 0);
  const enabledCaps = modules.reduce(
    (n, m) => n + m.capabilities.filter((c) => c.enabled).length,
    0,
  );
  const drill = openModule ? (modules.find((m) => m.key === openModule) ?? null) : null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fg-muted">
        <Spinner /> Loading…
      </div>
    );
  }
  if (error && !config) return <Alert tone="danger">{error}</Alert>;
  if (!config || !tenant) return null;

  function toggleModule(m: ModuleConfigModule) {
    if (m.alwaysOn) return;
    if (m.entitled) {
      const dependents = modules
        .filter((x) => x.entitled && x.hardDependencies.includes(m.key))
        .map((x) => x.name);
      setConfirmDisable({ module: m, dependents });
    } else {
      void run(() => api.grantTenantModule(id, m.key));
    }
  }

  const categoryName = (key: string) => config.categories.find((c) => c.key === key)?.name ?? key;

  return (
    <>
      <PageHeader
        title="Modules & capabilities"
        description={`${tenant.name} · ${enabledModules.length}/${modules.length} modules · ${enabledCaps}/${totalCaps} capabilities enabled`}
        actions={
          <Link href={`/tenants/${id}`}>
            <Button variant="ghost">
              <ArrowLeft size={16} strokeWidth={2} /> Tenant
            </Button>
          </Link>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Verification view: exactly what this hospital has switched on. */}
      <Card
        header={
          <span className="flex items-center gap-2">
            <Check size={16} strokeWidth={2} aria-hidden /> Enabled configuration
          </span>
        }
      >
        {enabledModules.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing is enabled for this hospital yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {config.categories
              .filter((c) => enabledModules.some((m) => m.category === c.key))
              .map((c) => (
                <div key={c.key}>
                  <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                    {c.name}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {enabledModules
                      .filter((m) => m.category === c.key)
                      .map((m) => {
                        const on = m.capabilities.filter((cap) => cap.enabled).length;
                        return (
                          <button
                            key={m.key}
                            type="button"
                            onClick={() => {
                              setSearch('');
                              setActiveCat(m.category);
                              setOpenModule(m.key);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-token border border-border bg-surface px-2 py-1 text-xs text-fg hover:bg-surface-2"
                          >
                            {m.name}
                            {m.alwaysOn && (
                              <Lock
                                size={11}
                                strokeWidth={2}
                                className="text-fg-subtle"
                                aria-label="Required"
                              />
                            )}
                            {m.status !== 'BUILT' && (
                              <span className="text-fg-subtle">· preview</span>
                            )}
                            {m.capabilities.length > 0 && (
                              <span className="text-fg-muted">
                                {on}/{m.capabilities.length}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            size={16}
            strokeWidth={2}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <input
            className="hms-input w-full pl-9"
            placeholder="Search modules or capabilities…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpenModule(null);
            }}
            aria-label="Search modules or capabilities"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-token text-fg-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Clear search"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-token px-3 py-1.5 text-sm ${
                filter === f.key
                  ? 'bg-brand-subtle text-brand'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        {/* Level 1 — domains */}
        <nav className="flex flex-col gap-1" aria-label="Module domains">
          {config.categories.map((c) => {
            const meta = catMeta[c.key] ?? { total: 0, enabled: 0 };
            const active = !searching && c.key === activeCat;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setActiveCat(c.key);
                  setOpenModule(null);
                  setSearch('');
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center justify-between gap-2 rounded-token px-3 py-2 text-left text-sm ${
                  active
                    ? 'bg-brand-subtle text-brand'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-fg-subtle">
                  {meta.enabled}/{meta.total}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3">
          {drill ? (
            /* Level 3 — one module's capabilities */
            <Card>
              <nav
                className="flex items-center gap-1.5 text-xs text-fg-muted"
                aria-label="Breadcrumb"
              >
                <button type="button" className="hover:text-fg" onClick={() => setOpenModule(null)}>
                  {categoryName(drill.category)}
                </button>
                <ChevronRight size={12} strokeWidth={2} aria-hidden />
                <span className="text-fg">{drill.name}</span>
              </nav>

              <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-fg">{drill.name}</span>
                    {drill.alwaysOn ? (
                      <Badge tone="brand">
                        <Lock size={11} strokeWidth={2} aria-hidden /> Required
                      </Badge>
                    ) : (
                      <Badge tone={drill.entitled ? 'success' : 'neutral'}>
                        {drill.entitled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    )}
                    {drill.status !== 'BUILT' && <Badge tone="warning">Coming soon</Badge>}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-fg-subtle">{drill.key}</div>
                  {drill.hardDependencies.length > 0 && (
                    <div className="mt-1 text-xs text-fg-muted">
                      Requires {drill.hardDependencies.join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setOpenModule(null)}>
                    <ArrowLeft size={16} strokeWidth={2} /> Back
                  </Button>
                  {!drill.alwaysOn && (
                    <Button
                      size="sm"
                      variant={drill.entitled ? 'secondary' : undefined}
                      disabled={busy}
                      onClick={() => toggleModule(drill)}
                    >
                      {drill.entitled ? 'Disable module' : 'Enable module'}
                    </Button>
                  )}
                </div>
              </div>

              {drill.capabilities.length === 0 ? (
                <p className="mt-3 text-sm text-fg-subtle">
                  Whole module — no separate capabilities.
                </p>
              ) : !drill.entitled ? (
                <div className="mt-3">
                  <p className="text-sm text-fg-muted">
                    Enable the module to configure its {drill.capabilities.length} capabilities.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {drill.capabilities.map((cap) => (
                      <li
                        key={cap.key}
                        className="rounded-token border border-border px-2 py-1 text-xs text-fg-subtle"
                      >
                        {cap.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {drill.capabilities.map((cap) => {
                    const builtCap = cap.status === 'BUILT';
                    return (
                      <li key={cap.key} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-fg">{cap.name}</span>
                            <Badge tone={cap.enabled ? 'success' : 'neutral'}>
                              {cap.enabled ? 'On' : 'Off'}
                            </Badge>
                            {!builtCap && <Badge tone="warning">Coming soon</Badge>}
                          </div>
                          <div className="font-mono text-[11px] text-fg-subtle">{cap.key}</div>
                          {cap.dependencies.length > 0 && (
                            <div className="text-xs text-fg-muted">
                              Requires {cap.dependencies.join(', ')}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={cap.enabled ? 'secondary' : undefined}
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              api.setTenantCapability(id, drill.key, cap.key, !cap.enabled),
                            )
                          }
                        >
                          {cap.enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : (
            /* Level 2 — modules of the selected domain (or search results) */
            <>
              <p className="text-sm text-fg-muted">
                {searching
                  ? `${visibleModules.length} module${visibleModules.length === 1 ? '' : 's'} match “${search.trim()}”.`
                  : `${categoryName(activeCat ?? '')} — ${visibleModules.length} module${visibleModules.length === 1 ? '' : 's'}. Open one to configure its capabilities.`}
              </p>
              {visibleModules.length === 0 ? (
                <Card>
                  <div className="flex items-center gap-2 text-sm text-fg-muted">
                    <Layers size={16} strokeWidth={2} aria-hidden /> No modules match.
                  </div>
                </Card>
              ) : (
                <Card>
                  <ul className="flex flex-col divide-y divide-border">
                    {visibleModules.map((m) => {
                      const on = m.capabilities.filter((c) => c.enabled).length;
                      return (
                        <li
                          key={m.key}
                          className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setOpenModule(m.key)}
                            aria-label={`Configure ${m.name}`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-fg">{m.name}</span>
                              {m.alwaysOn ? (
                                <Badge tone="brand">
                                  <Lock size={11} strokeWidth={2} aria-hidden /> Required
                                </Badge>
                              ) : (
                                <Badge tone={m.entitled ? 'success' : 'neutral'}>
                                  {m.entitled ? 'Enabled' : 'Disabled'}
                                </Badge>
                              )}
                              {m.status !== 'BUILT' && <Badge tone="warning">Coming soon</Badge>}
                              {searching && (
                                <span className="text-xs text-fg-subtle">
                                  {categoryName(m.category)}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-fg-subtle">
                              {m.capabilities.length === 0
                                ? 'No separate capabilities'
                                : m.entitled
                                  ? `${on}/${m.capabilities.length} capabilities on`
                                  : `${m.capabilities.length} capabilities`}
                              {m.hardDependencies.length > 0 &&
                                ` · requires ${m.hardDependencies.join(', ')}`}
                            </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            {!m.alwaysOn && (
                              <Button
                                size="sm"
                                variant={m.entitled ? 'secondary' : undefined}
                                disabled={busy}
                                onClick={() => toggleModule(m)}
                              >
                                {m.entitled ? 'Disable' : 'Enable'}
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={() => setOpenModule(m.key)}
                              className="grid h-8 w-8 place-items-center rounded-token text-fg-muted hover:bg-surface-2 hover:text-fg"
                              aria-label={`Open ${m.name}`}
                            >
                              <ChevronRight size={16} strokeWidth={2} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDisable !== null}
        title={confirmDisable ? `Disable ${confirmDisable.module.name}?` : ''}
        description={
          confirmDisable?.dependents.length
            ? `Everyone in this hospital loses access immediately. These enabled modules depend on it and may stop working correctly: ${confirmDisable.dependents.join(', ')}. Historical data is kept and the module can be re-enabled.`
            : 'Everyone in this hospital loses access immediately. Historical data is kept and the module can be re-enabled.'
        }
        confirmLabel="Disable"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirmDisable(null)}
        onConfirm={() => {
          const m = confirmDisable?.module;
          setConfirmDisable(null);
          if (m) void run(() => api.revokeTenantModule(id, m.key));
        }}
      />
    </>
  );
}

export default function TenantModulesPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.TENANTS_MANAGE}>
      <Manager id={params.id} />
    </RequirePermission>
  );
}
