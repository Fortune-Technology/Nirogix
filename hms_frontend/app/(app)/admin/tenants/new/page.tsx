"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, Field, cn } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { ModuleCatalogItem, OnboardTenantResponse } from "@hms/types";
import * as api from "../../../../../lib/api";
import { RequirePermission } from "../../../../../components/Can";
import { PageHeader } from "../../../../../components/PageHeader";

const DEFAULT_MODULES = new Set(["patient", "appointment", "opd", "emr", "pharmacy", "laboratory", "billing"]);

function Wizard() {
  const [catalog, setCatalog] = useState<ModuleCatalogItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_MODULES));
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<OnboardTenantResponse | null>(null);

  useEffect(() => {
    api.listModuleCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  function toggle(key: string) {
    setSelected((prev) => {
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
        admin: { email: adminEmail.trim(), fullName: adminName.trim() },
        branches: branchCode.trim() ? [{ code: branchCode.trim().toUpperCase(), name: branchName.trim() || branchCode.trim() }] : undefined,
      });
      setDone(res);
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "Onboarding failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <PageHeader title="Tenant onboarded" description={`${done.tenant.name} (${done.tenant.code}) is ready.`} />
        <Card header="First administrator — share these credentials securely">
          <Alert tone="success">
            This temporary password is shown <strong>once</strong>. The admin should change it after signing in.
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
            <Link href={`/admin/tenants/${done.tenant.id}`}>
              <Button>View tenant</Button>
            </Link>
            <Link href="/admin/tenants">
              <Button variant="secondary">Back to list</Button>
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Onboard a tenant" description="Create an organization, entitle modules, and set up its first admin." />
      <form className="flex max-w-2xl flex-col gap-5" onSubmit={handleSubmit}>
        {error && <Alert tone="danger">{error}</Alert>}

        <Card header="Organization">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Org code" placeholder="e.g. GREENVALLEY" value={code} onChange={(e) => setCode(e.target.value)} required />
            <Field label="Name" placeholder="Green Valley Clinic" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        </Card>

        <Card header="Modules">
          <p className="mb-3 text-sm text-fg-muted">Entitlements this tenant starts with. Hard dependencies are added automatically.</p>
          <div className="flex flex-wrap gap-2">
            {catalog.map((m) => {
              const on = selected.has(m.key);
              return (
                <button
                  type="button"
                  key={m.key}
                  onClick={() => toggle(m.key)}
                  className={cn(
                    "rounded-token border px-3 py-1.5 text-sm transition-colors",
                    on ? "border-brand bg-brand-subtle text-brand" : "border-border bg-surface text-fg-muted hover:bg-surface-2",
                  )}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </Card>

        <Card header="First administrator">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admin email" type="email" placeholder="admin@hospital.example" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
            <Field label="Admin full name" placeholder="Dr. …" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
          </div>
          <p className="mt-2 text-sm text-fg-muted">A one-time temporary password is generated and shown after creation.</p>
        </Card>

        <Card header="Initial branch (optional)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch code" placeholder="HQ" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} />
            <Field label="Branch name" placeholder="Head Office" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={submitting}>Onboard tenant</Button>
          <Link href="/admin/tenants">
            <Button variant="ghost" type="button">Cancel</Button>
          </Link>
          <Badge tone="brand">{selected.size} modules selected</Badge>
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
