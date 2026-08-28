import type { Patient } from '../../db/schema';

/**
 * The patient as the API presents it.
 *
 * Extracted from `patient.controller` when ABDM linking became a second endpoint returning a
 * patient (ADR-084). Two copies of this mapping would not merely duplicate code — they would
 * disagree about which columns are safe to send, and the columns this one omits are omitted on
 * purpose:
 *
 * - `abhaLinkingTokenEnc` is a bearer credential against a person's national health identity.
 *   Encrypted or not, it has no business in a browser.
 * - `createdBy` / `updatedAt` are internal bookkeeping no screen consumes.
 *
 * An allow-list, never a spread of the row: a column added to the table later must be published
 * deliberately, not by default.
 */
export function toPatientDto(p: Patient) {
  return {
    id: p.id,
    uhid: p.uhid,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth, // drizzle `date` → 'YYYY-MM-DD' string
    phone: p.phone,
    email: p.email,
    bloodGroup: p.bloodGroup,
    addressLine: p.addressLine,
    city: p.city,
    state: p.state,
    pincode: p.pincode,
    abhaNumber: p.abhaNumber,
    // ABDM Milestone 1. `abhaVerifiedAt` is the field that separates a proved ABHA from one
    // somebody typed in, so the Portal can label it honestly.
    abhaAddress: p.abhaAddress,
    abhaVerifiedAt: p.abhaVerifiedAt ? p.abhaVerifiedAt.toISOString() : null,
    abhaSource: p.abhaSource,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    branchId: p.branchId,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}
