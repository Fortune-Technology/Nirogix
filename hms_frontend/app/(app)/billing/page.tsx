'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Dialog,
  Field,
  NumberRangeFilter,
  Select,
  TableActions,
  ViewAction,
  actionsColumn,
  type Column,
  type DataTableQuery,
  type NumberRangeValue,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { CreateInvoiceRequest, InvoiceListItem, Patient, Service } from '@hms/types';
import { formatDate } from '@hms/utils';
import * as api from '../../../lib/api';
import { RequirePermission, Can } from '../../../components/Can';
import { PageHeader } from '../../../components/PageHeader';
import { formatPaise, rupeesToPaise } from '../../../lib/money';

function statusTone(s: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (s === 'paid') return 'success';
  if (s === 'partially_paid') return 'warning';
  if (s === 'void') return 'neutral';
  return 'danger'; // draft = unpaid
}

/** One row of the new-invoice line editor — a catalogue service or a custom item. */
type LineRow = {
  key: number;
  kind: 'service' | 'custom';
  serviceId: string;
  description: string;
  priceRupees: string;
  qty: string;
  taxPercent: string;
};

function InvoicesTable() {
  // Server mode: the invoice list is paginated and filtered by the API, so the
  // table reports the view the user asked for instead of paging in the browser.
  const [rows, setRows] = useState<InvoiceListItem[]>([]);
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1,
    pageSize: 20,
    search: '',
    sort: [],
    filters: {},
  });
  // Total range in rupees; converted to paise at the API boundary. It is a numeric
  // range, not a facet, so it lives beside `query` rather than in `filters` (ADR-063).
  const [amount, setAmount] = useState<NumberRangeValue>({ min: null, max: null });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusFilter = query.filters.status;

  // New-invoice dialog: pick a patient, then compose catalogue + custom lines.
  const router = useRouter();
  const keyRef = useRef(0);
  const [creating, setCreating] = useState(false);
  const [services, setServices] = useState<Service[] | null>(null); // null = not loaded yet
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listInvoices({
        page: query.page,
        pageSize: query.pageSize,
        status: query.filters.status?.length ? query.filters.status.join(',') : undefined,
        amountFrom: amount.min !== null ? Math.round(amount.min * 100) : undefined,
        amountTo: amount.max !== null ? Math.round(amount.max * 100) : undefined,
        sort: api.sortParam(query.sort),
      });
      setRows(res.data);
      setTotal(res.page.total);
      setError(null);
    } catch {
      setError('Could not load invoices.');
    } finally {
      setLoading(false);
    }
  }, [query, amount]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced patient search — pick-and-lock, like OPD check-in.
  useEffect(() => {
    if (!creating || patient || !patientSearch.trim()) {
      setPatientResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .listPatients(1, 6, patientSearch)
        .then((r) => setPatientResults(r.data))
        .catch(() => setPatientResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [creating, patientSearch, patient]);

  function freshRow(kind: LineRow['kind']): LineRow {
    keyRef.current += 1;
    return {
      key: keyRef.current,
      kind,
      serviceId: '',
      description: '',
      priceRupees: '',
      qty: '1',
      taxPercent: '',
    };
  }

  function patchLine(key: number, patch: Partial<LineRow>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: number) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  function openCreate() {
    setPatient(null);
    setPatientSearch('');
    setPatientResults([]);
    setLines([freshRow('service')]);
    setCreateError(null);
    setCreating(true);
    if (services === null) {
      api
        .listServices({ activeOnly: true })
        .then(setServices)
        .catch(() => setServices([]));
    }
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!patient) {
      setCreateError('Select a patient.');
      return;
    }
    if (lines.length === 0) {
      setCreateError('Add at least one line.');
      return;
    }
    const lineItems: CreateInvoiceRequest['lineItems'] = [];
    for (const [idx, l] of lines.entries()) {
      const label = `Line ${idx + 1}`;
      const q = Number(l.qty);
      if (!Number.isInteger(q) || q < 1) {
        setCreateError(`${label}: quantity must be a whole number of at least 1.`);
        return;
      }
      if (l.kind === 'service') {
        const svc = (services ?? []).find((s) => s.id === l.serviceId);
        if (!svc) {
          setCreateError(`${label}: choose a service from the catalogue.`);
          return;
        }
        lineItems.push({
          itemType: 'service',
          description: `${svc.name} (${svc.code})`,
          quantity: q,
          unitPricePaise: svc.pricePaise,
          taxRateBps: svc.taxRateBps,
        });
      } else {
        if (!l.description.trim()) {
          setCreateError(`${label}: describe the item.`);
          return;
        }
        const price = Number(l.priceRupees);
        if (l.priceRupees.trim() === '' || !Number.isFinite(price) || price < 0) {
          setCreateError(`${label}: enter a valid unit price.`);
          return;
        }
        const pct = l.taxPercent.trim() === '' ? 0 : Number(l.taxPercent);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          setCreateError(`${label}: enter a valid tax percentage (0–100).`);
          return;
        }
        lineItems.push({
          itemType: 'other',
          description: l.description.trim(),
          quantity: q,
          unitPricePaise: rupeesToPaise(price),
          taxRateBps: Math.round(pct * 100),
        });
      }
    }
    setCreatingBusy(true);
    try {
      const created = await api.createInvoice({ patientId: patient.id, lineItems });
      router.push(`/billing/${created.id}`);
      // Stay busy through the navigation — the dialog unmounts with the page.
    } catch (err) {
      setCreateError(
        err instanceof api.ApiRequestError ? err.message : 'Could not create the invoice.',
      );
      setCreatingBusy(false);
    }
  }

  const columns: Array<Column<InvoiceListItem>> = [
    {
      key: 'number',
      header: 'Invoice',
      hideable: false,
      accessor: (i) => i.invoiceNumber,
      cell: (i) => (
        <Link href={`/billing/${i.id}`} className="font-mono text-brand hover:underline">
          {i.invoiceNumber}
        </Link>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      hideable: false,
      accessor: (i) => `${i.patientName} ${i.patientUhid}`,
      cell: (i) => (
        <Link href={`/patients/${i.patientId}`} className="hover:underline">
          {i.patientName} <span className="font-mono text-xs text-fg-muted">{i.patientUhid}</span>
        </Link>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      accessor: (i) => i.totalPaise,
      cell: (i) => (
        <span className="whitespace-nowrap text-fg">{formatPaise(i.totalPaise, i.currency)}</span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      accessor: (i) => i.balancePaise,
      cell: (i) => (
        <span className={`whitespace-nowrap ${i.balancePaise > 0 ? 'text-fg' : 'text-fg-muted'}`}>
          {formatPaise(i.balancePaise, i.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      filterOptions: [
        { value: 'draft', label: 'unpaid (draft)' },
        { value: 'partially_paid', label: 'partially paid' },
        { value: 'paid', label: 'paid' },
        { value: 'void', label: 'void' },
      ],
      // Raw status is the filter/sort value; the pretty form is display only.
      accessor: (i) => i.status,
      cell: (i) => <Badge tone={statusTone(i.status)}>{i.status.replace('_', ' ')}</Badge>,
    },
    {
      key: 'date',
      header: 'Created',
      accessor: (i) => i.createdAt,
      cell: (i) => (
        <span className="whitespace-nowrap text-fg-muted">{formatDate(i.createdAt)}</span>
      ),
    },
    actionsColumn<InvoiceListItem>((i) => (
      <TableActions label={`Actions for invoice ${i.invoiceNumber}`}>
        <ViewAction label="View invoice" href={`/billing/${i.id}`} />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Billing"
        description={`${total} invoice${total === 1 ? '' : 's'}`}
        actions={
          <Can perm={PERMISSIONS.BILLING_CREATE}>
            <Button onClick={openCreate}>
              <Plus size={16} strokeWidth={2} /> New invoice
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyMessage={statusFilter?.length ? 'No invoices with this status.' : 'No invoices yet.'}
        urlState
        filters={
          <NumberRangeFilter
            label="Total (₹)"
            value={amount}
            onChange={(r) => {
              setAmount(r);
              setQuery((q) => ({ ...q, page: 1 }));
            }}
          />
        }
        server={{
          total,
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          sort: query.sort,
          filters: query.filters,
          onChange: setQuery,
        }}
      />

      <Dialog
        open={creating}
        onClose={() => !creatingBusy && setCreating(false)}
        title="New invoice"
        description="Bills a patient for catalogue services and one-off items."
        size="lg"
        busy={creatingBusy}
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              type="button"
              disabled={creatingBusy}
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="new-invoice-form" loading={creatingBusy}>
              Create invoice
            </Button>
          </div>
        }
      >
        <form id="new-invoice-form" onSubmit={submitCreate} className="flex flex-col gap-5">
          {createError && <Alert tone="danger">{createError}</Alert>}

          <div className="flex flex-col gap-1.5">
            <span className="hms-label">Patient</span>
            {patient ? (
              <div className="flex items-center gap-3 rounded-token border border-border bg-surface px-3 py-2">
                <Badge tone="brand">{patient.uhid}</Badge>
                <span className="text-fg">
                  {[patient.firstName, patient.lastName].filter(Boolean).join(' ')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="ml-auto"
                  onClick={() => {
                    setPatient(null);
                    setPatientSearch('');
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Field
                  placeholder="Search patient by UHID, name, or phone…"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                />
                {patientResults.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 rounded-token border border-border bg-surface p-1">
                    {patientResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-token px-3 py-2 text-left text-sm hover:bg-surface-2"
                          onClick={() => {
                            setPatient(p);
                            setPatientResults([]);
                          }}
                        >
                          <span className="font-mono text-xs text-fg-muted">{p.uhid}</span>
                          <span className="text-fg">
                            {[p.firstName, p.lastName].filter(Boolean).join(' ')}
                          </span>
                          {p.phone && (
                            <span className="ml-auto text-xs text-fg-subtle">{p.phone}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <span className="hms-label">Line items</span>
            {lines.length === 0 && (
              <p className="text-sm text-fg-muted">
                No lines yet. Add a catalogue service or a custom item.
              </p>
            )}
            {lines.map((l, idx) => (
              <div
                key={l.key}
                role="group"
                aria-label={`Line ${idx + 1}`}
                className="flex flex-col gap-3 rounded-token border border-border p-3"
              >
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={l.kind === 'service' ? 'secondary' : 'ghost'}
                    aria-pressed={l.kind === 'service'}
                    onClick={() => patchLine(l.key, { kind: 'service' })}
                  >
                    Catalogue
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={l.kind === 'custom' ? 'secondary' : 'ghost'}
                    aria-pressed={l.kind === 'custom'}
                    onClick={() => patchLine(l.key, { kind: 'custom' })}
                  >
                    Custom
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    aria-label={`Remove line ${idx + 1}`}
                    onClick={() => removeLine(l.key)}
                  >
                    <Trash2 size={15} strokeWidth={2} aria-hidden />
                  </Button>
                </div>
                {l.kind === 'service' ? (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
                    <Select
                      label="Service"
                      value={l.serviceId}
                      onChange={(v) => patchLine(l.key, { serviceId: v })}
                      loading={services === null}
                      placeholder={services?.length ? 'Choose a service…' : 'No active services'}
                      emptyMessage="No service matches that search."
                      options={(services ?? []).map((s) => ({
                        value: s.id,
                        label: s.name,
                        description: s.code,
                        meta: formatPaise(s.pricePaise),
                        keywords: s.code,
                      }))}
                    />
                    <Field
                      label="Qty"
                      type="number"
                      min={1}
                      step={1}
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-3">
                      <Field
                        label="Description"
                        value={l.description}
                        onChange={(e) => patchLine(l.key, { description: e.target.value })}
                        placeholder="Dressing kit"
                      />
                    </div>
                    <Field
                      label="Unit price (₹)"
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.priceRupees}
                      onChange={(e) => patchLine(l.key, { priceRupees: e.target.value })}
                    />
                    <Field
                      label="Qty"
                      type="number"
                      min={1}
                      step={1}
                      value={l.qty}
                      onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                    />
                    <Field
                      label="Tax (%)"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={l.taxPercent}
                      onChange={(e) => patchLine(l.key, { taxPercent: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setLines((ls) => [...ls, freshRow('service')])}
              >
                <Plus size={15} strokeWidth={2} /> Add line
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export default function BillingPage() {
  return (
    <RequirePermission perm={PERMISSIONS.BILLING_VIEW}>
      <InvoicesTable />
    </RequirePermission>
  );
}
