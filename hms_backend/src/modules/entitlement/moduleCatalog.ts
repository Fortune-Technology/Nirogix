// The module catalog. As of ADR-085 the single source of truth is the shared
// `MODULE_REGISTRY` in `@hms/permissions` (the canonical Domain → Module → Capability
// registry, shared with every frontend). This file is the backend's thin, backward-compatible
// view of it — the same `{ key, name, hardDependencies }` shape the entitlement engine has always
// consumed, derived from the registry so there is exactly ONE module list. A dependency is only
// "hard" when the module is genuinely inoperable without it; hard deps are enforced at grant time.

import { MODULE_REGISTRY } from '@hms/permissions';

export type ModuleDef = {
  key: string;
  name: string;
  hardDependencies: string[];
};

export const MODULE_CATALOG: readonly ModuleDef[] = MODULE_REGISTRY.map((m) => ({
  key: m.key,
  name: m.name,
  hardDependencies: [...m.hardDependencies],
}));

export const MODULE_KEYS: ReadonlySet<string> = new Set(MODULE_CATALOG.map((m) => m.key));

export function moduleDef(key: string): ModuleDef | undefined {
  return MODULE_CATALOG.find((m) => m.key === key);
}
