"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FlaskConical,
  GitBranch,
  Landmark,
  Network,
  Pill,
  Stethoscope,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../components/Can";
import { SetupOverview } from "../../../components/settings/SetupChecklist";
import { useCan } from "../../../lib/auth";

/**
 * Hospital Setup Console — the overview (ADR-049).
 *
 * Progress first, then the areas that live on their own screens. Nothing here is a
 * second implementation of an existing screen: branches, providers, staff and the
 * two catalogues are linked, so there is exactly one place each is maintained and
 * the console is how a hospital's administrator finds them.
 */
type Area = { href: string; label: string; blurb: string; icon: LucideIcon; perm: string };

const AREAS: Area[] = [
  {
    href: "/branches",
    label: "Branches",
    blurb: "The locations your hospital runs. Staff, providers and records are organised under them.",
    icon: GitBranch,
    perm: PERMISSIONS.BRANCHES_VIEW,
  },
  {
    href: "/departments",
    label: "Departments",
    blurb: "The clinical departments patients are seen in. Doctors belong to them and check-in routes by them.",
    icon: Network,
    perm: PERMISSIONS.DEPARTMENT_VIEW,
  },
  {
    href: "/providers",
    label: "Doctors & specialties",
    blurb: "The provider directory appointments are booked against, and each doctor's specialties.",
    icon: Stethoscope,
    perm: PERMISSIONS.PROVIDER_VIEW,
  },
  {
    href: "/users",
    label: "Staff, roles & access",
    blurb: "Accounts, the role each person holds, and individual permission exceptions.",
    icon: UserCog,
    perm: PERMISSIONS.USERS_VIEW,
  },
  {
    href: "/hospital-setup/registry",
    label: "National registries (ABDM)",
    blurb: "List this hospital in the Health Facility Registry and its clinicians in the Professional Registry.",
    icon: Landmark,
    perm: PERMISSIONS.ABDM_REGISTRY_VIEW,
  },
  {
    href: "/laboratory/tests",
    label: "Laboratory test master",
    blurb: "The tests you offer, with price and reference ranges.",
    icon: FlaskConical,
    perm: PERMISSIONS.LAB_MANAGE,
  },
  {
    href: "/pharmacy/stock",
    label: "Pharmacy drug master",
    blurb: "The medicines you stock, with unit price and reorder level.",
    icon: Pill,
    perm: PERMISSIONS.PHARMACY_MANAGE,
  },
  {
    href: "/hospital-setup/hospital-information",
    label: "Hospital information",
    blurb: "Registered address, contact details and statutory numbers, printed on your documents.",
    icon: Building2,
    perm: PERMISSIONS.ORG_PROFILE_MANAGE,
  },
];

function AreaCard({ area }: { area: Area }) {
  const permitted = useCan(area.perm);
  if (!permitted) return null;
  const Icon = area.icon;
  return (
    <Link
      href={area.href}
      className="group flex items-start gap-3 rounded-token border border-border bg-surface p-4 transition-colors hover:border-brand"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-token bg-brand-subtle text-brand">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-medium text-fg">
          {area.label}
          <ArrowRight
            size={14}
            strokeWidth={2}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </span>
        <span className="mt-0.5 block text-sm text-fg-muted">{area.blurb}</span>
      </span>
    </Link>
  );
}

export default function HospitalSetupPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <SetupOverview />

      <Card header="Configuration areas">
        <p className="mb-4 text-sm text-fg-muted">
          Each area has its own screen, reachable from here or from the sidebar. Setup is never the only way in.
          Everything below can be changed at any time.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {AREAS.map((area) => (
            <AreaCard key={area.href} area={area} />
          ))}
        </div>
      </Card>
    </RequirePermission>
  );
}
