'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  EditAction,
  Field,
  Select,
  ToggleAction,
  TableActions,
  actionsColumn,
  type Column,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type {
  ArrivalType,
  ConsultationFeeRule,
  Department,
  HospitalWorkflowConfig,
  Provider,
} from '@hms/types';
import * as api from '../../../../lib/api';
import { RequirePermission } from '../../../../components/Can';
import { useCan } from '../../../../lib/auth';
import { formatPaise, rupeesToPaise } from '../../../../lib/money';

/**
 * The consultation price list (ADR-117).
 *
 * The screen's real job is making the **resolution order** legible. A hospital writing "cardiology
 * is ₹600" and also "Dr Sharma is ₹800" needs to see, without reading documentation, which of the
 * two a patient of Dr Sharma's in cardiology will be charged. So rules are listed most-specific
 * first — the order the server applies them — and each row says what it matches on.
 *
 * An empty list is not an error state: a hospital with no rules falls back to each doctor's own
 * configured fee, which is exactly what the product did before this screen existed.
 *
 * **Consultation type and case type only appear once the hospital has defined them** (ADR-121).
 * Showing two empty dropdowns to a hospital that prices by doctor alone would be two more things
 * to not understand; the screen says where to define them instead.
 */

const ARRIVAL_LABEL: Record<string, string> = {
  walk_in: 'Walk-in',
  appointment: 'First visit',
  follow_up: 'Follow-up',
};

const ANY = '__any__';

