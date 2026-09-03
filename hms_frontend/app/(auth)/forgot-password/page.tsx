'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, BrandMark, Button, Card, Field } from '@hms/ui';
import { forgotPassword } from '../../../lib/api';

// These pages render outcomes inline (feedback: false on the calls), so a caught
// error's message — the backend's own wording via ApiRequestError — is shown here.
function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Try again.';
}

/**
 * Forgot-password step 1 (ADR-081). Asks for the same organization code + email the
 * sign-in form uses; the backend answers the SAME message whether or not an account
 * matches, and this page simply shows it — nothing here can confirm an account exists.
 */
export default function ForgotPasswordPage() {
  const [orgCode, setOrgCode] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await forgotPassword({ orgCode: orgCode.trim(), email: email.trim() });
      setSent(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <BrandMark size={40} />
        <h1 className="text-lg font-semibold text-fg">Forgot your password?</h1>
        <p className="text-sm text-fg-muted">
          Enter your organization code and email, and we&rsquo;ll send a reset link.
        </p>
      </div>

      {sent ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success">{sent}</Alert>
          <p className="text-sm text-fg-muted">
            Check your inbox. The link is valid for 30 minutes and works once.
          </p>
          <Link href="/login" className="text-sm font-medium text-brand hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
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
          <Button type="submit" loading={submitting} className="mt-1 w-full">
            Email me a reset link
          </Button>
          <p className="text-center">
            <Link href="/login" className="text-sm font-medium text-brand hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </Card>
  );
}
