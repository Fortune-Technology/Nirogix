"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Diff, PackagePlus, Plus } from "lucide-react";
import {
  actionsColumn,
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  DateField,
  Dialog,
  EmptyValue,
  Field,
  Select,
  TableAction,
  TableActions,
  Textarea,
  ToggleAction,
  type Column,
  ValueOrEmpty,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { formatDateTime, todayApiDate } from "@hms/utils";
import type { Drug, ReceiveStockRequest, StockAdjustment, Supplier } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission, Can } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { CatalogPickerButton } from "../../../../components/catalog/CatalogPicker";
import { formatPaise, rupeesToPaise } from "../../../../lib/money";
import { useCan } from "../../../../lib/auth";

// `onError` carries client-side validation only — API failures are announced by
// the shared toast from the API client (ADR-026), never re-reported here.
function AddDrugForm({ onAdded, onError }: { onAdded: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [form, setForm] = useState("tablet");
  const [strength, setStrength] = useState("");
  const [unit, setUnit] = useState("unit");
  const [catalogCode, setCatalogCode] = useState("");
  const [priceRupees, setPriceRupees] = useState("");
  const [reorder, setReorder] = useState("0");
  const [busy, setBusy] = useState(false);

  // Pre-fill the standardised fields from a catalogue item; the hospital still sets its own price.
  function applyCatalog(item: api.CatalogItem) {
    const a = item.attributes;
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    setName(item.name);
    setForm(s(a.form) || "tablet");
    setStrength(s(a.strength));
    setUnit(s(a.unit) || "unit");
    setCatalogCode(item.code);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return onError("Enter a drug name.");
    setBusy(true);
    try {
      await api.createDrug({
        name: name.trim(),
        form: form || null,
        strength: strength || null,
        unit: unit || "unit",
        catalogCode: catalogCode || null,
        unitPricePaise: rupeesToPaise(Number(priceRupees) || 0),
        reorderLevel: Number(reorder) || 0,
      });
      setName(""); setStrength(""); setUnit("unit"); setCatalogCode(""); setPriceRupees(""); setReorder("0");
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
        <Plus size={16} strokeWidth={2} /> Add drug
      </Button>
    );
  }
  return (
    <Card header="Add drug">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-muted">Start from a common medicine, or fill it in yourself.</span>
        <CatalogPickerButton
          category="drug"
          title="Common medicines"
          description="Pick a generic to pre-fill its name, form and strength. You set the price and stock."
          onPick={applyCatalog}
        />
      </div>
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

function ReceivePanel({
  drug,
  suppliers,
  onDone,
  onError,
}: {
  drug: Drug;
  /** Active suppliers only — a retired distributor is not offered for new stock. */
  suppliers: Supplier[];
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [qty, setQty] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(qty);
    if (!Number.isInteger(quantity) || quantity <= 0) return onError("Enter a valid quantity.");
    setBusy(true);
    try {
      // The API's ReceiveStockBody accepts an optional supplierId; the shared
      // ReceiveStockRequest type has not caught up yet, so it is widened here
      // rather than forked (packages/types is the single contract).
      const body: ReceiveStockRequest & { supplierId?: string } = {
        quantity,
        batchNo: batch || null,
        expiryDate: expiry || null,
      };
      if (supplierId) body.supplierId = supplierId;
      await api.receiveStock(drug.id, body);
      onDone();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <Field label="Quantity" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      <Field label="Batch" value={batch} onChange={(e) => setBatch(e.target.value)} />
      <DateField label="Expiry" value={expiry || null} min={todayApiDate()} onChange={(v) => setExpiry(v ?? "")} />
      <Select
        label="Supplier"
        className="min-w-[12rem]"
        value={supplierId}
        onChange={setSupplierId}
        options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        placeholder="No supplier"
        emptyMessage="No suppliers recorded."
        clearable
      />
      <Button type="submit" loading={busy}>Receive</Button>
    </form>
  );
}

/**
 * Stock correction (ADR-060) — the permitted, safe way to fix a count that is
 * displayed incorrectly. A negative delta writes stock off, a positive one records
 * stock found; the mandatory reason travels with the record into the audit trail.
 * On failure (e.g. the write-off would take a batch below zero) the dialog stays
 * open with the user's input intact — the server's message arrives through the
 * shared API-feedback toast (ADR-026).
 */
function AdjustStockDialog({ drug, onClose, onDone }: { drug: Drug | null; onClose: () => void; onDone: () => void }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ delta?: string; reason?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!drug) return;
    const change = Number(delta);
    const next: { delta?: string; reason?: string } = {};
    if (!Number.isInteger(change) || change === 0) next.delta = "Enter a whole number other than 0.";
    if (reason.trim().length < 3) next.reason = "Give a reason of at least 3 characters.";
    setErrors(next);
    if (next.delta || next.reason) return;
    setBusy(true);
    try {
      await api.adjustStock(drug.id, { delta: change, reason: reason.trim() });
      onDone();
    } catch {
      /* dialog stays open with the input intact; the shared toast shows the server's message */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={drug !== null}
      onClose={onClose}
      title={drug ? `Adjust stock: ${drug.name}` : "Adjust stock"}
      description={drug ? `${drug.onHand} on hand. Corrections are recorded with your reason in the audit trail.` : undefined}
      size="md"
      busy={busy}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-stock-form" loading={busy}>
            Save correction
          </Button>
        </div>
      }
    >
      <form id="adjust-stock-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Quantity change"
          type="number"
          step={1}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          error={errors.delta}
          hint="Negative writes stock off (damage, expiry, count short); positive records stock found."
        />
        <Textarea
          label="Reason"
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          hint="Required. At least 3 characters. Say what happened, e.g. “2 strips damaged in transit”."
        />
      </form>
    </Dialog>
  );
}

function AddSupplierDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setNameError("Enter the supplier's name.");
    setNameError(undefined);
    setBusy(true);
    try {
      await api.createSupplier({
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        addressLine: address.trim() || null,
      });
      onAdded();
    } catch {
      /* reported by the shared API-feedback layer; the dialog stays open */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add supplier"
      description="The distributor stock is purchased from, selectable when receiving stock."
      size="md"
      busy={busy}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form" loading={busy}>
            Add supplier
          </Button>
        </div>
      }
    >
      <form id="supplier-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
        </div>
        <Field label="Phone" maxLength={32} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="GSTIN"
          maxLength={15}
          value={gstin}
          onChange={(e) => setGstin(e.target.value)}
          hint="15-character GST number, if registered."
        />
        <Field label="Address" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
      </form>
    </Dialog>
  );
}

