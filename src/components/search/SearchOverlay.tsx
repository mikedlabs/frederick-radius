"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, MapPin, Calendar, Tag, Building2, Clock, ArrowRight, Sparkles, Phone, Train } from "lucide-react";
import type { SearchResult, SearchResultType } from "@/lib/search/index";
import { findDepartments, jurisdictionLabel, formatPhone } from "@/data/departments";
import { findQuickAnswers } from "@/lib/answers/intents";
import type { IntentIcon } from "@/lib/answers/types";

/**
 * Quick-answer intents now live in `@/lib/answers/intents` so /today's
 * AnswerCards and this overlay share ONE source (extracted, not
 * duplicated). Icons are stored there as string names to keep the list
 * server-safe; this client map turns them back into lucide glyphs.
 */
const QUICK_ICON: Record<IntentIcon, typeof Clock> = {
  clock: Clock,
  calendar: Calendar,
  train: Train,
  pin: MapPin,
};
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

const HEADING_BY_TYPE: Record<SearchResultType, string> = {
  place: "Places",
  event: "Events",
  category: "Categories",
  municipality: "Towns",
  action: "Actions",
};

/**
 * Group flat results by type WHILE preserving relevance ordering.
 * The first occurrence of each type determines the group order, so
 * if the top hit is a Place, the Places group shows first; if an
 * Event leads, Events leads. Within each group, items stay in the
 * order the API returned (which is already relevance-scored).
 *
 * Returns a list of {type, items} pairs whose concatenated items
 * preserve the original flat result indices — so keyboard nav and
 * activeIdx keep working across the grouped layout.
 *
 * Exported only for unit tests; the SearchOverlay JSX is the only
 * runtime consumer in the app.
 */
