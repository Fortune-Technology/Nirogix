"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, emptyLabel, Field, PhoneField, Spinner } from "@hms/ui";
import { formatDate } from "@hms/utils";
import { PERMISSIONS } from "@hms/permissions";
import type { AbdmCapabilities, AbdmPendingShare, AbhaIdentifierType, AbhaPrefill, AbhaVerificationResult } from "@hms/types";
import * as api from "../../lib/api";
import { useQrDataUrl } from "../../lib/useQrDataUrl";
import { Can } from "../Can";

/**
 * The ABHA address policy, quoted from NHA's M1 workbook (`CRT_ABHA_112`).
 *
 * The case requires the rules to be enforced *"at the API level"* **and** *"print[ed] beside the
 * field where ABHA Address is entered"*. The enforcing copy lives in the backend's
 * `abdm.schema.ts` and is the only one that decides anything; this copy exists because the two
 * share no contract package, and because a rule the operator cannot read is a rule they will
 * break three times before guessing it. Keep the two in step.
 */
const ABHA_ADDRESS_POLICY =
  "Between 8 and 18 characters. Letters and numbers, with at most one dot and one underscore, and neither at the start nor the end.";

/** Applies the policy to the part before any `@`, so ABDM's own qualified suggestions still pass. */
function abhaAddressError(value: string): string | undefined {
  const local = (value.split("@")[0] ?? "").trim();
  if (local.length < 8) return "At least 8 characters.";
  if (local.length > 18) return "At most 18 characters.";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._]*[a-zA-Z0-9]$/.test(local)) {
    return "Letters and numbers only, and it must start and end with one.";
  }
  if ((local.match(/\./g) ?? []).length > 1) return "At most one dot.";
  if ((local.match(/_/g) ?? []).length > 1) return "At most one underscore.";
  return undefined;
}

/**
 * ABHA verification at the registration desk — ABDM Milestone 1 (ADR-084).
 *
 * Three ways to the same place: a verified ABDM profile, reviewed by the operator, used to fill
 * the ordinary registration form. The panel never registers anyone. It hands a prefill and a
 * transaction id back to the form, which submits through the normal patient endpoint and then
 * links the ABHA — so the manual form stays exactly as it was, and a hospital that skips ABDM
 * entirely loses nothing.
 *
 * **Scan and Share leads** because it is the only flow with no OTP in it: the patient scans the
 * hospital's QR in their own ABHA app and their profile arrives here. The other two exist for the
 * patient who does not have the app open, or does not have an ABHA at all.
 *
 * Every failure ends in the same place — the operator closes the panel and types the form. That
 * is the design, not a fallback bolted on: ABDM is unreachable often enough (sandbox limits,
 * NHA maintenance, a patient with no Aadhaar) that a registration desk cannot depend on it.
 */

type Mode = "scan" | "aadhaar" | "verify";

export interface AbhaVerificationPanelProps {
  /** Called when the operator accepts a verified profile for the form. */
  onUseDetails: (prefill: AbhaPrefill, transactionId: string) => void;
  branchId?: string;
}

const IDENTIFIER_LABELS: Record<AbhaIdentifierType, string> = {
  abha_number: "ABHA number",
  abha_address: "ABHA address",
  mobile: "Mobile number",
  aadhaar: "Aadhaar number",
};

/**
 * Everything ABDM has said about this person so far, the newest answer winning per field
 * (ADR-130).
 *
 * A step that omits a field has said nothing about it, which is not the same as saying the person
 * has no name — so an absent, null or blank value never overwrites one an earlier step supplied.
 */
function mergePrefill(known: AbhaPrefill, incoming: AbhaPrefill): AbhaPrefill {
  const merged: Record<string, unknown> = { ...known };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    merged[key] = value;
  }
  return merged as AbhaPrefill;
}