function FeeSchedule() {
  const canManage = useCan(PERMISSIONS.BILLING_FEE_RULES_MANAGE);

  const [rules, setRules] = useState<ConsultationFeeRule[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workflow, setWorkflow] = useState<HospitalWorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const [adding, setAdding] = useState(false);
  const [providerId, setProviderId] = useState(ANY);
  const [departmentId, setDepartmentId] = useState(ANY);
  const [arrivalType, setArrivalType] = useState(ANY);
  const [consultationType, setConsultationType] = useState(ANY);
  const [caseType, setCaseType] = useState(ANY);
  const [feeRupees, setFeeRupees] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ConsultationFeeRule | null>(null);
  const [editFee, setEditFee] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p, d, w] = await Promise.all([
        api.listFeeRules(showRetired),
        api.listProviders(),
        api.listDepartments({ activeOnly: true }),
        // The hospital's own vocabularies. Without them there are no type dimensions to price on.
        api.getWorkflowConfig(),
      ]);
      setRules(r);
      setProviders(p);
      setDepartments(d);
      setWorkflow(w);
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not load the fee schedule.');
    } finally {
      setLoading(false);
    }
  }, [showRetired]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerOptions = useMemo(
    () => [
      { value: ANY, label: 'Any doctor' },
      ...providers
        .filter((p) => p.isActive)
        .map((p) => ({ value: p.id, label: p.fullName, keywords: p.specialties.join(' ') })),
    ],
    [providers],
  );

  const departmentOptions = useMemo(
    () => [
      { value: ANY, label: 'Any department' },
      ...departments.map((d) => ({ value: d.id, label: d.name })),
    ],
    [departments],
  );

  const consultationTypes = workflow?.consultationTypes ?? [];
  const caseTypes = workflow?.caseTypes ?? [];

  async function add() {
    const fee = Number(feeRupees);
    if (!Number.isFinite(fee) || fee < 0) {
      setAddError('Enter a valid fee.');
      return;
    }
    setSaving(true);
    setAddError(null);
    try {
      await api.createFeeRule({
        providerId: providerId === ANY ? undefined : providerId,
        departmentId: departmentId === ANY ? undefined : departmentId,
        arrivalType: arrivalType === ANY ? undefined : (arrivalType as ArrivalType),
        consultationType: consultationType === ANY ? undefined : consultationType,
        caseType: caseType === ANY ? undefined : caseType,
        feePaise: rupeesToPaise(fee),
        label: label.trim() || undefined,
      });
      setAdding(false);
      setProviderId(ANY);
      setDepartmentId(ANY);
      setArrivalType(ANY);
      setConsultationType(ANY);
      setCaseType(ANY);
      setFeeRupees('');
      setLabel('');
      await load();
    } catch (e) {
      setAddError(e instanceof api.ApiRequestError ? e.message : 'Could not add the rule.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const fee = Number(editFee);
    if (!Number.isFinite(fee) || fee < 0) return;
    setSaving(true);
    try {
      await api.updateFeeRule(editing.id, {
        version: editing.version,
        feePaise: rupeesToPaise(fee),
      });
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: ConsultationFeeRule) {
    await api.updateFeeRule(rule.id, { version: rule.version, isActive: !rule.isActive });
    await load();
  }

  const columns: Array<Column<ConsultationFeeRule>> = [
    {
      key: 'applies',
      header: 'Applies to',
      hideable: false,
      accessor: (r) =>
        `${r.providerName ?? ''} ${r.departmentName ?? ''} ${r.arrivalType ?? ''} ${r.consultationType ?? ''} ${r.caseType ?? ''}`,
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={r.providerName ? 'brand' : 'neutral'}>
              {r.providerName ?? 'Any doctor'}
            </Badge>
            <Badge tone={r.departmentName ? 'brand' : 'neutral'}>
              {r.departmentName ?? 'Any department'}
            </Badge>
            <Badge tone={r.arrivalType ? 'brand' : 'neutral'}>
              {r.arrivalType ? ARRIVAL_LABEL[r.arrivalType] : 'Any visit type'}
            </Badge>
            {/* Only shown when set: a row of four "Any …" badges says nothing and hides the one
                dimension that actually narrows this rule. */}
            {r.consultationType && <Badge tone="brand">{r.consultationType}</Badge>}
            {r.caseType && <Badge tone="brand">{r.caseType}</Badge>}
          </div>
          {r.label && <span className="text-xs text-fg-muted">{r.label}</span>}
        </div>
      ),
    },
    {
      key: 'fee',
      header: 'Fee',
      accessor: (r) => r.feePaise,
      cell: (r) => <span className="font-medium text-fg">{formatPaise(r.feePaise)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      accessor: (r) => (r.isActive ? 'Active' : 'Retired'),
      cell: (r) => (
        <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Retired'}</Badge>
      ),
    },
    actionsColumn<ConsultationFeeRule>((r) => (
      <TableActions label={`Actions for this rule`}>
        <EditAction
          label="Change fee"
          permitted={canManage}
          onSelect={() => {
            setEditing(r);
            setEditFee(String(r.feePaise / 100));
          }}
        />
        <ToggleAction
          on={r.isActive}
          permitted={canManage}
          onLabel="Retire rule"
          offLabel="Reinstate rule"
          confirm={{
            title: r.isActive ? 'Retire this rule?' : 'Reinstate this rule?',
            description: r.isActive
              ? 'It stops applying to new check-ins. Invoices it already priced are untouched — a retired rule is kept because it explains them.'
              : 'It will apply to new check-ins again.',
          }}
          onToggle={() => void toggle(r)}
        />
      </TableActions>
    )),
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card header="How a fee is decided">
        <p className="text-sm text-fg-muted">
          A rule can name a <strong className="font-medium text-fg">doctor</strong>, a{' '}
          <strong className="font-medium text-fg">department</strong>, a{' '}
          <strong className="font-medium text-fg">case type</strong>, a{' '}
          <strong className="font-medium text-fg">consultation type</strong>, a{' '}
          <strong className="font-medium text-fg">visit type</strong>, or any combination. Leaving
          one as &ldquo;any&rdquo; makes the rule broader. When several rules match, the{' '}
          <strong className="font-medium text-fg">most specific wins</strong> — a named doctor beats
          a department, which beats a case type, which beats a consultation type, which beats a
          blanket visit-type rate. Rules are listed below in that order.
        </p>
        {consultationTypes.length === 0 && caseTypes.length === 0 && (
          <p className="mt-3 text-sm text-fg-muted">
            Consultation types (teleconsultation, procedure, review…) and case types (corporate,
            insurance, camp…) are your own words, and you have not defined any yet. Add them under{' '}
            <strong className="font-medium text-fg">Hospital setup → Workflow</strong> and they
            become available here and on the check-in form.
          </p>
        )}
        <p className="mt-3 text-sm text-fg-muted">
          Where nothing matches, the doctor&rsquo;s own configured fee applies, and then ₹0. A
          hospital that adds no rules here keeps behaving exactly as it does today.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
          />
          Show retired rules
        </label>
        {canManage && (
          <Button type="button" onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={2} /> Add a rule
          </Button>
        )}
      </div>

      {!loading && rules.length === 0 ? (
        <Card>
          <EmptyState
            title="No fee rules yet"
            description="Every consultation is charged the doctor's own configured fee. Add a rule to charge differently by department, by visit type, or for a particular doctor."
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={rules}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="No fee rules."
        />
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a fee rule"
        description="Leave a field as “any” to make the rule broader."
        busy={saving}
        footer={
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setAdding(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={saving}
              onClick={() => void add()}
              disabled={!feeRupees.trim()}
            >
              Add rule
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {addError && <Alert tone="danger">{addError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Doctor"
              value={providerId}
              onChange={setProviderId}
              options={providerOptions}
            />
            <Select
              label="Department"
              value={departmentId}
              onChange={setDepartmentId}
              options={departmentOptions}
            />
            <Select
              label="Visit type"
              value={arrivalType}
              onChange={setArrivalType}
              searchable={false}
              options={[
                { value: ANY, label: 'Any visit type' },
                { value: 'walk_in', label: 'Walk-in' },
                { value: 'appointment', label: 'First visit' },
                { value: 'follow_up', label: 'Follow-up' },
              ]}
            />
            {/* Both are hidden until the hospital has a vocabulary — an empty dropdown is a dead end. */}
            {caseTypes.length > 0 && (
              <Select
                label="Case type"
                value={caseType}
                onChange={setCaseType}
                searchable={false}
                hint="Beats consultation type when both match."
                options={[
                  { value: ANY, label: 'Any case type' },
                  ...caseTypes.map((t) => ({ value: t, label: t })),
                ]}
              />
            )}
            {consultationTypes.length > 0 && (
              <Select
                label="Consultation type"
                value={consultationType}
                onChange={setConsultationType}
                searchable={false}
                options={[
                  { value: ANY, label: 'Any consultation type' },
                  ...consultationTypes.map((t) => ({ value: t, label: t })),
                ]}
              />
            )}
            <Field
              label="Fee (₹)"
              type="number"
              min={0}
              step="0.01"
              value={feeRupees}
              onChange={(e) => setFeeRupees(e.target.value)}
              hint="₹0 is allowed — a free follow-up is a real policy."
            />
          </div>
          <Field
            label="Label"
            value={label}
            maxLength={200}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Senior consultant rate, Camp pricing…"
            hint="Optional, for your own reference. Shown on this screen only."
          />
        </div>
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Change this fee"
        description="What a rule matches on cannot be edited — retire it and add another, so the old rule still explains the invoices it priced."
        busy={saving}
        footer={
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" loading={saving} onClick={() => void saveEdit()}>
              Save fee
            </Button>
          </>
        }
      >
        <Field
          label="Fee (₹)"
          type="number"
          min={0}
          step="0.01"
          autoFocus
          value={editFee}
          onChange={(e) => setEditFee(e.target.value)}
        />
      </Dialog>
    </div>
  );
}

export default function FeeSchedulePage() {
  return (
    <RequirePermission perm={PERMISSIONS.BILLING_FEE_RULES_VIEW}>
      <FeeSchedule />
    </RequirePermission>
  );
}
