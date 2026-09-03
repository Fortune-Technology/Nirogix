'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, BrandMark, Button, Card, PasswordField } from '@hms/ui';
import { resetPassword } from '../../../lib/api';

/**
 * Forgot-password step 2 for the operator console (ADR-081) — the destination of the
 * emailed link (`/reset-password?token=…`). Single-use, 30-minute token; on success
 * every session was revoked server-side, so the only path onward is signing in again.
 */
function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Try again.';
}

function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await resetPassword({ token, newPassword: password });
      setDone(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger">
          This reset link is incomplete. Open the link from the email again.
        </Alert>
        <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{done}</Alert>
        <Link href="/login" className="text-sm font-medium text-brand hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {error && <Alert tone="danger">{error}</Alert>}
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={10}
        autoFocus
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        minLength={10}
      />
      <p className="-mt-1 text-xs text-fg-subtle">At least 10 characters.</p>
      <Button type="submit" loading={submitting} className="mt-1 w-full">
        Set new password
      </Button>
      <p className="text-center">
        <Link href="/login" className="text-sm font-medium text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Card>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <BrandMark size={40} />
        <h1 className="text-lg font-semibold text-fg">Choose a new password</h1>
        <p className="text-sm text-fg-muted">
          The link works once and expires 30 minutes after it was sent.
        </p>
      </div>
      {/* useSearchParams needs a Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </Card>
  );
}
