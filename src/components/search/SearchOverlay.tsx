"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, MapPin, Calendar, Tag, Building2, Clock, ArrowRight, Sparkles } from "lucide-react";
import type { SearchResult, SearchResultType } from "@/lib/search/index";
// A2.5: SearchOverlay no longer static-imports lib/search.ts (and its
// transitive places-client.json ~2MB blob) into every page's client
// bundle. It now fetches /api/search with a 150ms debounce and an
// AbortController so an out-of-order request can't overwrite a newer
// result. Trust signals are populated server-side on each result so
// the overlay doesn't need clientPlaceBySlug / EVENT_BY_SLUG either.
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import TrustChip from "@/components/ui/TrustChip";
import { useRecentSearches, usePushRecentSearch, useClearRecentSearches } from "@/hooks/useRecentSearches";
import { suggestionsForHour, frederickHour } from "@/lib/search-suggestions";
import { getHomeMuni } from "@/lib/personalize";

const ICON_BY_TYPE: Record<SearchResultType, typeof MapPin> = {
  place: MapPin,
  event: Calendar,
  category: Tag,
  municipality: Building2,
  action: ArrowRight,
};

/**
 * Wrap each occurrence of `needle` in the haystack with a <mark> span.
 * Case-insensitive; preserves the original casing of the haystack so
 * "Tabù" still reads "Tabù" with the matched portion highlighted.
 * Renders the rest as plain text fragments so React keeps it stable.
 */
function highlight(haystack: string, needle: string): React.ReactNode {
  const q = needle.trim();
  if (!q) return haystack;
  const lower = haystack.toLowerCase();
  const lq = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < haystack.length) {
    const at = lower.indexOf(lq, i);
    if (at < 0) {
      parts.push(haystack.slice(i));
      break;
    }
    if (at > i) parts.push(haystack.slice(i, at));
    parts.push(
      <mark
        key={key++}
        className="rounded-sm px-0.5"
        style={{
          background: "color-mix(in srgb, var(--app-brand) 22%, transparent)",
          color: "var(--app-ink)",
        }}
      >
        {haystack.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
  }
  return parts;
}

const COLOR_BY_TYPE: Record<SearchResultType, string> = {
  place: "var(--app-brand)",
  event: "var(--app-accent)",
  category: "var(--app-cool)",
  municipality: "var(--app-positive)",
  action: "var(--app-cool)",
};

export default function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const recent = useRecentSearches();
  const pushRecent = usePushRecentSearch();
  const clearRecent = useClearRecentSearches();

  // Debounced fetch against /api/search. 150ms feels instant on a fast
  // typer but still coalesces 3-4 keystrokes into a single round trip.
  // AbortController prevents out-of-order responses from clobbering
  // newer ones — without it, a slow "co" can land after a fast "coffee"
  // and replace the right answer with the wrong one.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=12`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: { results: SearchResult[] }) => {
          setResults(data.results ?? []);
        })
        .catch((err) => {
          // AbortError is expected when the user keeps typing — never
          // surface it. Other errors collapse to "no results" so the
          // overlay still feels responsive even if the API is down.
          if (err && err.name !== "AbortError") {
            setResults([]);
          }
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
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
          // Persist the query so the next time the user opens the
          // overlay they see their last queries first.
          if (query.trim()) pushRecent(query.trim());
          window.location.href = r.href;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // pushRecent + query are read inside the handler when Enter is
    // pressed — without them, a stale closure can persist the previous
    // query string after the user edits the input and hits Enter.
  }, [open, results, activeIdx, onClose, pushRecent, query]);

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
            <EmptyHint
              recent={recent}
              onPick={(s) => setQuery(s)}
              onClearRecent={clearRecent}
            />
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
                const trust = r.trust ?? null;
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
                      {/* Thumbnail when the result has a photo (places +
                          events) — a 36px rounded square that reads as
                          "this is a real thing" much faster than a
                          generic icon stamp. Falls back to the typed
                          round icon when no photo is available (every
                          category / municipality / action, plus place +
                          event rows that lack a hero). The image is
                          loaded as plain <img>: no next/image optimizer
                          round-trip just for a 32px tile inside an
                          already-rendered overlay. */}
                      {r.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.thumbnail}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="mt-0.5 h-9 w-9 shrink-0 rounded-[var(--app-radius-sm)] object-cover"
                          style={{
                            background: `${color}1A`,
                            boxShadow: `inset 0 0 0 1px var(--app-border)`,
                          }}
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-sm)]"
                          style={{ background: `${color}1A`, color }}
                        >
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                          {r.type === "action" ? r.title : highlight(r.title, query)}
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

