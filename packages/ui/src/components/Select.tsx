"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "../cn";

export interface SelectOption<V extends string = string> {
  value: V;
  /** The text shown in the trigger and the list, and the text the search matches. */
  label: string;
  /** A second line under the label — a department, a speciality, a code. */
  description?: string;
  /** Right-aligned detail — a fee, a count, a status. Not searched. */
  meta?: ReactNode;
  /** An icon or avatar shown before the label, in both the trigger and the list. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Options carrying the same group name are rendered together under that heading. */
  group?: string;
  /** Extra text the search should match — a phone number, a UHID, an alias. */
  keywords?: string;
}

export interface SelectProps<V extends string = string> {
  label?: ReactNode;
  /** The selected value, or `""` for nothing selected. Controlled. */
  value: V | "";
  onChange: (value: V | "") => void;
  options: readonly SelectOption<V>[];
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string;
  /**
   * Whether the panel carries a search box. `"auto"` (the default) turns it on once the
   * list is longer than `searchThreshold`, which is the case that actually needs it —
   * a five-item list is faster to read than to type into.
   */
  searchable?: boolean | "auto";
  searchThreshold?: number;
  /** Offer an explicit "clear" affordance. Pair with a placeholder that reads as a real state. */
  clearable?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  id?: string;
  /** Rendered as a hidden input so the control participates in an uncontrolled `<form>` submit. */
  name?: string;
  className?: string;
  /** Class applied to the trigger — width constraints belong here. */
  triggerClassName?: string;
  /** Shown when the list is empty, or when a search matches nothing. */
  emptyMessage?: string;
  /** Options are still loading; the panel says so instead of claiming the list is empty. */
  loading?: boolean;
  "aria-label"?: string;
}

const DEFAULT_SEARCH_THRESHOLD = 7;
/** Room the panel wants below the trigger before it gives up and flips above it. */
const PANEL_SPACE = 260;

