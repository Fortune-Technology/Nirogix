import { and, desc, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { labOrders, labResults } from '../../db/schema';
import { Errors } from '../../http/error';
import { listAppointments } from '../appointment/appointment.service';
import { listInvoices } from '../billing/billing.service';
import { getPatient } from '../patient/patient.service';
import { resolvePatientAccess } from './patientIdentity.service';

/**
 * What a patient may read, and nothing more (ADR-052).
 *
 * Every function here takes the identity from the session and the hospital from the
 * path, then calls `resolvePatientAccess` FIRST. That call is the boundary: it proves
 * an active link exists and returns **the patient id from the link**, which is the id
 * every query below filters on. The caller never supplies a patient id, so there is no
 * parameter to tamper with — asking for another person's chart is not refused, it is
 * unrepresentable.
 *
 * Reads only. The portal writes nothing clinical.
 */

async function scope(identityId: string, tenantId: string): Promise<string> {
  const { patientId } = await resolvePatientAccess(identityId, tenantId);
  return patientId;
}

export async function patientProfile(identityId: string, tenantId: string) {
  const patientId = await scope(identityId, tenantId);
  const patient = await getPatient(tenantId, patientId);
  if (!patient) throw Errors.notFound('Record not found');
  // Deliberately narrow: the portal shows the person their own identifying details,
  // not the hospital's internal annotations on them.
  return {
    uhid: patient.uhid,
    firstName: patient.firstName,
    lastName: patient.lastName,
    gender: patient.gender,
    dateOfBirth: patient.dateOfBirth,
    phone: patient.phone,
    email: patient.email,
    bloodGroup: patient.bloodGroup,
    city: patient.city,
    state: patient.state,
  };
}

export async function patientAppointments(identityId: string, tenantId: string, page = 1, pageSize = 20) {
  const patientId = await scope(identityId, tenantId);
  return listAppointments(tenantId, { page, pageSize, patientId });
}

export async function patientInvoices(identityId: string, tenantId: string, page = 1, pageSize = 20) {
  const patientId = await scope(identityId, tenantId);
  return listInvoices(tenantId, { page, pageSize, patientId });
}

/**
 * Laboratory reports for this patient.
 *
 * A patient-scoped query of its own rather than reusing the staff worklist: the
 * worklist has no patient filter, and widening a staff-facing query so a patient can
 * call it is exactly how a filter later gets forgotten. Only **resulted** orders are
 * returned — an in-progress sample is not a report, and showing one would invite a
 * patient to read a half-entered value as a finding.
 */
export async function patientLabReports(identityId: string, tenantId: string) {
  const patientId = await scope(identityId, tenantId);
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: labOrders.id,
        status: labOrders.status,
        orderedAt: labOrders.createdAt,
        testName: labOrders.testName,
        value: labResults.value,
        unit: labResults.unit,
        refLow: labResults.refLow,
        refHigh: labResults.refHigh,
        // "normal | low | high | critical" — shown as-is; the portal does not interpret it.
        flag: labResults.flag,
        resultedAt: labResults.createdAt,
      })
      .from(labOrders)
      .leftJoin(labResults, eq(labResults.labOrderId, labOrders.id))
      .where(
        and(
          eq(labOrders.tenantId, tenantId),
          eq(labOrders.patientId, patientId),
          eq(labOrders.status, 'resulted'),
        ),
      )
      .orderBy(desc(labOrders.createdAt));
    return rows.map((r) => ({
      ...r,
      orderedAt: r.orderedAt.toISOString(),
      resultedAt: r.resultedAt ? r.resultedAt.toISOString() : null,
    }));
  });
}
