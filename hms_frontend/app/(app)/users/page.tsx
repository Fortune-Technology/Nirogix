"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  actionsColumn,
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EditAction,
  emptyLabel,
  EmptyValue,
  Field,
  Select,
  TableActions,
  ToggleAction,
  type Column,
  ViewAction,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { UserListItem, Role } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";

function statusTone(s: string): "success" | "warning" | "neutral" {
  if (s === "active") return "success";
  if (s === "suspended") return "warning";
  return "neutral";
}

function userColumns(
  canManage: boolean,
  busy: boolean,
  onSetStatus: (u: UserListItem, status: string) => void,
): Array<Column<UserListItem>> {
  return [
  {
    key: "email",
    header: "Email",
    hideable: false,
    accessor: (u) => u.email,
    cell: (u) => (
      <Link href={`/users/${u.id}`} className="font-medium text-brand hover:underline">
        {u.email}
      </Link>
    ),
  },
  { key: "name", header: "Name", accessor: (u) => u.fullName, cell: (u) => <span className="text-fg">{u.fullName}</span> },
  {
    key: "roles",
    header: "Roles",
    filterable: true,
    accessor: (u) => u.roles.join(", ") || emptyLabel("none"),
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
        // A real and actionable state: the account exists but can do nothing until given a role.
        <EmptyValue reason="none" />
      ),
  },
  {
    key: "status",
    header: "Status",
    filterable: true,
    accessor: (u) => u.status,
    cell: (u) => <Badge tone={statusTone(u.status)}>{u.status}</Badge>,
  },
  actionsColumn<UserListItem>((u) => (
    <TableActions label={`Actions for ${u.fullName}`}>
      <ViewAction label="View user" href={`/users/${u.id}`} />
      {/* The same detail page, opened ready to edit — one editing surface for a user,
          not a second form in a dialog (ADR-060). */}
      <EditAction label="Edit user" permitted={canManage} href={`/users/${u.id}?edit=1`} />
      <ToggleAction
        on={u.status === "active"}
        onLabel="Suspend user"
        offLabel="Reactivate user"
        // Roles, overrides and everything else live on the user's own page; the
        // row carries only the active ↔ suspended switch.
        permitted={canManage && (u.status === "active" || u.status === "suspended")}
        loading={busy}
        confirm={
          u.status === "active"
            ? {
                title: `Suspend ${u.fullName}?`,
                description: `${u.email} is signed out and cannot sign in until the account is reactivated.`,
                confirmLabel: "Suspend",
              }
            : undefined
        }
        onToggle={(next) => onSetStatus(u, next ? "active" : "suspended")}
      />
    </TableActions>
  )),
  ];
}

function UsersTable() {
  const [rows, setRows] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = useCan(PERMISSIONS.USERS_MANAGE);

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

  async function setStatus(u: UserListItem, status: string) {
    setBusy(true);
    try {
      await api.updateUser(u.id, { status });
      await load();
    } catch {
      // The shared API-feedback layer has already told the user.
    } finally {
      setBusy(false);
    }
  }

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
              {showForm ? "Close" : <><Plus size={16} strokeWidth={2} /> New user</>}
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
            <Select
              label="Role (optional)"
              className="max-w-sm"
              value={roleKey}
              onChange={setRoleKey}
              options={roles.map((r) => ({ value: r.key, label: r.name, description: r.description || undefined }))}
              placeholder="No role yet"
              emptyMessage="No roles defined."
              clearable
            />
            <div>
              <Button type="submit" loading={submitting}>Create user</Button>
            </div>
          </form>
        </Card>
      )}

      <DataTable
        columns={userColumns(canManage, busy, (u, status) => void setStatus(u, status))}
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
