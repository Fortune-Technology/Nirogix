"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Dialog, Field } from "@hms/ui";

/**
 * The edit surface for a **simple** record (ADR-060).
 *
 * A dialog is the right shape when a record is a handful of fields and correcting one
 * shouldn't cost the user their place in the list — a branch's name, a department's
 * name. A record with sections, relationships or clinical content gets a page instead;
 * that judgement is made per table, not per developer.
 *
 * Fields are declared, not hand-built, so every edit dialog validates the same way,
 * reports failures through the shared toast (ADR-026), and disables Save until
 * something has actually changed.
 */

export type EditField<T> = {
  key: keyof T & string;
  label: string;
  hint?: string;
  required?: boolean;
  /** Blocks Save and shows the message under the field. */
  validate?: (value: string) => string | null;
};

export function EditRecordDialog<T extends object>({
  open,
  record,
  title,
  description,
  fields,
  onSave,
  onClose,
}: {
  open: boolean;
  /** The row being corrected. `null` closes the dialog. */
  record: T | null;
  title: string;
  description?: string;
  fields: Array<EditField<T>>;
  /** Only the changed fields are passed — a partial update never blanks what wasn't shown. */
  onSave: (patch: Partial<Record<string, string>>) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Re-seed whenever a different row is opened, so the dialog never shows the
  // previous record's values for the half-second before it is filled.
  useEffect(() => {
    if (!record) return;
    const next: Record<string, string> = {};
    const source = record as Record<string, unknown>;
    for (const f of fields) next[f.key] = String(source[f.key] ?? "");
    setValues(next);
    setErrors({});
    // `fields` is a module-level constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  if (!record) return null;

  const original = (key: string) => String((record as Record<string, unknown>)[key] ?? "");
  const changed = fields.filter((f) => values[f.key] !== original(f.key));

  function validate(): boolean {
    const found: Record<string, string> = {};
    for (const f of fields) {
      const value = (values[f.key] ?? "").trim();
      if (f.required && !value) found[f.key] = `${f.label} is required.`;
      else if (f.validate) {
        const message = f.validate(value);
        if (message) found[f.key] = message;
      }
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      // Only what the user actually altered. The server treats an omitted field as
      // "leave it alone", so a dialog can never blank a column it does not show.
      const patch: Record<string, string> = {};
      for (const f of changed) patch[f.key] = (values[f.key] ?? "").trim();
      await onSave(patch);
      onClose();
    } catch {
      /* reported by the shared API-feedback layer (ADR-026) */
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      busy={saving}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="hms-edit-record" loading={saving} disabled={changed.length === 0}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="hms-edit-record" onSubmit={save} className="flex flex-col gap-4">
        {fields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            hint={f.hint}
            error={errors[f.key]}
            required={f.required}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
          />
        ))}
      </form>
    </Dialog>
  );
}
