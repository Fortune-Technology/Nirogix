"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Ban, LifeBuoy, SlidersHorizontal } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Field,
  Spinner,
  TableAction,
  TableActions,
  actionsColumn,
  type Column,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { ModuleCatalogItem, TenantDetail } from "@hms/types";
import * as api from "../../../../lib/api";
import { PORTAL_ORIGIN, PORTAL_SUPPORT_ENTER_URL } from "../../../../lib/portal";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";

const STATUSES = ["active", "suspended", "cancelled", "deactivated"];

function Detail({ id }: { id: string }) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  // Support session (ADR-037)
  const [targetUser, setTargetUser] = useState("");
  const [reason, setReason] = useState("");
  const [ticketRef, setTicketRef] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
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
  /**
   * Starts the session and hands it to a NEW TAB on the **Portal's** origin (ADR-037,
   * ADR-051), so the operator keeps their platform context here and works inside the
   * hospital where the support banner lives.
   *
   * The token travels by `postMessage` rather than in the URL — a URL lands in
   * history, referrers and server logs. Since the split the two ends are different
   * origins, so each names the other explicitly: this side posts to
   * `PORTAL_ORIGIN`, and the Portal accepts only the configured admin origin. Using
   * `window.location.origin`, as both sides did while they shared an origin, would
   * now post the token back to this app where nothing is listening.
   *
   * The pop-up is opened synchronously on the click so browsers do not treat it as
   * unsolicited.
   */
  async function startSession() {
    if (!tenant) return;
    setStarting(true);
    const tab = window.open(PORTAL_SUPPORT_ENTER_URL, "_blank");
    try {
      const res = await api.startSupportSession({
        tenantId: tenant.id,
        userId: targetUser,
        reason: reason.trim(),
        ticketRef: ticketRef.trim() || undefined,
      });

      if (!tab) {
        // Pop-up blocked: say so instead of leaving a session running invisibly.
        setPopupBlocked(true);
        return;
      }

      // The new tab announces itself when it is ready; only then is the token sent.
      const handOver = (event: MessageEvent) => {
        // Only the Portal may announce itself, and the token is only ever posted there.
        if (event.origin !== PORTAL_ORIGIN) return;
        if ((event.data as { type?: string })?.type !== "hms:support-ready") return;
        tab.postMessage({ type: "hms:support-session", accessToken: res.accessToken }, PORTAL_ORIGIN);
        window.removeEventListener("message", handOver);
      };
      window.addEventListener("message", handOver);

      setConfirming(false);
      setTargetUser("");
      setReason("");
      setTicketRef("");
    } catch {
      tab?.close();
      /* reported by the shared API-feedback layer */
    } finally {
      setStarting(false);
    }
  }


  if (error && !tenant) return <Alert tone="danger">{error}</Alert>;
  if (!tenant) return null;

  const grantable = catalog.filter((m) => !tenant.modules.includes(m.key));

  // Entitled modules render through the Standard DataTable with the shared Action
  // column, like every other list in the platform (rules.md → Table Row Actions).
  const moduleRows = tenant.modules.map((key) => ({
    key,
    name: catalog.find((m) => m.key === key)?.name ?? key,
  }));
  const moduleColumns: Array<Column<{ key: string; name: string }>> = [
    {
      key: "name",
      header: "Module",
      hideable: false,
      accessor: (m) => m.name,
      cell: (m) => <span className="text-fg">{m.name}</span>,
    },
    {
      key: "code",
      header: "Key",
      accessor: (m) => m.key,
      cell: (m) => <span className="font-mono text-xs text-fg-muted">{m.key}</span>,
    },
    actionsColumn<{ key: string; name: string }>((m) => (
      <TableActions label={`Actions for ${m.name}`}>
        <TableAction
          label="Revoke module"
          icon={<Ban size={16} strokeWidth={2} aria-hidden />}
          tone="danger"
          loading={busy}
          confirm={{
            title: `Revoke ${m.name}?`,
            description:
              "Everyone in this hospital loses access to the module immediately. The entitlement record is kept and the module can be granted again.",
            confirmLabel: "Revoke",
          }}
          onSelect={() => void run(() => api.revokeTenantModule(id, m.key))}
        />
      </TableActions>
    )),
  ];
  // Support-session targets: a platform operator can never be impersonated (the
  // server refuses it too — this only keeps them out of the picker).
  const targets = (tenant.users ?? []).filter((u) => u.status === "active" && !u.roles.includes("super_admin"));

  return (
    <>
      <PageHeader
        title={tenant.name}
        description={`Org code ${tenant.code} · ${tenant.userCount} user(s)`}
        actions={
          <Link href="/tenants">
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
        <DataTable
          columns={moduleColumns}
          rows={moduleRows}
          rowKey={(m) => m.key}
          pagination={false}
          searchable={false}
          columnVisibility={false}
          emptyMessage="No modules entitled."
          emptyDescription="Grant one below to switch it on for this hospital."
        />
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
        <div className="mt-4 border-t border-border pt-4">
          <Link href={`/tenants/${id}/modules`}>
            <Button variant="secondary" size="sm">
              <SlidersHorizontal size={16} strokeWidth={2} /> Manage modules &amp; capabilities
            </Button>
          </Link>
        </div>
      </Card>

      <Card
        header={
          <span className="flex items-center gap-2">
            <LifeBuoy size={16} strokeWidth={1.75} aria-hidden /> Support access
          </span>
        }
      >
        <p className="text-sm text-fg-muted">
          Enter this hospital as one of its users to reproduce a problem. You never see or need their password. The
          session grants exactly that user&apos;s permissions, and both its start and its end are written to this
          tenant&apos;s audit trail with your name and the reason you give.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="hms-field">
            <span className="hms-label">Act as</span>
            <select className="hms-input" value={targetUser} onChange={(e) => setTargetUser(e.target.value)}>
              <option value="">Select a user…</option>
              {targets.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} · {u.email}
                  {u.roles.length ? ` (${u.roles.join(", ")})` : ""}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Ticket reference (optional)"
            value={ticketRef}
            onChange={(e) => setTicketRef(e.target.value)}
            placeholder="e.g. SUP-1042"
          />
          <div className="sm:col-span-2">
            <Field
              label="Reason (recorded in the audit trail)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why do you need to enter this hospital?"
              error={reason.length > 0 && reason.trim().length < 10 ? "At least 10 characters." : undefined}
            />
          </div>
        </div>

        {popupBlocked ? (
          <Alert tone="danger">
            Your browser blocked the new tab. Allow pop-ups for this site and start the session again.
          </Alert>
        ) : null}

        <div className="mt-4">
          <Button
            variant="secondary"
            disabled={!targetUser || reason.trim().length < 10}
            onClick={() => setConfirming(true)}
          >
            Start support session in a new tab
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirming}
        title={`Enter ${tenant.name} as this user?`}
        description="This opens in a new tab so your platform session stays here. You will act as them until you exit, and everything you do is audited in this tenant under your name."
        confirmLabel="Start session"
        tone="default"
        busy={starting}
        onCancel={() => setConfirming(false)}
        onConfirm={startSession}
      />

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
