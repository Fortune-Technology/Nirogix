import { describe, expect, test } from 'vitest';
import { SPECIALTY_CATALOG } from '../../modules/provider/specialtyCatalog';
import { STAGING_DATASET } from '../seed.staging';
import { DEVELOPMENT_DATASET } from '../seed.development';
import type { SeedTenantSpec } from '../seedKit';

/**
 * The staging dataset is a **contract** (ADR-114): E2E asserts against its values and the manual
 * regression script is run on it. It is also three hundred lines of hand-written data, which is
 * exactly the kind of thing that acquires a typo nobody notices until a deployment fails halfway
 * through seeding a shared environment.
 *
 * These checks need no database and run in milliseconds. They catch the mistakes that are actually
 * made when editing a dataset by hand: a department code that no longer exists, a phone number
 * reused so two patients collide on the key the seeder identifies them by, a specialty that is not
 * in the catalogue, a provider pointing at an account that was renamed.
 */

const hospitals = (dataset: { tenants: readonly SeedTenantSpec[] }) =>
  dataset.tenants.filter((t) => t.kind === 'hospital');

describe('the staging dataset', () => {
  test('every service names a department that hospital actually has', () => {
    for (const t of hospitals(STAGING_DATASET)) {
      const codes = new Set((t.departments ?? []).map((d) => d.code.toUpperCase()));
      for (const s of t.services ?? []) {
        if (!s.department) continue;
        expect(codes, `${t.code} service ${s.code}`).toContain(s.department.toUpperCase());
      }
    }
  });

  test('every provider is linked to an account that exists', () => {
    for (const t of hospitals(STAGING_DATASET)) {
      const emails = new Set(t.users.map((u) => u.email));
      for (const p of t.providers ?? []) {
        if (!p.userEmail) continue;
        expect(emails, `${t.code} provider ${p.registrationNumber}`).toContain(p.userEmail);
      }
    }
  });

  test('every specialty is one the catalogue knows', () => {
    const known = new Set(SPECIALTY_CATALOG.map((s) => s.code));
    for (const t of hospitals(STAGING_DATASET)) {
      for (const p of t.providers ?? []) expect(known, `${t.code} ${p.fullName}`).toContain(p.specialty);
      for (const d of t.departments ?? []) {
        if (d.specialty) expect(known, `${t.code} department ${d.code}`).toContain(d.specialty);
      }
    }
  });

  test('nothing collides on the key the seeder identifies it by', () => {
    // A patient is found by phone, a provider by registration number, a user by email, a service
    // and a department by code (ADR-122). Two records sharing one of those inside a tenant means
    // the second is silently treated as already present.
    for (const t of STAGING_DATASET.tenants) {
      const unique = (values: Array<string | undefined>, what: string) => {
        const present = values.filter(Boolean) as string[];
        expect(new Set(present).size, `${t.code} duplicate ${what}`).toBe(present.length);
      };
      unique(t.users.map((u) => u.email), 'user email');
      unique((t.patients ?? []).map((p) => p.phone ?? undefined), 'patient phone');
      unique((t.providers ?? []).map((p) => p.registrationNumber), 'provider registration number');
      unique((t.services ?? []).map((s) => s.code.toUpperCase()), 'service code');
      unique((t.departments ?? []).map((d) => d.code.toUpperCase()), 'department code');
      unique((t.branches ?? []).map((b) => b.code.toUpperCase()), 'branch code');
      unique((t.labTests ?? []).map((l) => l.code?.toUpperCase()), 'lab test code');
      unique([...(t.registrationRequests ?? []), ...(t.bookingRequests ?? [])].map((r) => r.phone), 'request phone');
    }
    // Emails are how a person signs in, and the login is org-scoped — but a duplicate ACROSS
    // tenants would still confuse whoever reads the credentials list.
    const allEmails = STAGING_DATASET.tenants.flatMap((t) => t.users.map((u) => u.email));
    expect(new Set(allEmails).size).toBe(allEmails.length);
  });

  test('every hospital with a story keeps two charts activity-free', () => {
    // `seedClinicalStory` excludes the last two patients from the rotation, because "a patient
    // with no history yet" is a state every detail page has to render. A hospital whose story is
    // on and which has fewer than three patients would have almost nothing in the rotation.
    for (const t of hospitals(STAGING_DATASET)) {
      if (!t.story) continue;
      expect((t.patients ?? []).length, `${t.code} needs patients for its story`).toBeGreaterThan(2);
    }
  });

  test('the two E2E fixtures stay first, and stay spelled the way tests expect', () => {
    // ADR-114: these names are asserted on elsewhere. Adding patients must not reorder them.
    const qa = STAGING_DATASET.tenants.find((t) => t.code === 'QAHOSP')!;
    expect(qa.patients?.[0]).toMatchObject({ firstName: 'QA Patient', lastName: 'One' });
    expect(qa.patients?.[1]).toMatchObject({ firstName: 'QA Patient', lastName: 'Two' });
  });

  test('it is now shaped like development: several hospitals, one of them restricted', () => {
    // The gap this closes (ADR-132). One hospital could not exercise the two properties a
    // multi-tenant platform lives or dies by — isolation, and a module a tenant has not bought.
    const hs = hospitals(STAGING_DATASET);
    expect(hs.length).toBeGreaterThanOrEqual(3);
    expect(hs.some((t) => !(t.modules ?? []).includes('pharmacy'))).toBe(true);
    expect(hs.some((t) => t.status === 'suspended')).toBe(true);

    // And its busiest hospital carries a history comparable to development's busiest, which is
    // what the reported thinness was actually about.
    const busiestStaging = Math.max(...hs.map((t) => (t.story ? t.story.historyDays * t.story.visitsPerDay : 0)));
    const busiestDev = Math.max(
      ...hospitals(DEVELOPMENT_DATASET).map((t) => (t.story ? t.story.historyDays * t.story.visitsPerDay : 0)),
    );
    expect(busiestStaging).toBeGreaterThanOrEqual(busiestDev);
  });
});
