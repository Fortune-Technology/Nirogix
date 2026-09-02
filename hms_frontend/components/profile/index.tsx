"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Card, Field, PasswordField, ValueOrEmpty } from "@hms/ui";

/**
 * The reusable profile system (ADR-035). One set of pieces serves every role —
 * a receptionist and a super admin get the same components, differing only in
 * which fields their permissions allow them to see and edit. There is no
 * per-role profile page.
 */

export function ProfileHeader({
  fullName,
  email,
  roles,
  status,
  organization,
}: {
  fullName: string;
  email: string;
  roles: string[];
  status: string;
  organization?: string;
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
        {organization ? (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-fg-subtle">Organization</p>
            <p className="text-sm font-medium text-fg">{organization}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Initials stand in until avatar upload exists. Deliberately not a photo
 * placeholder: showing an empty frame implies a feature that is not built.
 */
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

/** A read-only fact. Used for everything the user may see but not change. */
export function ProfileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-1 text-[0.975rem] text-fg">
        <ValueOrEmpty value={children} reason="unspecified" />
      </dd>
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
 * An editable section with explicit Save / Cancel. Cancel restores the values the
 * section opened with, so a half-finished edit never silently persists.
 */
export function ProfileEditableCard({
  header,
  description,
  onSave,
  children,
  dirty,
  onCancel,
  saving,
}: {
  header: string;
  description?: string;
  onSave: (e: FormEvent) => void;
  onCancel: () => void;
  children: ReactNode;
  dirty: boolean;
  saving?: boolean;
}) {
  return (
    <Card header={header}>
      <form onSubmit={onSave} className="flex flex-col gap-4">
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={!dirty || saving}>
            Cancel
          </Button>
        </div>
      </form>
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

export { Field };
