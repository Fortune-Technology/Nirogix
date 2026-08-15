"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@hms/types";
import { formatDateTime } from "@hms/utils";
import * as api from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { PageHeader } from "../../../components/PageHeader";
import {
  Field,
  ProfileEditableCard,
  ProfileField,
  ProfileHeader,
  ProfileInfoCard,
  ProfileSecurityCard,
} from "../../../components/profile";

/**
 * My Profile (ADR-035) — one screen for every role, built from the shared profile
 * components. What a user sees is what the server already returns for *them*
 * (`GET /auth/me`); editing is limited to their own account through
 * `PATCH /auth/profile`, whose user id comes from the token, not the page.
 *
 * Fields the schema does not carry yet (phone, department, designation, avatar,
 * notification preferences) are deliberately absent rather than faked — they need
 * an additive migration, tracked in BACKLOG.md.
 */
export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [me, setMe] = useState<AuthUser | null>(user);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((res) => {
        if (!alive) return;
        setMe(res.user);
        setFullName(res.user.fullName);
      })
      .catch(() => {
        /* reported by the shared API-feedback layer */
      });
    return () => {
      alive = false;
    };
  }, []);

  const dirty = me !== null && fullName.trim() !== me.fullName;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await api.updateOwnProfile({ fullName: fullName.trim() });
      setMe(res.user);
      await refresh();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    setChanging(true);
    try {
      await api.changeOwnPassword(input);
      // Every session was revoked server-side, including this one.
      router.replace("/login");
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setChanging(false);
    }
  }

  if (!me) {
    return <PageHeader title="My profile" description="Loading your account…" />;
  }

  return (
    <>
      <PageHeader title="My profile" description="Your account, role and security settings." />

      <ProfileHeader
        fullName={me.fullName}
        email={me.email}
        roles={me.roles ?? []}
        status={me.status ?? "active"}
      />

      <ProfileEditableCard
        header="Personal details"
        description="Your name is shown to colleagues on records you create and on the audit trail."
        dirty={dirty}
        saving={saving}
        onSave={saveProfile}
        onCancel={() => setFullName(me.fullName)}
      >
        <Field label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        <Field label="Email" value={me.email} readOnly disabled title="Contact an administrator to change your email." />
      </ProfileEditableCard>

      <ProfileInfoCard header="Account">
        <ProfileField label="Organization ID">
          <span className="font-mono text-sm">{me.tenantId}</span>
        </ProfileField>
        <ProfileField label="Role">{(me.roles ?? []).join(", ")}</ProfileField>
        <ProfileField label="Account status">{me.status ?? "active"}</ProfileField>
        <ProfileField label="Two-factor authentication">{me.mfaEnabled ? "Enabled" : "Not enabled"}</ProfileField>
        <ProfileField label="Last sign-in">{me.lastLoginAt ? formatDateTime(me.lastLoginAt) : "This session"}</ProfileField>
        <ProfileField label="Member since">{me.createdAt ? formatDateTime(me.createdAt) : "—"}</ProfileField>
      </ProfileInfoCard>

      <ProfileSecurityCard onSubmit={changePassword} busy={changing} />
    </>
  );
}
