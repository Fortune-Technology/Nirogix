"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Provider } from "@hms/types";
import { Alert, Badge, Button, Card, Field, PageHeader, Spinner, toast } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { ArrowLeft, Check, IdCard } from "lucide-react";
import * as api from "../../../../../lib/api";
import { RequirePermission } from "../../../../../components/Can";
import { useCan } from "../../../../../lib/auth";

/**
 * Enrolling one clinician in the Healthcare Professional Registry (ADR-097; HPR-001…060).
 *
 * An HPR ID is a **national identity for a real person**, minted from their Aadhaar. That single
 * fact decides the whole shape of this screen, and none of it is incidental:
 *
 * - **The dedup check comes first, always.** Most clinicians already hold an HPR ID from a previous
 *   employer or their council. Creating a second one splits one person's professional record in
 *   two, permanently, in a registry we do not control. So the first call asks the registry whether
 *   this Aadhaar already has an account, and "they already have one" is reported as a **success**,
 *   not a failure — the enrolment is finished, it just did not need us.
 * - **Aadhaar is typed, used, and never written down.** It is sent to the registry and kept nowhere
 *   — not in our database, not in this component's saved state, not in an audit record. The field
 *   clears the moment the OTP is on its way.
 * - **The steps cannot be reordered or skipped.** The registry mints an id only once both Aadhaar
 *   and mobile are proven, so the wizard follows its order rather than offering a form. What the
 *   clinician has already completed is read from their stored status, so an interrupted enrolment
 *   resumes where it stopped instead of starting over with another OTP.
 * - **Consent is a person's, not an administrator's.** The clinician has to be present: they hold
 *   the Aadhaar-linked phone the OTP arrives on. The screen says so rather than letting somebody
 *   discover it after typing twelve digits.
 */

type Step = "identify" | "aadhaar-otp" | "mobile" | "mobile-otp" | "profile" | "done";

/** What the stored status means the clinician has already proven. */
function stepFor(enrolment: api.AbdmHprEnrolment | null): Step {
  if (!enrolment) return "identify";
  switch (enrolment.status) {
    case "registered":
    case "already_registered":
      return "done";
    case "mobile_verified":
      return "profile";
    case "aadhaar_verified":
      return "mobile";
    default:
      return "identify";
  }
}

const STEP_ORDER: Step[] = ["identify", "aadhaar-otp", "mobile", "mobile-otp", "profile"];
const STEP_LABEL: Record<Step, string> = {
  identify: "Aadhaar",
  "aadhaar-otp": "Aadhaar OTP",
  mobile: "Mobile",
  "mobile-otp": "Mobile OTP",
  profile: "Professional details",
  done: "Done",
};

export default function HprEnrolmentPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ABDM_REGISTRY_VIEW}>
      <HprEnrolment />
    </RequirePermission>
  );
}

