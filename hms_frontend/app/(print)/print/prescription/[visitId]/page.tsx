"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  emptyLabel,
  PrintDocument,
  PrintFields,
  PrintNote,
  PrintSection,
  PrintSignatures,
  PrintTable,
  PrintToolbar,
  Spinner,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Encounter } from "@hms/types";
import { formatDateTime } from "@hms/utils";
import * as api from "../../../../../lib/api";
import { RequirePermission } from "../../../../../components/Can";
import { useDocumentBrand } from "../../../../../components/print/useDocumentBrand";

type RxRow = Encounter["prescriptions"][number];

/**
 * The printed prescription (ADR-047, ADR-070): the signed consultation's medication
 * list on the hospital's letterhead — Rx table, diagnoses, advice and the doctor's
 * signature block. Reads the encounter through the read-only endpoint, so printing
 * can never create a draft.
 */
function PrescriptionDocument({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { brand, ready } = useDocumentBrand();
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getVisitEncounter(visitId)
      .then(setEnc)
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Could not load the consultation."));
  }, [visitId]);

  if (error) return <p className="mx-auto max-w-2xl text-center text-sm text-danger">{error}</p>;
  if (!enc || !ready) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-fg-muted">
        <Spinner /> Preparing the document…
      </div>
    );
  }

  const dxLine = enc.diagnoses
    .map((d) => `${d.icd10Term} (${d.icd10Code})${d.isPrimary ? " (primary)" : ""}`)
    .join("; ");

  return (
    <>
      <PrintToolbar onBack={() => router.push(`/opd/${visitId}`)} backLabel="Back to the consultation" />

      <PrintDocument
        brand={brand}
        title="Prescription"
        reference={
          <>
            {enc.signedAt ? <div>Signed {formatDateTime(enc.signedAt)}</div> : <div><strong>Draft (not signed)</strong></div>}
            {enc.providerName && <div>{enc.providerName}</div>}
          </>
        }
        meta={
          <PrintFields
            fields={[
              { label: "Patient", value: enc.patientName },
              { label: "UHID", value: enc.patientUhid },
              { label: "Complaint", value: enc.chiefComplaint ?? emptyLabel("notRecorded") },
              { label: "Diagnosis", value: dxLine || emptyLabel("notRecorded") },
            ]}
          />
        }
        footerNote="Take medicines exactly as directed. Contact the hospital if symptoms worsen or new symptoms appear."
      >
        <PrintSection title="Rx">
          {enc.prescriptions.length === 0 ? (
            <p className="hms-doc__empty">No medication was prescribed in this consultation.</p>
          ) : (
            <PrintTable
              columns={[
                { key: "drug", header: "Medicine", cell: (r: RxRow) => r.drugName },
                { key: "dose", header: "Dose", cell: (r: RxRow) => r.dose ?? emptyLabel("unspecified") },
                { key: "freq", header: "Frequency", cell: (r: RxRow) => r.frequency ?? emptyLabel("unspecified") },
                { key: "route", header: "Route", cell: (r: RxRow) => r.route ?? emptyLabel("unspecified") },
                { key: "duration", header: "Duration", cell: (r: RxRow) => r.duration ?? emptyLabel("unspecified") },
                { key: "instructions", header: "Instructions", cell: (r: RxRow) => r.instructions ?? emptyLabel("unspecified") },
              ]}
              rows={enc.prescriptions}
              rowKey={(r: RxRow) => r.id}
            />
          )}
        </PrintSection>

        {enc.plan ? <PrintNote title="Advice">{enc.plan}</PrintNote> : null}
        {enc.labOrders.length > 0 ? (
          <PrintNote title="Investigations advised">
            {enc.labOrders.map((l) => l.testName).join(", ")}
          </PrintNote>
        ) : null}

        <PrintSignatures signatures={[{ label: enc.providerName ? `${enc.providerName}: Signature` : "Doctor's signature" }]} />
      </PrintDocument>
    </>
  );
}

export default function PrescriptionPrintPage() {
  const { visitId } = useParams<{ visitId: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.EMR_VIEW}>
      <PrescriptionDocument visitId={visitId} />
    </RequirePermission>
  );
}
