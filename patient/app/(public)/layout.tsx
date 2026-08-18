/**
 * Shell for pages a person reaches without signing in — today, the hospital's own
 * self-registration form (ADR-056).
 *
 * Deliberately separate from `(app)`: nothing here mounts the session provider or the
 * portal navigation, so a public page cannot accidentally render something that assumes
 * a signed-in patient.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-bg p-6">
      <div className="w-full max-w-xl py-6">{children}</div>
    </div>
  );
}
