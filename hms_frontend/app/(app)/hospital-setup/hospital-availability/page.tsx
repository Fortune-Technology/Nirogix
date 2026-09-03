'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Select } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { Branch } from '@hms/types';
import { Check, X } from 'lucide-react';
import * as api from '../../../../lib/api';
import { RequirePermission } from '../../../../components/Can';

// Per-hospital availability (ADR-073). An org configures which of its master items each of its
// hospitals offers. The backend enforces it (the day-to-day pickers/lists filter by branch); this
// screen is where the org sets the config. Departments are absent on purpose — they are natively
// per-branch (they carry their own branch_id).

const ITEM_TYPES: { value: api.AvailabilityItemType; label: string }[] = [
  { value: 'drug', label: 'Medicines' },
  { value: 'lab_test', label: 'Lab tests' },
  { value: 'service', label: 'Services' },
  { value: 'vaccine', label: 'Vaccines' },
];

function AvailabilityManager() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [itemType, setItemType] = useState<api.AvailabilityItemType>('drug');
  const [items, setItems] = useState<api.AvailabilityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingRef, setSavingRef] = useState<string | null>(null);

  useEffect(() => {
    api
      .listBranches()
      .then((b) => {
        setBranches(b);
        if (b[0]) setBranchId(b[0].id);
      })
      .catch(() => setError('Could not load your hospitals.'));
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await api.getAvailabilityItems(branchId, itemType));
    } catch {
      setError('Could not load the items for this hospital.');
    } finally {
      setLoading(false);
    }
  }, [branchId, itemType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(item: api.AvailabilityItem) {
    const next = !item.isAvailable;
    setSavingRef(item.ref);
    try {
      await api.setBranchAvailability({ branchId, itemType, itemRef: item.ref, isAvailable: next });
      setItems((prev) =>
        prev.map((it) => (it.ref === item.ref ? { ...it, isAvailable: next } : it)),
      );
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setSavingRef(null);
    }
  }

  const branchName = branches.find((b) => b.id === branchId)?.name ?? '';
  const typeLabel = ITEM_TYPES.find((t) => t.value === itemType)?.label ?? '';

  return (
    <div className="flex flex-col gap-4">
      <Card header="Per-hospital availability">
        <p className="mb-4 text-sm text-fg-muted">
          Choose which of your organisation&apos;s items each hospital offers. Turning an item off
          here removes it from that hospital&apos;s pickers only. Every other hospital, and your
          existing records, are unaffected.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Neither is clearable: this screen is always looking at ONE hospital and ONE kind
              of item, so an empty state here would show a table of nothing. */}
          <Select
            label="Hospital"
            value={branchId}
            onChange={(v) => v && setBranchId(v)}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            emptyMessage="No hospitals defined."
          />
          <Select
            label="Item type"
            value={itemType}
            onChange={(v) => v && setItemType(v as api.AvailabilityItemType)}
            options={ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
        </div>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card header={branchName ? `${branchName}: ${typeLabel}` : 'Items'}>
        {loading ? (
          <p className="text-sm text-fg-subtle">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            No items of this type yet. Add them in the relevant catalogue first.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <li key={item.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{item.name}</span>
                  {item.detail && (
                    <span className="block truncate text-xs text-fg-subtle">{item.detail}</span>
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={item.isAvailable ? 'secondary' : 'ghost'}
                  loading={savingRef === item.ref}
                  onClick={() => void toggle(item)}
                  aria-pressed={item.isAvailable}
                >
                  {item.isAvailable ? (
                    <>
                      <Check size={15} strokeWidth={2} aria-hidden /> Offered here
                    </>
                  ) : (
                    <>
                      <X size={15} strokeWidth={2} aria-hidden /> Not offered
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function AvailabilityPage() {
  return (
    <RequirePermission perm={PERMISSIONS.CATALOG_AVAILABILITY_MANAGE}>
      <AvailabilityManager />
    </RequirePermission>
  );
}
