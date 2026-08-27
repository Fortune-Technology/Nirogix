import { describe, expect, test } from "vitest";
import { NAV_ITEMS, mobilePrimaryNav, navEntitled, navGroupsForUser } from "../nav";

// Module- and capability-aware navigation (ADR-085): the sidebar shows the intersection the
// backend already enforces — tenant module ∩ tenant capability ∩ user permission. Hiding is UX;
// every route is re-checked server-side, which is what these tests deliberately do NOT rely on.

const allow = () => true;
const entitlement = (modules: string[], capabilities: string[] = []) => ({
  hasModule: (k: string) => modules.includes(k),
  hasCapability: (k: string) => capabilities.includes(k),
});

const hrefs = (groups: ReturnType<typeof navGroupsForUser>) =>
  groups.flatMap((g) => g.items.map((i) => i.href));

describe("nav entitlement filtering", () => {
  test("without entitlement context every permitted item stays visible", () => {
    // The session has not loaded yet — hiding the whole menu would be worse than showing it,
    // and the API still refuses anything the tenant lacks.
    const visible = hrefs(navGroupsForUser(allow));
    expect(visible).toContain("/pharmacy");
    expect(visible).toContain("/laboratory");
  });

  test("a module the tenant does not have is hidden even when permitted", () => {
    const visible = hrefs(navGroupsForUser(allow, entitlement(["patient", "appointment", "opd"])));
    expect(visible).toContain("/patients");
    expect(visible).not.toContain("/pharmacy");
    expect(visible).not.toContain("/laboratory");
    expect(visible).not.toContain("/billing");
  });

  test("a capability switched off hides its item while the module stays", () => {
    const withCap = hrefs(navGroupsForUser(allow, entitlement(["opd", "patient", "appointment"], ["opd.queue", "opd.referral"])));
    expect(withCap).toContain("/opd");
    expect(withCap).toContain("/referrals");

    const withoutReferral = hrefs(navGroupsForUser(allow, entitlement(["opd", "patient", "appointment"], ["opd.queue"])));
    expect(withoutReferral).toContain("/opd");
    expect(withoutReferral).not.toContain("/referrals");
  });

  test("permission still gates independently of entitlement", () => {
    const onlyPatients = (perm: string) => perm === "patient.record.view";
    const visible = hrefs(navGroupsForUser(onlyPatients, entitlement(["patient", "pharmacy", "laboratory"])));
    expect(visible).toContain("/patients");
    expect(visible).not.toContain("/pharmacy");
  });

  test("platform-core items carry no module and are never hidden by entitlement", () => {
    const visible = hrefs(navGroupsForUser(allow, entitlement([])));
    // Dashboard and profile are Platform Core — no module key, so they survive an empty tenant.
    expect(visible).toContain("/dashboard");
    expect(visible.length).toBeGreaterThan(0);
  });

  test("a group whose every item is hidden disappears entirely", () => {
    const groups = navGroupsForUser(allow, entitlement([]));
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  test("the mobile bottom bar applies the same filter", () => {
    const ranked = mobilePrimaryNav(allow, NAV_ITEMS, entitlement(["patient"]));
    const paths = ranked.map((i) => i.href);
    expect(paths).toContain("/patients");
    expect(paths).not.toContain("/pharmacy");
  });

  test("navEntitled is the single predicate both surfaces use", () => {
    const item = NAV_ITEMS.find((i) => i.href === "/laboratory")!;
    expect(navEntitled(item, entitlement(["laboratory"]))).toBe(true);
    expect(navEntitled(item, entitlement([]))).toBe(false);
    expect(navEntitled(item)).toBe(true);
  });
});
