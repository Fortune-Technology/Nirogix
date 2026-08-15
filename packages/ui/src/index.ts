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
export { Toaster } from './components/Toaster';
export type { ToasterProps } from './components/Toaster';
export { toast } from './toast';
export type { ToastOptions, ToastVariant, ToastAction } from './toast';
// The Standard DataTable system + the shared patterns it is built from (ADR-029).
export {
  DataTable,
  DataTableToolbar,
  DataTablePagination,
  DataTableColumnHeader,
  DataTableViewOptions,
  DataTableFacetedFilter,
} from './components/data-table';
export type { Column, DataTableProps, DataTableQuery, ServerMode, SortState } from './components/data-table';
export { Menu, MenuItem, MenuCheckboxItem, MenuSeparator } from './components/Menu';
export type { MenuProps, MenuItemProps } from './components/Menu';
export { ActionMenu } from './components/ActionMenu';
export type { ActionMenuProps, RowAction } from './components/ActionMenu';
export { ConfirmDialog } from './components/ConfirmDialog';
export type { ConfirmDialogProps } from './components/ConfirmDialog';
export { EmptyState, ErrorState, Skeleton } from './components/States';
export type { EmptyStateProps, ErrorStateProps, SkeletonProps } from './components/States';
export { BackToTop } from './components/BackToTop';
export type { BackToTopProps } from './components/BackToTop';
export { SmoothScroll } from './components/SmoothScroll';
export type { SmoothScrollProps } from './components/SmoothScroll';
export { useScrollLock } from './useScrollLock';
export { LottiePlayer } from './components/LottiePlayer';
export type { LottiePlayerProps } from './components/LottiePlayer';
export { LottiePreloader } from './components/LottiePreloader';
export type { LottiePreloaderProps } from './components/LottiePreloader';
export { recolorLottie } from './lottieRecolor';
export type { RecolorOptions } from './lottieRecolor';