export function groupByTypePreservingOrder(
  results: SearchResult[],
): { type: SearchResultType; items: Array<{ r: SearchResult; idx: number }> }[] {
  const order: SearchResultType[] = [];
  const buckets = new Map<SearchResultType, Array<{ r: SearchResult; idx: number }>>();
  results.forEach((r, idx) => {
    if (!buckets.has(r.type)) {
      buckets.set(r.type, []);
      order.push(r.type);
    }
    buckets.get(r.type)!.push({ r, idx });
  });
  return order.map((type) => ({ type, items: buckets.get(type)! }));
}

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clear the previous fetch's results when the user empties the input, so the overlay never shows stale answers
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

  // Direct answers for the current query — quick-route intents
  // (open-now, events, transit, parking) + buried-gov departments.
  // Cheap synchronous lookups; no fetch.
  const quickAnswers = findQuickAnswers(query);
  const govAnswers = findDepartments(query);
  const hasAnswer = quickAnswers.length > 0 || govAnswers.length > 0;

  return (
    <div
      className="fixed inset-0 z-[var(--z-overlay)] flex items-start justify-center"
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
              className="tap-44 shrink-0 rounded-full p-1 transition hover:bg-[var(--app-bg-sunken)]"
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
          {/* Direct answer — "ask Frederick" routes a buried-gov question
              (recycling, permits, potholes, animal control…) straight to
              the right department + phone + source, ABOVE place results.
              The North Star front door, on real data. */}
          {hasAnswer && (
            <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--app-border)", background: "color-mix(in srgb, var(--app-brand) 5%, transparent)" }}>
              <p className="eyebrow mb-1.5 px-1" style={{ color: "var(--app-brand)" }}>Direct answer</p>
              {quickAnswers.length > 0 && (
                <ul className="mb-1.5 space-y-1.5">
                  {quickAnswers.map((qa) => {
                    const Icon = QUICK_ICON[qa.icon];
                    return (
                      <li key={qa.href}>
                        <Link
                          href={qa.href}
                          onClick={onClose}
                          className="tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2.5 transition active:scale-[0.99]"
                          style={{ borderColor: "var(--app-border)" }}
                        >
                          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-brand) 12%, transparent)", color: "var(--app-brand)" }}>
                            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-body font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{qa.title}</span>
                            <span className="block text-meta-lg leading-snug" style={{ color: "var(--app-ink-2)" }}>{qa.sub}</span>
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ul className="space-y-1.5">
                {govAnswers.map((d) => (
                  <li key={d.slug}>
                    <div
                      className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2.5"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)", color: "var(--app-cool)" }}>
                          <Building2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-body font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{d.name}</p>
                          <p className="mt-0.5 text-meta-lg leading-snug" style={{ color: "var(--app-ink-2)" }}>{d.about}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {d.phone && (
                              <a href={`tel:${d.phone}`} className="tactile-interactive inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-meta font-semibold text-white" style={{ background: "var(--app-cool)" }}>
                                <Phone className="h-3 w-3" strokeWidth={2.5} aria-hidden /> {formatPhone(d.phone)}
                              </a>
                            )}
                            <a href={d.website} target="_blank" rel="noopener noreferrer" className="tactile-interactive inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-meta font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
                              Open site <ArrowRight className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                            </a>
                            <span className="ml-auto text-caption uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
                              {jurisdictionLabel(d.jurisdiction)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!query.trim() ? (
            <EmptyHint
              recent={recent}
              onPick={(s) => setQuery(s)}
              onClearRecent={clearRecent}
            />
          ) : results.length === 0 ? (
            hasAnswer ? null : (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--app-ink-3)" }}>
              <p>Nothing matches <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>&ldquo;{query}&rdquo;</span> yet.</p>
              <p className="mt-1 text-xs">Try a town (Brunswick, Thurmont), a category (&ldquo;coffee&rdquo;, &ldquo;parks&rdquo;), or a partial place name.</p>
            </div>
            )
          ) : (
            // Grouped results — group order follows relevance (the
            // type of the top hit appears first), items within a group
            // keep the API's relevance ordering. The flat `activeIdx`
            // is preserved across groups via the `idx` recorded in each
            // bucket, so arrow-key nav still walks the full result list.
            <ul ref={listRef} role="listbox" className="py-1">
              {groupByTypePreservingOrder(results).map((group, gi) => {
                const color = COLOR_BY_TYPE[group.type];
                return (
                  <li key={group.type} className={gi > 0 ? "mt-1" : ""}>
                    {/* Group header — small, all-caps, tinted by type
                        so the eye can pick out the section it wants
                        without reading individual rows. Single source
                        of "what kind of thing is this" — the per-item
                        type pill is gone now that the header carries
                        it. */}
                    <div
                      className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{ color }}
                    >
                      {HEADING_BY_TYPE[group.type]} · {group.items.length}
                    </div>
                    <ul role="group" aria-label={HEADING_BY_TYPE[group.type]}>
                      {group.items.map(({ r, idx }) => {
                        const Icon = ICON_BY_TYPE[r.type];
                        const active = idx === activeIdx;
                        const trust = r.trust ?? null;
                        return (
                          <li key={r.id} role="option" aria-selected={active} data-idx={idx}>
                            <Link
                              href={r.href}
                              onClick={onClose}
                              onMouseEnter={() => setActiveIdx(idx)}
                              className="flex items-start gap-3 px-4 py-2.5 outline-none"
                              style={{
                                background: active ? "var(--app-bg-sunken)" : "transparent",
                              }}
                            >
                              {/* Thumbnail when the result has a photo
                                  (places + events) — a 36px rounded
                                  square that reads as "this is a real
                                  thing" faster than a generic icon
                                  stamp. Falls back to the typed round
                                  icon when no photo is available. Plain
                                  <img>: no next/image optimizer round-
                                  trip just for a 32px tile. */}
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
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
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
  // /discover entries were duplicate paths to /today's content —
  // retired in the structural cuts. We point straight at /now with
  // a lens, plus /m/<home-muni> when set. Each tile is a real
  // destination, not a query — tapping closes the overlay and
  // navigates.
  const homeMuni = getHomeMuni();
  const homeMuniName = homeMuni ? MUNICIPALITY_BY_SLUG[homeMuni]?.name : null;
  const quickStart: Array<{ href: string; title: string; subtitle: string; Icon: typeof Sparkles }> = [
    { href: "/today?t=tonight", title: "Plan tonight", subtitle: "What's happening this evening", Icon: Sparkles },
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
                  <span className="block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
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
