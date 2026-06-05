"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";

/**
 * Frederick-County-scoped place autocomplete input.
 *
 * The dropdown is keyboard-navigable (↑/↓/Enter/Esc), accessible
 * (listbox + option roles, aria-activedescendant), and debounced so
 * the API isn't hit on every keystroke. All API hits go through
 * /api/discover/autocomplete, where the server enforces the county
 * bbox restriction + the includedRegionCodes:["us"] guard.
 *
 * Selecting a suggestion bubbles up via onSelect with the Google
 * place_id + the display text. The parent decides what to do next —
 * typically a Place Details fetch + a route to the result page.
 */

export type AutocompleteOption = {
  place_id: string;
  primary: string;
  secondary: string;
  full_text: string;
  types: string[];
};

export default function LocationAutocomplete({
  placeholder = "Search Frederick County…",
  onSelect,
  className = "",
  initialValue = "",
}: {
  placeholder?: string;
  onSelect: (s: AutocompleteOption) => void;
  className?: string;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const listId = `${inputId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetcher. Aborts any in-flight request before firing a
  // new one so a fast typer can't show stale results.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setOptions([]);
      setLoading(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/discover/autocomplete?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const json = (await res.json()) as
          | { ok: true; suggestions: AutocompleteOption[] }
          | { ok: false; message: string };
        if (!ctrl.signal.aborted) {
          if (json.ok) {
            setOptions(json.suggestions);
            setError(null);
            setActive(0);
          } else {
            setOptions([]);
            setError(json.message);
          }
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setOptions([]);
          setError(e instanceof Error ? e.message : "Network error");
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  function choose(opt: AutocompleteOption) {
    onSelect(opt);
    setValue(opt.full_text);
    setOpen(false);
    setOptions([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && options.length > 0) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (options[active]) {
        e.preventDefault();
        choose(options[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function clear() {
    setValue("");
    setOptions([]);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className={`relative ${className}`}>
      <label htmlFor={inputId} className="sr-only">
        Search Frederick County
      </label>
      <div
        className="tactile flex items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3.5 py-2.5"
        style={{ borderColor: "var(--app-border)" }}
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so click-on-option still registers before the
            // blur kills the dropdown.
            setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[active] ? `${listId}-opt-${active}` : undefined
          }
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-60"
          style={{ color: "var(--app-ink)" }}
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear"
            className="shrink-0 rounded-full p-1 transition active:scale-[0.9]"
            style={{ color: "var(--app-ink-3)" }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>

      {open && (options.length > 0 || loading || error) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1.5 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-3)]"
          style={{ borderColor: "var(--app-border)" }}
        >
          {loading && options.length === 0 && (
            <li className="px-3.5 py-2.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              Searching Frederick County…
            </li>
          )}
          {error && (
            <li className="px-3.5 py-2.5 text-[12px]" style={{ color: "var(--app-danger)" }}>
              {error}
            </li>
          )}
          {options.map((opt, i) => {
            const isActive = i === active;
            return (
              <li
                key={opt.place_id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  // mousedown beats blur — keeps the click landing.
                  e.preventDefault();
                  choose(opt);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 transition-colors ${
                  isActive ? "bg-[var(--app-bg-sunken)]" : ""
                }`}
              >
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  strokeWidth={2}
                  style={{ color: "var(--app-brand)" }}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span
                    className="block truncate text-[14px] font-semibold"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {opt.primary}
                  </span>
                  {opt.secondary && (
                    <span
                      className="block truncate text-[11px]"
                      style={{ color: "var(--app-ink-3)" }}
                    >
                      {opt.secondary}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
