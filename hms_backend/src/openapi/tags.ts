// Tag taxonomy = the Nirogix module map. Every documented operation carries one of these tags
// so Swagger UI groups the API by module. Add a tag here when a new module is introduced;
// the coverage validator requires every operation to be tagged.
export const OPENAPI_TAGS = [
  { name: 'Health', description: 'Liveness and readiness probes' },
  { name: 'Auth', description: 'Authentication — login, logout, token refresh, MFA, SSO' },
  { name: 'Admin', description: 'Tenant, organization and platform administration' },
  { name: 'Users', description: 'User accounts and staff records' },
  { name: 'RBAC', description: 'Roles, permissions, entitlements and user overrides' },
  { name: 'Patients', description: 'Patient registration, profiles and records' },
  { name: 'Doctors', description: 'Providers, specialties and schedules' },
  { name: 'Appointments', description: 'Appointment booking and scheduling' },
  { name: 'OPD', description: 'OPD check-in, queue and encounters' },
  { name: 'EMR', description: 'Clinical workflow / electronic medical records' },
  { name: 'Pharmacy', description: 'Pharmacy dispensing and stock' },
  { name: 'Laboratory', description: 'Lab orders, samples and results' },
  { name: 'Radiology', description: 'Radiology and imaging' },
  { name: 'IPD', description: 'Admissions, beds and inpatient workflow' },
  { name: 'Billing', description: 'Invoicing, payments and financial transactions' },
  { name: 'Insurance', description: 'Insurance, TPA and government schemes' },
  { name: 'Departments', description: 'Departments and units' },
  { name: 'Hospitals', description: 'Hospitals / branches' },
  { name: 'Notifications', description: 'Notification sending and templates' },
  { name: 'Files', description: 'File and document storage' },
  { name: 'Reports', description: 'Reporting and analytics' },
  { name: 'Config', description: 'Feature configuration and settings' },
  { name: 'Catalog', description: 'System master data + hospital custom items (ADR-072)' },
  { name: 'ABDM', description: 'ABDM / ABHA — Milestone 1 identity verification at registration (ADR-084)' },
  { name: 'Audit', description: 'Audit log and activity timeline' },
] as const;

export type OpenApiTag = (typeof OPENAPI_TAGS)[number]['name'];
