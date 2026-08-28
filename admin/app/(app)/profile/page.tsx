"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@hms/types";
import { formatDateTime } from "@hms/utils";
import * as api from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { PageHeader } from "../../../components/PageHeader";
import { ProfileField, ProfileHeader, ProfileInfoCard, ProfileSecurityCard } from "../../../components/profile";

/**
 * My profile for the platform operator (closes the gap where an operator had to sign
 * in to the hospital-staff Portal to change their own password — ADR-051 gives each
 * audience its own surface). Any authenticated operator may use it: what they see is
 * what `GET /auth/me` already returns for *them*, and the password change goes to the
 * same `POST /auth/change-password` the Portal uses — the user id comes from the
 * token, never the page. On success every session is revoked server-side, so the page
 * sends the operator back to sign in.
 */
export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<AuthUser | null>(user);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((res) => {
        if (alive) setMe(res.user);
      })
      .catch(() => {
        /* reported by the shared API-feedback layer */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function changePassword(input: { currentPassword: string; newPassword: string }) {
    setChanging(true);
    try {
      await api.changePassword(input);
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
      <PageHeader title="My profile" description="Your operator account and security settings." />

      <ProfileHeader fullName={me.fullName} email={me.email} roles={me.roles ?? []} status={me.status ?? "active"} />

      <ProfileInfoCard header="Account">
        <ProfileField label="Email">{me.email}</ProfileField>
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
