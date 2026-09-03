"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { cn } from "../cn";
import { useAnchoredPanel } from "./useAnchoredPanel";

export interface ComboboxOption {
  /** Stable id of the record behind the option — a drug id, a test id, an ICD-10 code. */
  value: string;
  /** The text shown in the list, written into the field on selection, and searched. */
  label: string;
  /** A second line under the label — a strength, a code, a department. */
  description?: string;
  /** Right-aligned detail — a price, a stock count. Not searched. */
  meta?: ReactNode;
  /** Extra text the search should match — a code, an alias, a brand name. */
  keywords?: string;
  /** Options carrying the same group name render together under that heading. */
  group?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  label?: ReactNode;
  /** The text in the field. Controlled — with `allowCustomValue`, free text is a real value. */
  value: string;
  /**
   * Fires on every keystroke and on every selection. `option` is the matched record, or
   * `null` when what is in the field is free text — which is exactly the pair a caller
   * stores (`drugName` + `drugId`), so nothing has to be re-derived afterwards.
   */
  onChange: (text: string, option: ComboboxOption | null) => void;
  options: readonly ComboboxOption[];
  /**
   * Called instead of `onChange` when an option is chosen, if given. For a
   * search-and-add control (ICD-10) that adds a row and resets the field rather than
   * binding one value.
   */
  onSelect?: (option: ComboboxOption) => void;
  /** Typing arbitrary text is a legitimate answer — an unstocked medicine, a test the master lacks. */
  allowCustomValue?: boolean;
  /** Filter `options` against what is typed. Turn off when a server already searched. */
  filter?: boolean;
  /** Notified (debounce at the call site) when the text changes, for a server-backed search. */
  onSearch?: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  hint?: ReactNode;
  /** Shown under the field when the text matches no option and custom values are allowed. */
  customValueHint?: ReactNode;
  required?: boolean;
  /** Options are still arriving; the panel says so instead of claiming the list is empty. */
  loading?: boolean;
  emptyMessage?: string;
  clearable?: boolean;
  id?: string;
  name?: string;
  className?: string;
  /** Class applied to the input itself — width constraints belong here. */
  inputClassName?: string;
  "aria-label"?: string;
}

