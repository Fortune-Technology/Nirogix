"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { Badge, Button, Card, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import * as api from "../../../lib/api";

// Read-only preview of the platform's central email catalogue (backend
// notification/email/email-templates.ts). Every template renders from its own realistic sample
// data, so an operator or developer can verify the design and copy without triggering the business
// action that would send it. No tenant data is ever involved.

const CATEGORY_LABELS: Record<string, string> = {
  auth: "Authentication",
  onboarding: "Onboarding",
  appointment: "Appointments",
  billing: "Billing",
  laboratory: "Laboratory",
  patient: "Patient",
};

function EmailTemplates() {
  const [templates, setTemplates] = useState<api.EmailTemplateSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<api.EmailTemplatePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const rows = await api.listEmailTemplates();
      setTemplates(rows);
      setListError(null);
      setSelected((prev) => prev ?? rows[0]?.key ?? null);
    } catch (e) {
      setListError(e instanceof api.ApiRequestError ? e.message : "Failed to load email templates.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);
    api
      .previewEmailTemplate(selected)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((e) => {
        if (!cancelled) setPreviewError(e instanceof api.ApiRequestError ? e.message : "Failed to render the template.");
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const grouped = useMemo(() => {
    const by = new Map<string, api.EmailTemplateSummary[]>();
    for (const t of templates) {
      const arr = by.get(t.category);
      if (arr) arr.push(t);
      else by.set(t.category, [t]);
    }
    return [...by.entries()];
  }, [templates]);

  const current = templates.find((t) => t.key === selected) ?? null;

  return (
    <>
      <PageHeader
        title="Email templates"
        description="Preview every email Nirogix can send, rendered from realistic sample data. Read-only — no email is sent and no tenant data is used."
      />

      {loadingList ? (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner /> Loading templates…
        </div>
      ) : listError ? (
        <Card>
          <p className="text-sm text-danger">{listError}</p>
          <div className="mt-3">
            <Button variant="secondary" onClick={() => void loadList()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
          {/* Master: the catalogue, grouped by category. */}
          <div className="flex flex-col gap-5">
            {grouped.map(([category, items]) => (
              <Card key={category} header={CATEGORY_LABELS[category] ?? category}>
                <ul className="flex flex-col gap-1">
                  {items.map((t) => {
                    const active = t.key === selected;
                    return (
                      <li key={t.key}>
                        <button
                          type="button"
                          onClick={() => setSelected(t.key)}
                          aria-current={active}
                          className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            active ? "bg-brand-subtle text-fg" : "text-fg-muted hover:bg-surface-muted hover:text-fg"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Mail size={14} strokeWidth={1.75} aria-hidden className={active ? "text-brand" : ""} />
                            <span className="font-medium">{t.name}</span>
                          </span>
                          <span className="mt-0.5 block text-xs text-fg-subtle">{t.description}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>

          {/* Detail: subject + rendered email. */}
          <Card
            header={
              <span className="flex flex-wrap items-center gap-2">
                {current ? current.name : "Preview"}
                {current ? <Badge>{CATEGORY_LABELS[current.category] ?? current.category}</Badge> : null}
              </span>
            }
          >
            {loadingPreview ? (
              <div className="flex items-center gap-2 text-sm text-fg-muted">
                <Spinner /> Rendering…
              </div>
            ) : previewError ? (
              <p className="text-sm text-danger">{previewError}</p>
            ) : preview ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-border bg-surface-muted px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-fg-subtle">Subject</div>
                  <div className="text-sm font-medium text-fg">{preview.subject}</div>
                </div>
                <div className="text-xs text-fg-subtle">
                  Template key: <code className="font-mono">{preview.key}</code>
                </div>
                <iframe
                  title={`Preview of ${current?.name ?? preview.key}`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="h-[640px] w-full rounded-md border border-border bg-white"
                />
              </div>
            ) : (
              <p className="text-sm text-fg-muted">Select a template to preview it.</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

export default function EmailTemplatesPage() {
  return (
    <RequirePermission perm={PERMISSIONS.TENANTS_MANAGE}>
      <EmailTemplates />
    </RequirePermission>
  );
}
