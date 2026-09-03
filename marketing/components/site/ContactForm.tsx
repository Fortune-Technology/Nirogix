'use client';

import { useId, useState, type FormEvent } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';

/*
 * Demo-request form. NOTE: the marketing site is static and has no backend, so on
 * submit this shows a success state without transmitting anywhere. Before launch,
 * wire handleSubmit to a real endpoint or CRM (the TODO below). Field names are
 * stable so that wiring is a drop-in.
 *
 * The role field is a **native `<select>` on purpose** — the one left in the monorepo after the
 * Portal moved to `@hms/ui`'s `Select` (ADR-112). Three reasons, and they are marketing's, not
 * the Portal's:
 *
 * - This form is **uncontrolled**. It has no state per field, submits natively, and leans on the
 *   browser's `required` to refuse an empty role. `Select` is controlled and its hidden input
 *   carries no `required`, so swapping it in would quietly remove that validation.
 * - Marketing is an **independent token scope** (`--mk-*`, ADR-040) with its own `inputClass`.
 *   The kit's control is styled for the Portal's fields, which this form does not use.
 * - Five options with no search. There is nothing here the kit's control would do better.
 *
 * Consistency is the reason to use the shared control, not a reason to lose form validation.
 */

const inputClass =
  'w-full rounded-md border border-hairline bg-surface px-3.5 py-2.5 text-[0.975rem] text-ink ' +
  'placeholder:text-ink-faint transition-shadow focus:outline-none focus:border-accent ' +
  'focus:ring-3 focus:ring-accent/25';
const labelClass = 'text-sm font-medium text-ink';

const ROLE_OPTIONS = [
  'Owner or founder',
  'Hospital administrator',
  'Doctor',
  'IT or operations',
  'Other',
];

export function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const uid = useId();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    // TODO(before launch): POST the form data to the real demo-request endpoint / CRM.
    // The form is intentionally inert on the static marketing site.
    await new Promise((r) => setTimeout(r, 500));
    setStatus('done');
  }

  if (status === 'done') {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-subtle text-accent">
          <Check size={24} strokeWidth={2} />
        </span>
        <h3 className="mt-5 text-xl font-medium tracking-tight text-ink">Thanks, we have it.</h3>
        <p className="mx-auto mt-2 max-w-sm text-[0.975rem] leading-relaxed text-ink-subtle">
          Our team will reach out to set up a walkthrough for your hospital. You can also sign in to
          the Portal if you already have an account.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-hairline bg-surface p-6 sm:p-8"
    >
      <div className="grid gap-5">
        <div className="grid gap-2">
          <label htmlFor={`${uid}-name`} className={labelClass}>
            Full name
          </label>
          <input
            id={`${uid}-name`}
            name="name"
            required
            autoComplete="name"
            className={inputClass}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor={`${uid}-email`} className={labelClass}>
              Work email
            </label>
            <input
              id={`${uid}-email`}
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor={`${uid}-phone`} className={labelClass}>
              Phone <span className="text-ink-faint">(optional)</span>
            </label>
            <input
              id={`${uid}-phone`}
              name="phone"
              type="tel"
              autoComplete="tel"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <label htmlFor={`${uid}-org`} className={labelClass}>
            Hospital or clinic name
          </label>
          <input id={`${uid}-org`} name="organisation" required className={inputClass} />
        </div>

        <div className="grid gap-2">
          <label htmlFor={`${uid}-role`} className={labelClass}>
            Your role
          </label>
          <select id={`${uid}-role`} name="role" defaultValue="" required className={inputClass}>
            <option value="" disabled>
              Select a role
            </option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label htmlFor={`${uid}-message`} className={labelClass}>
            What are you looking for?
          </label>
          <textarea
            id={`${uid}-message`}
            name="message"
            rows={4}
            className={`${inputClass} resize-y`}
          />
          <p className="text-sm text-ink-faint">
            Tell us which modules and how many branches you have in mind.
          </p>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={status === 'submitting'}>
          {status === 'submitting' ? (
            <>
              <Loader2 size={18} strokeWidth={2} className="animate-spin" />
              Sending
            </>
          ) : (
            'Book a demo'
          )}
        </Button>
        <p className="text-center text-xs leading-relaxed text-ink-faint">
          By submitting, you agree to be contacted about a demo. We never share your details.
        </p>
      </div>
    </form>
  );
}
