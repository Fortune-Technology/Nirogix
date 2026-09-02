// @hms/ui — shared design system for the Nirogix monorepo.
// (The `@hms/*` scope and the `--hms-*` token prefix are internal identifiers kept
//  deliberately at the rename — ADR-041. The product is Nirogix everywhere a person looks.)
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
export { Textarea } from './components/Textarea';
export type { TextareaFieldProps } from './components/Textarea';
export { Select } from './components/Select';
export type { SelectOption, SelectProps } from './components/Select';
export { PasswordField } from './components/PasswordField';
export type { PasswordFieldProps } from './components/PasswordField';
export { Card } from './components/Card';
export { PageHeader } from './components/PageHeader';
export type { PageHeaderProps } from './components/PageHeader';
export { PhoneField, localIndianMobile, canonicalIndianMobile } from './components/PhoneField';
export type { PhoneFieldProps } from './components/PhoneField';
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
  DateRangeFilter,
  NumberRangeFilter,
} from './components/data-table';
export type { Column, ColumnFilters, DataTableProps, DataTableQuery, ServerMode, SortState } from './components/data-table';
export type { DateRangeValue, DateRangeFilterProps, NumberRangeValue, NumberRangeFilterProps } from './components/data-table';
export { Menu, MenuItem, MenuCheckboxItem, MenuSeparator } from './components/Menu';
export type { MenuProps, MenuItemProps } from './components/Menu';
// The one Action-column system — every table's row actions (rules.md → Table Row Actions).
export {
  TableActions,
  TableAction,
  ViewAction,
  EditAction,
  DeleteAction,
  ToggleAction,
  MoreActions,
  actionsColumn,
} from './components/table-actions';
export type {
  TableActionsProps,
  TableActionProps,
  GenericTableActionProps,
  DeleteActionProps,
  ToggleActionProps,
  MoreActionsProps,
  MoreAction,
  ActionConfirm,
} from './components/table-actions';
export { Dialog } from './components/Dialog';
export type { DialogProps } from './components/Dialog';
export { ConfirmDialog } from './components/ConfirmDialog';
export type { ConfirmDialogProps } from './components/ConfirmDialog';
export { EmptyState, ErrorState, Skeleton } from './components/States';
// Scrolling over a focused number input must never change its value (ADR-127). Mounted once per
// app, alongside the other providers.
export { NumberInputGuard } from './components/NumberInputGuard';
// The one way a missing value is written — a reason, never a bare dash (ADR-123).
export { EmptyValue, ValueOrEmpty, emptyLabel, valueLabel } from './components/EmptyValue';
export type { EmptyValueProps, ValueOrEmptyProps, EmptyReason } from './components/EmptyValue';
export type { EmptyStateProps, ErrorStateProps, SkeletonProps } from './components/States';
export { BottomNav, NavDrawer, NavDrawerItem, NavDrawerSection, BOTTOM_NAV_MAX_ITEMS } from './components/MobileNav';
export type { BottomNavProps, NavDrawerProps, MobileNavItem } from './components/MobileNav';
// Dashboard data visualisation — token-driven, dependency-free (ADR-043).
export { AreaChart, BarChart, StatCard, UsageBar, ChartTable, compact } from './components/charts';
export type { AreaChartProps, BarChartProps, StatCardProps, UsageBarProps, Series } from './components/charts';
// The document/print layer — print prints the document, not the application (ADR-047).
export {
  PrintDocument,
  PrintSection,
  PrintFields,
  PrintTable,
  PrintTotals,
  PrintSignatures,
  PrintNote,
  PrintToolbar,
} from './components/print';
export type { PrintDocumentProps, DocumentBrand } from './components/print';
// Date & time ENTRY — the one date/time input set (ADR-048).
export { Calendar, DateField, TimeField, DateTimeField } from './components/datetime';
export type { CalendarProps, DateFieldProps, TimeFieldProps, DateTimeFieldProps } from './components/datetime';
// Date/time display — the one place a user-facing date or time is rendered (ADR-046).
export { DateDisplay, TimeDisplay, DateTimeDisplay } from './components/DateTimeDisplay';
export type { DateDisplayProps, TimeDisplayProps, DateTimeDisplayProps } from './components/DateTimeDisplay';
export { BrandMark } from './components/BrandMark';
export type { BrandMarkProps } from './components/BrandMark';
export { HeaderUser } from './components/HeaderUser';
export type { HeaderUserProps } from './components/HeaderUser';
export { PeriodFilter, makePeriod } from './components/PeriodFilter';
export type { PeriodFilterProps, PeriodValue } from './components/PeriodFilter';
export { usePeriodParam } from './usePeriodParam';
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
