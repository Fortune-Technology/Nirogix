"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Card, EmptyState, Skeleton } from "@hms/ui";
import * as api from "../../../../lib/api";

/**
 * The modules this hospital is entitled to (ADR-004).
 *
 * Read-only on purpose. Entitlements are granted by Nirogix, not bought from inside
 * the product — a hospital cannot enable a module for itself, and showing a toggle
 * that does nothing would suggest otherwise. What this screen is for is answering
 * "why can I not see Laboratory in my menu?" without a support call.
 */
const MODULE_NAMES: Record<string, string> = {
  patient: "Patient Management",
  appointment: "Appointment Management",
  opd: "OPD & Check-in",
  emr: "Clinical Workflow (EMR)",
  pharmacy: "Pharmacy",
  laboratory: "Laboratory",
  billing: "Billing & Payments",
  radiology: "Radiology & Imaging",
  inventory: "Inventory, Stores & Procurement",
  ipd: "Admission (IPD)",
  nursing: "Nursing",
  emergency: "Emergency Department",
  ot: "Operation Theatre",
  cssd: "CSSD",
  blood_bank: "Blood Bank",
  insurance: "Insurance, TPA & Govt. Schemes",
};

export default function ModulesSettingsPage() {
  const [modules, setModules] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMyModules()
      .then(setModules)
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Could not load your modules."));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!modules) return <Skeleton height="12rem" />;

  return (
    <Card header="Enabled modules">
      <p className="mb-4 text-sm text-fg-muted">
        These are the modules your hospital is licensed for. They decide what appears in your menu and what the API
        will answer. To enable another one, talk to us — entitlements are granted by Nirogix, not switched on here.
      </p>

      {modules.length === 0 ? (
        <EmptyState title="No modules enabled" description="Contact Nirogix to have your modules provisioned." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {modules.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-token border border-border bg-surface px-4 py-3"
            >
              <span className="text-sm text-fg">{MODULE_NAMES[key] ?? key}</span>
              <Badge tone="success">Enabled</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
