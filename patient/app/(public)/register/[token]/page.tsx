"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert, BrandMark, Button, Card, DateField, Field, PhoneField, Skeleton, Textarea } from "@hms/ui";
import type { PublicRegistrationContext } from "@hms/types";
import * as api from "../../../../lib/api";

/**
 * The hospital's public self-registration form (ADR-056).
 *
 * The URL carries an **opaque token and nothing else** — no tenant id, no patient id, no
 * configuration. The hospital is resolved from that token by the backend on both calls,
 * so the identity of the hospital this form registers with is never something the browser
 * asserts. A QR for one hospital cannot submit to another because there is no field in
 * which to name a different one.
 *
 * The page is honest about what submitting does: it sends details to the hospital's front
 * desk. It does **not** create a patient record, an account, or portal access — the
 * hospital does that after checking who you are (ADR-052).
 */

const GENDERS = [
  { value: "", label: "Prefer not to say" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

type Form = {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  city: string;
  note: string;
};

const EMPTY: Form = {
  firstName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  city: "",
  note: "",
};

export default function PublicRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [context, setContext] = useState<PublicRegistrationContext | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .registrationContext(token)
      .then(setContext)
      // An unknown token, a retired one, and a hospital that has switched registration
      // off all land here identically — the page must not reveal which it was.
      .catch(() => setInvalid(true));
  }, [token]);

  function set<K extends keyof Form>(key: K, value: string) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.submitRegistration(token, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        gender: form.gender || null,
        dateOfBirth: form.dateOfBirth || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        note: form.note.trim() || null,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "We could not send your details just now.");
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <BrandMark size={36} />
          <h1 className="text-lg font-semibold text-fg">This registration link is not active</h1>
          <p className="max-w-sm text-sm text-fg-muted">
            The link or QR code may have been replaced, or the hospital may not be accepting online registrations right
            now. Please register at the reception desk.
          </p>
        </div>
      </Card>
    );
  }

  if (!context) return <Skeleton height="24rem" />;

  if (done) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} strokeWidth={1.75} className="text-success" aria-hidden />
          <h1 className="text-lg font-semibold text-fg">Thank you — we have your details</h1>
          <p className="max-w-sm text-sm text-fg-muted">
            {context.hospitalName} has your information. Please go to the reception desk when you arrive and give your
            name — they will complete your registration and confirm your details.
          </p>
          <p className="max-w-sm text-xs text-fg-subtle">
            Sending this form does not create an account or book an appointment.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <BrandMark size={36} />
          <h1 className="text-lg font-semibold text-fg">Register with {context.hospitalName}</h1>
          {context.city ? <p className="text-sm text-fg-muted">{context.city}</p> : null}
          <p className="max-w-md text-sm text-fg-muted">
            Send your details ahead so the desk has less to type when you arrive. Someone at the hospital checks them
            and completes your registration — nothing is confirmed until they do.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          {error && <Alert tone="danger">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              required
              autoFocus
              autoComplete="given-name"
            />
            <Field
              label="Last name"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              autoComplete="family-name"
            />
            <PhoneField
              label="Mobile number"
              value={form.phone}
              onChange={(v) => set("phone", v)}
              required
              hint="How the hospital will reach you."
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
            />

            <div className="hms-field">
              <label className="hms-label" htmlFor="reg-gender">
                Gender
              </label>
              <select
                id="reg-gender"
                className="hms-input"
                value={form.gender}
                onChange={(e) => set("gender", e.target.value)}
              >
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            {/* `DateField`, never a native date input — that renders in the browser's own
                locale, and this form is read by people who expect DD/MM/YYYY (ADR-048). */}
            <DateField
              label="Date of birth"
              value={form.dateOfBirth || null}
              onChange={(v) => set("dateOfBirth", v ?? "")}
              max={new Date().toISOString().slice(0, 10)}
            />

            <div className="sm:col-span-2">
              <Field label="City" value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <Textarea
                label="Anything the hospital should know"
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
                rows={3}
                maxLength={500}
                hint="Optional. Please do not include medical details here — tell the doctor those in person."
              />
            </div>
          </div>

          <Button type="submit" loading={busy} className="mt-1 w-full">
            Send my details
          </Button>
        </form>
      </Card>

      <p className="mt-4 px-2 text-center text-xs text-fg-subtle">
        Your details go only to {context.hospitalName}. Sending this form does not create an account, book an
        appointment, or give you access to any records.
      </p>
    </>
  );
}
