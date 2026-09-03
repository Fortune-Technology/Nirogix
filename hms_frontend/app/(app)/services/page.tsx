'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  EditAction,
  EmptyValue,
  Field,
  Select,
  TableActions,
  Textarea,
  ToggleAction,
  actionsColumn,
  valueLabel,
  type Column,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { Department, Service } from '@hms/types';
import * as api from '../../../lib/api';
import { RequirePermission, Can } from '../../../components/Can';
import { PageHeader } from '../../../components/PageHeader';
import { BulkImportAction } from '../../../components/import/BulkImportDialog';
import { CatalogPickerButton } from '../../../components/catalog/CatalogPicker';
import { useCan } from '../../../lib/auth';
import { formatPaise, rupeesToPaise } from '../../../lib/money';

type ServiceForm = {
  code: string;
  name: string;
  description: string;
  departmentId: string;
  priceRupees: string;
  taxPercent: string;
  catalogCode: string;
};

const EMPTY_FORM: ServiceForm = {
  code: '',
  name: '',
  description: '',
  departmentId: '',
  priceRupees: '',
  taxPercent: '',
  catalogCode: '',
};

/** Rupee input → integer paise; undefined = invalid. */
function priceToPaise(priceRupees: string): number | undefined {
  if (priceRupees.trim() === '') return undefined;
  const n = Number(priceRupees);
  return Number.isFinite(n) && n >= 0 ? rupeesToPaise(n) : undefined;
}

/** Percent input → basis points (12 → 1200); blank = untaxed; undefined = invalid. */
function percentToBps(taxPercent: string): number | undefined {
  if (taxPercent.trim() === '') return 0;
  const n = Number(taxPercent);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : undefined;
}

