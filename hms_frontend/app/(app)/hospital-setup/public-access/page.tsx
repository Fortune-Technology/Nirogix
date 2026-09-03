'use client';

import Link from 'next/link';
import { Alert, Card } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import * as api from '../../../../lib/api';
import { RequirePermission } from '../../../../components/Can';
import { PublicAccessPanel } from '../../../../components/settings/PublicAccessPanel';
import { useRegistrationQr } from '../../../../components/print/useRegistrationQr';
import { useBookingQr } from '../../../../components/print/useBookingQr';
import { useCheckinQr } from '../../../../components/print/useCheckinQr';

/**
 * **Patient self-service** — the one screen for every QR code a patient scans (ADR-124).
 *
 * Self-registration (ADR-056), online booking (ADR-069) and self check-in (ADR-118) were three
 * separate tabs that looked identical, because they *are* the same mechanism: a token in a URL,
 * a QR poster, a toggle, and a queue the front desk works through. Three tabs made an
 * administrator ask which one they were on; one screen with three sections does not, and none
 * of the three settings, tokens or endpoints changed to get here.
 *
 * The promise every section repeats, because it is the thing people assume wrongly: **nothing a
 * patient submits creates anything**. Each one produces a request, and a member of staff turns
 * it into a patient, an appointment or a visit.
 */
export default function PublicAccessPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <Card header="What these three do">
        <p className="text-sm text-fg-muted">
          Each one gives your hospital a QR code and a link a patient can use before they reach the
          desk. Each has its own code, its own on/off switch and its own review queue — turning one
          off leaves the other two working.{' '}
          <strong className="font-medium text-fg">None of them writes to your records.</strong>{' '}
          Every submission waits for a member of staff.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-sm text-fg-muted">
          <li>
            <strong className="font-medium text-fg">Self-registration</strong> — a new patient sends
            their details; your desk reviews them under{' '}
            <Link href="/patients/registrations" className="text-brand hover:underline">
              Patient registrations
            </Link>
            .
          </li>
          <li>
            <strong className="font-medium text-fg">Online booking</strong> — a patient asks for an
            appointment; your desk books it under{' '}
            <Link href="/appointments/requests" className="text-brand hover:underline">
              Booking requests
            </Link>
            .
          </li>
          <li>
            <strong className="font-medium text-fg">Self check-in</strong> — a patient says they
            have arrived; your desk checks them in from the{' '}
            <Link href="/opd/arrivals" className="text-brand hover:underline">
              Arrivals board
            </Link>
            .
          </li>
        </ul>
      </Card>

      <section aria-label="Patient self-registration" className="flex flex-col gap-4">
        <PublicAccessPanel
          title="Patient self-registration"
          linkLabel="Registration link"
          explainer={
            <>
              Patients scan your QR code and send their details before they reach the desk.{' '}
              <strong className="font-medium text-fg">
                Nothing is added to your patient list automatically
              </strong>
              . Each submission arrives as a request your front desk reviews, checks against
              existing records, and converts into a patient. You stay in control of who is in your
              records. Requests wait under{' '}
              <Link href="/patients/registrations" className="text-brand hover:underline">
                Patient registrations
              </Link>
              .
            </>
          }
          pendingHref="/patients/registrations"
          qrAlt="QR code linking to this hospital's patient registration form"
          downloadName="nirogix-patient-registration-qr.png"
          printHref="/print/registration-qr"
          confirmDisableTitle="Turn off patient self-registration?"
          disabledNoun="self-registration"
          load={api.getRegistrationSettings}
          setEnabled={api.setSelfRegistration}
          regenerate={api.regenerateRegistrationToken}
          useQr={useRegistrationQr}
        />
      </section>

      <section aria-label="Online appointment booking" className="flex flex-col gap-4">
        <PublicAccessPanel
          title="Online appointment booking"
          linkLabel="Booking link"
          explainer={
            <>
              Patients scan your QR code and ask for an appointment before they call or visit.{' '}
              <strong className="font-medium text-fg">Nothing is booked automatically</strong>. Each
              submission arrives as a request your front desk reviews and converts into a real
              appointment, under the same roster and double-booking rules as booking by hand.
              Requests wait under{' '}
              <Link href="/appointments/requests" className="text-brand hover:underline">
                Booking requests
              </Link>
              .
            </>
          }
          pendingHref="/appointments/requests"
          qrAlt="QR code linking to this hospital's appointment request form"
          downloadName="nirogix-appointment-booking-qr.png"
          printHref="/print/booking-qr"
          confirmDisableTitle="Turn off online appointment booking?"
          disabledNoun="online booking"
          load={api.getBookingSettings}
          setEnabled={api.setOnlineBooking}
          regenerate={api.regenerateBookingToken}
          useQr={useBookingQr}
        />
      </section>

      <section aria-label="Patient self check-in" className="flex flex-col gap-4">
        <PublicAccessPanel
          title="Patient self check-in"
          linkLabel="Check-in link"
          explainer={
            <>
              Patients scan this code in the entrance to say they have arrived for today&rsquo;s
              appointment.{' '}
              <strong className="font-medium text-fg">Nobody is checked in automatically</strong>.
              Each arrival appears on your{' '}
              <Link href="/opd/arrivals" className="text-brand hover:underline">
                Arrivals board
              </Link>
              , where one click checks the patient in against the appointment you already booked —
              and confirming is also the identity check, because your desk can see who is standing
              there.
            </>
          }
          pendingHref="/opd/arrivals"
          qrAlt="QR code linking to this hospital's self check-in page"
          downloadName="nirogix-self-check-in-qr.png"
          printHref="/print/check-in-qr"
          confirmDisableTitle="Turn off patient self check-in?"
          disabledNoun="self check-in"
          load={api.getSelfCheckinSettings}
          setEnabled={api.setSelfCheckinEnabled}
          regenerate={api.regenerateSelfCheckinToken}
          useQr={useCheckinQr}
        />
      </section>

      <Alert>
        Each QR code carries only a link — no patient or hospital information is stored in the code
        itself. Regenerating one invalidates every poster already printed for that surface, and
        leaves the other two untouched.
      </Alert>
    </RequirePermission>
  );
}
