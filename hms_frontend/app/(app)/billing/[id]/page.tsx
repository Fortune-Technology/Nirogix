"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Printer } from "lucide-react";
import { Alert, Badge, Button, Card, DataTable, Dialog, Field, Select, Spinner, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { AddInvoiceLineRequest, Invoice, Service } from "@hms/types";
import { formatDateTime } from "@hms/utils";
import * as api from "../../../../lib/api";
import { RequirePermission, Can } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { formatPaise, rupeesToPaise } from "../../../../lib/money";

function statusTone(s: string): "success" | "warning" | "neutral" | "danger" {
  if (s === "paid") return "success";
  if (s === "partially_paid") return "warning";
  if (s === "void") return "neutral";
  return "danger";
}

const METHODS: Array<Invoice["payments"][number]["method"]> = ["cash", "upi", "card", "netbanking", "other"];

/** Invoice line items — the shared table, configured as a receipt (ADR-029). */
function lineItemColumns(currency: string): Array<Column<Invoice["lineItems"][number]>> {
  return [
    {
      key: "item",
      header: "Item",
      cell: (li) => (
        <span className="text-fg">
          {li.description}
          <span className="ml-2 text-xs text-fg-subtle">{li.itemType}</span>
        </span>
      ),
    },
    { key: "qty", header: "Qty", cell: (li) => <span className="text-fg-muted">{li.quantity}</span> },
    {
      key: "unit",
      header: "Unit",
      cell: (li) => <span className="text-fg-muted">{formatPaise(li.unitPricePaise, currency)}</span>,
    },
    {
      key: "tax",
      header: "Tax",
      cell: (li) => <span className="text-fg-muted">{formatPaise(li.taxPaise, currency)}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      cell: (li) => <span className="text-fg">{formatPaise(li.lineTotalPaise, currency)}</span>,
    },
  ];
}

function InvoiceDetail({ id }: { id: string }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collecting, setCollecting] = useState(false);
  const [amountRupees, setAmountRupees] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [idemKey, setIdemKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Add-item dialog — a catalogue service (server-priced) or a custom one-off line.
  const [adding, setAdding] = useState(false);
  const [services, setServices] = useState<Service[] | null>(null); // null = not loaded yet
  const [mode, setMode] = useState<"service" | "custom">("service");
  const [serviceId, setServiceId] = useState("");
  const [qty, setQty] = useState("1");
  const [itemDesc, setItemDesc] = useState("");
  const [itemPriceRupees, setItemPriceRupees] = useState("");
  const [itemTaxPercent, setItemTaxPercent] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addingBusy, setAddingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const i = await api.getInvoice(id);
      setInv(i);
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load the invoice.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCollect() {
    if (!inv) return;
    setIdemKey(crypto.randomUUID()); // one key per attempt — retries are idempotent server-side
    setAmountRupees(String(inv.balancePaise / 100));
    setMethod("cash");
    setReference("");
    setError(null);
    setCollecting(true);
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amountRupees);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.recordPayment(id, {
        amountPaise: rupeesToPaise(amt),
        method: method as "cash" | "upi" | "card" | "netbanking" | "other",
        reference: reference || undefined,
        idempotencyKey: idemKey,
      });
      setInv(updated);
      setCollecting(false);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not record the payment.");
    } finally {
      setSubmitting(false);
    }
  }

  function openAddItem() {
    setMode("service");
    setServiceId("");
    setQty("1");
    setItemDesc("");
    setItemPriceRupees("");
    setItemTaxPercent("");
    setAddError(null);
    setAdding(true);
    if (services === null) {
      api.listServices({ activeOnly: true }).then(setServices).catch(() => setServices([]));
    }
  }

  async function submitAddItem(e: FormEvent) {
    e.preventDefault();
    if (!inv) return;
    setAddError(null);
    const q = Number(qty);
    if (!Number.isInteger(q) || q < 1) {
      setAddError("Quantity must be a whole number of at least 1.");
      return;
    }
    let body: AddInvoiceLineRequest;
    if (mode === "service") {
      if (!serviceId) {
        setAddError("Choose a service from the catalogue.");
        return;
      }
      // Catalogue lines are priced by the server from the service — never send a price.
      body = { serviceId, quantity: q };
    } else {
      if (!itemDesc.trim()) {
        setAddError("Describe the item.");
        return;
      }
      const price = Number(itemPriceRupees);
      if (itemPriceRupees.trim() === "" || !Number.isFinite(price) || price < 0) {
        setAddError("Enter a valid unit price.");
        return;
      }
      const pct = itemTaxPercent.trim() === "" ? 0 : Number(itemTaxPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setAddError("Enter a valid tax percentage (0–100).");
        return;
      }
      body = {
        description: itemDesc.trim(),
        unitPricePaise: rupeesToPaise(price),
        quantity: q,
        taxRateBps: Math.round(pct * 100),
      };
    }
    setAddingBusy(true);
    try {
      const updated = await api.addInvoiceLine(inv.id, body);
      setInv(updated); // the API returns the recalculated invoice
      setAdding(false);
    } catch (err) {
      setAddError(err instanceof api.ApiRequestError ? err.message : "Could not add the item.");
    } finally {
      setAddingBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fg-muted">
        <Spinner /> Loading invoice…
      </div>
    );
  }
  if (!inv) return <Alert tone="danger">{error ?? "Invoice not found."}</Alert>;

  const currency = inv.currency;

  return (
    <>
      <Link href="/billing" className="print:hidden inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} strokeWidth={2} /> Billing
      </Link>
      <PageHeader
        title={inv.invoiceNumber}
        description={`For ${inv.patientName} · ${inv.patientUhid}`}
        actions={
          <div className="flex items-center gap-2">
            {/* Opens the invoice DOCUMENT (ADR-047), not this screen. Printing the
                page would put the sidebar and the collect-payment form on the bill. */}
            <Link href={`/print/invoice/${id}`}>
              <Button variant="secondary">
                <Printer size={16} strokeWidth={2} /> Print / PDF
              </Button>
            </Link>
            {inv.status !== "void" && (
              <Can perm={PERMISSIONS.BILLING_CREATE}>
                <Button variant="secondary" onClick={openAddItem}>
                  <Plus size={16} strokeWidth={2} /> Add item
                </Button>
              </Can>
            )}
            {inv.balancePaise > 0 && inv.status !== "void" && (
              <Can perm={PERMISSIONS.BILLING_PAYMENT}>
                <Button onClick={openCollect}>Collect payment</Button>
              </Can>
            )}
          </div>
        }
      />

      {error && !collecting && <Alert tone="danger">{error}</Alert>}

      {collecting && (
        <Card header="Collect payment">
          <form className="flex flex-col gap-4" onSubmit={submitPayment}>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label={`Amount (₹) · ${formatPaise(inv.balancePaise, currency)} due`}
                type="number"
                min={0}
                step="0.01"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
              />
              <Select
                label="Method"
                value={method}
                onChange={(v) => setMethod(v || METHODS[0]!)}
                options={METHODS.map((m) => ({ value: m, label: m.toUpperCase() }))}
              />
              <Field label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" loading={submitting}>Record payment</Button>
              <Button type="button" variant="ghost" onClick={() => setCollecting(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        header={
          <div className="flex items-center justify-between">
            <span>Receipt</span>
            <Badge tone={statusTone(inv.status)}>{inv.status.replace("_", " ")}</Badge>
          </div>
        }
      >
        {/* A receipt, not a worklist: the shared table with its controls turned off. */}
        <DataTable
          columns={lineItemColumns(currency)}
          rows={inv.lineItems}
          rowKey={(li) => li.id}
          pagination={false}
          columnVisibility={false}
          searchable={false}
          stickyHeader={false}
          emptyMessage="No line items on this invoice."
        />

        <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1.5 text-sm">
          <div className="flex justify-between text-fg-muted">
            <dt>Subtotal</dt>
            <dd>{formatPaise(inv.subtotalPaise, currency)}</dd>
          </div>
          <div className="flex justify-between text-fg-muted">
            <dt>Tax</dt>
            <dd>{formatPaise(inv.taxPaise, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-fg">
            <dt>Total</dt>
            <dd>{formatPaise(inv.totalPaise, currency)}</dd>
          </div>
          <div className="flex justify-between text-fg-muted">
            <dt>Paid</dt>
            <dd>{formatPaise(inv.amountPaidPaise, currency)}</dd>
          </div>
          <div className={`flex justify-between font-semibold ${inv.balancePaise > 0 ? "text-danger" : "text-success"}`}>
            <dt>Balance</dt>
            <dd>{formatPaise(inv.balancePaise, currency)}</dd>
          </div>
        </dl>
      </Card>

      {inv.payments.length > 0 && (
        <Card header="Payments">
          <ul className="flex flex-col gap-2 text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
                <span className="text-fg">
                  {formatPaise(p.amountPaise, currency)} · <span className="uppercase text-fg-muted">{p.method}</span>
                  {p.reference && <span className="ml-2 text-xs text-fg-subtle">{p.reference}</span>}
                </span>
                <span className="text-xs text-fg-muted">{formatDateTime(p.collectedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={adding}
        onClose={() => !addingBusy && setAdding(false)}
        title="Add item"
        description={`Adds a line to ${inv.invoiceNumber}. Catalogue items are priced from the services list by the server.`}
        size="md"
        busy={addingBusy}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" disabled={addingBusy} onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-line-form" loading={addingBusy}>
              Add to bill
            </Button>
          </div>
        }
      >
        <form id="add-line-form" onSubmit={submitAddItem} className="flex flex-col gap-4">
          {addError && <Alert tone="danger">{addError}</Alert>}
          <div className="flex gap-2" role="group" aria-label="Item source">
            <Button
              type="button"
              size="sm"
              variant={mode === "service" ? "secondary" : "ghost"}
              aria-pressed={mode === "service"}
              onClick={() => setMode("service")}
            >
              From catalogue
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "custom" ? "secondary" : "ghost"}
              aria-pressed={mode === "custom"}
              onClick={() => setMode("custom")}
            >
              Custom
            </Button>
          </div>
          {mode === "service" ? (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
              {/* A hospital's service catalogue runs to hundreds of lines, so this is the shared
                  searchable Select (ADR-029): the code and the fee are their own columns rather
                  than punctuation inside one truncated line of native-select text. */}
              <Select
                label="Service"
                value={serviceId}
                onChange={setServiceId}
                options={(services ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                  description: s.code,
                  keywords: s.code,
                  meta: formatPaise(s.pricePaise),
                }))}
                loading={services === null}
                placeholder={services === null ? "Loading catalogue…" : "Choose a service…"}
                emptyMessage="No active services."
                clearable
              />
              <Field label="Qty" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <Field
                  label="Description"
                  required
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  placeholder="Dressing kit"
                />
              </div>
              <Field
                label="Unit price (₹)"
                required
                type="number"
                min={0}
                step="0.01"
                value={itemPriceRupees}
                onChange={(e) => setItemPriceRupees(e.target.value)}
              />
              <Field label="Qty" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
              <Field
                label="Tax (%)"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={itemTaxPercent}
                onChange={(e) => setItemTaxPercent(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
        </form>
      </Dialog>
    </>
  );
}

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.BILLING_VIEW}>
      <InvoiceDetail id={params.id} />
    </RequirePermission>
  );
}