export function AbhaVerificationPanel({ onUseDetails, branchId }: AbhaVerificationPanelProps) {
  const [capabilities, setCapabilities] = useState<AbdmCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("scan");
  const [result, setResult] = useState<AbhaVerificationResult | null>(null);
  /**
   * The same value, readable synchronously. `handleVerified` has to merge the incoming step onto
   * what is already known *and* hand the merged result to `accept` in the same tick, which a
   * functional `setState` cannot give back.
   */
  const latest = useRef<AbhaVerificationResult | null>(null);
  /** Whether this verification has already been written into the registration form. */
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api
      .getAbdmCapabilities(branchId)
      .then((c) => {
        if (!alive) return;
        setCapabilities(c);
        // Scan and Share leads only when it can actually work. Offering a QR the hospital has
        // not registered would be a control that silently does nothing.
        setMode(c.scanShareEnabled ? "scan" : "verify");
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branchId]);

  const accept = useCallback(
    (r: AbhaVerificationResult) => {
      onUseDetails(r.prefill, r.transactionId);
      setApplied(true);
    },
    [onUseDetails],
  );

  /**
   * Fills the form the moment a verification lands, so the desk's remaining job is to press
   * Register — which is the entire point of the feature.
   *
   * **Except when the patient may already be registered here.** A `returning` or `ambiguous` match
   * still stops and asks, because auto-filling there would put a second chart for the same person
   * one button away, and a duplicated clinical record is far more expensive to undo than a click.
   * So the shortcut applies exactly where it is safe: a patient this hospital has not seen before.
   */
  const handleVerified = useCallback(
    (r: AbhaVerificationResult) => {
      // Merge, never replace (ADR-130). A verification is several calls and each answers a
      // different amount: the Aadhaar step returns the whole demographic record, the mobile OTP
      // that follows it returns almost nothing, and picking an ABHA from a list returns a token.
      // Taking the newest response wholesale is what turned a filled card into "Unnamed · Not
      // specified · DOB unknown · no phone" on the final step. The server merges as well; this is
      // the same rule where the screen keeps its own copy, so a step that says nothing about a
      // field cannot unsay what an earlier one established.
      const merged: AbhaVerificationResult = latest.current
        ? { ...r, prefill: mergePrefill(latest.current.prefill, r.prefill) }
        : r;
      latest.current = merged;
      setResult(merged);
      if (merged.match.outcome === "new" && merged.prefill.abhaNumber) accept(merged);
    },
    [accept],
  );

  if (loading) {
    return (
      <Card header="ABHA (ABDM)">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner /> Checking what ABDM can do for this hospital…
        </div>
      </Card>
    );
  }

  // The module is entitled but nothing is usable — say so plainly instead of showing dead controls.
  if (!capabilities) return null;

  return (
    <Card header="ABHA (ABDM)">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">
          Verify the patient&apos;s ABHA to fill this form. Every field stays editable, and you can ignore this and type the
          form as usual.
        </p>
        {capabilities.provider === "mock" && (
          <Alert tone="neutral">
            <strong>Test mode.</strong> No ABDM calls are made and no real ABHA is created. The OTP is <code>123456</code>.
          </Alert>
        )}
        {!capabilities.encryptionConfigured && (
          <Alert tone="danger">
            Encryption is not configured on the server, so ABDM tokens cannot be stored. Verification still works; linking for
            future record sharing does not.
          </Alert>
        )}

        <nav className="flex flex-wrap gap-2" aria-label="ABHA verification method">
          <ModeTab active={mode === "scan"} onClick={() => setMode("scan")} disabled={!capabilities.scanShareEnabled}>
            Scan &amp; Share
            <Badge tone="brand">Fastest</Badge>
          </ModeTab>
          <ModeTab active={mode === "verify"} onClick={() => setMode("verify")}>
            Patient has an ABHA
          </ModeTab>
          <ModeTab active={mode === "aadhaar"} onClick={() => setMode("aadhaar")}>
            Create a new ABHA
          </ModeTab>
        </nav>

        {error && <Alert tone="danger">{error}</Alert>}

        {result ? (
          <VerifiedProfile
            result={result}
            applied={applied}
            onAccept={accept}
            onUpdated={(r) => {
              latest.current = r;
              setResult(r);
            }}
            onDismiss={() => {
              latest.current = null;
              setResult(null);
              setApplied(false);
            }}
          />
        ) : mode === "scan" ? (
          <ScanAndShare capabilities={capabilities} onPicked={handleVerified} onError={setError} />
        ) : mode === "verify" ? (
          <VerifyExisting branchId={branchId} onVerified={handleVerified} onError={setError} />
        ) : (
          <CreateWithAadhaar branchId={branchId} onVerified={handleVerified} onError={setError} />
        )}
      </div>
    </Card>
  );
}

function ModeTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={disabled ? "This hospital has not registered a facility QR with ABDM yet" : undefined}
      className={[
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        active ? "border-brand bg-brand-subtle text-fg" : "border-border text-fg-muted hover:text-fg",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** The consent gate. The API refuses without it, and this is where the operator records it. */
function ConsentCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-fg-muted">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby="abha-consent-text"
      />
      <span id="abha-consent-text">
        The patient has been told their details will be verified with ABDM, and consents. Required before any OTP is sent.
      </span>
    </label>
  );
}

/** Flow 2 — the patient scans the hospital's QR and their profile arrives here. */
function ScanAndShare({
  capabilities,
  onPicked,
  onError,
}: {
  capabilities: AbdmCapabilities;
  onPicked: (r: AbhaVerificationResult) => void;
  onError: (m: string | null) => void;
}) {
  const [shares, setShares] = useState<AbdmPendingShare[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const qr = useQrDataUrl(capabilities.qrContent ?? null, { size: 512 });

  // Polled rather than pushed: the arrival happens on ABDM's schedule, and a socket for one
  // screen at one desk is not worth the infrastructure. Four seconds is fast enough that the
  // patient is still holding their phone.
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .listAbdmPendingShares()
        .then((rows) => alive && setShares(rows))
        .catch(() => undefined);
    void tick();
    const id = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  async function use(share: AbdmPendingShare) {
    setBusy(share.transactionId);
    onError(null);
    try {
      onPicked(await api.getAbdmVerification(share.transactionId));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load that profile.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-2">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL generated in the browser
          <img src={qr} alt="Scan this code with your ABHA app to share your profile" className="h-48 w-48 rounded-md border border-border bg-white p-2" />
        ) : (
          <div className="flex h-48 w-48 items-center justify-center rounded-md border border-dashed border-border text-sm text-fg-muted">
            No facility QR configured
          </div>
        )}
        <p className="max-w-48 text-center text-xs text-fg-muted">
          {capabilities.facilityName ?? "This hospital"} — ask the patient to scan this in their ABHA app.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-fg">Shared just now</h3>
        {shares.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing yet. Profiles appear here within a few seconds of the patient scanning.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {shares.map((s) => (
              <li key={s.transactionId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium text-fg">
                    {[s.prefill.firstName, s.prefill.lastName].filter(Boolean).join(" ") || "Unnamed"}
                  </span>
                  <p className="text-xs text-fg-muted">
                    {s.abhaAddress ?? s.abhaNumber ?? "no ABHA identifier"}
                    {s.matchOutcome === "returning" ? " · already registered here" : ""}
                  </p>
                </div>
                <Button size="sm" loading={busy === s.transactionId} onClick={() => void use(s)}>
                  Use
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Flow 3 — the patient already holds an ABHA and verifies it with an OTP. */
function VerifyExisting({
  branchId,
  onVerified,
  onError,
}: {
  branchId?: string;
  onVerified: (r: AbhaVerificationResult) => void;
  onError: (m: string | null) => void;
}) {
  const [identifierType, setIdentifierType] = useState<AbhaIdentifierType>("abha_number");
  const [identifier, setIdentifier] = useState("");
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState<{ transactionId: string; mobileHint?: string; devOtp?: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [accounts, setAccounts] = useState<AbhaVerificationResult["accounts"]>(undefined);
  const [txnId, setTxnId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    setBusy(true);
    onError(null);
    try {
      const res = await api.startAbhaVerification({ identifierType, identifier, consentGiven: true, branchId });
      setSent(res);
      setTxnId(res.transactionId);
      setOtp(res.devOtp ?? "");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not send the OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!sent) return;
    setBusy(true);
    onError(null);
    try {
      const res = await api.verifyAbhaIdentifierOtp({ transactionId: sent.transactionId, otp });
      if (res.accounts?.length) setAccounts(res.accounts);
      else onVerified(res);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not verify the OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(abhaNumber: string) {
    if (!txnId) return;
    setBusy(true);
    try {
      onVerified(await api.selectAbhaAccount({ transactionId: txnId, abhaNumber }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load that ABHA.");
    } finally {
      setBusy(false);
    }
  }

  if (accounts?.length) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">Several ABHA accounts use this identifier. Ask the patient which one is theirs.</p>
        <ul className="flex flex-col divide-y divide-border">
          {accounts.map((a) => (
            <li key={a.abhaNumber} className="flex items-center justify-between gap-3 py-2">
              <div>
                <span className="font-medium text-fg">{a.name ?? a.abhaAddress ?? a.abhaNumber}</span>
                <p className="font-mono text-xs text-fg-muted">{a.abhaNumber}</p>
              </div>
              <Button size="sm" loading={busy} onClick={() => void choose(a.abhaNumber)}>
                This one
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="hms-field">
          <span className="hms-label">Verify using</span>
          <select
            className="hms-input"
            value={identifierType}
            onChange={(e) => setIdentifierType(e.target.value as AbhaIdentifierType)}
            disabled={Boolean(sent)}
          >
            {(Object.keys(IDENTIFIER_LABELS) as AbhaIdentifierType[]).map((k) => (
              <option key={k} value={k}>
                {IDENTIFIER_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={IDENTIFIER_LABELS[identifierType]}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          disabled={Boolean(sent)}
          hint={identifierType === "abha_address" ? "For example, ramesh.kumar@abdm" : undefined}
        />
      </div>

      {!sent ? (
        <>
          <ConsentCheckbox checked={consent} onChange={setConsent} />
          <div>
            <Button type="button" loading={busy} disabled={!consent || identifier.trim().length < 3} onClick={() => void sendOtp()}>
              Send OTP
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              autoFocus
              hint={sent.mobileHint ? `Sent to ${sent.mobileHint}` : undefined}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" loading={busy} disabled={otp.length < 4} onClick={() => void verify()}>
              Verify
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSent(null)}>
              Start again
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Flow 1 — the patient has no ABHA; create one from Aadhaar. */
function CreateWithAadhaar({
  branchId,
  onVerified,
  onError,
}: {
  branchId?: string;
  onVerified: (r: AbhaVerificationResult) => void;
  onError: (m: string | null) => void;
}) {
  const [aadhaar, setAadhaar] = useState("");
  const [consent, setConsent] = useState(false);
  const [mobile, setMobile] = useState("");
  const [sent, setSent] = useState<{ transactionId: string; mobileHint?: string; devOtp?: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"aadhaar" | "otp" | "mobileOtp" | "address">("aadhaar");
  const [pending, setPending] = useState<AbhaVerificationResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [chosenAddress, setChosenAddress] = useState("");

  const aadhaarDigits = useMemo(() => aadhaar.replace(/\D/g, ""), [aadhaar]);

  async function sendOtp() {
    setBusy(true);
    onError(null);
    try {
      const res = await api.startAbhaAadhaarOtp({ aadhaar: aadhaarDigits, consentGiven: true, branchId });
      setSent(res);
      setOtp(res.devOtp ?? "");
      setStep("otp");
      // The Aadhaar number is not needed again — the transaction carries the rest of the flow —
      // so it is cleared from the browser as soon as it has been sent.
      setAadhaar("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not send the OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!sent) return;
    setBusy(true);
    onError(null);
    try {
      const res = await api.verifyAbhaAadhaarOtp({
        transactionId: sent.transactionId,
        otp,
        mobile: mobile.replace(/\D/g, "") || undefined,
      });
      if (res.requiresMobileVerification) {
        const otpRes = await api.requestAbhaMobileOtp({ transactionId: res.transactionId, mobile: mobile.replace(/\D/g, "") });
        setSent(otpRes);
        setOtp(otpRes.devOtp ?? "");
        setPending(res);
        setStep("mobileOtp");
        return;
      }
      await afterProfile(res);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not verify the OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyMobile() {
    if (!sent) return;
    setBusy(true);
    onError(null);
    try {
      await afterProfile(await api.verifyAbhaMobileOtp({ transactionId: sent.transactionId, otp }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not verify the mobile OTP.");
    } finally {
      setBusy(false);
    }
  }

  /** A newly created ABHA has no address yet, and ABDM requires one before the flow is complete. */
  async function afterProfile(res: AbhaVerificationResult) {
    if (res.requiresAbhaAddress) {
      setPending(res);
      setStep("address");
      try {
        const { suggestions: list } = await api.suggestAbhaAddresses(res.transactionId);
        setSuggestions(list);
        setChosenAddress(list[0] ?? "");
      } catch {
        // Suggestions are a convenience; the operator can type an address instead.
        setSuggestions([]);
      }
      return;
    }
    onVerified(res);
  }

  async function claimAddress() {
    if (!pending) return;
    setBusy(true);
    onError(null);
    try {
      const created = await api.createAbhaAddress({ transactionId: pending.transactionId, abhaAddress: chosenAddress });
      onVerified({ ...pending, prefill: { ...pending.prefill, abhaAddress: created.abhaAddress } });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create that ABHA address.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "address" && pending) {
    const addressError = abhaAddressError(chosenAddress);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">
          The ABHA was created. Choose the address the patient will use to sign in to their own health records.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="hms-field">
            <span className="hms-label">Suggested addresses</span>
            <select className="hms-input" value={chosenAddress} onChange={(e) => setChosenAddress(e.target.value)}>
              {suggestions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {suggestions.length === 0 && <option value="">No suggestions available</option>}
            </select>
            {/* The registry offers three or more; saying how many arrived is honest when it offers fewer. */}
            <span className="hms-hint">
              {suggestions.length > 0
                ? `${suggestions.length} available from ABDM. Pick one, or type your own.`
                : "ABDM returned no suggestions. Type an address instead."}
            </span>
          </label>
          {/* CRT_ABHA_112 requires the policy to be printed beside this field, not merely enforced. */}
          <Field
            label="Or type one"
            value={chosenAddress}
            error={chosenAddress ? addressError : undefined}
            hint={ABHA_ADDRESS_POLICY}
            onChange={(e) => setChosenAddress(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" loading={busy} disabled={Boolean(addressError)} onClick={() => void claimAddress()}>
            Create ABHA address
          </Button>
          <Button type="button" variant="ghost" onClick={() => onVerified(pending)}>
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "aadhaar" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Aadhaar number"
              value={aadhaar}
              onChange={(e) => setAadhaar(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              hint="Sent to ABDM encrypted, never stored here."
            />
            <PhoneField
              label="Mobile for the record (optional)"
              value={mobile}
              onChange={setMobile}
              hint="Only needed if it differs from the Aadhaar-linked number."
            />
          </div>
          <ConsentCheckbox checked={consent} onChange={setConsent} />
          <div>
            <Button type="button" loading={busy} disabled={!consent || aadhaarDigits.length !== 12} onClick={() => void sendOtp()}>
              Send OTP
            </Button>
          </div>
        </>
      )}

      {(step === "otp" || step === "mobileOtp") && sent && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={step === "mobileOtp" ? "OTP sent to the new mobile" : "OTP"}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              autoFocus
              hint={sent.mobileHint ? `Sent to ${sent.mobileHint}` : undefined}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              loading={busy}
              disabled={otp.length < 4}
              onClick={() => void (step === "mobileOtp" ? verifyMobile() : verify())}
            >
              Verify
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setSent(null); setStep("aadhaar"); }}>
              Start again
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The review step every flow lands on.
 *
 * A demographic match is shown as candidates to confirm, never merged automatically — two people
 * can share a name, a gender and a birth year, and merging the wrong charts is a clinical safety
 * incident rather than a data-quality one.
 */
function VerifiedProfile({
  result,
  applied,
  onAccept,
  onUpdated,
  onDismiss,
}: {
  result: AbhaVerificationResult;
  applied: boolean;
  onAccept: (r: AbhaVerificationResult) => void;
  onUpdated: (r: AbhaVerificationResult) => void;
  onDismiss: () => void;
}) {
  const { prefill, match } = result;
  const name = [prefill.firstName, prefill.lastName].filter(Boolean).join(" ") || "Unnamed";
  // What ABDM did not send, the operator still has to ask for. Naming it beats leaving them to
  // discover an empty required field after they have already told the patient they are done.
  const missing = [
    !prefill.firstName && "name",
    !prefill.gender && "gender",
    !prefill.dateOfBirth && "date of birth",
    !prefill.phone && "phone",
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-fg">{name}</span>
          {result.isNewAbha && <Badge tone="success">New ABHA created</Badge>}
          {match.outcome === "returning" && <Badge tone="warning">Already registered here</Badge>}
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          {prefill.gender ?? emptyLabel("unspecified")} · {prefill.dateOfBirth ? formatDate(prefill.dateOfBirth) : "DOB unknown"} · {prefill.phone ?? "no phone"}
        </p>
        <p className="mt-1 font-mono text-xs text-fg-muted">
          {prefill.abhaNumber ?? "no ABHA number"}
          {prefill.abhaAddress ? ` · ${prefill.abhaAddress}` : ""}
        </p>
      </div>

      {match.candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <Alert tone={match.outcome === "returning" ? "danger" : "neutral"}>
            {match.outcome === "returning"
              ? "This ABHA is already on a chart at this hospital. Open it instead of registering a second one."
              : "These charts look similar. Check with the patient before registering a new one."}
          </Alert>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {match.candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium text-fg">{[c.firstName, c.lastName].filter(Boolean).join(" ")}</span>
                  <span className="ml-2 font-mono text-xs text-fg-muted">{c.uhid}</span>
                  <p className="text-xs text-fg-muted">
                    {c.phone ?? "no phone"} · {c.dateOfBirth ? formatDate(c.dateOfBirth) : "DOB unknown"} ·{" "}
                    {c.reason === "exact_abha" ? "same ABHA number" : "same name, gender and birth year"}
                  </p>
                </div>
                <Link href={`/patients/${c.id}`}>
                  <Button size="sm">Open chart</Button>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Can perm={PERMISSIONS.ABDM_PROFILE_UPDATE}>
        <CorrectAtAbdm result={result} onUpdated={onUpdated} />
      </Can>

      {applied ? (
        <div className="flex flex-col gap-2">
          <Alert tone="success">
            Details filled into the form below.{" "}
            {missing.length > 0
              ? `ABDM did not provide ${missing.join(", ")} — add ${missing.length > 1 ? "those" : "that"}, then press Register patient.`
              : "Check them with the patient and press Register patient."}
          </Alert>
          <div>
            <Button type="button" variant="ghost" onClick={onDismiss}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => onAccept(result)}>
            {match.outcome === "new" ? "Use these details" : "Register as a new patient anyway"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Correcting the patient's record AT ABDM — not ours.
 *
 * Folded away behind a disclosure because it is the rare action, and the destructive-sounding one:
 * it writes to the national identity register, so it is permission-gated (the front desk does not
 * hold the key by default) and the copy says plainly where the change lands. Editing the
 * registration form below changes only this hospital's chart; this changes what ABDM holds.
 */
function CorrectAtAbdm({
  result,
  onUpdated,
}: {
  result: AbhaVerificationResult;
  onUpdated: (r: AbhaVerificationResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastName, setLastName] = useState(result.prefill.lastName ?? "");
  const [address, setAddress] = useState(result.prefill.addressLine ?? "");
  const [pincode, setPincode] = useState(result.prefill.pincode ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Only what the operator actually changed — a PATCH that resends unchanged values would
      // rewrite fields nobody touched, on a national record.
      onUpdated(
        await api.updateAbhaProfile({
          transactionId: result.transactionId,
          lastName: lastName !== (result.prefill.lastName ?? "") ? lastName : undefined,
          address: address !== (result.prefill.addressLine ?? "") ? address : undefined,
          pincode: pincode !== (result.prefill.pincode ?? "") ? pincode : undefined,
        }),
      );
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ABDM did not accept the change.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Correct these details at ABDM
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm text-fg-muted">
        This changes the patient&apos;s record <strong className="font-medium text-fg">at ABDM</strong>, not just here.
        To fix only this hospital&apos;s copy, edit the registration form below instead.
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <Field label="PIN code" value={pincode} onChange={(e) => setPincode(e.target.value)} inputMode="numeric" />
        <Field label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" loading={saving} onClick={() => void save()}>
          Save at ABDM
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
