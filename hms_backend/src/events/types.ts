import type { NotificationJobData } from '../jobs/types';

// Representative domain events (architecture.md → Domain Events). A module publishes once;
// Notifications, Audit, the Activity Timeline, Reporting and Analytics subscribe independently.
// Extend this map as modules land — publishing an event is how a module stays decoupled from the
// downstream concerns that react to it (and is what makes later service extraction realistic).
export type DomainEventPayload = {
  'user.logged_in': { tenantId: string; userId: string; at: string };
  'notification.requested': NotificationJobData;
  'patient.registered': { tenantId: string; patientId: string };
  'appointment.booked': { tenantId: string; appointmentId: string; patientId: string };
  'appointment.cancelled': { tenantId: string; appointmentId: string };
  'visit.checked_in': { tenantId: string; visitId: string; patientId: string };
  'invoice.created': { tenantId: string; invoiceId: string };
  'payment.received': { tenantId: string; paymentId: string; invoiceId: string };
};

export type DomainEventType = keyof DomainEventPayload;
