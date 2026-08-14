"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Alert, Badge, Button, Card, DataTable, Field, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Drug } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission, Can } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { formatPaise, rupeesToPaise } from "../../../../lib/money";
import { useCan } from "../../../../lib/auth";

function AddDrugForm({ onAdded, onError }: { onAdded: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [form, setForm] = useState("tablet");
  const [strength, setStrength] = useState("");
  const [priceRupees, setPriceRupees] = useState("");
  const [reorder, setReorder] = useState("0");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return onError("Enter a drug name.");
    setBusy(true);
    try {
      await api.createDrug({
        name: name.trim(),
        form: form || null,
        strength: strength || null,
        unitPricePaise: rupeesToPaise(Number(priceRupees) || 0),
        reorderLevel: Number(reorder) || 0,
      });
      setName(""); setStrength(""); setPriceRupees(""); setReorder("0");
      setOpen(false);
      onAdded();
    } catch (err) {
      onError(err instanceof api.ApiRequestError ? err.message : "Could not add the drug.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} strokeWidth={2} /> Add drug
      </Button>
    );
  }
  return (
    <Card header="Add drug">
      <form className="grid gap-3 sm:grid-cols-5" onSubmit={submit}>
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Form" value={form} onChange={(e) => setForm(e.target.value)} />
        <Field label="Strength" value={strength} onChange={(e) => setStrength(e.target.value)} />
        <Field label="Price (₹)" type="number" step="0.01" min={0} value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} />
        <Field label="Reorder level" type="number" min={0} value={reorder} onChange={(e) => setReorder(e.target.value)} />
        <div className="flex items-center gap-2 sm:col-span-5">
          <Button type="submit" loading={busy}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function ReceivePanel({ drug, onDone, onError }: { drug: Drug; onDone: () => void; onError: (m: string) => void }) {
  const [qty, setQty] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(qty);
    if (!Number.isInteger(quantity) || quantity <= 0) return onError("Enter a valid quantity.");
    setBusy(true);
    try {
      await api.receiveStock(drug.id, { quantity, batchNo: batch || null, expiryDate: expiry || null });
      onDone();
    } catch (err) {
      onError(err instanceof api.ApiRequestError ? err.message : "Could not receive stock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <Field label="Quantity" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      <Field label="Batch" value={batch} onChange={(e) => setBatch(e.target.value)} />
      <Field label="Expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
      <Button type="submit" loading={busy}>Receive</Button>
    </form>
  );
}

function Stock() {
  const [rows, setRows] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const canManage = useCan(PERMISSIONS.PHARMACY_MANAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listDrugs());
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load stock.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Array<Column<Drug>> = [
    {
      key: "name",
      header: "Drug",
      cell: (d) => (
        <span className="text-fg">
          {d.name} {d.strength && <span className="text-xs text-fg-muted">{d.strength}</span>}
          {d.form && <span className="ml-1 text-xs text-fg-subtle">· {d.form}</span>}
        </span>
      ),
    },
    {
      key: "onHand",
      header: "On hand",
      cell: (d) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-fg">{d.onHand}</span>
          {d.lowStock && <Badge tone="warning">Low</Badge>}
        </span>
      ),
    },
    { key: "price", header: "Price", cell: (d) => formatPaise(d.unitPricePaise) },
    { key: "reorder", header: "Reorder", cell: (d) => <span className="text-fg-muted">{d.reorderLevel || "—"}</span> },
    {
      key: "actions",
      header: "",
      cell: (d) =>
        canManage ? (
          <Button variant="secondary" size="sm" onClick={() => setReceiving((r) => (r === d.id ? null : d.id))}>
            {receiving === d.id ? "Close" : "Receive"}
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <Link href="/pharmacy" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} strokeWidth={2} /> Pharmacy
      </Link>
      <PageHeader
        title="Stock"
        description={`${rows.length} drug${rows.length === 1 ? "" : "s"}`}
        actions={<Can perm={PERMISSIONS.PHARMACY_MANAGE}><AddDrugForm onAdded={() => { setMsg("Drug added."); setError(null); void load(); }} onError={(m) => { setError(m); setMsg(null); }} /></Can>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {msg && !error && <Alert tone="success">{msg}</Alert>}

      {receiving && rows.find((d) => d.id === receiving) && (
        <Card header={`Receive stock — ${rows.find((d) => d.id === receiving)!.name}`}>
          <ReceivePanel
            drug={rows.find((d) => d.id === receiving)!}
            onDone={() => { setMsg("Stock received."); setError(null); setReceiving(null); void load(); }}
            onError={(m) => { setError(m); setMsg(null); }}
          />
        </Card>
      )}

      <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} loading={loading} error={error} emptyMessage="No drugs yet. Add one to start." />
    </>
  );
}

export default function StockPage() {
  return (
    <RequirePermission perm={PERMISSIONS.PHARMACY_STOCK_VIEW}>
      <Stock />
    </RequirePermission>
  );
}