function EmptyHint({
  recent,
  onPick,
  onClearRecent,
}: {
  recent: string[];
  onPick: (s: string) => void;
  onClearRecent: () => void;
}) {
  // Time-of-day-aware suggestions. The hour is read at render-time
  // so a returning user in the evening sees evening prompts, even
  // if their last visit was morning. Frederick is locked to Eastern.
  const hour = frederickHour();
  const suggestions = suggestionsForHour(hour);

  // Personalized quick-start tiles. The previous /tonight and
  // /discover entries were duplicate paths to /now's content —
  // retired in the structural cuts. We point straight at /now with
  // a lens, plus /m/<home-muni> when set. Each tile is a real
  // destination, not a query — tapping closes the overlay and
  // navigates.
  const homeMuni = getHomeMuni();
  const homeMuniName = homeMuni ? MUNICIPALITY_BY_SLUG[homeMuni]?.name : null;
  const quickStart: Array<{ href: string; title: string; subtitle: string; Icon: typeof Sparkles }> = [
    { href: "/now?t=tonight", title: "Plan tonight", subtitle: "What's happening this evening", Icon: Sparkles },
    { href: "/events", title: "All events", subtitle: "Tonight, weekend, this week", Icon: Sparkles },
    ...(homeMuniName && homeMuni
      ? [{ href: `/m/${homeMuni}`, title: homeMuniName, subtitle: "Your spot", Icon: MapPin }]
      : []),
  ];

  return (
    <div className="space-y-5 px-4 py-5">
      {/* Quick-start tiles — visible above recents so a fresh visitor
          sees high-value destinations first. Personalized to the home
          muni when set. */}
      <div>
        <p
          className="text-xs font-medium uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Quick start
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {quickStart.map((q) => (
            <li key={q.href}>
              <Link
                href={q.href}
                className="group flex items-center gap-2.5 rounded-xl border p-2.5 transition active:scale-[0.99]"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-bg-elevated)",
                }}
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                  style={{
                    background: "color-mix(in srgb, var(--app-cool) 14%, transparent)",
                    color: "var(--app-cool)",
                  }}
                >
                  <q.Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    {q.title}
                  </span>
                  <span className="block truncate text-[10.5px]" style={{ color: "var(--app-ink-3)" }}>
                    {q.subtitle}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {recent.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between">
            <p
              className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.1em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
              Recent
            </p>
            <button
              type="button"
              onClick={onClearRecent}
              className="text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--app-ink-3)" }}
              aria-label="Clear recent searches"
            >
              Clear
            </button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {recent.map((s) => (
              <li key={`recent-${s}`}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
                  style={{
                    borderColor: "var(--app-border)",
                    color: "var(--app-ink)",
                    background: "var(--app-bg-sunken)",
                  }}
                >
                  <Clock className="h-2.5 w-2.5" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p
          className="text-xs font-medium uppercase tracking-[0.1em]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Try {hour >= 5 && hour < 11 ? "this morning" : hour < 17 ? "this afternoon" : hour < 22 ? "this evening" : "tonight"}
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <li key={`sugg-${s}`}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-[var(--app-bg-sunken)]"
                style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