function ServicesTable() {
  const canManage = useCan(PERMISSIONS.BILLING_SERVICES_MANAGE);
  const [rows, setRows] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For the form's department select only — the table shows the denormalised name.
  const [departments, setDepartments] = useState<Department[]>([]);

  // One dialog for create and edit; `editing` decides which.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // All services, inactive included — that is where Reactivate lives.
      setRows(await api.listServices());
      setError(null);
    } catch (err) {
      setError(
        err instanceof api.ApiRequestError ? err.message : 'Failed to load the services catalogue.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    // Only active departments are offered — the server refuses a retired one anyway (ADR-050).
    api
      .listDepartments({ activeOnly: true })
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, [canManage]);

  function startCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setOpen(true);
  }

  function startEdit(s: Service) {
    setEditing(s);
    setForm({
      code: s.code,
      name: s.name,
      description: s.description ?? '',
      departmentId: s.departmentId ?? '',
      priceRupees: String(s.pricePaise / 100),
      taxPercent: String(s.taxRateBps / 100),
      catalogCode: '',
    });
    setFormError(null);
    setOpen(true);
  }

  function set<K extends keyof ServiceForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Pre-fill code + name from a catalogue item; price and tax stay the hospital's own.
  function applyCatalog(item: api.CatalogItem) {
    setForm((f) => ({ ...f, code: item.code, name: item.name, catalogCode: item.code }));
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Code and name are required.');
      return;
    }
    const pricePaise = priceToPaise(form.priceRupees);
    if (pricePaise === undefined) {
      setFormError('Enter a valid price.');
      return;
    }
    const taxRateBps = percentToBps(form.taxPercent);
    if (taxRateBps === undefined) {
      setFormError('Enter a valid tax percentage (0–100).');
      return;
    }
    setSavingForm(true);
    try {
      if (editing) {
        await api.updateService(editing.id, {
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          departmentId: form.departmentId || null,
          pricePaise,
          taxRateBps,
        });
      } else {
        await api.createService({
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          catalogCode: form.catalogCode || undefined,
          departmentId: form.departmentId || undefined,
          pricePaise,
          taxRateBps,
        });
      }
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(
        err instanceof api.ApiRequestError ? err.message : 'Could not save the service.',
      );
    } finally {
      setSavingForm(false);
    }
  }

  async function toggleActive(s: Service) {
    try {
      await api.updateService(s.id, { isActive: !s.isActive });
      await load();
    } catch {
      /* reported by the shared API-feedback layer */
    }
  }

  const columns: Array<Column<Service>> = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      hideable: false,
      accessor: (s) => s.code,
      cell: (s) => <span className="font-mono text-fg">{s.code}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      hideable: false,
      accessor: (s) => s.name,
      cell: (s) => <span className="font-medium text-fg">{s.name}</span>,
    },
    {
      key: 'department',
      header: 'Department',
      filterable: true,
      // Unassigned, not unknown: a service may legitimately belong to no department, and the
      // accessor carries the same words so the filter and the search can find those rows.
      accessor: (s) => valueLabel(s.departmentName, 'unassigned'),
      cell: (s) =>
        s.departmentName ? (
          <span className="text-fg-muted">{s.departmentName}</span>
        ) : (
          <EmptyValue reason="unassigned" />
        ),
    },
    {
      key: 'price',
      header: 'Price',
      sortable: true,
      accessor: (s) => s.pricePaise,
      cell: (s) => <span className="whitespace-nowrap text-fg">{formatPaise(s.pricePaise)}</span>,
    },
    {
      key: 'tax',
      header: 'Tax',
      accessor: (s) => s.taxRateBps,
      cell: (s) => <span className="text-fg-muted">{s.taxRateBps / 100}%</span>,
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      accessor: (s) => (s.isActive ? 'Active' : 'Inactive'),
      cell: (s) =>
        s.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>,
    },
    actionsColumn<Service>((s) => (
      <TableActions label={`Actions for ${s.name}`}>
        <EditAction label="Edit service" permitted={canManage} onSelect={() => startEdit(s)} />
        {/* Deactivate, never delete — invoice lines already reference the service. */}
        <ToggleAction
          on={s.isActive}
          permitted={canManage}
          onLabel="Deactivate service"
          offLabel="Reactivate service"
          confirm={
            s.isActive
              ? {
                  title: `Deactivate ${s.name}?`,
                  description:
                    'Lines already on invoices keep their description and price. The service stops appearing in the catalogue for new bills until reactivated.',
                  confirmLabel: 'Deactivate',
                }
              : true
          }
          onToggle={() => void toggleActive(s)}
        />
      </TableActions>
    )),
  ];

  const formFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      {!editing && (
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <span className="text-sm text-fg-muted">
            Start from a common service, or fill it in yourself.
          </span>
          <CatalogPickerButton
            category="service"
            title="Common services"
            description="Pick a service to pre-fill its code and name. You set the price and tax."
            onPick={applyCatalog}
          />
        </div>
      )}
      <Field
        label="Code"
        required
        value={form.code}
        onChange={(e) => set('code', e.target.value)}
        placeholder="CONS-GEN"
        hint="Short unique code shown on bills and reports."
      />
      <Field
        label="Name"
        required
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="General consultation"
      />
      <div className="sm:col-span-2">
        <Textarea
          label="Description (optional)"
          rows={2}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>
      <Select
        label="Department"
        value={form.departmentId}
        onChange={(v) => set('departmentId', v)}
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
        placeholder="No department"
        emptyMessage="No departments defined."
        clearable
      />
      <Field
        label="Price (₹)"
        required
        type="number"
        min={0}
        step="0.01"
        value={form.priceRupees}
        onChange={(e) => set('priceRupees', e.target.value)}
        placeholder="500"
      />
      <Field
        label="Tax (%)"
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={form.taxPercent}
        onChange={(e) => set('taxPercent', e.target.value)}
        placeholder="0"
        hint="GST percentage charged on top of the price. Blank = untaxed."
      />
    </div>
  );

  return (
    <>
      <PageHeader
        title="Services"
        description="The priced catalogue — consultations, procedures, investigations and packages — that bills draw from."
        actions={
          <Can perm={PERMISSIONS.BILLING_SERVICES_MANAGE}>
            <BulkImportAction moduleKey="services" onImported={() => void load()} />
            <Button onClick={startCreate}>
              <Plus size={16} strokeWidth={2} /> Add service
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyMessage="No services yet."
        emptyDescription="Add the hospital's priced services and packages so invoices can be raised from the catalogue."
        emptyAction={
          <Can perm={PERMISSIONS.BILLING_SERVICES_MANAGE}>
            <Button size="sm" onClick={startCreate}>
              <Plus size={16} strokeWidth={2} /> Add service
            </Button>
          </Can>
        }
        searchPlaceholder="Search services…"
        pagination={{ pageSize: 20 }}
      />

      <Dialog
        open={open}
        onClose={() => !savingForm && setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add service'}
        description={
          editing
            ? undefined
            : 'Adds a priced item to the catalogue. New bills pick it up immediately.'
        }
        size="lg"
        busy={savingForm}
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              type="button"
              disabled={savingForm}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="service-form" loading={savingForm}>
              {editing ? 'Save changes' : 'Add service'}
            </Button>
          </div>
        }
      >
        <form id="service-form" onSubmit={submitForm} className="flex flex-col gap-4">
          {formError && <p className="text-sm text-danger">{formError}</p>}
          {formFields}
        </form>
      </Dialog>
    </>
  );
}

export default function ServicesPage() {
  return (
    <RequirePermission perm={PERMISSIONS.BILLING_SERVICES_VIEW}>
      <ServicesTable />
    </RequirePermission>
  );
}
