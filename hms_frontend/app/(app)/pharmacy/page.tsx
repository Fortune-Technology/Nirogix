"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Alert, Button, Card, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { PendingPrescription, Drug } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { formatPaise } from "../../../lib/money";

function firstWord(s: string): string {
  return s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function DispenseCard({
  rx,
  drugs,
  onDone,
  onError,
}: {
  rx: PendingPrescription;
  drugs: Drug[];
  onDone: () => void;
  /** Client-side validation only — API failures come from the shared toast. */
  onError: (msg: string) => void;
}) {
  // Pre-match a stocked drug against the prescribed name.
  const matched = drugs.find((d) => firstWord(d.name) === firstWord(rx.drugName)) ?? drugs[0];
  const [drugId, setDrugId] = useState(matched?.id ?? "");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const drug = drugs.find((d) => d.id === drugId);

  async function dispense() {
    const quantity = Number(qty);
    if (!drugId) return onError("Select a drug to dispense.");
    if (!Number.isInteger(quantity) || quantity <= 0) return onError("Enter a valid quantity.");
    setBusy(true);
    try {
      await api.dispense({ prescriptionId: rx.id, drugId, quantity });
      onDone();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-medium text-fg">{rx.drugName}</div>
          <div className="mt-0.5 text-sm text-fg-muted">
            {[rx.dose, rx.frequency, rx.duration].filter(Boolean).join(" · ") || "—"}
          </div>
          <div className="mt-1 text-xs text-fg-subtle">
            {rx.patientName} · <span className="font-mono">{rx.patientUhid}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="hms-field">
            <span className="hms-label">Drug (stock)</span>
            <select className="hms-input min-w-[13rem]" value={drugId} onChange={(e) => setDrugId(e.target.value)}>
              <option value="">Select…</option>
              {drugs.map((d) => (
                <option key={d.id} value={d.id} disabled={d.onHand <= 0}>
                  {d.name} — {d.onHand} in stock ({formatPaise(d.unitPricePaise)})
                </option>
              ))}
            </select>
          </label>
          <label className="hms-field">
            <span className="hms-label">Qty</span>
            <input className="hms-input w-20" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <Button onClick={dispense} loading={busy} disabled={!drug || drug.onHand <= 0}>
            Dispense
          </Button>
        </div>
      </div>
      {drug && drug.onHand <= 0 && <p className="mt-2 text-xs text-danger">Out of stock — receive stock first.</p>}
    </Card>
  );
}

function Worklist() {
  const [rows, setRows] = useState<PendingPrescription[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pend, dr] = await Promise.all([api.listPendingPrescriptions(), api.listDrugs()]);
      setRows(pend);
      setDrugs(dr);
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load the worklist.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Pharmacy"
        description="Prescriptions waiting to be dispensed."
        actions={
          <Link href="/pharmacy/stock">
            <Button variant="secondary">
              <Package size={16} strokeWidth={2} /> Stock
            </Button>
          </Link>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 text-fg-muted">
          <Spinner /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-fg-muted">No pending prescriptions. Signed consultations queue here.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((rx) => (
            <DispenseCard
              key={rx.id}
              rx={rx}
              drugs={drugs}
              onDone={() => { setError(null); void load(); }}
              onError={setError}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function PharmacyPage() {
  return (
    <RequirePermission perm={PERMISSIONS.PHARMACY_DISPENSE}>
      <Worklist />
    </RequirePermission>
  );
}
