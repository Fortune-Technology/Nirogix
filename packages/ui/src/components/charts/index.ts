// Data visualisation for the platform's dashboards (ADR-043).
//
// Dependency-free SVG/CSS on the design tokens: the platform needs a small set of
// consistent charts, and a charting library would add bundle weight plus a second
// styling system to keep on-brand (rules.md → Dependency Rules). Colours are always
// passed in as tokens, so every chart follows Light/Dark and a tenant accent.
//
// Each chart repeats its numbers in a visually-hidden table — a drawing alone is
// not readable, and describing a trend in prose would be an interpretation.

export { AreaChart, ChartTable } from './AreaChart';
export type { AreaChartProps } from './AreaChart';
export { BarChart } from './BarChart';
export type { BarChartProps } from './BarChart';
export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';
export { UsageBar } from './UsageBar';
export type { UsageBarProps } from './UsageBar';
export { compact } from './geometry';
export type { Series } from './geometry';
