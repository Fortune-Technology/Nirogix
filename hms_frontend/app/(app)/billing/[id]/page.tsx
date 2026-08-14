"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Invoice } from "@hms/types";
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
          <div className="print:hidden flex items-center gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} strokeWidth={2} /> Print
            </Button>
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
              <label className="hms-field">
                <span className="hms-label">Method</span>
                <select className="hms-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>{m.toUpperCase()}</option>
                  ))}
                </select>
              </label>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-fg-muted">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 px-3 text-right font-medium">Qty</th>
                <th className="py-2 px-3 text-right font-medium">Unit</th>
                <th className="py-2 px-3 text-right font-medium">Tax</th>
                <th className="py-2 pl-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lineItems.map((li) => (
                <tr key={li.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 text-fg">
                    {li.description}
                    <span className="ml-2 text-xs text-fg-subtle">{li.itemType}</span>
                  </td>
                  <td className="py-2 px-3 text-right text-fg-muted">{li.quantity}</td>
                  <td className="py-2 px-3 text-right text-fg-muted">{formatPaise(li.unitPricePaise, currency)}</td>
                  <td className="py-2 px-3 text-right text-fg-muted">{formatPaise(li.taxPaise, currency)}</td>
                  <td className="py-2 pl-3 text-right text-fg">{formatPaise(li.lineTotalPaise, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
                <span className="text-xs text-fg-muted">{new Date(p.collectedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
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
