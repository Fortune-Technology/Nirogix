"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Card, PasswordField } from "@hms/ui";

/**
 * Profile pieces for the operator console — shared with the Portal **by copy, not by
 * import** (the same rule as Can/Forbidden/PageHeader): the two apps deliberately
 * share no app-level code, only `@hms/ui`. Source of the copy:
 * `hms_frontend/components/profile/index.tsx` (ADR-035). The operator page does not
 * use the editable-card piece, so it is not copied — copy it over if name editing
 * ever lands here (clean-code rule: nothing unused ships).
 */

export function ProfileHeader({
  fullName,
  email,
  roles,
  status,
}: {
  fullName: string;
  email: string;
  roles: string[];
  status: string;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <ProfileAvatar name={fullName} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-fg">{fullName}</h2>
          <p className="mt-0.5 truncate text-sm text-fg-muted">{email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {roles.length === 0 ? (
              <Badge tone="neutral">No role assigned</Badge>
            ) : (
              roles.map((r) => (
                <Badge key={r} tone="brand">
                  {r}
                </Badge>
              ))
            )}
            <Badge tone={status === "active" ? "success" : "warning"}>{status}</Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Initials stand in until avatar upload exists (same reasoning as the Portal's copy). */
export function ProfileAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-brand-subtle font-semibold text-brand"
      style={{ width: size, height: size, fontSize: size / 2.8 }}
    >
      {initials}
    </span>
  );
}

/** A read-only fact. Used for everything the operator may see but not change. */
export function ProfileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-1 text-[0.975rem] text-fg">{children || "—"}</dd>
    </div>
  );
}

export function ProfileInfoCard({ header, children }: { header: string; children: ReactNode }) {
  return (
    <Card header={header}>
      <dl className="grid gap-5 sm:grid-cols-2">{children}</dl>
    </Card>
  );
}

/**
 * Password change. Requires the current password (the server re-checks it), uses
 * the shared `PasswordField` so the reveal affordance is consistent, and carries
 * the correct autocomplete semantics so password managers can offer and then save
 * the new credential.
 */
export function ProfileSecurityCard({
  onSubmit,
  busy,
}: {
  onSubmit: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  busy?: boolean;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < 10;
  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 10) return setError("Use at least 10 characters for the new password.");
    if (next !== confirm) return setError("The two new passwords do not match.");
    await onSubmit({ currentPassword: current, newPassword: next });
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <Card header="Password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">
          Changing your password signs you out of every device, including this one, so sign in again afterwards.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <PasswordField
            label="Current password"
            value={current}
            autoComplete="current-password"
            onChange={(e) => setCurrent(e.target.value)}
          />
          <PasswordField
            label="New password"
            value={next}
            autoComplete="new-password"
            error={tooShort ? "At least 10 characters." : undefined}
            onChange={(e) => setNext(e.target.value)}
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            autoComplete="new-password"
            error={mismatch ? "Does not match." : undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div>
          <Button type="submit" loading={busy} disabled={!current || !next || !confirm}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
