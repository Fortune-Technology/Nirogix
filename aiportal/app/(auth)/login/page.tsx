'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Alert, BrandMark, Button, Card, Field, PasswordField } from '@hms/ui';
import { useAuth } from '../../../lib/auth';
import { MARKETING_URL, PORTAL_URL } from '../../../lib/links';

/**
 * The AI Portal's front door (ADR-053).
 *
 * The ordinary staff credential shape — organization code, email, password — because the
 * people who may use this are hospital staff and platform operators, against the same
 * backend. **A patient can never sign in here**: the backend refuses a patient principal
 * by type, before any permission is read, so knowing this URL achieves nothing (ADR-052).
 *
 * Two things are deliberately absent:
 *
 * - **No sign-up.** The AI Portal has no public registration, so there is no button and
 *   the page says why rather than leaving someone looking for one.
 * - **No "forgot password" link.** Self-service password reset is not built (`BACKLOG.md`);
 *   a link to a route that does not exist is worse than none, so the page states what
 *   actually happens — an administrator issues a new password.
 *
 * Signing in successfully is not the same as getting in: access is a separate permission
 * held by no role, and the page is honest about that before someone tries.
 */
export default function AiPortalLoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  const [orgCode, setOrgCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login({ orgCode: orgCode.trim(), email: email.trim(), password });
    setSubmitting(false);
    if (result.ok) router.replace('/');
    else setError(result.error);
  }

  return (
    <Card>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <BrandMark size={40} />
        <h1 className="text-lg font-semibold text-fg">Nirogix AI Portal</h1>
        <p className="text-sm text-fg-muted">
          For authorised healthcare teams and Nirogix platform administrators. Sign in with your
          Nirogix account to continue.
        </p>
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
          hint="Forgotten it? Your administrator can issue a new one. There is no self-service reset yet."
        />
        <Button type="submit" loading={submitting} className="mt-1 w-full">
          Sign in
        </Button>
      </form>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
        <p className="flex items-start gap-2 text-xs text-fg-subtle">
          <ShieldCheck size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            There is no sign-up for the AI Portal. Access is granted to individual accounts by a
            platform administrator, and every sign-in is recorded. Patients cannot sign in here.
          </span>
        </p>
        <p className="text-center text-xs text-fg-subtle">
          <a href={`${PORTAL_URL}/login`} className="underline hover:text-fg-muted">
            Nirogix Portal
          </a>
          <span aria-hidden> · </span>
          <a href={MARKETING_URL} className="underline hover:text-fg-muted">
            About Nirogix
          </a>
        </p>
      </div>
    </Card>
  );
}
