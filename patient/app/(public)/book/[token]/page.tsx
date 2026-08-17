"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Alert, BrandMark, Button, Card, DateField, Field, PhoneField, Skeleton, Textarea, TimeField } from "@hms/ui";
import { todayApiDate } from "@hms/utils";
import * as api from "../../../../lib/api";

/**
 * The hospital's public appointment-request form (ADR-069).
 *
 * The URL carries an **opaque token and nothing else** — no tenant id, no patient id,
 * no configuration. The hospital is resolved from that token by the backend on both
 * calls, so the identity of the hospital this form asks is never something the browser
 * asserts. A QR for one hospital cannot submit to another because there is no field in
 * which to name a different one.
 *
 * The page is honest about what submitting does: it sends a **wish** — a name, a
 * phone number, a preferred time — to the hospital's front desk. It does **not** book
 * an appointment, create a patient record, an account, or portal access. The hospital
 * confirms the actual slot (ADR-052).
 */

type Form = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  preferredDate: string;
  preferredTime: string | null;
  departmentId: string;
  providerId: string;
  note: string;
};

const EMPTY: Form = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  preferredDate: "",
  preferredTime: null,
  departmentId: "",
  providerId: "",
  note: "",
};

export default function PublicBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [context, setContext] = useState<api.PublicBookingContext | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .getPublicBookingContext(token)
      // A hospital that has switched booking off renders the same not-valid state as
      // an unknown or retired token — the page must not reveal which it was.
      .then((ctx) => (ctx.enabled ? setContext(ctx) : setInvalid(true)))
      .catch(() => setInvalid(true));
  }, [token]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.submitBookingRequest(token, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        preferredDate: form.preferredDate || null,
        preferredTime: form.preferredTime || null,
        departmentId: form.departmentId || null,
        providerId: form.providerId || null,
        note: form.note.trim() || null,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "We could not send your request just now.");
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <BrandMark size={36} />
          <h1 className="text-lg font-semibold text-fg">This booking link is not active</h1>
          <p className="max-w-sm text-sm text-fg-muted">
            The link or QR code may have been replaced, or the hospital may not be taking online appointment requests
            right now. Please call the hospital or ask at the reception desk.
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
          <h1 className="text-lg font-semibold text-fg">Thank you — we have your request</h1>
          <p className="max-w-sm text-sm text-fg-muted">
            The hospital will confirm your appointment. {context.hospitalName} will contact you on the number you gave
            to settle the exact date and time.
          </p>
          <p className="max-w-sm text-xs text-fg-subtle">
            Sending this form does not book a slot by itself, and it does not create an account.
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
          <h1 className="text-lg font-semibold text-fg">Request an appointment at {context.hospitalName}</h1>
          {context.city ? <p className="text-sm text-fg-muted">{context.city}</p> : null}
          <p className="max-w-md text-sm text-fg-muted">
            Tell us who you are and when you would like to come in. The hospital checks its schedule and confirms the
            actual slot with you — nothing is booked until they do.
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
              hint="How the hospital will reach you to confirm."
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
            />

            {/* `DateField` / `TimeField`, never native inputs — those render in the
                browser's own locale (ADR-048). Both are a wish, not a slot. */}
            <DateField
              label="Preferred date"
              value={form.preferredDate || null}
              onChange={(v) => set("preferredDate", v ?? "")}
              min={todayApiDate()}
              hint="Optional."
            />
            <TimeField
              label="Preferred time"
              value={form.preferredTime}
              onChange={(v) => set("preferredTime", v)}
              hint="Optional."
            />

            {context.departments.length > 0 ? (
              <div className="hms-field">
                <label className="hms-label" htmlFor="book-department">
                  Department
                </label>
                <select
                  id="book-department"
                  className="hms-input"
                  value={form.departmentId}
                  onChange={(e) => set("departmentId", e.target.value)}
                >
                  <option value="">No preference</option>
                  {context.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {context.providers.length > 0 ? (
              <div className="hms-field">
                <label className="hms-label" htmlFor="book-doctor">
                  Doctor
                </label>
                <select
                  id="book-doctor"
                  className="hms-input"
                  value={form.providerId}
                  onChange={(e) => set("providerId", e.target.value)}
                >
                  <option value="">No preference</option>
                  {context.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

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
            Send my request
          </Button>
        </form>
      </Card>

      <p className="mt-4 px-2 text-center text-xs text-fg-subtle">
        Your details go only to {context.hospitalName}. Sending this form does not book an appointment by itself,
        create an account, or give you access to any records — the hospital confirms your appointment with you.
      </p>
    </>
  );
}
