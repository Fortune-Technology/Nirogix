"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, BrandMark, Button, Card, Field, PhoneField } from "@hms/ui";
import * as api from "../../../lib/api";
import { useSession } from "../../../lib/session";

/**
 * Patient sign-in (ADR-052).
 *
 * Two steps: a contact, then the code sent to it. There is **no signup**, and the
 * screen says why in plain words rather than leaving a patient hunting for a button
 * that does not exist — access is granted by the hospital during registration.
 *
 * The server answers `request-code` identically whether or not the contact is
 * registered, so this screen must too. Saying "we don't recognise that number" would
 * undo the whole point: the endpoint would become a way to ask "is this person a
 * patient somewhere?".
 */
export default function PatientLoginPage() {
  const router = useRouter();
  const { signedIn, signIn } = useSession();

  const [step, setStep] = useState<"contact" | "code">("contact");
  const [channel, setChannel] = useState<"mobile" | "email">("mobile");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (signedIn) router.replace("/");
  }, [signedIn, router]);

  const contact = channel === "mobile" ? { mobile: mobile.trim() } : { email: email.trim() };

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.requestCode(contact);
      // Always advance. Whether a code was really sent is deliberately not revealed.
      setStep("code");
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "Could not send a code just now.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      signIn(await api.verifyCode(contact, code.trim()));
      router.replace("/");
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "That code is not valid.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <BrandMark size={40} />
        <h1 className="text-lg font-semibold text-fg">Your health records</h1>
        <p className="text-sm text-fg-muted">
          {step === "contact"
            ? "Sign in with the mobile number or email your hospital has on file."
            : "Enter the 6-digit code we sent you."}
        </p>
      </div>

      {step === "contact" ? (
        <form className="flex flex-col gap-4" onSubmit={sendCode}>
          {error && <Alert tone="danger">{error}</Alert>}

          <div className="flex gap-2" role="group" aria-label="How would you like the code sent?">
            <Button
              type="button"
              variant={channel === "mobile" ? "primary" : "secondary"}
              size="sm"
              className="flex-1"
              onClick={() => setChannel("mobile")}
            >
              Mobile
            </Button>
            <Button
              type="button"
              variant={channel === "email" ? "primary" : "secondary"}
              size="sm"
              className="flex-1"
              onClick={() => setChannel("email")}
            >
              Email
            </Button>
          </div>

          {channel === "mobile" ? (
            <PhoneField
              label="Mobile number"
              value={mobile}
              onChange={setMobile}
              required
              hint="We'll text a one-time code to this number."
            />
          ) : (
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          )}

          <Button type="submit" loading={busy} className="mt-1 w-full">
            Send me a code
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submitCode}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            hint="The code expires in 10 minutes and can be used once."
          />
          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setStep("contact");
              setCode("");
              setError(null);
            }}
          >
            Use a different contact
          </Button>
        </form>
      )}

      <p className="mt-5 border-t border-border pt-4 text-center text-xs text-fg-subtle">
        There is no sign-up here. Your hospital gives you access when it registers you. If you cannot sign in, ask
        the hospital to check the mobile number or email on your file.
      </p>
    </Card>
  );
}
