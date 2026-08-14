import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { BookAppointmentBody, CancelAppointmentBody } from './appointment.schema';
import * as c from './appointment.controller';

// Appointment Management (MVP 0). Module-gated: requireModule('appointment') (which itself hard-
// depends on 'patient'). auth → module → permission → logic.
export const appointmentRouter = Router();

const mod = requireModule('appointment');

appointmentRouter.get(
  '/appointments',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.APPOINTMENT_VIEW),
  asyncHandler(c.listAppointments),
);
appointmentRouter.post(
  '/appointments',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.APPOINTMENT_CREATE),
  validate({ body: BookAppointmentBody }),
  asyncHandler(c.bookAppointment),
);
appointmentRouter.post(
  '/appointments/:id/cancel',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.APPOINTMENT_CANCEL),
  validate({ body: CancelAppointmentBody }),
  asyncHandler(c.cancelAppointment),
);