function Stock() {
  const [rows, setRows] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<Drug | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [togglingSupplier, setTogglingSupplier] = useState<string | null>(null);

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(true);
  const [adjustmentsError, setAdjustmentsError] = useState<string | null>(null);

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

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      setSuppliers(await api.listSuppliers());
      setSuppliersError(null);
    } catch (e) {
      setSuppliersError(e instanceof api.ApiRequestError ? e.message : "Failed to load suppliers.");
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  const loadAdjustments = useCallback(async () => {
    setAdjustmentsLoading(true);
    try {
      setAdjustments(await api.listStockAdjustments());
      setAdjustmentsError(null);
    } catch (e) {
      setAdjustmentsError(e instanceof api.ApiRequestError ? e.message : "Failed to load stock corrections.");
    } finally {
      setAdjustmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadSuppliers();
    void loadAdjustments();
  }, [load, loadSuppliers, loadAdjustments]);

  const activeSuppliers = suppliers.filter((s) => s.isActive);

  async function toggleSupplier(s: Supplier, next: boolean) {
    setTogglingSupplier(s.id);
    try {
      // Server re-checks pharmacy.manage and audits the change whether or not
      // this control was rendered (ADR-060).
      await api.updateSupplier(s.id, { isActive: next });
      await loadSuppliers();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setTogglingSupplier(null);
    }
  }

  const columns: Array<Column<Drug>> = [
    {
      key: "name",
      header: "Drug",
      hideable: false,
      accessor: (d) => `${d.name} ${d.strength ?? ""} ${d.form ?? ""}`,
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
      accessor: (d) => d.onHand,
      cell: (d) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-fg">{d.onHand}</span>
          {d.lowStock && <Badge tone="warning">Low</Badge>}
        </span>
      ),
    },
    {
      key: "price",
      header: "Price",
      accessor: (d) => d.unitPricePaise,
      cell: (d) => formatPaise(d.unitPricePaise),
    },
    {
      key: "reorder",
      header: "Reorder",
      accessor: (d) => d.reorderLevel,
      // A drug with no reorder level set never raises a low-stock warning — a configuration
      // gap the pharmacist can close, not an absent fact.
      cell: (d) => <ValueOrEmpty value={d.reorderLevel || null} reason="notConfigured" className="text-fg-muted" />,
    },
    {
      key: "stock",
      header: "Stock level",
      filterable: true,
      accessor: (d) => (d.lowStock ? "Low" : "OK"),
      cell: (d) => (d.lowStock ? <Badge tone="warning">Low</Badge> : <span className="text-fg-muted">OK</span>),
    },
    actionsColumn<Drug>((d) => (
      <TableActions label={`Actions for ${d.name}`}>
        <TableAction
          label={receiving === d.id ? "Close receive panel" : "Receive stock"}
          icon={<PackagePlus size={16} strokeWidth={2} aria-hidden />}
          permitted={canManage}
          onSelect={() => setReceiving((r) => (r === d.id ? null : d.id))}
        />
        <TableAction
          label="Adjust stock"
          icon={<Diff size={16} strokeWidth={2} aria-hidden />}
          permitted={canManage}
          onSelect={() => setAdjusting(d)}
        />
      </TableActions>
    )),
  ];

  const supplierColumns: Array<Column<Supplier>> = [
    {
      key: "name",
      header: "Supplier",
      hideable: false,
      accessor: (s) => `${s.name} ${s.email ?? ""}`,
      cell: (s) => (
        <span className="text-fg">
          {s.name}
          {s.email && <span className="ml-1 text-xs text-fg-subtle">· {s.email}</span>}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      accessor: (s) => s.phone ?? "",
      cell: (s) => <ValueOrEmpty value={s.phone} reason="unspecified" />,
    },
    {
      key: "gstin",
      header: "GSTIN",
      accessor: (s) => s.gstin ?? "",
      cell: (s) => (s.gstin ? <span className="font-mono text-xs">{s.gstin}</span> : <EmptyValue reason="unspecified" />),
    },
    {
      key: "status",
      header: "Status",
      filterable: true,
      accessor: (s) => (s.isActive ? "active" : "inactive"),
      cell: (s) => <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "active" : "inactive"}</Badge>,
    },
    actionsColumn<Supplier>((s) => (
      <TableActions label={`Actions for ${s.name}`}>
        {/* Deactivate, never delete — received batches keep their supplier history. */}
        <ToggleAction
          on={s.isActive}
          permitted={canManage}
          onLabel="Deactivate supplier"
          offLabel="Reactivate supplier"
          loading={togglingSupplier === s.id}
          confirm={
            s.isActive
              ? {
                  title: `Deactivate ${s.name}?`,
                  description: "New stock can no longer be received against this supplier. Batches already received keep their history.",
                  confirmLabel: "Deactivate",
                }
              : {
                  title: `Reactivate ${s.name}?`,
                  description: "The supplier becomes selectable again when receiving stock.",
                  confirmLabel: "Reactivate",
                }
          }
          onToggle={(next) => void toggleSupplier(s, next)}
        />
      </TableActions>
    )),
  ];

  const adjustmentColumns: Array<Column<StockAdjustment>> = [
    {
      key: "drug",
      header: "Drug",
      hideable: false,
      accessor: (a) => a.drugName,
      cell: (a) => <span className="text-fg">{a.drugName}</span>,
    },
    {
      key: "delta",
      header: "Change",
      accessor: (a) => a.delta,
      cell: (a) => (
        <Badge tone={a.delta > 0 ? "success" : "danger"}>{a.delta > 0 ? `+${a.delta}` : `−${Math.abs(a.delta)}`}</Badge>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      accessor: (a) => a.reason,
      cell: (a) => <span className="text-fg-muted">{a.reason}</span>,
    },
    {
      key: "when",
      header: "When",
      accessor: (a) => a.createdAt,
      cell: (a) => formatDateTime(a.createdAt),
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
        actions={<Can perm={PERMISSIONS.PHARMACY_MANAGE}><AddDrugForm onAdded={() => { setError(null); void load(); }} onError={setError} /></Can>}
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {receiving && rows.find((d) => d.id === receiving) && (
        <Card header={`Receive stock: ${rows.find((d) => d.id === receiving)!.name}`}>
          <ReceivePanel
            drug={rows.find((d) => d.id === receiving)!}
            suppliers={activeSuppliers}
            onDone={() => { setError(null); setReceiving(null); void load(); }}
            onError={setError}
          />
        </Card>
      )}

      <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} loading={loading} error={error} emptyMessage="No drugs yet. Add one to start." />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card
          header={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Suppliers</span>
              <Can perm={PERMISSIONS.PHARMACY_MANAGE}>
                <Button size="sm" onClick={() => setAddingSupplier(true)}>
                  <Plus size={16} strokeWidth={2} /> Add supplier
                </Button>
              </Can>
            </div>
          }
        >
          <DataTable
            columns={supplierColumns}
            rows={suppliers}
            rowKey={(s) => s.id}
            loading={suppliersLoading}
            error={suppliersError}
            onRetry={() => void loadSuppliers()}
            pagination={{ pageSize: 10 }}
            searchPlaceholder="Search suppliers…"
            emptyMessage="No suppliers yet."
            emptyDescription="Add the distributors stock is purchased from, then pick one when receiving stock."
          />
        </Card>

        <Card header="Recent corrections">
          <DataTable
            columns={adjustmentColumns}
            rows={adjustments}
            rowKey={(a) => a.id}
            loading={adjustmentsLoading}
            error={adjustmentsError}
            onRetry={() => void loadAdjustments()}
            pagination={{ pageSize: 10 }}
            searchPlaceholder="Search corrections…"
            emptyMessage="No stock corrections yet."
            emptyDescription="Write-offs and count corrections made with “Adjust stock” appear here."
          />
        </Card>
      </div>

      {/* Keyed per open so every correction starts from a blank form — a failed
          submit keeps the dialog (and the typed input) intact, but reopening never
          shows the previous correction. */}
      <AdjustStockDialog
        key={adjusting?.id ?? "closed"}
        drug={adjusting ? rows.find((d) => d.id === adjusting.id) ?? adjusting : null}
        onClose={() => setAdjusting(null)}
        onDone={() => {
          setAdjusting(null);
          void load();
          void loadAdjustments();
        }}
      />

      <AddSupplierDialog
        key={addingSupplier ? "open" : "closed"}
        open={addingSupplier}
        onClose={() => setAddingSupplier(false)}
        onAdded={() => {
          setAddingSupplier(false);
          void loadSuppliers();
        }}
      />
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
