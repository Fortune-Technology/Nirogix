"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Alert, Button, Card, DataTable, Field, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { LabTest } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission, Can } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { formatPaise, rupeesToPaise } from "../../../../lib/money";

function AddTestForm({ onAdded, onError }: { onAdded: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", code: "", sampleType: "blood", unit: "", refLow: "", refHigh: "", price: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return onError("Enter a test name.");
    setBusy(true);
    try {
      await api.createLabTest({
        name: f.name.trim(),
        code: f.code || null,
        sampleType: f.sampleType || null,
        unit: f.unit || null,
        refLow: f.refLow || null,
        refHigh: f.refHigh || null,
        pricePaise: rupeesToPaise(Number(f.price) || 0),
      });
      setF({ name: "", code: "", sampleType: "blood", unit: "", refLow: "", refHigh: "", price: "" });
      setOpen(false);
      onAdded();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} strokeWidth={2} /> Add test
      </Button>
    );
  }
  return (
    <Card header="Add test">
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={submit}>
        <Field label="Name" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <Field label="Code (LOINC)" value={f.code} onChange={(e) => set("code", e.target.value)} />
        <Field label="Sample" value={f.sampleType} onChange={(e) => set("sampleType", e.target.value)} />
        <Field label="Unit" value={f.unit} onChange={(e) => set("unit", e.target.value)} />
        <Field label="Ref low" value={f.refLow} onChange={(e) => set("refLow", e.target.value)} />
        <Field label="Ref high" value={f.refHigh} onChange={(e) => set("refHigh", e.target.value)} />
        <Field label="Price (₹)" type="number" step="0.01" min={0} value={f.price} onChange={(e) => set("price", e.target.value)} />
        <div className="flex items-center gap-2 sm:col-span-4">
          <Button type="submit" loading={busy}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

function Tests() {
  const [rows, setRows] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listLabTests());
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load tests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Array<Column<LabTest>> = [
    {
      key: "name",
      header: "Test",
      hideable: false,
      accessor: (t) => `${t.name} ${t.code ?? ""}`,
      cell: (t) => (
        <span className="text-fg">
          {t.name} {t.code && <span className="font-mono text-xs text-fg-muted">{t.code}</span>}
        </span>
      ),
    },
    {
      key: "sample",
      header: "Sample",
      filterable: true,
      accessor: (t) => t.sampleType ?? "—",
      cell: (t) => <span className="text-fg-muted">{t.sampleType ?? "—"}</span>,
    },
    {
      key: "range",
      header: "Reference",
      sortable: false,
      cell: (t) => (t.refLow || t.refHigh ? `${t.refLow ?? ""}–${t.refHigh ?? ""} ${t.unit ?? ""}` : "—"),
    },
    { key: "price", header: "Price", align: "right", accessor: (t) => t.pricePaise, cell: (t) => formatPaise(t.pricePaise) },
  ];

  return (
    <>
      <Link href="/laboratory" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} strokeWidth={2} /> Laboratory
      </Link>
      <PageHeader
        title="Test master"
        description={`${rows.length} test${rows.length === 1 ? "" : "s"}`}
        actions={<Can perm={PERMISSIONS.LAB_MANAGE}><AddTestForm onAdded={() => { setError(null); void load(); }} onError={setError} /></Can>}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} loading={loading} error={error} emptyMessage="No tests yet. Add one to start." />
    </>
  );
}

export default function LabTestsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.LAB_ORDER_VIEW}>
      <Tests />
    </RequirePermission>
  );
}