function matches(option: SelectOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`.toLowerCase();
  // Every whitespace-separated term must appear, so "sharma cardio" finds a cardiologist
  // named Sharma without the user having to remember the order they are written in.
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

interface PanelRect {
  left: number;
  width: number;
  top: number | null;
  bottom: number | null;
  maxHeight: number;
}

/**
 * The one dropdown/select primitive (ADR-029 — build once, configure everywhere).
 *
 * A native `<select>` cannot show a second line, cannot be searched, renders in the
 * browser's own chrome rather than the design tokens, and on a phone hands the user an
 * OS wheel that ignores every one of them. Every dropdown in the product is this
 * component; reach for it before writing another `<select className="hms-input">`.
 *
 * The panel is rendered into a portal and positioned in viewport coordinates, so a
 * dialog's scrolling body, a sticky table header or any ancestor's `overflow` cannot
 * clip it — the failure that makes an in-flow dropdown feel cramped and half-usable. It
 * is width-matched to the trigger, scrolls at a computed maximum height, and flips above
 * the trigger when the space below is too small.
 *
 * Long labels truncate in the trigger with an ellipsis and keep their full text in
 * `title`; in the open list they wrap instead, because a half-shown drug or department
 * name is what makes the wrong one get picked.
 *
 * Accessible by construction: the trigger is a `combobox`, the panel a `listbox`, the
 * active option tracked with `aria-activedescendant`; Enter/Space open, ArrowUp/Down,
 * Home/End move, Enter selects, Esc closes and returns focus to the trigger.
 */
export function Select<V extends string = string>({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable = "auto",
  searchThreshold = DEFAULT_SEARCH_THRESHOLD,
  clearable = false,
  disabled = false,
  error,
  hint,
  required = false,
  id,
  name,
  className,
  triggerClassName,
  emptyMessage = "No matches.",
  loading = false,
  "aria-label": ariaLabel,
}: SelectProps<V>) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const listId = `${fieldId}-list`;
  const messageId = `${fieldId}-msg`;
  const hasMessage = Boolean(error || hint);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<PanelRect | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const showSearch = searchable === true || (searchable === "auto" && options.length > searchThreshold);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const visible = useMemo(
    () => (showSearch ? options.filter((o) => matches(o, query)) : options),
    [options, query, showSearch],
  );

  // Group headings are rendered in first-appearance order, so the caller controls the
  // ordering by ordering the options — there is no second sort to keep in sync.
  const groups = useMemo(() => {
    const out: Array<{ name: string | null; items: Array<{ option: SelectOption<V>; index: number }> }> = [];
    visible.forEach((option, index) => {
      const name = option.group ?? null;
      const last = out[out.length - 1];
      if (last && last.name === name) last.items.push({ option, index });
      else out.push({ name, items: [{ option, index }] });
    });
    return out;
  }, [visible]);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const up = spaceBelow < PANEL_SPACE && spaceAbove > spaceBelow;
    setRect({
      left: r.left,
      width: r.width,
      top: up ? null : r.bottom + gap,
      bottom: up ? window.innerHeight - r.top + gap : null,
      // Never taller than the room actually available, so the panel cannot run off-screen.
      maxHeight: Math.max(140, Math.min(PANEL_SPACE + 60, up ? spaceAbove : spaceBelow) - 8),
    });
  }, []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    setRect(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (option: SelectOption<V>) => {
      if (option.disabled) return;
      onChange(option.value);
      close();
    },
    [onChange, close],
  );

  // Opening points the active option at the current selection, so ArrowDown continues
  // from where the user is rather than restarting at the top of a long list.
  const openPanel = useCallback(() => {
    if (disabled) return;
    measure();
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }, [disabled, measure, options, value]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    if (showSearch) searchRef.current?.focus();
    else listRef.current?.focus();
  }, [open, showSearch]);

  // Filtering can leave the active index past the end of the list.
  useEffect(() => {
    if (open && activeIndex >= visible.length) setActiveIndex(visible.length - 1);
  }, [open, activeIndex, visible.length]);

  // The panel lives in a portal, so it follows the trigger only if it is told to.
  // Capture-phase catches scrolling in any ancestor, not just the window.
  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => measure();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Keep the active option in view when the keyboard walks past the scroll edge.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function move(delta: number) {
    if (visible.length === 0) return;
    let next = activeIndex;
    // Skip disabled options rather than parking the highlight on something unselectable.
    for (let i = 0; i < visible.length; i++) {
      next = (next + delta + visible.length) % visible.length;
      if (!visible[next]?.disabled) break;
    }
    setActiveIndex(next);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(visible.findIndex((o) => !o.disabled));
        break;
      case "End":
        e.preventDefault();
        for (let i = visible.length - 1; i >= 0; i--) {
          if (!visible[i]?.disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      case "Enter": {
        e.preventDefault();
        const option = visible[activeIndex];
        if (option) commit(option);
        break;
      }
      case "Tab":
        close(false);
        break;
      default:
        break;
    }
  }

  const panel =
    open && rect ? (
      <div
        ref={panelRef}
        className="hms-select__panel"
        style={{
          left: rect.left,
          width: rect.width,
          ...(rect.top != null ? { top: rect.top } : { bottom: rect.bottom ?? 0 }),
        }}
      >
        {showSearch && (
          <div className="hms-select__search">
            <Search size={15} strokeWidth={2} aria-hidden />
            <input
              ref={searchRef}
              type="text"
              className="hms-select__search-input"
              placeholder="Search…"
              value={query}
              aria-label="Search options"
              aria-controls={listId}
              autoComplete="off"
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
        )}
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          tabIndex={showSearch ? -1 : 0}
          aria-label={typeof label === "string" ? label : ariaLabel}
          aria-activedescendant={activeIndex >= 0 ? `${fieldId}-opt-${activeIndex}` : undefined}
          className="hms-select__list"
          style={{ maxHeight: rect.maxHeight }}
          onKeyDown={showSearch ? undefined : onKeyDown}
        >
          {loading ? (
            <p className="hms-select__empty">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="hms-select__empty">{emptyMessage}</p>
          ) : (
            groups.map((group) => (
              <div key={group.name ?? "__ungrouped"} role="group" aria-label={group.name ?? undefined}>
                {group.name && <p className="hms-select__group">{group.name}</p>}
                {group.items.map(({ option, index }) => (
                  <div
                    key={option.value}
                    id={`${fieldId}-opt-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled || undefined}
                    className={cn(
                      "hms-select__option",
                      index === activeIndex && "hms-select__option--active",
                      option.value === value && "hms-select__option--selected",
                      option.disabled && "hms-select__option--disabled",
                    )}
                    onPointerMove={() => !option.disabled && setActiveIndex(index)}
                    onClick={() => commit(option)}
                  >
                    <span className="hms-select__check" aria-hidden>
                      {option.value === value ? <Check size={15} strokeWidth={2.5} /> : null}
                    </span>
                    {option.icon ? <span className="hms-select__icon">{option.icon}</span> : null}
                    <span className="hms-select__option-text">
                      <span className="hms-select__option-label">{option.label}</span>
                      {option.description && <span className="hms-select__option-desc">{option.description}</span>}
                    </span>
                    {option.meta ? <span className="hms-select__meta">{option.meta}</span> : null}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className={cn("hms-field", className)}>
      {label && (
        <label className="hms-label" htmlFor={fieldId}>
          {label}
          {required && (
            <span className="hms-select__required" aria-hidden>
              {" "}
              *
            </span>
          )}
        </label>
      )}
      <div className="hms-select">
        <button
          id={fieldId}
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="listbox"
          aria-required={required || undefined}
          aria-invalid={!!error}
          aria-label={ariaLabel}
          aria-describedby={hasMessage ? messageId : undefined}
          disabled={disabled}
          className={cn(
            "hms-select__trigger",
            error && "hms-select__trigger--error",
            !selected && "hms-select__trigger--empty",
            triggerClassName,
          )}
          onClick={() => (open ? close() : openPanel())}
          onKeyDown={onKeyDown}
        >
          {selected?.icon ? <span className="hms-select__icon">{selected.icon}</span> : null}
          <span className="hms-select__value" title={selected?.label}>
            {selected ? selected.label : placeholder}
          </span>
          {selected?.meta ? <span className="hms-select__meta">{selected.meta}</span> : null}
          {clearable && selected && !disabled ? (
            // A span, not a nested button: a button inside a button is invalid HTML and
            // breaks the trigger's own keyboard handling.
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              className="hms-select__clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </span>
          ) : null}
          <ChevronDown size={16} strokeWidth={2} className="hms-select__chevron" aria-hidden />
        </button>
        {name && <input type="hidden" name={name} value={value} />}
      </div>
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
      {error ? (
        <span id={messageId} className="hms-field__error">
          {error}
        </span>
      ) : hint ? (
        <span id={messageId} className="hms-field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
