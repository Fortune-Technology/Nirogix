"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
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
import type { LabOrder } from "@hms/types";
import { formatDateTime } from "@hms/utils";
import * as api from "../../../../../lib/api";
import { RequirePermission } from "../../../../../components/Can";
import { useDocumentBrand } from "../../../../../components/print/useDocumentBrand";

/**
 * The laboratory report (ADR-047). A different document type with a different
 * structure from the invoice — result table, reference ranges, an abnormal-value
 * flag and a reporting signature instead of totals and payments — built from the
 * same document kit, which is the whole point of having one.
 */
function LabReportDocument({ id }: { id: string }) {
  const router = useRouter();
  const { brand, ready } = useDocumentBrand();
  const [order, setOrder] = useState<LabOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getLabOrder(id)
      .then(setOrder)
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Could not load the lab order."));
  }, [id]);

  if (error) return <p className="mx-auto max-w-2xl text-center text-sm text-danger">{error}</p>;
  if (!order || !ready) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-fg-muted">
        <Spinner /> Preparing the document…
      </div>
    );
  }

  const result = order.result;
  const range =
    result && (result.refLow || result.refHigh) ? `${result.refLow ?? ""} – ${result.refHigh ?? ""}` : "—";

  return (
    <>
      <PrintToolbar onBack={() => router.push(`/laboratory/${id}`)} backLabel="Back to the order" />

      <PrintDocument
        brand={brand}
        title="Laboratory report"
        reference={
          <>
            <div>
              <strong>{order.testCode ?? order.testName}</strong>
            </div>
            <div>Ordered {formatDateTime(order.createdAt)}</div>
          </>
        }
        meta={
          <PrintFields
            fields={[
              { label: "Patient", value: order.patientName },
              { label: "UHID", value: order.patientUhid },
              { label: "Test", value: order.testName },
              { label: "Priority", value: order.priority },
            ]}
          />
        }
        footerNote="Confidential. This report contains patient health information and is intended only for the named patient and their treating clinician."
      >
        <PrintSection title="Result">
          {result ? (
            <PrintTable
              columns={[
                { key: "test", header: "Investigation", cell: (r: typeof result) => order.testName },
                { key: "value", header: "Result", cell: (r) => r.value },
                { key: "unit", header: "Unit", cell: (r) => r.unit ?? "—" },
                { key: "range", header: "Reference range", cell: () => range },
                {
                  key: "flag",
                  header: "Flag",
                  cell: (r) => (
                    <span style={{ fontWeight: r.flag === "normal" ? 400 : 700 }}>
                      {r.flag === "normal" ? "Normal" : r.flag.toUpperCase()}
                    </span>
                  ),
                },
              ]}
              rows={[result]}
              rowKey={() => order.id}
            />
          ) : (
            <p className="hms-doc__empty">
              No result has been entered yet. This order is {order.status}. A report is issued once the
              result is recorded.
            </p>
          )}
        </PrintSection>

        {result?.notes ? <PrintNote title="Laboratory notes">{result.notes}</PrintNote> : null}
        {order.notes ? <PrintNote title="Clinical notes">{order.notes}</PrintNote> : null}

        <PrintNote title="Interpretation">
          Reference ranges are those configured for this laboratory&apos;s test master and may differ between
          laboratories. Results should be interpreted by the treating clinician alongside the clinical picture.
        </PrintNote>

        <PrintSignatures signatures={[{ label: "Performed by" }, { label: "Verified by" }]} />
      </PrintDocument>
    </>
  );
}

export default function LabReportPrintPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.LAB_ORDER_VIEW}>
      <LabReportDocument id={id} />
    </RequirePermission>
  );
}
