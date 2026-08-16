// Public, centered shell for the auth screens (login, and later forgot-password / MFA).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
