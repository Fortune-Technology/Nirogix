'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  emptyLabel,
  PrintDocument,
  PrintFields,
  PrintNote,
  PrintSection,
  PrintSignatures,
  PrintTable,
  PrintToolbar,
  PrintTotals,
  Spinner,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { Invoice } from '@hms/types';
import { formatDate, formatDateTime } from '@hms/utils';
import * as api from '../../../../../lib/api';
import { RequirePermission } from '../../../../../components/Can';
import { useDocumentBrand } from '../../../../../components/print/useDocumentBrand';
import { formatPaise } from '../../../../../lib/money';

/**
 * The invoice document (ADR-047) — a hospital-branded bill, not a printout of the
 * billing screen. Same data, same permission (`billing.invoice.view`), same
 * RLS-scoped endpoint as the screen; what changes is that this page contains the
 * document and nothing else.
 */
function InvoiceDocument({ id }: { id: string }) {
  const router = useRouter();
  const { brand, ready } = useDocumentBrand();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getInvoice(id)
      .then(setInv)
      .catch((e) =>
        setError(e instanceof api.ApiRequestError ? e.message : 'Could not load the invoice.'),
      );
  }, [id]);

  if (error) return <p className="mx-auto max-w-2xl text-center text-sm text-danger">{error}</p>;
  if (!inv || !ready) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-fg-muted">
        <Spinner /> Preparing the document…
      </div>
    );
  }

  const balance = Math.max(0, inv.totalPaise - inv.amountPaidPaise);
  const isPaid = balance === 0 && inv.status !== 'void';

  return (
    <>
      <PrintToolbar onBack={() => router.push(`/billing/${id}`)} backLabel="Back to the invoice" />

      <PrintDocument
        brand={brand}
        title={inv.status === 'void' ? 'Invoice (void)' : 'Tax invoice'}
        reference={
          <>
            <div>
              <strong>{inv.invoiceNumber}</strong>
            </div>
            <div>Issued {formatDate(inv.createdAt)}</div>
          </>
        }
        meta={
          <PrintFields
            fields={[
              { label: 'Patient', value: inv.patientName },
              { label: 'UHID', value: inv.patientUhid },
              { label: 'Invoice date', value: formatDateTime(inv.createdAt) },
              { label: 'Status', value: inv.status.replace('_', ' ') },
            ]}
          />
        }
      >
        <PrintSection title="Items">
          <PrintTable
            columns={[
              {
                key: 'item',
                header: 'Description',
                cell: (li: Invoice['lineItems'][number]) => (
                  <>
                    {li.description}
                    <div style={{ fontSize: '8.5pt', color: 'var(--doc-muted)' }}>
                      {li.itemType}
                    </div>
                  </>
                ),
              },
              { key: 'qty', header: 'Qty', align: 'right', cell: (li) => String(li.quantity) },
              {
                key: 'unit',
                header: 'Unit price',
                align: 'right',
                cell: (li) => formatPaise(li.unitPricePaise, inv.currency),
              },
              {
                key: 'tax',
                header: 'Tax',
                align: 'right',
                cell: (li) => formatPaise(li.taxPaise, inv.currency),
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                cell: (li) => formatPaise(li.lineTotalPaise, inv.currency),
              },
            ]}
            rows={inv.lineItems}
            rowKey={(li) => li.id}
            emptyMessage="No items on this invoice."
          />

          <PrintTotals
            lines={[
              { label: 'Subtotal', value: formatPaise(inv.subtotalPaise, inv.currency) },
              { label: 'Tax', value: formatPaise(inv.taxPaise, inv.currency) },
              { label: 'Total', value: formatPaise(inv.totalPaise, inv.currency), strong: true },
              { label: 'Paid', value: formatPaise(inv.amountPaidPaise, inv.currency) },
              { label: 'Balance due', value: formatPaise(balance, inv.currency) },
            ]}
          />
        </PrintSection>

        {inv.payments.length > 0 ? (
          <PrintSection title="Payments received">
            <PrintTable
              columns={[
                {
                  key: 'when',
                  header: 'Date',
                  cell: (p: Invoice['payments'][number]) => formatDateTime(p.collectedAt),
                },
                { key: 'method', header: 'Method', cell: (p) => p.method },
                // Cash has no transaction reference to print.
                {
                  key: 'ref',
                  header: 'Reference',
                  cell: (p) => p.reference ?? emptyLabel('notApplicable'),
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  cell: (p) => formatPaise(p.amountPaise, inv.currency),
                },
              ]}
              rows={inv.payments}
              rowKey={(p) => p.id}
            />
          </PrintSection>
        ) : null}

        {inv.notes ? <PrintNote title="Notes">{inv.notes}</PrintNote> : null}

        {isPaid ? (
          <PrintNote title="Receipt">
            Payment received in full. This document serves as the receipt for {inv.invoiceNumber}.
          </PrintNote>
        ) : null}

        {/* The hospital's side falls back to its configured signatory (ADR-056); the
            patient's line has no name by definition. */}
        <PrintSignatures
          brand={brand}
          signatures={[
            { label: 'Patient / attendant' },
            {
              label: 'For ' + (brand.organizationName ?? 'the hospital'),
              useDefaultSignatory: true,
            },
          ]}
        />
      </PrintDocument>
    </>
  );
}

export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.BILLING_VIEW}>
      <InvoiceDocument id={id} />
    </RequirePermission>
  );
}
