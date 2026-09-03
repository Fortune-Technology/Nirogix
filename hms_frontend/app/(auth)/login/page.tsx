'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, BrandMark, Button, Card, Field, PasswordField } from '@hms/ui';
import { useAuth } from '../../../lib/auth';
import { QuickLogin } from '../../../components/auth/QuickLogin';
import type { DevUser } from '../../../lib/devUsers';

// Build-time gate. `NEXT_PUBLIC_ENVIRONMENT` is one of the three canonical environments —
// `development` | `staging` | `production` (ADR-071) — inlined as a string literal at build, so in
// a PRODUCTION build this expression folds to `false` and `<QuickLogin/>` below never renders.
// The real production-safety guarantee, though, lives in `lib/devUsers.ts`: the credential array
// is itself built behind the same folded gate, so `false ? [...] : []` minifies to `[]` and the
// dev credentials are physically ABSENT from the production bundle — not merely un-rendered.
// (Verified by grepping the built `.next/static` + `.next/server` chunks — see DONE.md.)
// Default (unset) is also `false` → safe.
const QUICK_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'development' ||
  process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging';

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  const [orgCode, setOrgCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The account the dev quick-login last filled, shown as a confirmation until the user edits a
  // field or signs in. Never rendered in production (QuickLogin returns null there).
  const [filled, setFilled] = useState<DevUser | null>(null);

  // Already signed in → skip the form.
  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  // The one authentication path — the form and the dev quick-login both go through it, so there
  // is no second auth mechanism to keep in sync.
  async function submitCredentials(creds: { orgCode: string; email: string; password: string }) {
    setError(null);
    setSubmitting(true);
    const result = await login({
      orgCode: creds.orgCode.trim(),
      email: creds.email.trim(),
      password: creds.password,
    });
    setSubmitting(false);
    if (result.ok) router.replace('/dashboard');
    else setError(result.error);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submitCredentials({ orgCode, email, password });
  }

  // Dev/staging only (QuickLogin renders nothing in production): fill the visible fields so it is
  // clear who you are signing in as. It does NOT sign in — the user reviews the filled form and
  // clicks the normal Sign in button, going through the one auth path above.
  function handleQuickLogin(user: DevUser) {
    setOrgCode(user.orgCode);
    setEmail(user.email);
    setPassword(user.password);
    setError(null);
    setFilled(user);
  }

  // The confirmation only holds while the filled values are untouched; a manual edit hides it.
  const showFilled =
    filled !== null &&
    orgCode === filled.orgCode &&
    email === filled.email &&
    password === filled.password;

  return (
    <Card>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <BrandMark size={40} />
        <h1 className="text-lg font-semibold text-fg">Sign in to Nirogix Portal</h1>
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
        <p className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </p>
        {showFilled && filled && (
          <p className="-mt-1 text-xs text-fg-subtle">
            Filled with <span className="font-medium text-fg">{filled.role}</span>
            <span className="font-mono"> · {filled.email}</span>. Review and sign in.
          </p>
        )}
        <Button type="submit" loading={submitting} className="mt-1 w-full">
          Sign in
        </Button>
      </form>

      {QUICK_LOGIN_ENABLED && <QuickLogin onSelect={handleQuickLogin} busy={submitting} />}
    </Card>
  );
}