function matches(option: ComboboxOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`.toLowerCase();
  // Every whitespace-separated term must appear, so "amox 500" finds Amoxicillin 500 mg
  // without the user having to type it in the order the master happens to store it.
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/**
 * The one **searchable, type-ahead** input (ADR-029 — build once, configure everywhere).
 *
 * `Select` answers "choose one of these"; this answers "choose one of these **or** write
 * your own", which is the shape every clinical master picker actually has — a drug that is
 * not in this hospital's formulary and a test the master has never heard of both still have
 * to be orderable, and the link (`drugId`, `testId`) is what the pharmacy and the lab use
 * when it exists. Reach for `Select` when a free-text answer is meaningless, and this when
 * the list is a *convenience over* a text field rather than the whole set of valid answers.
 *
 * It replaces `<input list={…}>` + `<datalist>`, which cannot show a second line, cannot be
 * styled at all, silently renders nothing on several browsers, and gives no way to tell a
 * picked option from a coincidentally identical string.
 *
 * The panel is portalled and positioned by `useAnchoredPanel`, the same code `Select` uses,
 * so an ancestor's `overflow` cannot clip it. Long labels wrap in the open list rather than
 * truncating — a half-shown drug name is what makes the wrong one get picked.
 *
 * Accessible by construction: `role="combobox"` with `aria-autocomplete="list"`, the panel a
 * `listbox`, the active option tracked with `aria-activedescendant`; ArrowUp/Down and
 * Home/End move, Enter selects, Esc closes, Tab closes and keeps what was typed.
 */
export function Combobox({
  label,
  value,
  onChange,
  options,
  onSelect,
  allowCustomValue = true,
  filter = true,
  onSearch,
  placeholder,
  disabled = false,
  error,
  hint,
  customValueHint,
  required = false,
  loading = false,
  emptyMessage = "No matches.",
  clearable = true,
  id,
  name,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const listId = `${fieldId}-list`;
  const messageId = `${fieldId}-msg`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { rect, measure, clear: clearRect } = useAnchoredPanel(wrapRef, open);

  const visible = useMemo(
    () => (filter ? options.filter((o) => matches(o, value)) : [...options]),
    [options, value, filter],
  );

  const exact = useMemo(
    () => options.find((o) => o.label.trim().toLowerCase() === value.trim().toLowerCase()) ?? null,
    [options, value],
  );

  const groups = useMemo(() => {
    const out: Array<{ name: string | null; items: Array<{ option: ComboboxOption; index: number }> }> = [];
    visible.forEach((option, index) => {
      const name = option.group ?? null;
      const last = out[out.length - 1];
      if (last && last.name === name) last.items.push({ option, index });
      else out.push({ name, items: [{ option, index }] });
    });
    return out;
  }, [visible]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    clearRect();
  }, [clearRect]);

  // `onSelect` and `onChange` are read through a ref: callers pass inline arrow functions
  // whose identity changes on every render, and an effect or callback keyed on them would
  // re-arm on each keystroke — the caret-jump failure ADR-127 exists to prevent.
  const handlers = useRef({ onChange, onSelect });
  handlers.current = { onChange, onSelect };

  const commit = useCallback(
    (option: ComboboxOption) => {
      if (option.disabled) return;
      const h = handlers.current;
      if (h.onSelect) h.onSelect(option);
      else h.onChange(option.label, option);
      close();
      inputRef.current?.focus();
    },
    [close],
  );

  const openPanel = useCallback(() => {
    if (disabled) return;
    measure();
    setActiveIndex(0);
    setOpen(true);
  }, [disabled, measure]);

  // Filtering can leave the active index past the end of the list.
  useEffect(() => {
    if (open && activeIndex >= visible.length) setActiveIndex(visible.length - 1);
  }, [open, activeIndex, visible.length]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
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
    for (let i = 0; i < visible.length; i++) {
      next = (next + delta + visible.length) % visible.length;
      if (!visible[next]?.disabled) break;
    }
    setActiveIndex(next);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown") {
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
        const option = visible[activeIndex];
        // Enter on a highlighted option selects it. With nothing highlighted the key is
        // left alone, so the field stays submittable inside a form.
        if (option) {
          e.preventDefault();
          commit(option);
        }
        break;
      }
      case "Tab":
        close();
        break;
      default:
        break;
    }
  }

  function onBlur() {
    // Without free text the field cannot be left holding a value that means nothing:
    // an unmatched string reverts to empty rather than looking like a real selection.
    if (!allowCustomValue && !exact && value !== "") onChange("", null);
  }

  const showCustomHint = Boolean(customValueHint) && allowCustomValue && !exact && value.trim() !== "";
  const hasMessage = Boolean(error || hint || showCustomHint);

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
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={typeof label === "string" ? label : ariaLabel}
          className="hms-select__list"
          style={{ maxHeight: rect.maxHeight }}
        >
          {loading ? (
            <p className="hms-select__empty">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="hms-select__empty">{emptyMessage}</p>
          ) : (
            groups.map((group, groupIndex) => (
              // Keyed by POSITION, not by name — the same reason as `Select`: a caller whose
              // options are not sorted by group repeats a name in two non-adjacent runs, and
              // keying on the name hands React two siblings with one key.
              <div key={`group-${groupIndex}`} role="group" aria-label={group.name ?? undefined}>
                {group.name && <p className="hms-select__group">{group.name}</p>}
                {group.items.map(({ option, index }) => (
                  <div
                    key={option.value}
                    id={`${fieldId}-opt-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={exact?.value === option.value}
                    aria-disabled={option.disabled || undefined}
                    className={cn(
                      "hms-select__option",
                      index === activeIndex && "hms-select__option--active",
                      exact?.value === option.value && "hms-select__option--selected",
                      option.disabled && "hms-select__option--disabled",
                    )}
                    onPointerMove={() => !option.disabled && setActiveIndex(index)}
                    // Pointer-down, not click: the field's own blur would otherwise close
                    // the panel before the click ever lands on the option.
                    onPointerDown={(e) => {
                      e.preventDefault();
                      commit(option);
                    }}
                  >
                    <span className="hms-select__check" aria-hidden>
                      {exact?.value === option.value ? <Check size={15} strokeWidth={2.5} /> : null}
                    </span>
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
      <div ref={wrapRef} className="hms-combobox">
        <Search size={15} strokeWidth={2} className="hms-combobox__icon" aria-hidden />
        <input
          id={fieldId}
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${fieldId}-opt-${activeIndex}` : undefined}
          aria-required={required || undefined}
          aria-invalid={!!error}
          aria-label={ariaLabel}
          aria-describedby={hasMessage ? messageId : undefined}
          className={cn("hms-combobox__input", inputClassName)}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          name={name}
          onChange={(e) => {
            const text = e.target.value;
            onChange(text, options.find((o) => o.label.trim().toLowerCase() === text.trim().toLowerCase()) ?? null);
            onSearch?.(text);
            setActiveIndex(0);
            if (!open) openPanel();
          }}
          onFocus={() => !open && openPanel()}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        {clearable && value !== "" && !disabled ? (
          <button
            type="button"
            aria-label="Clear"
            className="hms-combobox__clear"
            // Pointer-down for the same reason as an option: blur must not beat the click.
            onPointerDown={(e) => {
              e.preventDefault();
              onChange("", null);
              onSearch?.("");
              inputRef.current?.focus();
            }}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </div>
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
      {error ? (
        <span id={messageId} className="hms-field__error">
          {error}
        </span>
      ) : showCustomHint ? (
        <span id={messageId} className="hms-field__hint">
          {customValueHint}
        </span>
      ) : hint ? (
        <span id={messageId} className="hms-field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
