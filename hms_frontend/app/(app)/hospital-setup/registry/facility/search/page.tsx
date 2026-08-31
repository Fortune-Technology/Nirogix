"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, EmptyState, Field, PageHeader, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { ArrowLeft, Search } from "lucide-react";
import * as api from "../../../../../../lib/api";
import { RequirePermission } from "../../../../../../components/Can";
import { RegistryMasterSelect } from "../../../../../../components/abdm/RegistryMasterSelect";

/**
 * Searching the Health Facility Registry (ADR-096; HFR-064…072).
 *
 * This screen exists for one reason, and it is not curiosity. A hospital that registers a building
 * HFR **already holds** ends up with two national identities for one facility — and because the
 * Facility ID is the `hipId` that M1–M3 identify us by, the wrong half of that pair silently breaks
 * linking and discovery for real patients, weeks later, with no obvious cause. So the question
 * "is this already listed?" is asked before the forty-field registration form, not after it.
 *
 * Three things follow from that purpose:
 *
 * - **Nothing here is a claim on a facility.** A result is a record in a national registry that
 *   belongs to whoever operates that building. Finding one that looks like yours means going and
 *   checking, not pressing a button — so there is no "use this" action, only the Facility ID to
 *   carry to the person who can confirm it.
 * - **HFR accepts exactly two shapes of search**, and the form offers exactly those two rather
 *   than a box of optional filters. Either a Facility ID on its own, or ownership + state +
 *   facility name *all three together* — NHA's documentation is explicit that anything less is
 *   rejected outright. A form that let somebody search by PIN code alone would produce a registry
 *   error that reads as "the registry is down".
 * - **No results is an answer, not a failure.** It is usually the *good* answer — nobody has
 *   registered this building yet, so registration can proceed. The empty state says that plainly
 *   instead of looking like an error.
 */

type Filters = {
  facilityName: string;
  facilityId: string;
  stateLGDCode: string;
  districtLGDCode: string;
  subDistrictLGDCode: string;
  pincode: string;
  ownershipCode: string;
};

const EMPTY: Filters = {
  facilityName: "",
  facilityId: "",
  stateLGDCode: "",
  districtLGDCode: "",
  subDistrictLGDCode: "",
  pincode: "",
  ownershipCode: "",
};

const PER_PAGE = 10;

export default function FacilitySearchPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ABDM_REGISTRY_VIEW}>
      <FacilitySearch />
    </RequirePermission>
  );
}

