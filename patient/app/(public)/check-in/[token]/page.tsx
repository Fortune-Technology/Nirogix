'use client';

import { use, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Alert, BrandMark, Button, Card, PhoneField, Skeleton } from '@hms/ui';
import type { PublicCheckinContext } from '@hms/types';
import * as api from '../../../../lib/api';

/**
 * The hospital's self check-in screen (ADR-118) — a poster in the entrance, or a kiosk.
 *
 * Two things this page is deliberately honest about, because the alternative would be a screen
 * that lies politely:
 *
 * **It does not check anybody in.** It tells the front desk you have arrived. A visit carries a
 * queue token and opens a bill; ADR-056 does not let a public page create one, and the desk
 * confirming is also the identity check — they can see you.
 *
 * **It cannot tell you whether it found you.** The reply is the same whether the number matched an
 * appointment or matched nothing, because a screen that said "found you, Ravi" would answer "is
 * this number a patient here, and are they due in today?" for anyone who picked up the phone. So
 * the confirmation says what actually happened — the desk has been told — and directs you to them
 * either way.
 *
 * One field, because everything else is already on the appointment the hospital booked. Asking a
 * patient to retype their name at a kiosk adds typing, adds error, and adds nothing: none of it
 * would be trusted.
 */
export default function SelfCheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [ctx, setCtx] = useState<PublicCheckinContext | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .checkinContext(token)
      .then(setCtx)
      // A typo, a retired poster and a hospital that is not with us any more all land here, and
      // all say the same thing — the page must not become a way to tell them apart.
      .catch(() => setLoadError(true));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phone.length < 10) return;
    setSubmitting(true);
    try {
      await api.announceArrival(token, phone);
    } catch {
      // Deliberately swallowed. The endpoint answers 202 for everything it accepts, so an error
      // here is a network problem — and telling the patient more than the server does would
      // reintroduce exactly the difference the uniform reply exists to remove.
    } finally {
      setSubmitting(false);
      setDone(true);
    }
  }

  if (loadError) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <BrandMark />
          <h1 className="text-lg font-semibold text-fg">This check-in link is not valid</h1>
          <p className="max-w-sm text-sm text-fg-muted">
            The code may have been replaced. Please go to the front desk — they can check you in.
          </p>
        </div>
      </Card>
    );
  }

  if (!ctx) return <Skeleton className="h-64 w-full max-w-md" />;

  if (done) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 size={40} strokeWidth={1.5} className="text-success" aria-hidden />
          <h1 className="text-lg font-semibold text-fg">
            Thanks — the front desk knows you are here
          </h1>
          <p className="max-w-sm text-sm text-fg-muted">
            Please take a seat. If you do not hear your name shortly, or you are not sure your
            appointment is today, go to the desk and they will sort it out.
          </p>
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setDone(false);
              setPhone('');
            }}
          >
            Check someone else in
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandMark />
          <h1 className="text-lg font-semibold text-fg">{ctx.hospitalName}</h1>
          {ctx.city && <p className="text-sm text-fg-muted">{ctx.city}</p>}
        </div>

        <Alert tone="neutral">
          Tell the front desk you have arrived for today&rsquo;s appointment. This does not book
          anything and does not replace the desk — they will confirm and call you through.
        </Alert>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <PhoneField
            label="Your mobile number"
            value={phone}
            onChange={setPhone}
            hint="The number the hospital has on your record."
          />
          <Button type="submit" loading={submitting} disabled={phone.length < 10}>
            I have arrived
          </Button>
        </form>

        <p className="text-center text-xs text-fg-subtle">
          No appointment today? Go straight to the front desk.
        </p>
      </div>
    </Card>
  );
}
