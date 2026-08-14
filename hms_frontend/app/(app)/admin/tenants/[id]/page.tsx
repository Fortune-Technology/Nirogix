"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { Alert, Badge, Button, Card, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { ModuleCatalogItem, TenantDetail } from "@hms/types";
import * as api from "../../../../../lib/api";
import { RequirePermission } from "../../../../../components/Can";
import { PageHeader } from "../../../../../components/PageHeader";

const STATUSES = ["active", "suspended", "cancelled", "deactivated"];

function Detail({ id }: { id: string }) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [catalog, setCatalog] = useState<ModuleCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantKey, setGrantKey] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, c] = await Promise.all([api.getTenant(id), api.listModuleCatalog()]);
      setTenant(t);
      setCatalog(c);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load tenant.");
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
      setError(e instanceof api.ApiRequestError ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fg-muted">
        <Spinner /> Loading…
      </div>
    );
  }
  if (error && !tenant) return <Alert tone="danger">{error}</Alert>;
  if (!tenant) return null;

  const grantable = catalog.filter((m) => !tenant.modules.includes(m.key));

  return (
    <>
      <PageHeader
        title={tenant.name}
        description={`Org code ${tenant.code} · ${tenant.userCount} user(s)`}
        actions={
          <Link href="/admin/tenants">
            <Button variant="ghost"><ArrowLeft size={16} strokeWidth={2} /> All tenants</Button>
          </Link>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      <Card header="Account status">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={tenant.status === "active" ? "success" : "warning"}>{tenant.status}</Badge>
          <select
            className="hms-input max-w-[12rem]"
            value={tenant.status}
            disabled={busy}
            onChange={(e) => run(() => api.setTenantStatus(id, e.target.value))}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card header={`Modules (${tenant.modules.length})`}>
        <div className="flex flex-wrap gap-2">
          {tenant.modules.map((m) => (
            <span key={m} className="inline-flex items-center gap-2 rounded-token bg-brand-subtle px-3 py-1.5 text-sm text-brand">
              {m}
              <button
                type="button"
                className="text-danger hover:opacity-80"
                disabled={busy}
                title="Revoke"
                onClick={() => run(() => api.revokeTenantModule(id, m))}
              >
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            </span>
          ))}
          {tenant.modules.length === 0 && <span className="text-sm text-fg-muted">No modules entitled.</span>}
        </div>
        {grantable.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <select className="hms-input max-w-[16rem]" value={grantKey} onChange={(e) => setGrantKey(e.target.value)}>
              <option value="">Grant a module…</option>
              {grantable.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!grantKey || busy} onClick={() => run(async () => { await api.grantTenantModule(id, grantKey); setGrantKey(""); })}>
              Grant
            </Button>
          </div>
        )}
      </Card>

      <Card header={`Branches (${tenant.branches.length})`}>
        {tenant.branches.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {tenant.branches.map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <Badge tone={b.isActive ? "success" : "neutral"}>{b.code}</Badge>
                <span className="text-fg">{b.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-sm text-fg-muted">No branches.</span>
        )}
      </Card>
    </>
  );
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.TENANTS_MANAGE}>
      <Detail id={params.id} />
    </RequirePermission>
  );
}
