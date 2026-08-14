"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, Field, DataTable, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { UserListItem, Role } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

function statusTone(s: string): "success" | "warning" | "neutral" {
  if (s === "active") return "success";
  if (s === "suspended") return "warning";
  return "neutral";
}

const columns: Array<Column<UserListItem>> = [
  {
    key: "email",
    header: "Email",
    cell: (u) => (
      <Link href={`/users/${u.id}`} className="font-medium text-brand hover:underline">
        {u.email}
      </Link>
    ),
  },
  { key: "name", header: "Name", cell: (u) => <span className="text-fg">{u.fullName}</span> },
  {
    key: "roles",
    header: "Roles",
    cell: (u) =>
      u.roles.length ? (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <Badge key={r} tone="brand">
              {r}
            </Badge>
          ))}
        </div>
      ) : (
        "—"
      ),
  },
  { key: "status", header: "Status", cell: (u) => <Badge tone={statusTone(u.status)}>{u.status}</Badge> },
];

function UsersTable() {
  const [rows, setRows] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ email: string; tempPassword: string | null } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([api.listUsers(), api.listRoles().catch(() => [])]);
      setRows(u);
      setRoles(r);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await api.createUser({
        email: email.trim(),
        fullName: fullName.trim(),
        roleKey: roleKey || undefined,
      });
      setCreated({ email: email.trim(), tempPassword: res.tempPassword });
      setEmail("");
      setFullName("");
      setRoleKey("");
      await load();
    } catch (e) {
      setFormError(e instanceof api.ApiRequestError ? e.message : "Could not create user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts in your organization."
        actions={
          <Can perm={PERMISSIONS.USERS_MANAGE}>
            <Button onClick={() => { setShowForm((v) => !v); setCreated(null); }}>
              {showForm ? "Close" : "+ New user"}
            </Button>
          </Can>
        }
      />

      {created && (
        <Alert tone="success">
          Created <strong>{created.email}</strong>.
          {created.tempPassword ? (
            <> Temporary password (shown once): <code className="font-mono">{created.tempPassword}</code></>
          ) : null}
        </Alert>
      )}

      {showForm && (
        <Card header="New user">
          <form className="flex flex-col gap-4" onSubmit={handleCreate}>
            {formError && <Alert tone="danger">{formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Field label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <label className="hms-field">
              <span className="hms-label">Role (optional)</span>
              <select className="hms-input max-w-sm" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
                <option value="">— no role —</option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <Button type="submit" loading={submitting}>Create user</Button>
            </div>
          </form>
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        loading={loading}
        error={error}
        emptyMessage="No users."
      />
    </>
  );
}

export default function UsersPage() {
  return (
    <RequirePermission perm={PERMISSIONS.USERS_VIEW}>
      <UsersTable />
    </RequirePermission>
  );
}
