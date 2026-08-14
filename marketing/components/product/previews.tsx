import { Badge, DataTable, type Column } from "@hms/ui";

/*
 * Real product-UI previews built from the actual @hms/ui primitives with
 * representative (illustrative) clinic data. These render the genuine Portal
 * components, so the marketing surface shows the real product, not a fake mockup.
 * Data is illustrative and India-context; no real patient information.
 */

type Appt = {
  patient: string;
  provider: string;
  time: string;
  status: "Booked" | "Checked in" | "Cancelled";
};

const APPTS: Appt[] = [
  { patient: "Ananya Iyer", provider: "Dr. Mehta", time: "09:15", status: "Checked in" },
  { patient: "Rohan Deshpande", provider: "Dr. Mehta", time: "09:45", status: "Booked" },
  { patient: "Fatima Sheikh", provider: "Dr. Rao", time: "10:00", status: "Booked" },
  { patient: "Vikram Nair", provider: "Dr. Rao", time: "10:30", status: "Cancelled" },
];

const apptTone = {
  "Checked in": "success",
  Booked: "brand",
  Cancelled: "danger",
} as const;

const apptColumns: Column<Appt>[] = [
  { key: "patient", header: "Patient", cell: (r) => <span className="font-medium">{r.patient}</span> },
  { key: "provider", header: "Provider", cell: (r) => r.provider },
  { key: "time", header: "Time", cell: (r) => r.time },
  {
    key: "status",
    header: "Status",
    cell: (r) => <Badge tone={apptTone[r.status]}>{r.status}</Badge>,
  },
];

/** The appointments schedule — a real Standard DataTable. */
export function AppointmentsPreview() {
  return <DataTable columns={apptColumns} rows={APPTS} rowKey={(r) => r.patient} />;
}

type AuditRow = { event: string; actor: string; when: string };

const AUDIT: AuditRow[] = [
  { event: "appointment.book", actor: "reception@brightcare", when: "12:04:19" },
  { event: "patient.view", actor: "dr.mehta@brightcare", when: "12:03:56" },
  { event: "permission.grant", actor: "admin@brightcare", when: "11:58:02" },
  { event: "auth.login", actor: "dr.rao@brightcare", when: "11:41:30" },
];

const auditColumns: Column<AuditRow>[] = [
  {
    key: "event",
    header: "Event",
    cell: (r) => <span className="font-mono text-[0.8rem]">{r.event}</span>,
  },
  { key: "actor", header: "Actor", cell: (r) => r.actor },
  { key: "when", header: "Time", cell: (r) => r.when },
];

/** The immutable audit trail — a real Standard DataTable. */
export function AuditPreview() {
  return <DataTable columns={auditColumns} rows={AUDIT} rowKey={(r) => r.when} />;
}

type Entitlement = { module: string; on: boolean };

const ENTITLEMENTS: Entitlement[] = [
  { module: "Patient Management", on: true },
  { module: "Appointments", on: true },
  { module: "Pharmacy", on: true },
  { module: "Laboratory", on: true },
  { module: "Radiology & PACS", on: false },
  { module: "Operation Theatre", on: false },
];

/** Module entitlements — the "turn on only what you need" control, per tenant. */
export function EntitlementsPreview() {
  return (
    <div className="hms-card">
      <div className="hms-card__header">Modules · Bright Care Clinic</div>
      <ul className="hms-card__body flex flex-col gap-2.5 !py-3">
        {ENTITLEMENTS.map((e) => (
          <li key={e.module} className="flex items-center justify-between gap-3">
            <span style={{ color: "var(--hms-fg)" }}>{e.module}</span>
            <span className="inline-flex items-center gap-2">
              <Badge tone={e.on ? "success" : "neutral"}>{e.on ? "Enabled" : "Off"}</Badge>
              <span
                aria-hidden
                className="relative inline-block h-5 w-9 rounded-full transition-colors"
                style={{
                  background: e.on ? "var(--hms-brand)" : "var(--hms-border)",
                }}
              >
                <span
                  className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                  style={{ left: e.on ? "1.125rem" : "0.125rem" }}
                />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
