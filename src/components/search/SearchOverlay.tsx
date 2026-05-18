"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, MapPin, Calendar, Tag, Building2 } from "lucide-react";
import { searchIndex, type SearchResult, type SearchResultType } from "@/lib/search/index";
// Client-safe slim set (already decorated); NOT @/lib/loaders/places
// which static-imports the ~12MB enrichment into the browser bundle.
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { EVENT_BY_SLUG } from "@/data/events";
import { placeHoursTrust, eventTrust, type TrustSignal } from "@/lib/trust";
import TrustChip from "@/components/ui/TrustChip";

const ICON_BY_TYPE: Record<SearchResultType, typeof MapPin> = {
  place: MapPin,
  event: Calendar,
  category: Tag,
  municipality: Building2,
};

/**
 * Same trust signal the rest of the app shows, resolved from the
 * lightweight search index. Places go through the P0-1 canonical
 * resolver so a closed/folded slug never carries a stale signal;
 * categories and municipalities have no provenance, so no chip.
 */
function resultTrust(r: SearchResult): TrustSignal | null {
  if (r.type === "place") {
    const p = clientPlaceBySlug(r.id.replace(/^place:/, ""));
    return p ? placeHoursTrust(p.open_status) : null;
  }
  if (r.type === "event") {
    const e = EVENT_BY_SLUG[r.id.replace(/^event:/, "")];
    return e ? eventTrust(e) : null;
  }
  return null;
}

const COLOR_BY_TYPE: Record<SearchResultType, string> = {
  place: "var(--app-brand)",
  event: "var(--app-accent)",
  category: "var(--app-cool)",
  municipality: "var(--app-positive)",
};

export default function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Build results client-side from the search index
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    return searchIndex(query, 12);
  }, [query]);

  // Focus the input when overlay opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional UI reset when the overlay closes
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  // Keyboard navigation: arrows, Enter, Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        const r = results[activeIdx];
        if (r) {
          e.preventDefault();
          window.location.href = r.href;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, onClose]);

  // Reset active index when query changes
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset highlight to the top result whenever the query changes
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Scroll active result into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Search Frederick Radius"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />

      {/* Sheet */}
      <div
        className="relative z-10 mx-4 mt-[10vh] w-full max-w-screen-sm overflow-hidden rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-elevated)] shadow-[var(--app-shadow-3)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        {/* Input */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <Search className="h-5 w-5 shrink-0" strokeWidth={1.75} style={{ color: "var(--app-ink-3)" }} aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search places, events, towns…"
            aria-label="Search"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-[var(--app-ink-3)]"
            style={{ color: "var(--app-ink)" }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear"
              className="shrink-0 rounded-full p-1 transition hover:bg-[var(--app-bg-sunken)]"
            >
              <X className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
            </button>
          )}
          <kbd
            className="hidden shrink-0 rounded border bg-[var(--app-bg-sunken)] px-1.5 py-0.5 text-[10px] font-medium sm:inline-block"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() ? (
            <EmptyHint />
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--app-ink-3)" }}>
              <p>No matches for <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>“{query}”</span>.</p>
              <p className="mt-1 text-xs">Try a different word, a category like &quot;coffee&quot;, or a town.</p>
            </div>
          ) : (
            <ul ref={listRef} role="listbox" className="py-1">
              {results.map((r, i) => {
                const Icon = ICON_BY_TYPE[r.type];
                const color = COLOR_BY_TYPE[r.type];
                const active = i === activeIdx;
                const trust = resultTrust(r);
                return (
                  <li key={r.id} role="option" aria-selected={active} data-idx={i}>
                    <Link
                      href={r.href}
                      onClick={onClose}
                      onMouseEnter={() => setActiveIdx(i)}
                      className="flex items-start gap-3 px-4 py-2.5 outline-none"
                      style={{
                        background: active ? "var(--app-bg-sunken)" : "transparent",
                      }}
                    >
                      <span
                        aria-hidden
                        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                        style={{ background: `${color}1A`, color }}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                          {r.title}
                        </p>
                        <p className="truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                          {r.subtitle}
                        </p>
                        {trust && <TrustChip signal={trust} className="mt-1" />}
                      </div>
                      <span
                        className="ml-2 shrink-0 self-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                        style={{
                          background: `${color}14`,
                          color,
                        }}
                      >
                        {r.type}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hints */}
        <div
          className="flex items-center justify-between border-t px-4 py-2 text-[10px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          <div className="flex items-center gap-3">
            <KbdHint label="↑↓" desc="navigate" />
            <KbdHint label="↵" desc="open" />
            <KbdHint label="esc" desc="close" />
          </div>
          <p>{results.length > 0 ? `${results.length} match${results.length === 1 ? "" : "es"}` : ""}</p>
        </div>
      </div>
    </div>
  );
}

function KbdHint({ label, desc }: { label: string; desc: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd
        className="rounded border bg-[var(--app-bg-sunken)] px-1 text-[10px] font-medium"
        style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
      >
        {label}
      </kbd>
      <span>{desc}</span>
    </span>
  );
}

function EmptyHint() {
  return (
    <div className="px-4 py-6">
      <p className="text-xs font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
        Try searching for
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {["coffee", "brunswick", "alive at five", "live music", "weinberg", "carroll creek"].map((s) => (
          <li key={s}>
            <button
              type="button"
              data-suggestion={s}
              onClick={(e) => {
                const input = (e.currentTarget.closest("[role=dialog]") as HTMLElement)?.querySelector("input");
                if (input) {
                  (input as HTMLInputElement).value = s;
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  // input.onChange relies on React event system, so we set value + dispatch
                  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                  setter?.call(input, s);
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }}
              className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
