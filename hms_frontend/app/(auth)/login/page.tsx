"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, PasswordField } from "@hms/ui";
import { useAuth } from "../../../lib/auth";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  const [orgCode, setOrgCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → skip the form.
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login({ orgCode: orgCode.trim(), email: email.trim(), password });
    setSubmitting(false);
    if (result.ok) router.replace("/dashboard");
    else setError(result.error);
  }

  return (
    <Card>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <span className="inline-block h-9 w-9 rounded-token-lg bg-brand" aria-hidden />
        <h1 className="text-lg font-semibold text-fg">Sign in to HMS Portal</h1>
        <p className="text-sm text-fg-muted">Use your organization code and staff credentials.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field
          label="Organization code"
          placeholder="e.g. CITYCARE"
          autoComplete="organization"
          value={orgCode}
          onChange={(e) => setOrgCode(e.target.value)}
          required
          autoFocus
        />
        <Field
          label="Email"
          type="email"
          placeholder="you@hospital.example"
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
    </Card>
  );
}
