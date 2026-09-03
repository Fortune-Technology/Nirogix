'use client';

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Alert, Button, Card, Spinner } from '@hms/ui';
import type { BrandingTokens, PlatformBrandingScope } from '@hms/types';
import * as api from '../lib/api';

// The theme-safe brand family. Neutral surfaces (background/surface/foreground/border)
// are theme-managed for Light/Dark legibility, so they are not exposed here.
const FIELDS: { key: keyof BrandingTokens; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'buttonBg', label: 'Button background' },
  { key: 'buttonFg', label: 'Button text' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

// One independent branding scope (marketing or hms). Editing one never touches the other
// (ADR-024) — they are separate rows and separate token seams.
export function PlatformBrandingPanel({
  scope,
  title,
  description,
}: {
  scope: PlatformBrandingScope;
  title: string;
  description: string;
}) {
  const [tokens, setTokens] = useState<BrandingTokens>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await api.getPlatformBranding(scope);
      setTokens(b.tokens ?? {});
    } catch {
      setTokens({});
    }
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(key: keyof BrandingTokens, value: string) {
    setTokens((t) => {
      const next = { ...t };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    // keep only valid hex values
    const clean: BrandingTokens = {};
    for (const { key } of FIELDS) {
      const v = tokens[key];
      if (v && HEX.test(v)) clean[key] = v;
    }
    try {
      const b = await api.updatePlatformBranding(scope, clean);
      setTokens(b.tokens ?? {});
      setMsg({ tone: 'success', text: 'Branding saved.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message || 'Save failed.' });
    }
    setSaving(false);
  }

  async function reset() {
    setSaving(true);
    setMsg(null);
    try {
      const b = await api.resetPlatformBranding(scope);
      setTokens(b.tokens ?? {});
      setMsg({ tone: 'success', text: 'Reset to defaults.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as Error).message || 'Reset failed.' });
    }
    setSaving(false);
  }

  return (
    <Card
      header={
        <div>
          <div>{title}</div>
          <p className="mt-0.5 text-sm font-normal text-fg-muted">{description}</p>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-fg-muted">
          <Spinner /> Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {FIELDS.map(({ key, label }) => {
              const value = tokens[key] ?? '';
              return (
                <label key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-fg">{label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => setField(key, e.target.value.trim())}
                      placeholder="default"
                      spellCheck={false}
                      className="hms-input w-24 font-mono !text-xs"
                    />
                    <input
                      type="color"
                      aria-label={`${label} colour`}
                      value={HEX.test(value) ? value : '#888888'}
                      onChange={(e) => setField(key, e.target.value)}
                      className="h-8 w-9 cursor-pointer rounded-token border border-border bg-surface p-0.5"
                    />
                    {value && (
                      <button
                        type="button"
                        title="Clear"
                        onClick={() => setField(key, '')}
                        className="text-fg-subtle hover:text-fg"
                      >
                        <RotateCcw size={14} strokeWidth={2} />
                      </button>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {/* live preview — neutrals come from the current theme; the brand family previews */}
          <div className="rounded-token-lg border border-border bg-bg p-4">
            <div className="rounded-token border border-border bg-surface p-4">
              <div className="text-sm font-semibold text-fg">Preview</div>
              <div className="mt-1 text-xs text-fg-muted">
                The primary button on the current theme&apos;s surface.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-token px-3 py-1.5 text-sm font-medium"
                  style={{
                    background: tokens.buttonBg ?? tokens.primary ?? 'var(--hms-brand)',
                    color: tokens.buttonFg ?? 'var(--hms-brand-fg)',
                  }}
                >
                  Primary button
                </button>
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    background:
                      'color-mix(in srgb, ' +
                      (tokens.secondary ?? tokens.primary ?? 'var(--hms-brand)') +
                      ' 14%, var(--hms-surface))',
                    color: tokens.secondary ?? tokens.primary ?? 'var(--hms-brand)',
                  }}
                >
                  Secondary
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} loading={saving}>
              Save
            </Button>
            <Button variant="secondary" onClick={reset} disabled={saving}>
              Reset to defaults
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
