// @hms/permissions — the single source of truth for permission strings.
//
// Permission keys use a dot-hierarchy: module.submodule.page.action
// One mechanism gates modules, sub-modules, pages, tabs, and individual CRUD /
// sensitive actions — shared verbatim between the backend (enforcement) and the
// frontend (the Can guard + menu/route visibility). Frontend visibility is never
// treated as security; the backend re-checks every key independently.
//
// Populated in Stage 0. See resources/architecture.md (RBAC & User-Level Overrides)
// and resources/development-plan.md §12.
//
// Example shape (illustrative — real keys are added per module as modules are built):
//
//   export const PERMISSIONS = {
//     PATIENT_VIEW:   'patient.record.view',
//     PATIENT_CREATE: 'patient.record.create',
//     RBAC_MANAGE:    'admin.rbac.manage',
//   } as const;
//
//   export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export {};
