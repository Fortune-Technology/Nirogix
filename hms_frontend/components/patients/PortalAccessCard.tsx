"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, ConfirmDialog } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Patient } from "@hms/types";
import * as api from "../../lib/api";
import { useCan } from "../../lib/auth";

/**
 * Grant or withdraw a patient's access to the patient portal (ADR-052).
 *
 * **This is the only way portal access is ever created.** There is no self-service
 * path — a patient cannot attach themselves to a record — so the hospital doing it
 * here is the whole access-control model, not a convenience.
 *
 * Granting sends nothing and proves nothing: the patient still has to verify the
 * contact with a one-time code before they can read anything. The copy says so, because
 * "access granted" would otherwise read as "they can see it now".
 *
 * Withdrawing uses the same permission as granting — whoever can give access must be
 * able to take it back.
 */
export function PortalAccessCard({ patient }: { patient: Patient }) {
  const canManage = useCan(PERMISSIONS.PATIENT_CREATE);
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const contact = patient.phone
    ? { mobile: patient.phone, label: patient.phone }
    : patient.email
      ? { email: patient.email, label: patient.email }
      : null;

  async function grant() {
    if (!contact) return;
    setBusy(true);
    try {
      const { mobile, email } = contact as { mobile?: string; email?: string };
      await api.grantPortalAccess(patient.id, mobile ? { mobile } : { email: email! });
      setGranted(contact.label);
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await api.revokePortalAccess(patient.id);
      setGranted(null);
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
      setConfirmRevoke(false);
    }
  }

  if (!canManage) return null;

  return (
    <Card header="Patient portal access">
      {!contact ? (
        <Alert>
          This patient has no mobile number or email on file. Add one before giving them portal access. The code that
          proves who they are has to go somewhere.
        </Alert>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            Lets this patient sign in to the Nirogix patient portal and read their own record, appointments, bills and
            laboratory reports from this hospital. They sign in with a one-time code sent to{" "}
            <strong className="text-fg">{contact.label}</strong>: granting access does not sign them in, and it does
            not prove the contact is theirs.
          </p>

          {granted ? (
            <Alert tone="success" className="mt-4">
              Access granted for {granted}. They can sign in once they verify that contact.
            </Alert>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={grant} loading={busy}>
              Give portal access
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRevoke(true)} disabled={busy}>
              Withdraw access
            </Button>
            <Badge>Read-only for the patient</Badge>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmRevoke}
        title="Withdraw portal access?"
        description="They will no longer be able to sign in and read this hospital's records. It takes effect immediately, and their clinical record is not affected."
        confirmLabel="Withdraw access"
        tone="danger"
        onConfirm={revoke}
        onCancel={() => setConfirmRevoke(false)}
      />
    </Card>
  );
}
