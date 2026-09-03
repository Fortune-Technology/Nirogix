import { describe, expect, test } from 'vitest';
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  CAPABILITY_KEYS,
  MODULE_REGISTRY,
  REGISTRY_MODULE_KEYS,
  capabilityDef,
  capabilityDependents,
  isCapabilityBuilt,
  isModuleBuilt,
  moduleCapabilities,
} from '@hms/permissions';
import { MODULE_CATALOG } from '../moduleCatalog';
import { isCapabilityRowEffective, resolveCapabilityEnabled } from '../capability.service';

// Pure invariants of the ADR-085 Module & Capability registry and the deny-by-exception resolver.
// No database — this file always runs.

describe('module & capability registry integrity', () => {
  test('the backend module catalog is exactly the shared registry (one source of truth)', () => {
    expect(MODULE_CATALOG.map((m) => m.key)).toEqual(MODULE_REGISTRY.map((m) => m.key));
    for (const m of MODULE_REGISTRY) {
      const def = MODULE_CATALOG.find((x) => x.key === m.key)!;
      expect(def.name).toBe(m.name);
      expect(def.hardDependencies).toEqual([...m.hardDependencies]);
    }
  });

  test('module keys are unique', () => {
    const keys = MODULE_REGISTRY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every hard dependency references a real module', () => {
    for (const m of MODULE_REGISTRY) {
      for (const dep of m.hardDependencies) {
        expect(REGISTRY_MODULE_KEYS.has(dep)).toBe(true);
      }
    }
  });

  test('capability keys are unique, namespaced under their module, and back-reference it', () => {
    expect(new Set(ALL_CAPABILITIES.map((c) => c.key)).size).toBe(ALL_CAPABILITIES.length);
    for (const c of ALL_CAPABILITIES) {
      expect(REGISTRY_MODULE_KEYS.has(c.moduleKey)).toBe(true);
      expect(c.key.startsWith(`${c.moduleKey}.`)).toBe(true);
      expect(moduleCapabilities(c.moduleKey).some((x) => x.key === c.key)).toBe(true);
    }
  });

  test('capability dependencies reference real capabilities', () => {
    for (const c of ALL_CAPABILITIES) {
      for (const dep of c.dependencies ?? []) {
        expect(CAPABILITY_KEYS.has(dep)).toBe(true);
      }
    }
  });

  test('the CAPABILITIES map only names real, BUILT capabilities', () => {
    for (const key of Object.values(CAPABILITIES)) {
      expect(capabilityDef(key)).toBeDefined();
      expect(isCapabilityBuilt(key)).toBe(true);
    }
  });

  test('the live modules are BUILT and the unshipped ones are AVAILABLE', () => {
    for (const key of [
      'patient',
      'appointment',
      'opd',
      'emr',
      'pharmacy',
      'laboratory',
      'billing',
      'abdm',
    ]) {
      expect(isModuleBuilt(key)).toBe(true);
    }
    for (const key of [
      'radiology',
      'ipd',
      'nursing',
      'emergency',
      'ot',
      'cssd',
      'blood_bank',
      'insurance',
      'inventory',
    ]) {
      expect(isModuleBuilt(key)).toBe(false);
    }
  });

  // The honesty rule (ADR-038 / ADR-085): an unbuilt module may DESCRIBE its capabilities so the
  // architecture and the admin surface are complete, but none of them may claim to be BUILT.
  test('a non-BUILT module never declares a BUILT capability', () => {
    for (const m of MODULE_REGISTRY) {
      if (m.status === 'BUILT') continue;
      expect(m.capabilities.filter((c) => c.status === 'BUILT')).toEqual([]);
    }
  });

  test('the catalog covers the whole decomposition, by domain', () => {
    // Every one of the eleven domains that carries modules is represented, and the catalog is
    // the full map rather than the original seventeen-module entitlement list.
    expect(MODULE_REGISTRY.length).toBeGreaterThanOrEqual(40);
    expect(ALL_CAPABILITIES.length).toBeGreaterThanOrEqual(200);
    for (const category of [
      'CORE',
      'CLINIC',
      'HOSPITAL',
      'BILLING',
      'ADD_ON',
      'SPECIALTY',
      'CLINICAL',
      'PATIENT_ENGAGEMENT',
      'REPORTING',
      'AI',
      'PLATFORM',
    ]) {
      expect(MODULE_REGISTRY.some((m) => m.category === category)).toBe(true);
    }
  });

  test('the seventeen pre-existing module keys survive unchanged', () => {
    // Changing one of these would change what an existing tenant can be granted.
    for (const key of [
      'patient',
      'appointment',
      'opd',
      'emr',
      'pharmacy',
      'laboratory',
      'radiology',
      'billing',
      'inventory',
      'ipd',
      'nursing',
      'emergency',
      'ot',
      'cssd',
      'blood_bank',
      'insurance',
      'abdm',
    ]) {
      expect(REGISTRY_MODULE_KEYS.has(key)).toBe(true);
    }
  });

  test('capabilityDependents finds capabilities that depend on a key', () => {
    // abdm.scan_share depends on abdm.facility (the one dependency edge in the P1 registry).
    expect(capabilityDependents('abdm.facility').map((c) => c.key)).toContain('abdm.scan_share');
    expect(capabilityDependents('billing.services')).toEqual([]);
  });
});

describe('deny-by-exception resolver', () => {
  const active = {
    status: 'ACTIVE',
    effectiveFrom: new Date(Date.now() - 1000),
    effectiveUntil: null,
  };
  const disabled = {
    status: 'DISABLED',
    effectiveFrom: new Date(Date.now() - 1000),
    effectiveUntil: null,
  };
  const expired = {
    status: 'ACTIVE',
    effectiveFrom: new Date(Date.now() - 2000),
    effectiveUntil: new Date(Date.now() - 1000),
  };
  const future = {
    status: 'ACTIVE',
    effectiveFrom: new Date(Date.now() + 60_000),
    effectiveUntil: null,
  };

  test('module not entitled → capability off regardless of any row', () => {
    expect(resolveCapabilityEnabled(false, undefined)).toBe(false);
    expect(resolveCapabilityEnabled(false, active)).toBe(false);
  });

  test('module entitled + no override row → capability ON by default', () => {
    expect(resolveCapabilityEnabled(true, undefined)).toBe(true);
  });

  test('module entitled + an explicit disable/expiry/future row → OFF', () => {
    expect(resolveCapabilityEnabled(true, disabled)).toBe(false);
    expect(resolveCapabilityEnabled(true, expired)).toBe(false);
    expect(resolveCapabilityEnabled(true, future)).toBe(false);
  });

  test('module entitled + an explicit ACTIVE row → ON', () => {
    expect(resolveCapabilityEnabled(true, active)).toBe(true);
  });

  test('isCapabilityRowEffective combines status and dates', () => {
    expect(isCapabilityRowEffective(active)).toBe(true);
    expect(isCapabilityRowEffective(disabled)).toBe(false);
    expect(isCapabilityRowEffective(expired)).toBe(false);
    expect(isCapabilityRowEffective(future)).toBe(false);
  });
});
