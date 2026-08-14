// @hms/ui — shared design system for the HMS monorepo.
//
// The single design-token set (Light default + Dark, tokens in `styles.css`) plus
// one canonical implementation per UI primitive and the Standard DataTable. No
// component hardcodes a raw color / spacing / radius / type value — everything
// derives from the `--hms-*` custom properties. Consumed by hms_frontend (Portal)
// and marketing. See resources/rules.md (Design System) and development-plan.md §14.
//
// Styles ship separately: `import '@hms/ui/styles.css'` once in the consuming app.

export { cn } from './cn';
export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';
export { Field } from './components/Input';
export type { FieldProps } from './components/Input';
export { PasswordField } from './components/PasswordField';
export type { PasswordFieldProps } from './components/PasswordField';
export { Card } from './components/Card';
export type { CardProps } from './components/Card';
export { Badge } from './components/Badge';
export type { BadgeProps } from './components/Badge';
export { Alert } from './components/Alert';
export type { AlertProps } from './components/Alert';
export { Spinner } from './components/Spinner';
export type { SpinnerProps } from './components/Spinner';
export { DataTable } from './components/DataTable';
export type { Column, DataTableProps } from './components/DataTable';
