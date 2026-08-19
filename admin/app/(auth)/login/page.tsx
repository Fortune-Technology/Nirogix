"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, BrandMark, Button, Card, Field, PasswordField } from "@hms/ui";
import { useAuth } from "../../../lib/auth";

/**
 * Platform operator sign-in (ADR-051).
 *
 * The same credential shape as every other Nirogix surface — organization code,
 * email, password — because there is one backend and one identity model. What
 * differs is the organization: operators live in the PLATFORM org (ADR-022), never
 * inside a customer hospital.
 *
 * Deliberately NO "Test credentials" quick-login here, in ANY environment (ADR-077,
 * superseding ADR-074 on this point): the operator accounts are real platform
 * credentials, and this console never displays, hints, or pre-fills them. Operators
 * type org code `NIROGIX` (case-insensitive, ADR-074) + their email + password.
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

      <p className="mt-5 text-center text-xs text-fg-subtle">
        This console administers the Nirogix platform. Hospital staff sign in to the Nirogix Portal instead.
      </p>
    </Card>
  );
}
