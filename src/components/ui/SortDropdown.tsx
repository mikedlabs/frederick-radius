"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownAZ, Check, ChevronDown } from "lucide-react";

/**
 * SortDropdown — a small button that opens a single-select menu of
 * sort options. Lives next to layout toggles / item counts in list
 * page toolbars (/saved, /events, /category/[slug]).
 *
 * Why a custom component instead of <select> or Radix:
 *   - Native <select> can't be styled to match the brand pill
 *     vocabulary (rounded-full, brand accent on the active choice).
 *   - Radix DropdownMenu would be overkill here — this is one
 *     popup, one set of radio choices, no submenus, no triggers
 *     scattered around the page. Hand-rolled is ~80 lines and has
 *     no runtime dependency.
 *
 * Behavior:
 *   - Closed by default; clicking the trigger toggles open state.
 *   - Clicking an option commits the value and closes.
 *   - Esc closes; outside-click closes; Enter/Space on the trigger
 *     toggles. Roving focus inside the menu uses native browser
 *     tab order — the items are real buttons in DOM order so VO/NVDA
 *     announce them correctly.
 *   - The selected option is highlighted with the brand accent so
 *     a returning user sees their current sort in one glance.
 *
 * State ownership is the caller's. This component is presentational;
 * caller decides whether to persist in URL (nuqs), localStorage,
 * useState, or anything else.
 */

export type SortOption<K extends string = string> = {
  /** Stable key the caller uses to identify the sort. */
  key: K;
  /** Short user-facing label. ≤16 chars to fit the button + menu nicely. */
  label: string;
  /** Optional short hint shown under the label in the menu — e.g.
   *  "Most recently saved" under "Recent". */
  hint?: string;
};

export default function SortDropdown<K extends string = string>({
  options,
  value,
  onChange,
  label = "Sort",
  align = "right",
  className = "",
}: {
  options: ReadonlyArray<SortOption<K>>;
  value: K;
  onChange: (key: K) => void;
  /** Optional ARIA label (default "Sort"). Also used as the tooltip. */
  label?: string;
  /** Popup alignment relative to the trigger. */
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const choicesId = useId();
  const current = options.find((o) => o.key === value) ?? options[0];

  // Outside-click + Escape closes the menu. Bound only while open
  // so we don't add listeners pages don't need.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={choicesId}
        aria-label={`${label}: ${current?.label ?? ""}`}
        title={label}
        className="tap-44 inline-flex items-center gap-1.5 rounded-full border bg-[var(--app-bg-elevated)] px-3 py-1 text-[12px] font-semibold transition active:scale-[0.97]"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-ink-2)",
        }}
      >
        <ArrowDownAZ
          className="h-3.5 w-3.5"
          strokeWidth={2.25}
          aria-hidden
          style={{ color: "var(--app-ink-3)" }}
        />
        <span className="hidden sm:inline" style={{ color: "var(--app-ink-3)" }}>
          {label}:
        </span>
        <span>{current?.label ?? "Not set"}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.5}
          aria-hidden
          style={{ color: "var(--app-ink-3)" }}
        />
      </button>

      {open && (
        <div
          id={choicesId}
          role="group"
          aria-label={label}
          className={`absolute z-[var(--z-dropdown)] mt-1 min-w-[180px] overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-1 shadow-[var(--app-shadow-2)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ borderColor: "var(--app-border)" }}
        >
          {options.map((opt) => {
            const active = opt.key === value;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="flex min-h-[44px] w-full items-start gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--app-bg-sunken)]"
                style={{
                  // Brick on its own 10% tint is 3.83:1 at 13px. The pressed
                  // token is the text-on-light signal (5.80:1 on that ground).
                  color: active ? "var(--app-brand-press)" : "var(--app-ink)",
                  background: active
                    ? "color-mix(in srgb, var(--app-brand) 10%, transparent)"
                    : "transparent",
                  fontWeight: active ? 600 : 500,
                }}
              >
                <Check
                  className="mt-[3px] h-3 w-3 shrink-0"
                  strokeWidth={3}
                  aria-hidden
                  style={{
                    opacity: active ? 1 : 0,
                    color: "var(--app-brand)",
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight">{opt.label}</span>
                  {opt.hint && (
                    <span
                      className="block text-[11px] leading-tight"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {opt.hint}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
