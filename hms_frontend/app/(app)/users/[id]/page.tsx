"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, UserMinus } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Spinner,
  TableAction,
  TableActions,
  actionsColumn,
  type Column,
} from "@hms/ui";
import { PERMISSIONS, ALL_PERMISSIONS } from "@hms/permissions";
import type { UserDetail, Role } from "@hms/types";
import { formatDate } from "@hms/utils";
import * as api from "../../../../lib/api";
import { RequirePermission, Can } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { useCan } from "../../../../lib/auth";

function Detail({ id }: { id: string }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManageRbac = useCan(PERMISSIONS.RBAC_MANAGE);

  const [assignKey, setAssignKey] = useState("");
  const [ovPerm, setOvPerm] = useState("");
  const [ovEffect, setOvEffect] = useState<"GRANT" | "DENY">("DENY");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, r] = await Promise.all([api.getUser(id), api.listRoles().catch(() => [])]);
      setUser(u);
      setRoles(r);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load user.");
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

  if (loading) return <div className="flex items-center gap-2 text-fg-muted"><Spinner /> Loading…</div>;
  if (error && !user) return <Alert tone="danger">{error}</Alert>;
  if (!user) return null;

  const roleKeysHeld = new Set(user.roles.map((r) => r.key));
  const assignable = roles.filter((r) => !roleKeysHeld.has(r.key));

  // Roles and overrides are lists with row-level operations, so they render
  // through the Standard DataTable and the shared Action column, like every other
  // list in the platform (rules.md → Table Row Actions).
  const roleColumns: Array<Column<UserDetail["roles"][number]>> = [
    {
      key: "name",
      header: "Role",
      hideable: false,
      accessor: (r) => r.name,
      cell: (r) => <span className="text-fg">{r.name}</span>,
    },
    {
      key: "key",
      header: "Key",
      accessor: (r) => r.key,
      cell: (r) => <span className="font-mono text-xs text-fg-muted">{r.key}</span>,
    },
    actionsColumn<UserDetail["roles"][number]>((r) => (
      <TableActions label={`Actions for the ${r.name} role`}>
        <TableAction
          label="Remove role"
          icon={<UserMinus size={16} strokeWidth={2} aria-hidden />}
          tone="danger"
          permitted={canManageRbac}
          loading={busy}
          confirm={{
            title: `Remove ${r.name} from ${user.fullName}?`,
            description: "They lose every permission this role grants, unless another role grants it too.",
            confirmLabel: "Remove role",
          }}
          onSelect={() => void run(() => api.removeUserRole(id, r.key))}
        />
      </TableActions>
    )),
  ];

  const overrideColumns: Array<Column<UserDetail["overrides"][number]>> = [
    {
      key: "effect",
      header: "Effect",
      hideable: false,
      accessor: (o) => o.effect,
      cell: (o) => <Badge tone={o.effect === "DENY" ? "danger" : "success"}>{o.effect}</Badge>,
    },
    {
      key: "permission",
      header: "Permission",
      hideable: false,
      accessor: (o) => o.permission,
      cell: (o) => <span className="font-mono text-xs text-fg">{o.permission}</span>,
    },
    {
      key: "until",
      header: "Valid until",
      accessor: (o) => o.validUntil,
      cell: (o) => <span className="text-fg-muted">{o.validUntil ? formatDate(o.validUntil) : "Permanent"}</span>,
    },
    actionsColumn<UserDetail["overrides"][number]>((o) => (
      <TableActions label={`Actions for the ${o.effect} override on ${o.permission}`}>
        <TableAction
          label="Revoke override"
          icon={<Ban size={16} strokeWidth={2} aria-hidden />}
          tone="danger"
          permitted={canManageRbac}
          loading={busy}
          confirm={{
            title: `Revoke this ${o.effect} override?`,
            description: `${o.permission} goes back to whatever ${user.fullName}'s roles decide. The override record is kept for audit.`,
            confirmLabel: "Revoke",
          }}
          onSelect={() => void run(() => api.revokeUserOverride(id, o.id))}
        />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader
        title={user.fullName}
        description={user.email}
        actions={
          <Link href="/users">
            <Button variant="ghost"><ArrowLeft size={16} strokeWidth={2} /> All users</Button>
          </Link>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      <Card header="Account">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={user.status === "active" ? "success" : "warning"}>{user.status}</Badge>
          <Can perm={PERMISSIONS.USERS_MANAGE}>
            <select
              className="hms-input max-w-[12rem]"
              value={user.status}
              disabled={busy}
              onChange={(e) => run(() => api.updateUser(id, { status: e.target.value }))}
            >
              <option value="active">active</option>
              <option value="suspended">suspended</option>
            </select>
          </Can>
        </div>
      </Card>

      <Card header="Roles">
        <DataTable
          columns={roleColumns}
          rows={user.roles}
          rowKey={(r) => r.key}
          pagination={false}
          searchable={false}
          columnVisibility={false}
          emptyMessage="No roles."
          emptyDescription="Assign one below to give this account its permissions."
        />
        <Can perm={PERMISSIONS.RBAC_MANAGE}>
          {assignable.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <select className="hms-input max-w-[16rem]" value={assignKey} onChange={(e) => setAssignKey(e.target.value)}>
                <option value="">Assign a role…</option>
                {assignable.map((r) => (
                  <option key={r.key} value={r.key}>{r.name}</option>
                ))}
              </select>
              <Button size="sm" disabled={!assignKey || busy} onClick={() => run(async () => { await api.assignUserRole(id, assignKey); setAssignKey(""); })}>
                Assign
              </Button>
            </div>
          )}
        </Can>
      </Card>

      <Card header="Effective permissions">
        {user.wildcard ? (
          <Badge tone="brand">All permissions (wildcard)</Badge>
        ) : (
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
            {user.permissions.map((p) => (
              <span key={p} className="rounded-token bg-surface-2 px-2 py-1 font-mono text-xs text-fg-muted">{p}</span>
            ))}
            {user.permissions.length === 0 && <span className="text-sm text-fg-muted">None.</span>}
          </div>
        )}
      </Card>

      <Card header="Permission overrides">
        <div className="mb-3">
          <DataTable
            columns={overrideColumns}
            rows={user.overrides}
            rowKey={(o) => o.id}
            pagination={false}
            searchable={false}
            columnVisibility={false}
            emptyMessage="No overrides."
            emptyDescription="DENY always wins over role grants."
          />
        </div>
        <Can perm={PERMISSIONS.RBAC_MANAGE}>
          <div className="flex flex-wrap items-center gap-2">
            <select className="hms-input max-w-[18rem]" value={ovPerm} onChange={(e) => setOvPerm(e.target.value)}>
              <option value="">Choose a permission…</option>
              {ALL_PERMISSIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select className="hms-input max-w-[8rem]" value={ovEffect} onChange={(e) => setOvEffect(e.target.value as "GRANT" | "DENY")}>
              <option value="DENY">DENY</option>
              <option value="GRANT">GRANT</option>
            </select>
            <Button size="sm" disabled={!ovPerm || busy} onClick={() => run(async () => { await api.addUserOverride(id, { permission: ovPerm, effect: ovEffect }); setOvPerm(""); })}>
              Add override
            </Button>
          </div>
        </Can>
      </Card>
    </>
  );
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.USERS_VIEW}>
      <Detail id={params.id} />
    </RequirePermission>
  );
}
