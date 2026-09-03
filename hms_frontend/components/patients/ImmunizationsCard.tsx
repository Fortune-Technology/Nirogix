'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, DateDisplay, DateField, Dialog, Field, Textarea } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import { todayApiDate } from '@hms/utils';
import { Plus, Syringe } from 'lucide-react';
import * as api from '../../lib/api';
import { CatalogPicker } from '../catalog/CatalogPicker';
import { useCan } from '../../lib/auth';

// Patient immunisations (ADR-072 consumer) — the concrete home of the vaccine catalogue. Lists what
// a patient has had, and records a new one by picking from the predefined India schedule (or a
// hospital-specific custom vaccine) through the shared CatalogPicker.

export function ImmunizationsCard({ patientId }: { patientId: string }) {
  const canManage = useCan(PERMISSIONS.IMMUNIZATION_MANAGE);
  const [rows, setRows] = useState<api.Immunization[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listImmunizations(patientId)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card
      header={
        <div className="flex items-center justify-between gap-2">
          <span>Immunisations</span>
          {canManage && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={15} strokeWidth={2} aria-hidden /> Record
            </Button>
          )}
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-fg-subtle">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-subtle">No immunisations recorded yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-sm">
              <Syringe size={15} aria-hidden className="text-fg-subtle" />
              <span className="font-medium text-fg">{r.vaccineName}</span>
              {r.source === 'custom' && <Badge tone="brand">Custom</Badge>}
              {r.doseLabel && <span className="text-xs text-fg-muted">{r.doseLabel}</span>}
              <span className="ml-auto text-xs text-fg-subtle">
                <DateDisplay value={r.dateGiven} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <RecordImmunizationDialog
          patientId={patientId}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

function RecordImmunizationDialog({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<api.CatalogItem | null>(null);
  const [date, setDate] = useState<string>(todayApiDate());
  const [dose, setDose] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [customName, setCustomName] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  async function save() {
    if (!picked) return;
    setBusy(true);
    try {
      await api.recordImmunization(patientId, {
        vaccineCode: picked.code,
        vaccineName: picked.name,
        source: picked.source,
        dateGiven: date,
        doseLabel: dose.trim() || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
    }
  }

  async function addCustom() {
    if (customName.trim().length < 2) return;
    setAddingCustom(true);
    try {
      const item = await api.createCustomVaccine(customName.trim());
      setPicked(item);
      setCustomName('');
      setPickerKey((k) => k + 1); // so the picker reloads with the new item if reopened
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setAddingCustom(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Record immunisation"
      size="md"
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!picked} onClick={save}>
            Record
          </Button>
        </>
      }
    >
      {!picked ? (
        <CatalogPicker
          key={pickerKey}
          category="vaccine"
          onPick={setPicked}
          footer={
            <div className="border-t border-border pt-3">
              <span className="mb-1.5 block text-xs text-fg-subtle">
                Not in the list? Add a custom vaccine.
              </span>
              <div className="flex gap-2">
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Custom vaccine name"
                  aria-label="Custom vaccine name"
                  className="min-w-0 flex-1 rounded-token border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={addingCustom}
                  onClick={addCustom}
                >
                  Add
                </Button>
              </div>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-token border border-border bg-surface-2 px-3 py-2 text-sm">
            <Syringe size={15} aria-hidden className="text-fg-subtle" />
            <span className="font-medium text-fg">{picked.name}</span>
            {picked.source === 'custom' && <Badge tone="brand">Custom</Badge>}
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="ml-auto text-xs font-medium text-brand"
            >
              Change
            </button>
          </div>
          <DateField
            label="Date given"
            value={date || null}
            max={todayApiDate()}
            onChange={(v) => setDate(v ?? '')}
            required
          />
          <Field
            label="Dose (optional)"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            placeholder="e.g. 1st dose, Booster"
          />
          <Textarea
            label="Notes (optional)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}
    </Dialog>
  );
}
