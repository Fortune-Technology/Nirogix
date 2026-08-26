// Wires domain events to the emails a user genuinely benefits from (ADR-016 / ADR-059). Registered
// once at startup (bootstrap → events/subscribers). Each handler is decoupled from the publisher:
// the module that books an appointment or takes a payment knows nothing about email — it publishes
// an event, and this file reacts. A handler failure is caught and logged by the event bus and never
// affects the business action.
//
// Channel policy: EMAIL only, and only when the recipient has an email on file (patient contact is
// optional). SMS transactional stays gated behind DLT template registration (BACKLOG I-1) and is
// intentionally not sent here yet. Every send is deduped by a per-entity idempotency key, so a
// retried event never doubles a message.
//
// Deliberately NOT wired (no notification spam): visit.checked_in, encounter.signed,
// invoice.created (the receipt fires on payment.received instead), user.logged_in.

import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import {
  appointments,
  patients,
  providers,
  invoices,
  payments,
  labOrders,
  labTests,
  tenants,
} from '../../db/schema';
import { env } from '../../config/env';
import { eventBus } from '../../events/eventBus';
import { sendAppEmail } from './communication.service';
import { formatEmailDateTime, formatPaise } from './email';

function fullName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(' ') || 'Patient';
}

/** Hospital name for the email body (the `tenants` table is platform-managed, no RLS). */
async function orgNameOf(tenantId: string): Promise<string> {
  const row = (await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return row?.name ?? 'Nirogix';
}

/** A patient-portal deep link, when the portal origin is configured; otherwise no CTA. */
function patientPortalUrl(path: string): string | undefined {
  const base = env.PATIENT_URL?.replace(/\/$/, '');
  return base ? `${base}${path}` : undefined;
}

export function registerNotificationSubscribers(): void {
  // Appointment booked → confirmation to the patient.
  eventBus.subscribe('appointment.booked', async ({ tenantId, appointmentId }) => {
    const row = (
      await runWithTenant(tenantId, (tx) =>
        tx
          .select({
            email: patients.email,
            first: patients.firstName,
            last: patients.lastName,
            when: appointments.scheduledAt,
            provider: providers.fullName,
          })
          .from(appointments)
          .innerJoin(patients, eq(patients.id, appointments.patientId))
          .innerJoin(providers, eq(providers.id, appointments.providerId))
          .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
          .limit(1),
      )
    )[0];
    if (!row?.email) return;
    await sendAppEmail({
      tenantId,
      to: row.email,
      template: 'appointment_confirmed',
      data: {
        patientName: fullName(row.first, row.last),
        orgName: await orgNameOf(tenantId),
        providerName: row.provider,
        whenText: formatEmailDateTime(row.when),
        portalUrl: patientPortalUrl('/appointments'),
      },
      idempotencyKey: `appt-confirmed:${appointmentId}`,
    });
  });

  // Appointment cancelled → notice to the patient (payload carries only the id — load the rest).
  eventBus.subscribe('appointment.cancelled', async ({ tenantId, appointmentId }) => {
    const row = (
      await runWithTenant(tenantId, (tx) =>
        tx
          .select({
            email: patients.email,
            first: patients.firstName,
            last: patients.lastName,
            when: appointments.scheduledAt,
            reason: appointments.cancelReason,
            provider: providers.fullName,
          })
          .from(appointments)
          .innerJoin(patients, eq(patients.id, appointments.patientId))
          .innerJoin(providers, eq(providers.id, appointments.providerId))
          .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, appointmentId)))
          .limit(1),
      )
    )[0];
    if (!row?.email) return;
    await sendAppEmail({
      tenantId,
      to: row.email,
      template: 'appointment_cancelled',
      data: {
        patientName: fullName(row.first, row.last),
        orgName: await orgNameOf(tenantId),
        providerName: row.provider,
        whenText: formatEmailDateTime(row.when),
        reason: row.reason ?? undefined,
      },
      idempotencyKey: `appt-cancelled:${appointmentId}`,
    });
  });

  // Payment received → receipt to the patient.
  eventBus.subscribe('payment.received', async ({ tenantId, paymentId, invoiceId }) => {
    const row = (
      await runWithTenant(tenantId, (tx) =>
        tx
          .select({
            email: patients.email,
            first: patients.firstName,
            last: patients.lastName,
            amountPaise: payments.amountPaise,
            method: payments.method,
            paidAt: payments.createdAt,
            invoiceNumber: invoices.invoiceNumber,
          })
          .from(payments)
          .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
          .innerJoin(patients, eq(patients.id, invoices.patientId))
          .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId), eq(invoices.id, invoiceId)))
          .limit(1),
      )
    )[0];
    if (!row?.email) return;
    await sendAppEmail({
      tenantId,
      to: row.email,
      template: 'payment_receipt',
      data: {
        patientName: fullName(row.first, row.last),
        orgName: await orgNameOf(tenantId),
        invoiceNumber: row.invoiceNumber,
        amountText: formatPaise(row.amountPaise),
        method: row.method,
        whenText: formatEmailDateTime(row.paidAt),
        portalUrl: patientPortalUrl('/billing'),
      },
      idempotencyKey: `payment-receipt:${paymentId}`,
    });
  });

  // Lab result verified (released to the portal) → "results ready" to the patient. Fired on
  // verification, not on raw result entry — an unverified result is not released.
  eventBus.subscribe('lab.result_verified', async ({ tenantId, labOrderId, patientId }) => {
    const row = (
      await runWithTenant(tenantId, (tx) =>
        tx
          .select({
            email: patients.email,
            first: patients.firstName,
            last: patients.lastName,
            testName: labTests.name,
          })
          .from(labOrders)
          .innerJoin(patients, eq(patients.id, labOrders.patientId))
          .leftJoin(labTests, eq(labTests.id, labOrders.testId))
          .where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.id, labOrderId), eq(patients.id, patientId)))
          .limit(1),
      )
    )[0];
    if (!row?.email) return;
    await sendAppEmail({
      tenantId,
      to: row.email,
      template: 'lab_results_ready',
      data: {
        patientName: fullName(row.first, row.last),
        orgName: await orgNameOf(tenantId),
        testName: row.testName ?? 'lab',
        portalUrl: patientPortalUrl('/reports'),
      },
      idempotencyKey: `lab-verified:${labOrderId}`,
    });
  });

  // Patient registered → welcome, only when an email was provided (contact is optional).
  eventBus.subscribe('patient.registered', async ({ tenantId, patientId }) => {
    const row = (
      await runWithTenant(tenantId, (tx) =>
        tx
          .select({ email: patients.email, first: patients.firstName, last: patients.lastName, uhid: patients.uhid })
          .from(patients)
          .where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId)))
          .limit(1),
      )
    )[0];
    if (!row?.email) return;
    await sendAppEmail({
      tenantId,
      to: row.email,
      template: 'patient_welcome',
      data: {
        patientName: fullName(row.first, row.last),
        orgName: await orgNameOf(tenantId),
        uhid: row.uhid,
        portalUrl: patientPortalUrl('/'),
      },
      idempotencyKey: `patient-welcome:${patientId}`,
    });
  });
}
