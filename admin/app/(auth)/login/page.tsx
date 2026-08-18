"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, BrandMark, Button, Card, Field, PasswordField } from "@hms/ui";
import { useAuth } from "../../../lib/auth";
import { QuickLogin } from "../../../components/auth/QuickLogin";
import type { DevUser } from "../../../lib/devUsers";

/**
 * Platform operator sign-in (ADR-051).
 *
 * The same credential shape as every other Nirogix surface — organization code,
 * email, password — because there is one backend and one identity model. What
 * differs is the organization: operators live in the PLATFORM org (ADR-022), never
 * inside a customer hospital.
 *
 * In development and staging a "Test credentials" helper (`QuickLogin`) offers the two
 * seeded Platform Admins to fill this form — the SAME form and API, never a second auth
 * path. It folds out of a production build (see `lib/devUsers.ts`), so production ships
 * with no pre-filled or hinted credentials. The seeded operator accounts live in
 * `hms_backend/src/scripts/seed.ts` (operator org code `NIROGIX`) and the QA checklist.
 */
export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  const [orgCode, setOrgCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login({ orgCode: orgCode.trim(), email: email.trim(), password });
    setSubmitting(false);
    if (result.ok) router.replace("/");
    else setError(result.error);
  }

  // Dev/staging quick-login: fill the SAME form; the operator still submits with the button.
  function fillCredentials(user: DevUser) {
    setOrgCode(user.orgCode);
    setEmail(user.email);
    setPassword(user.password);
    setError(null);
  }

  return (
    <Card>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <BrandMark size={40} />
        <h1 className="text-lg font-semibold text-fg">Nirogix Platform Admin</h1>
        <p className="text-sm text-fg-muted">Sign in with your platform operator account.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field
          label="Organization code"
          autoComplete="organization"
          value={orgCode}
          onChange={(e) => setOrgCode(e.target.value)}
          required
          autoFocus
        />
        <Field
          label="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" loading={submitting} className="mt-1 w-full">
          Sign in
        </Button>
      </form>

      <QuickLogin onSelect={fillCredentials} busy={submitting} />

      <p className="mt-5 text-center text-xs text-fg-subtle">
        This console administers the Nirogix platform. Hospital staff sign in to the Nirogix Portal instead.
      </p>
    </Card>
  );
}
