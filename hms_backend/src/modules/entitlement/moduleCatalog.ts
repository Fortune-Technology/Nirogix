// The module catalog with an explicit, deliberately sparse hard-dependency graph
// (resources/architecture.md → Module Entitlements; Module Capability Matrix). A dependency is
// only "hard" when the module is genuinely inoperable without it. Enforced at grant time.

export type ModuleDef = {
  key: string;
  name: string;
  hardDependencies: string[];
};

export const MODULE_CATALOG: readonly ModuleDef[] = [
  { key: 'patient', name: 'Patient Management', hardDependencies: [] },
  { key: 'appointment', name: 'Appointment Management', hardDependencies: ['patient'] },
  { key: 'opd', name: 'OPD & Check-in', hardDependencies: ['patient', 'appointment'] },
  { key: 'emr', name: 'Clinical Workflow (EMR)', hardDependencies: ['patient'] },
  { key: 'pharmacy', name: 'Pharmacy', hardDependencies: [] },
  { key: 'laboratory', name: 'Laboratory', hardDependencies: [] },
  { key: 'radiology', name: 'Radiology & Imaging', hardDependencies: [] },
  { key: 'billing', name: 'Billing & Payments', hardDependencies: [] },
  { key: 'inventory', name: 'Inventory, Stores & Procurement', hardDependencies: [] },
  { key: 'ipd', name: 'Admission (IPD)', hardDependencies: ['patient'] },
  { key: 'nursing', name: 'Nursing', hardDependencies: ['ipd'] },
  { key: 'emergency', name: 'Emergency Department', hardDependencies: ['patient'] },
  { key: 'ot', name: 'Operation Theatre', hardDependencies: ['ipd'] },
  { key: 'cssd', name: 'CSSD', hardDependencies: ['ot'] },
  { key: 'blood_bank', name: 'Blood Bank', hardDependencies: [] },
  { key: 'insurance', name: 'Insurance, TPA & Govt. Schemes', hardDependencies: ['billing'] },
  // ABDM / ABHA (ADR-084). Its own module, not part of `patient`: a hospital only gets it after
  // it has registered a facility with NHA, and a hospital that has not should never be shown a
  // control that cannot work. Depends on `patient` because everything it does ends on a chart.
  { key: 'abdm', name: 'ABDM / ABHA (Milestone 1)', hardDependencies: ['patient'] },
];

export const MODULE_KEYS: ReadonlySet<string> = new Set(MODULE_CATALOG.map((m) => m.key));

export function moduleDef(key: string): ModuleDef | undefined {
  return MODULE_CATALOG.find((m) => m.key === key);
}
