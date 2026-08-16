"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, BrandMark, Button, Card, Field, PasswordField } from "@hms/ui";
import { useAuth } from "../../../lib/auth";

/**
 * AI Portal sign-in (ADR-053).
 *
 * The ordinary staff credential shape — organization code, email, password — because
 * the people who may use this are hospital staff and platform operators, against the
 * same backend. **A patient can never sign in here**: the backend refuses a patient
 * principal by type, before any permission is read, so knowing this URL achieves
 * nothing (ADR-052).
 *
 * Access is a separate permission that **no role holds by default**. Signing in
 * successfully is not the same as getting in.
 *
 * No credentials are pre-filled or hinted. Development accounts live in the seed and
 * the QA checklist, not in a shipped bundle.
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
        <h1 className="text-lg font-semibold text-fg">Nirogix AI</h1>
        <p className="text-sm text-fg-muted">Sign in with your Nirogix staff account.</p>
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
        AI Portal access is granted per person, not by role. If you sign in and see no access, ask the platform
        owner to grant it. Patients cannot sign in here.
      </p>
    </Card>
  );
}