function FacilitySearch() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [result, setResult] = useState<api.AbdmFacilitySearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      // The LGD lists are a chain: a district code from Karnataka is meaningless once the state is
      // Kerala, and sending it would filter the search down to nothing for no visible reason.
      if (key === "stateLGDCode") {
        next.districtLGDCode = "";
        next.subDistrictLGDCode = "";
      }
      if (key === "districtLGDCode") next.subDistrictLGDCode = "";
      return next;
    });
  }

  // HFR's two legal shapes, mirrored here so the button explains itself before a request is made.
  const byId = filters.facilityId.trim() !== "";
  const missing = byId
    ? []
    : (["ownershipCode", "stateLGDCode", "facilityName"] as const).filter((k) => filters[k].trim() === "");
  const canSearch = byId || missing.length === 0;

  async function run(page: number) {
    if (!canSearch) {
      setError(
        "HFR needs ownership, state and facility name together — or a Facility ID on its own. Anything less is refused by the registry.",
      );
      return;
    }
    if (!byId && filters.pincode.trim() && !/^\d{6}$/.test(filters.pincode.trim())) {
      setError("A PIN code is six digits.");
      return;
    }
    setError(null);
    setSearching(true);
    try {
      setResult(await api.searchAbdmFacilities({ ...filters, page, resultsPerPage: PER_PAGE }));
    } catch {
      // The shared client already raised the registry's own words (ADR-057); adding a second,
      // vaguer message would only bury them.
      setResult(null);
    } finally {
      setSearching(false);
    }
  }

  function reset() {
    setFilters(EMPTY);
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search the Health Facility Registry"
        description="Check whether a hospital is already listed nationally before registering it again."
        actions={
          <Link href="/hospital-setup/registry">
            <Button variant="secondary">
              <ArrowLeft className="size-4" aria-hidden />
              Back to registries
            </Button>
          </Link>
        }
      />

      <Alert>
        One building should hold one Facility ID. If this hospital is already in the registry &mdash; registered by a
        previous owner, a parent trust, or a state programme &mdash; claim that entry instead of creating a second one.
        The Facility ID is what the rest of ABDM identifies you by, and two of them for one hospital breaks record
        linking for real patients.
      </Alert>

      <Card header="What are you looking for?">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(1);
          }}
        >
          {/* Shape one: a Facility ID on its own. HFR ignores every other filter when it is
              present, so the form says so rather than leaving fields that quietly do nothing. */}
          <Field
            label="Facility ID"
            value={filters.facilityId}
            placeholder="IN0710…"
            hint="If you have one, this is the whole search — HFR ignores every other field."
            onChange={(e) => set("facilityId", e.target.value)}
          />

          <fieldset className="space-y-4 rounded-md border border-border p-4" disabled={byId}>
            <legend className="px-1 text-sm font-medium text-fg">
              Or search by name {byId && <span className="text-fg-muted">— not used with a Facility ID</span>}
            </legend>
            <p className="text-xs text-fg-muted">
              HFR requires all three of these together. Fewer is refused by the registry, not answered with more
              results.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Facility name *"
                value={filters.facilityName}
                placeholder="Part of the name is enough"
                error={missing.includes("facilityName") && error ? "Required." : undefined}
                hint="Matched loosely, so a partial name works."
                onChange={(e) => set("facilityName", e.target.value)}
              />
              <RegistryMasterSelect
                label="Ownership *"
                kind="masterData"
                type="OWNER"
                value={filters.ownershipCode}
                disabled={byId}
                hint={missing.includes("ownershipCode") && error ? "Required." : "Government, private or public-private."}
                onChange={(v) => set("ownershipCode", v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <RegistryMasterSelect
                label="State / UT *"
                kind="states"
                value={filters.stateLGDCode}
                disabled={byId}
                hint={missing.includes("stateLGDCode") && error ? "Required." : undefined}
                onChange={(v) => set("stateLGDCode", v)}
              />
              <RegistryMasterSelect
                label="District"
                kind="districts"
                filters={{ code: filters.stateLGDCode }}
                parentHint="Choose a state first"
                value={filters.districtLGDCode}
                disabled={byId}
                onChange={(v) => set("districtLGDCode", v)}
              />
              <RegistryMasterSelect
                label="Sub-district"
                kind="subDistricts"
                filters={{ code: filters.districtLGDCode }}
                parentHint="Choose a district first"
                value={filters.subDistrictLGDCode}
                disabled={byId}
                onChange={(v) => set("subDistrictLGDCode", v)}
              />
              <Field
                label="PIN code"
                value={filters.pincode}
                inputMode="numeric"
                maxLength={6}
                placeholder="560038"
                onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </fieldset>

          {error && <Alert tone="danger">{error}</Alert>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={searching || !canSearch}>
              <Search className="size-4" aria-hidden />
              {searching ? "Searching…" : "Search the registry"}
            </Button>
            <Button type="button" variant="secondary" onClick={reset} disabled={searching}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {searching && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {!searching && result && <Results result={result} onPage={(p) => void run(p)} />}
    </div>
  );
}

function Results({
  result,
  onPage,
}: {
  result: api.AbdmFacilitySearchResult;
  onPage: (page: number) => void;
}) {
  if (result.facilities.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nothing in the registry matches that"
          description="Which usually means this hospital has not been registered yet — so registering it now is the right move. If you expected a match, try a shorter name, or search by district instead of PIN code."
        />
        <div className="mt-4 flex justify-center">
          <Link href="/hospital-setup/registry/facility">
            <Button>Register this hospital</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {result.total} {result.total === 1 ? "facility" : "facilities"} found
          </span>
          {result.pages > 1 && (
            <span className="text-xs font-normal text-fg-muted">
              Page {result.page} of {result.pages}
            </span>
          )}
        </div>
      }
    >
      <ul className="space-y-2">
        {result.facilities.map((f) => (
          <li key={f.facilityId} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-fg">{f.facilityName}</p>
                {/* The id is the whole point of the screen — selectable, so it can be copied to
                    whoever confirms whether this entry is ours. */}
                <p className="mt-0.5 select-all font-mono text-xs text-fg-muted">{f.facilityId}</p>
              </div>
              {f.facilityStatus && <Badge tone="neutral">{f.facilityStatus}</Badge>}
            </div>

            <p className="mt-2 text-xs text-fg-muted">
              {[f.address, f.subDistrictName, f.districtName, f.stateName, f.pincode]
                .filter(Boolean)
                .join(", ") || "No address recorded in the registry."}
            </p>

            {(f.facilityType || f.ownership || f.systemOfMedicine) && (
              <p className="mt-1 text-xs text-fg-muted">
                {[f.facilityType, f.ownership, f.systemOfMedicine].filter(Boolean).join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>

      {result.pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            disabled={result.page <= 1}
            onClick={() => onPage(result.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={result.page >= result.pages}
            onClick={() => onPage(result.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <p className="mt-4 text-xs text-fg-muted">
        A match here is somebody&rsquo;s registry entry, not automatically yours. Confirm the building before claiming
        the Facility ID &mdash; there is no undo at the registry.
      </p>
    </Card>
  );
}