function HprEnrolment() {
  const canManage = useCan(PERMISSIONS.ABDM_REGISTRY_MANAGE);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [enrolments, setEnrolments] = useState<api.AbdmHprEnrolment[]>([]);
  const [providerId, setProviderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Step-local input. Deliberately not one big form object: the Aadhaar must be droppable the
  // instant it has been used, and burying it in shared state is how it survives longer than it should.
  const [aadhaar, setAadhaar] = useState("");
  const [category, setCategory] = useState<"doctor" | "nurse" | "pharmacist">("doctor");
  const [otp, setOtp] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobileSent, setMobileSent] = useState(false);
  const [profile, setProfile] = useState({
    email: "",
    firstName: "",
    lastName: "",
    registrationCouncil: "",
    registrationNumber: "",
    systemOfMedicine: "",
  });

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([
      api.listProviders().catch(() => [] as Provider[]),
      api.listAbdmHprEnrolments().catch(() => [] as api.AbdmHprEnrolment[]),
    ]);
    setProviders(p.filter((x) => x.isActive));
    setEnrolments(e);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enrolment = useMemo(
    () => enrolments.find((e) => e.providerId === providerId) ?? null,
    [enrolments, providerId],
  );
  const provider = useMemo(() => providers.find((p) => p.id === providerId) ?? null, [providers, providerId]);

  // The stored status decides the step, except while an OTP is in flight — the registry has no
  // status for "we asked for a code and are waiting", and inventing one in the database would
  // outlive the moment it describes.
  const [pendingOtp, setPendingOtp] = useState<"aadhaar" | null>(null);
  const step: Step = pendingOtp === "aadhaar" ? "aadhaar-otp" : mobileSent ? "mobile-otp" : stepFor(enrolment);

  /** Resets everything that belongs to one clinician's sitting. */
  function clearSitting() {
    setAadhaar("");
    setOtp("");
    setMobile("");
    setMobileSent(false);
    setPendingOtp(null);
  }

  function chooseProvider(id: string) {
    setProviderId(id);
    clearSitting();
    const existing = enrolments.find((e) => e.providerId === id);
    const chosen = providers.find((p) => p.id === id);
    // Pre-fill only what we genuinely hold. A guessed registration number on a national registry
    // is worse than an empty box, so nothing is invented — but re-typing what we already have is
    // pure friction, and the number is exactly the field a busy administrator gets wrong.
    setProfile({
      email: chosen?.email ?? "",
      firstName: chosen?.fullName?.split(" ")[0] ?? "",
      lastName: chosen?.fullName?.split(" ").slice(1).join(" ") ?? "",
      registrationCouncil: existing?.registrationCouncil ?? "",
      registrationNumber: existing?.registrationNumber ?? chosen?.registrationNumber ?? "",
      systemOfMedicine: "",
    });
    setMobile(chosen?.phone ?? "");
  }

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* the shared client raised the registry's own words (ADR-057) */
    } finally {
      setBusy(false);
    }
  }

  const start = () =>
    guard(async () => {
      const result = await api.startAbdmHprEnrolment({ providerId, aadhaar, category });
      // Used and gone. Nothing downstream needs it, so nothing downstream keeps it.
      setAadhaar("");
      setEnrolments((list) => upsert(list, result));
      if (result.status === "already_registered") {
        toast.success("They already hold an HPR ID — nothing more to do.");
        setPendingOtp(null);
      } else {
        toast.info("OTP sent to the phone linked to that Aadhaar.");
        setPendingOtp("aadhaar");
      }
    });

  const confirmAadhaar = () =>
    guard(async () => {
      const result = await api.verifyAbdmHprAadhaarOtp({ providerId, otp });
      setOtp("");
      setPendingOtp(null);
      setEnrolments((list) => upsert(list, result));
      toast.success("Aadhaar verified.");
    });

  const sendMobile = () =>
    guard(async () => {
      await api.sendAbdmHprMobileOtp({ providerId, mobile });
      setMobileSent(true);
      toast.info(`OTP sent to ${mobile}.`);
    });

  const confirmMobile = () =>
    guard(async () => {
      const result = await api.verifyAbdmHprMobileOtp({ providerId, otp });
      setOtp("");
      setMobileSent(false);
      setEnrolments((list) => upsert(list, result));
      toast.success("Mobile verified.");
    });

  const complete = () =>
    guard(async () => {
      const result = await api.completeAbdmHprEnrolment({
        providerId,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName || undefined,
        registrationCouncil: profile.registrationCouncil,
        registrationNumber: profile.registrationNumber,
        systemOfMedicine: profile.systemOfMedicine || undefined,
      });
      setEnrolments((list) => upsert(list, result));
      clearSitting();
      toast.success(result.hprId ? `HPR ID ${result.hprId} issued.` : "Enrolment complete.");
    });

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enrol a clinician in the HPR"
        description="One doctor, nurse or pharmacist at a time — with them present, because the OTPs go to their phone."
        actions={
          <Link href="/hospital-setup/registry">
            <Button variant="secondary">
              <ArrowLeft className="size-4" aria-hidden />
              Back to registries
            </Button>
          </Link>
        }
      />

      {!canManage && (
        <Alert>
          You can see who is enrolled, but enrolling somebody needs the registry-manage permission.
        </Alert>
      )}

      <Card header="Who is being enrolled?">
        <label className="hms-field">
          <span className="hms-label">Clinician</span>
          <select className="hms-input" value={providerId} onChange={(e) => chooseProvider(e.target.value)}>
            <option value="">Choose a clinician…</option>
            {providers.map((p) => {
              const e = enrolments.find((x) => x.providerId === p.id);
              return (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                  {e?.hprId ? ` — ${e.hprId}` : ""}
                </option>
              );
            })}
          </select>
          <span className="hms-hint">
            Most clinicians already hold an HPR ID. The first step checks, so nobody is enrolled twice.
          </span>
        </label>

        {providers.length === 0 && (
          <Alert className="mt-3">
            No active clinicians yet. Add doctors and nurses under Staff first &mdash; HPR enrolment attaches to an
            existing person, it does not create one.
          </Alert>
        )}
      </Card>

      {provider && (
        <>
          <StepRail current={step} />

          {step === "done" ? (
            <Card>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-success-subtle p-1.5 text-success">
                  <Check className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="font-medium text-fg">
                    {provider.fullName} {enrolment?.status === "already_registered" ? "already had" : "now has"} an HPR
                    ID.
                  </p>
                  <p className="mt-1 font-mono text-sm text-fg-muted">{enrolment?.hprId ?? "Issued by the registry"}</p>
                  {enrolment?.statusMessage && (
                    <p className="mt-2 text-xs text-fg-muted">{enrolment.statusMessage}</p>
                  )}
                  <p className="mt-3 text-xs text-fg-muted">
                    An HPR ID belongs to the clinician, not to this hospital &mdash; it follows them if they leave.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card header={STEP_LABEL[step]}>
              {step === "identify" && (
                <div className="space-y-4">
                  <Alert>
                    The clinician needs to be here: the OTP goes to the phone linked to their Aadhaar, and the number is
                    not stored anywhere by us.
                  </Alert>
                  <label className="hms-field">
                    <span className="hms-label">Category *</span>
                    <select
                      className="hms-input"
                      value={category}
                      disabled={!canManage || busy}
                      onChange={(e) => setCategory(e.target.value as typeof category)}
                    >
                      <option value="doctor">Doctor</option>
                      <option value="nurse">Nurse</option>
                      <option value="pharmacist">Pharmacist</option>
                    </select>
                  </label>
                  <Field
                    label="Aadhaar number *"
                    value={aadhaar}
                    inputMode="numeric"
                    maxLength={12}
                    autoComplete="off"
                    disabled={!canManage || busy}
                    hint="Twelve digits. Sent to the registry and kept nowhere."
                    onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ""))}
                  />
                  <Button disabled={!canManage || busy || aadhaar.length !== 12} onClick={() => void start()}>
                    {busy ? "Checking the registry…" : "Check and send OTP"}
                  </Button>
                </div>
              )}

              {step === "aadhaar-otp" && (
                <OtpStep
                  label="Aadhaar OTP"
                  hint="Sent to the phone linked to that Aadhaar."
                  otp={otp}
                  setOtp={setOtp}
                  busy={busy}
                  disabled={!canManage}
                  onSubmit={() => void confirmAadhaar()}
                  onBack={() => {
                    setPendingOtp(null);
                    setOtp("");
                  }}
                />
              )}

              {step === "mobile" && (
                <div className="space-y-4">
                  <Alert tone="success">Aadhaar verified. Now the mobile number the clinician wants on the registry.</Alert>
                  <Field
                    label="Mobile number *"
                    value={mobile}
                    inputMode="numeric"
                    maxLength={10}
                    disabled={!canManage || busy}
                    hint="May differ from the Aadhaar-linked one. This is what the registry publishes."
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                  />
                  <Button disabled={!canManage || busy || mobile.length < 10} onClick={() => void sendMobile()}>
                    {busy ? "Sending…" : "Send OTP"}
                  </Button>
                </div>
              )}

              {step === "mobile-otp" && (
                <OtpStep
                  label="Mobile OTP"
                  hint={`Sent to ${mobile}.`}
                  otp={otp}
                  setOtp={setOtp}
                  busy={busy}
                  disabled={!canManage}
                  onSubmit={() => void confirmMobile()}
                  onBack={() => {
                    setMobileSent(false);
                    setOtp("");
                  }}
                />
              )}

              {step === "profile" && (
                <div className="space-y-4">
                  <Alert tone="success">
                    Both identities are proven. These last details are what the registry publishes about them
                    professionally.
                  </Alert>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="First name *"
                      value={profile.firstName}
                      disabled={!canManage || busy}
                      onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                    />
                    <Field
                      label="Last name"
                      value={profile.lastName}
                      disabled={!canManage || busy}
                      onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                    />
                  </div>
                  <Field
                    label="Email *"
                    type="email"
                    value={profile.email}
                    disabled={!canManage || busy}
                    hint="The registry sends the clinician their own account details here."
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Registration council *"
                      value={profile.registrationCouncil}
                      disabled={!canManage || busy}
                      hint="The council that licensed them — state medical council, nursing council."
                      onChange={(e) => setProfile({ ...profile, registrationCouncil: e.target.value })}
                    />
                    <Field
                      label="Registration number *"
                      value={profile.registrationNumber}
                      disabled={!canManage || busy}
                      hint="As printed on their registration certificate."
                      onChange={(e) => setProfile({ ...profile, registrationNumber: e.target.value })}
                    />
                  </div>
                  <Field
                    label="System of medicine"
                    value={profile.systemOfMedicine}
                    disabled={!canManage || busy}
                    hint="Allopathy, Ayurveda, Homoeopathy, Siddha, Unani. Leave blank if unsure."
                    onChange={(e) => setProfile({ ...profile, systemOfMedicine: e.target.value })}
                  />
                  <Button
                    disabled={
                      !canManage ||
                      busy ||
                      !profile.firstName ||
                      !profile.email ||
                      !profile.registrationCouncil ||
                      !profile.registrationNumber
                    }
                    onClick={() => void complete()}
                  >
                    {busy ? "Creating the HPR ID…" : "Create HPR ID"}
                  </Button>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      <Card
        header={
          <span className="flex items-center gap-2">
            <IdCard className="size-4 text-fg-muted" aria-hidden />
            Everyone enrolled so far
          </span>
        }
      >
        {enrolments.length === 0 ? (
          <p className="text-sm text-fg-muted">Nobody yet.</p>
        ) : (
          <ul className="space-y-2">
            {enrolments.map((e) => {
              const who = providers.find((p) => p.id === e.providerId);
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="text-sm text-fg">
                    {who?.fullName ?? "Former staff member"}
                    {e.hprId && <span className="ml-2 font-mono text-xs text-fg-muted">{e.hprId}</span>}
                  </span>
                  <Badge tone={e.hprId ? "success" : "warning"}>{e.hprId ? "Has an HPR ID" : "In progress"}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** The two OTP steps differ only in wording, so they are one component rather than two forms. */
function OtpStep({
  label,
  hint,
  otp,
  setOtp,
  busy,
  disabled,
  onSubmit,
  onBack,
}: {
  label: string;
  hint: string;
  otp: string;
  setOtp: (v: string) => void;
  busy: boolean;
  disabled: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label={`${label} *`}
        value={otp}
        inputMode="numeric"
        maxLength={8}
        autoComplete="one-time-code"
        disabled={disabled || busy}
        hint={hint}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled || busy || otp.length < 4} onClick={onSubmit}>
          {busy ? "Verifying…" : "Verify"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          Start this step again
        </Button>
      </div>
    </div>
  );
}

/** Where this clinician is in the registry's order — which is not ours to rearrange. */
function StepRail({ current }: { current: Step }) {
  const index = STEP_ORDER.indexOf(current);
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Enrolment steps">
      {STEP_ORDER.map((s, i) => {
        const state = i < index ? "done" : i === index ? "current" : "todo";
        return (
          <li key={s}>
            <span
              className={
                state === "current"
                  ? "rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-fg"
                  : state === "done"
                    ? "rounded-full bg-success-subtle px-3 py-1 text-xs font-medium text-success"
                    : "rounded-full border border-border px-3 py-1 text-xs text-fg-muted"
              }
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? "✓ " : ""}
              {STEP_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Replaces one enrolment in the list, or appends it if this clinician had none. */
function upsert(list: api.AbdmHprEnrolment[], next: api.AbdmHprEnrolment): api.AbdmHprEnrolment[] {
  const i = list.findIndex((e) => e.providerId === next.providerId);
  if (i === -1) return [...list, next];
  const copy = [...list];
  copy[i] = next;
  return copy;
}
