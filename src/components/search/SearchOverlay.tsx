"use client";

import { track } from "@/lib/track";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import { Search, X, MapPin, Calendar, Tag, Building2, Clock, ArrowRight, MessageCircleQuestion, Phone, Train, Activity } from "lucide-react";
import type {
  QualifiedSearchIndexResult,
  SearchResult,
  SearchResultType,
} from "@/lib/search/index";
import { readCachedPosition } from "@/hooks/useGeolocation";
import { haversineMeters, formatDistance } from "@/lib/geo";
import { findDepartments, jurisdictionLabel, formatPhone } from "@/data/departments";
import { findQuickAnswers } from "@/lib/answers/intents";
import { searchCivicActions, shouldShowDepartmentAnswers } from "@/lib/search/civic";
import type { IntentIcon } from "@/lib/answers/types";
import { commandDestination } from "@/lib/command-routing";
import { useReversibleHistoryLayer } from "@/hooks/useReversibleHistoryLayer";

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
import TrustChip from "@/components/ui/TrustChip";
import { useRecentSearches, usePushRecentSearch, useClearRecentSearches } from "@/hooks/useRecentSearches";
import { frederickHour } from "@/lib/search-suggestions";

const ICON_BY_TYPE: Record<SearchResultType, typeof MapPin> = {
  place: MapPin,
  event: Calendar,
  category: Tag,
  municipality: Building2,
  action: ArrowRight,
};

const LABEL_BY_TYPE: Record<SearchResultType, string> = {
  place: "Place",
  event: "Event",
  category: "Category",
  municipality: "Town",
  action: "Tool",
};

/**
 * Keep the API's ranked order intact. The first result gets the stronger
 * decision card; everything after it stays in the exact order returned.
 * Grouping by type made a lower-ranked place leapfrog a better event or tool.
 */
export function splitBestMatch(results: SearchResult[]): {
  best: SearchResult | null;
  rest: Array<{ r: SearchResult; idx: number }>;
} {
  return {
    best: results[0] ?? null,
    rest: results.slice(1).map((r, index) => ({ r, idx: index + 1 })),
  };
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

function isPlainNavigationClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!event.currentTarget.target ||
      event.currentTarget.target === "_self")
  );
}

function storedFindReturnScrollY(): number | null {
  const state = window.history.state as Record<string, unknown> | null;
  const value = state?.__frederickRadiusLayerScrollY;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function settleFindReturnScroll(scrollY: number | null) {
  if (scrollY === null) return;
  // Today can finish hydrating a live rail while Find is open. Reassert the
  // saved coordinate after that layout settles so the dismissed surface does
  // not return the reader to a different chapter of the page.
  window.setTimeout(() => {
    window.scrollTo({ top: scrollY, behavior: "auto" });
  }, 220);
}

export default function SearchOverlay({
  open,
  onClose,
  openerRef,
  historyLayerId,
  returnScrollY,
}: {
  open: boolean;
  onClose: () => void;
  /** Explicit opener for touch browsers, which do not always move focus to
   * the button a person taps before mounting the dialog. */
  openerRef?: React.RefObject<HTMLElement | null>;
  historyLayerId: string;
  returnScrollY?: number | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchMeta, setSearchMeta] = useState<
    (QualifiedSearchIndexResult["meta"] & { liveEventsUnavailable?: boolean }) | null
  >(null);
  // Fetch lifecycle, so a network/API failure never masquerades as "nothing in
  // Frederick matches" (2026-07-12 audit): "loading" while a request is in
  // flight, "error" when it failed, "done" when it genuinely returned.
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [retryNonce, setRetryNonce] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** Element focused before the overlay opened — focus returns to it on
   *  close (WCAG 2.4.3; previously focus was dropped on the body). */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Seed this during render as well as the open effect. A production lazy
  // chunk can become visible and be dismissed before passive effects run.
  const returnScrollYRef = useRef<number | null>(returnScrollY ?? null);
  const leavingFindRef = useRef(false);
  const recent = useRecentSearches();
  const pushRecent = usePushRecentSearch();
  const clearRecent = useClearRecentSearches();
  const closeFindLayer = useCallback(() => {
    const returnScrollY = returnScrollYRef.current;
    const shouldRestore = !leavingFindRef.current;
    onClose();
    if (shouldRestore) settleFindReturnScroll(returnScrollY);
  }, [onClose]);
  const historyLayer = useReversibleHistoryLayer({
    active: open,
    id: historyLayerId,
    onDismiss: closeFindLayer,
    returnScrollY,
  });
  const dismiss = historyLayer.dismiss;
  const navigateFromSearch = useCallback(
    (href: string) => {
      leavingFindRef.current = true;
      historyLayer.leaveTo(href);
    },
    [historyLayer],
  );

  const updateQuery = (next: string) => {
    setQuery(next);
    // Never leave a result from the previous query tappable during the
    // debounce window. The first visible row always belongs to what is in the
    // field now.
    setResults([]);
    setSearchMeta(null);
    setStatus(next.trim() ? "loading" : "idle");
    setHoverIdx(null);
  };

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
      setSearchMeta(null);
      setStatus("idle");
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setStatus("loading");
      const params = new URLSearchParams({ q, limit: "12" });
      if (coords) {
        // About 11m precision: enough to rank nearby places without sending an
        // unnecessarily exact location to the search endpoint.
        params.set("lat", coords.lat.toFixed(4));
        params.set("lng", coords.lng.toFixed(4));
      }
      fetch(`/api/search?${params.toString()}`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: QualifiedSearchIndexResult) => {
          setResults(data.results ?? []);
          setSearchMeta(data.meta ?? null);
          setStatus("done");
        })
        .catch((err) => {
          // AbortError is expected when the user keeps typing — never surface
          // it. A REAL failure becomes an explicit "error" state so the empty
          // area reads "search unavailable", not "nothing matches" — a data
          // failure must never look like local absence.
          if (err && err.name !== "AbortError") {
            setResults([]);
            setSearchMeta(null);
            setStatus("error");
          }
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, coords, retryNonce]);

  // Report zero-result searches. The queries people type and get nothing
  // for are the app's real backlog, so the query text rides with the event
  // (place-seeking text, clamped + case-folded — same posture as ask_empty).
  // The 1.4s settle delay keeps mid-typing states ("pizz…" narrowed past a
  // match) from firing; the per-session set keeps backspace-and-retype from
  // double-counting the same miss.
  const emptyReportedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (status !== "done" || results.length !== 0 || q.length < 3) return;
    if (emptyReportedRef.current.has(q)) return;
    const t = setTimeout(() => {
      emptyReportedRef.current.add(q);
      track("search_empty", { query: q.slice(0, 80) });
    }, 1400);
    return () => clearTimeout(t);
  }, [query, results, status]);

  // Focus the input when overlay opens; also read any ALREADY-granted location
  // fix (no prompt) so place results can show distance. If there's no cached
  // fix, distance simply isn't shown — search never nags for permission.
  useEffect(() => {
    if (open) {
      track("find_open");
      leavingFindRef.current = false;
      returnScrollYRef.current =
        returnScrollY ?? storedFindReturnScrollY() ?? window.scrollY;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of a client-only cached fix when the overlay opens
      setCoords(readCachedPosition());
      // Remember what had focus (the TopBar search button) so closing the
      // overlay puts the keyboard user back where they were.
      returnFocusRef.current =
        openerRef?.current ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      const t = setTimeout(
        () => inputRef.current?.focus({ preventScroll: true }),
        50,
      );
      return () => {
        clearTimeout(t);
        // Restoring focus must not pull the page underneath the full-screen
        // Find surface to a new scroll position. That jump is especially
        // noticeable on a phone after someone opens Find halfway down Today.
        if (!leavingFindRef.current) {
          returnFocusRef.current?.focus?.({ preventScroll: true });
        }
        returnFocusRef.current = null;
      };
    }
  }, [open, openerRef, returnScrollY]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional UI reset when the overlay closes
      setQuery("");
      setResults([]);
      setSearchMeta(null);
      setStatus("idle");
      setHoverIdx(null);
    }
  }, [open]);

  // Keyboard navigation: arrows, Enter, Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return;
      }
      // Focus trap: this is role="dialog" aria-modal, so Tab must cycle
      // WITHIN the overlay instead of walking into the page behind the
      // backdrop (WCAG 2.4.3). Wrap at both ends.
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = document.activeElement;
          if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
            e.preventDefault();
            first.focus();
          }
        }
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // pushRecent + query are read inside the handler when Enter is
    // pressed — without them, a stale closure can persist the previous
    // query string after the user edits the input and hits Enter.
  }, [dismiss, open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  // Direct answers for the current query — quick-route intents
  // (open-now, events, transit, parking) + buried-gov departments +
  // the county's own How-Do-I actions (voter registration, FixIT,
  // marriage licenses, burn permits…). Cheap synchronous lookups; no fetch.
  const quickAnswers = findQuickAnswers(query);
  const civicCandidates = searchCivicActions(query, 2);
  const govAnswers = shouldShowDepartmentAnswers(query, civicCandidates)
    ? findDepartments(query)
    : [];
  const civicAnswers = civicCandidates.filter(
    // A department card already carries richer detail (phone, about) —
    // don't double up when an action points at the same page.
    (c) => !govAnswers.some((d) => d.website === c.href),
  );
  const hasAnswer = quickAnswers.length > 0 || govAnswers.length > 0 || civicAnswers.length > 0;
  const { best, rest } = splitBestMatch(results);
  const rankedResults = best ? [{ r: best, idx: 0 }, ...rest] : [];
  const submitCommand = () => {
    const destination = commandDestination({
      query,
      quickHref: quickAnswers[0]?.href,
      bestHref: best?.href,
      status,
    });
    if (!destination) return;
    const normalized = query.trim();
    pushRecent(normalized);
    track("command_submit", {
      destination: destination.startsWith("/ask")
        ? "ask"
        : destination.startsWith("/search")
          ? "search"
          : "direct",
    });
    navigateFromSearch(destination);
  };

  return (
    <div
      id="radius-find-dialog"
      ref={dialogRef}
      className="fixed inset-0 z-[var(--z-overlay)] flex items-start justify-center bg-[var(--app-bg)] sm:bg-transparent"
      style={{
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="radius-find-title"
    >
      {/* Backdrop — tabIndex={-1} keeps the invisible full-screen button out
          of the Tab cycle (the focus trap would otherwise wrap to it and the
          global focus ring would trace the whole viewport). Pointer taps and
          Escape still dismiss. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close search"
        onClick={dismiss}
        className="absolute inset-0 hidden bg-black/40 backdrop-blur-[2px] sm:block"
      />

      {/* Sheet */}
      <div
        className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--app-bg)] sm:mt-[8dvh] sm:h-auto sm:max-h-[84dvh] sm:max-w-screen-sm sm:rounded-[var(--app-radius-xl)] sm:border sm:bg-[var(--app-bg-elevated)] sm:shadow-[var(--app-shadow-3)]"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div
          className="flex min-h-14 items-center justify-between gap-3 px-4 sm:px-5"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--app-brand-press)" }}>
              Ask or find
            </p>
            <h2 id="radius-find-title" className="truncate font-serif text-[20px] font-semibold leading-tight tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
              What do you need?
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close Find"
            className="tap-44 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold transition active:scale-95"
            style={{ color: "var(--app-ink-2)" }}
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Close
          </button>
        </div>

        {/* Input */}
        <div
          className="mx-4 mb-3 flex min-h-14 items-center gap-3 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] px-3 shadow-[var(--app-shadow-1)] transition focus-within:border-[var(--app-brand)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--app-brand)_18%,transparent)] sm:mx-5"
          style={{ borderColor: "var(--app-border-strong)" }}
        >
          <Search className="h-5 w-5 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand-press)" }} aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submitCommand();
            }}
            placeholder="A place, plan, service, or quick need…"
            aria-label="Ask or find across Frederick County"
            // Results are real links, not ARIA listbox options. Keeping the
            // input a native search field avoids the invalid pattern of a
            // focusable link nested inside role=option while retaining the
            // fast Arrow/Enter shortcut for sighted keyboard users.
            aria-controls={query.trim() && results.length > 0 ? "search-results" : undefined}
            // self-stretch fills the pill's full 56px, so a thumb landing
            // anywhere in it focuses the input instead of hitting a dead
            // 20px band. Same fix .dock-search-input already carries.
            className="min-w-0 flex-1 self-stretch bg-transparent text-[16px] outline-none placeholder:text-[var(--app-ink-3)]"
            style={{ color: "var(--app-ink)" }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => updateQuery("")}
              aria-label="Clear search"
              className="tap-44 shrink-0 rounded-full p-1 transition hover:bg-[var(--app-bg-sunken)]"
            >
              <X className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto border-t sm:max-h-[64dvh]" style={{ borderColor: "var(--app-border)" }}>
          {/* Direct answer — "ask Frederick" routes a buried-gov question
              (recycling, permits, potholes, animal control…) straight to
              the right department + phone + source, ABOVE place results.
              The North Star front door, on real data. */}
          {hasAnswer && (
            <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--app-border)", background: "color-mix(in srgb, var(--app-brand) 5%, transparent)" }}>
              <p className="eyebrow mb-1.5 px-1" style={{ color: "var(--app-brand-press)" }}>Direct answer</p>
              {quickAnswers.length > 0 && (
                <ul className="mb-1.5 space-y-1.5">
                  {quickAnswers.map((qa) => {
                    const Icon = QUICK_ICON[qa.icon];
                    return (
                      <li key={qa.href}>
                        <Link
                          href={qa.href}
                          onClick={(event) => {
                            if (!isPlainNavigationClick(event)) return;
                            event.preventDefault();
                            navigateFromSearch(qa.href);
                          }}
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
                              <a href={`tel:${d.phone}`} className="tactile-interactive inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 py-1 text-meta font-semibold text-white" style={{ background: "var(--app-cool)" }}>
                                <Phone className="h-3 w-3" strokeWidth={2.5} aria-hidden /> {formatPhone(d.phone)}
                              </a>
                            )}
                            <a href={d.website} target="_blank" rel="noopener noreferrer" className="tactile-interactive inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 py-1 text-meta font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
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
              {civicAnswers.length > 0 && (
                <ul className="mt-1.5 space-y-1.5">
                  {civicAnswers.map((c) => (
                    <li key={c.id}>
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tactile-interactive flex items-center gap-2.5 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-2.5 transition active:scale-[0.99]"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--app-cool) 14%, transparent)", color: "var(--app-cool)" }}>
                          <Building2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-body font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>{c.title}</span>
                          <span className="block text-meta-lg leading-snug" style={{ color: "var(--app-ink-2)" }}>{c.subtitle}</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} style={{ color: "var(--app-ink-3)" }} aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {searchMeta?.qualifiers.constrained && status === "done" && (
            <p
              className="border-b px-4 py-2 text-[11px] font-medium"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
            >
              {[
                searchMeta.qualifiers.categoryLabel,
                searchMeta.qualifiers.openNow ? "Confirmed open" : null,
                searchMeta.qualifiers.nearMe
                  ? searchMeta.nearMeApplied
                    ? `Nearest first${searchMeta.contextLabel ? ` · ${searchMeta.contextLabel}` : ""}`
                    : searchMeta.fallbackReason === "outside-county"
                      ? "Location is outside Frederick County · not distance-ranked"
                      : "Location unavailable · not distance-ranked"
                  : searchMeta.contextLabel && searchMeta.qualifiers.categoryLabel
                    ? searchMeta.contextLabel
                    : null,
              ].filter(Boolean).join(" · ")}
            </p>
          )}
          {!query.trim() ? (
            <EmptyHint
              recent={recent}
              onPick={updateQuery}
              onClearRecent={clearRecent}
              onNavigate={navigateFromSearch}
            />
          ) : results.length === 0 ? (
            // No live role on this block — regions mounted WITH content aren't
            // announced by several SRs; the persistent footer count region
            // carries the announcement instead. Three distinct empty states so
            // a data failure never reads as local absence (2026-07-12 audit).
            status === "error" ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--app-ink-3)" }}>
                <p style={{ color: "var(--app-ink-2)" }}>Search is unavailable right now.</p>
                <p className="mt-1 text-xs">Check your connection, then try the same search again.</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus("loading");
                    setRetryNonce((value) => value + 1);
                  }}
                  className="tap-44 mt-3 inline-flex min-h-11 items-center justify-center rounded-[var(--app-radius-sm)] border px-4 text-[12px] font-semibold"
                  style={{
                    borderColor: "var(--app-brand-press)",
                    color: "var(--app-brand-press)",
                  }}
                >
                  Try again
                </button>
                {/* A retry button was the ONLY control here, so a person whose
                    search failed had exactly one move and no way out of the
                    overlay toward an answer. Give the same two exits the
                    healthy empty state offers. */}
                {query.trim() && (
                  <p className="mt-3 text-xs">
                    <a
                      href={`/search?q=${encodeURIComponent(query.trim())}`}
                      className="font-semibold underline"
                      style={{ color: "var(--app-brand-press)" }}
                    >
                      Open the full search page
                    </a>
                    <span aria-hidden> · </span>
                    <a
                      href={`/ask?q=${encodeURIComponent(query.trim())}`}
                      className="font-semibold underline"
                      style={{ color: "var(--app-brand-press)" }}
                    >
                      Ask Radius instead
                    </a>
                  </p>
                )}
              </div>
            ) : status === "loading" ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--app-ink-3)" }}>
                <p>Searching&hellip;</p>
              </div>
            ) : hasAnswer ? null : (
            <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--app-ink-3)" }}>
              <p>Nothing matches <span className="font-semibold" style={{ color: "var(--app-ink-2)" }}>&ldquo;{query}&rdquo;</span> yet.</p>
              {/* The degraded-archive caveat, the load-bearing half of the
                  503 removal. The API now answers 200 with this flag instead
                  of failing the request, and no component read the flag
                  before — so without this line an event the archive simply
                  could not see would render as a confident "nothing matches",
                  which is a quieter version of the same false answer. */}
              {searchMeta?.liveEventsUnavailable ? (
                <p className="mt-1 text-xs">
                  Live events could not be checked just now, so a current event
                  may be missing from this answer. Places and pages are
                  unaffected.
                </p>
              ) : (
                <p className="mt-1 text-xs">Try a shorter search, then add a town if you need to narrow it.</p>
              )}
            </div>
            )
          ) : (
            <ul ref={listRef} id="search-results" aria-label="Search results" className="py-2">
              {rankedResults.map(({ r, idx }) => {
                const Icon = ICON_BY_TYPE[r.type];
                const color = COLOR_BY_TYPE[r.type];
                const trust = r.trust ?? null;
                const distance = coords && r.lat != null && r.lng != null
                  ? formatDistance(haversineMeters(coords, { lng: r.lng, lat: r.lat }))
                  : null;
                const pick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
                  if (!isPlainNavigationClick(event)) return;
                  event.preventDefault();
                  if (query.trim()) pushRecent(query.trim());
                  track("search_pick", { type: r.type });
                  navigateFromSearch(r.href);
                };
                const art = r.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnail}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={idx === 0
                      ? "h-16 w-16 shrink-0 rounded-[var(--app-radius-md)] object-cover"
                      : "mt-0.5 h-10 w-10 shrink-0 rounded-[var(--app-radius-sm)] object-cover"}
                    style={{ background: `${color}1A`, boxShadow: "inset 0 0 0 1px var(--app-border)" }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className={idx === 0
                      ? "grid h-16 w-16 shrink-0 place-items-center rounded-[var(--app-radius-md)]"
                      : "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"}
                    style={{ background: `color-mix(in srgb, ${color} 12%, var(--app-bg-sunken))`, color }}
                  >
                    <Icon className={idx === 0 ? "h-6 w-6" : "h-4 w-4"} strokeWidth={1.9} />
                  </span>
                );

                if (idx === 0) {
                  const mapHref = r.type === "place" && r.lat != null && r.lng != null
                    ? `/map?at=${r.lat.toFixed(5)},${r.lng.toFixed(5)}&place=${encodeURIComponent(r.id.replace(/^place:/, ""))}`
                    : null;
                  return (
                    <li
                      key={r.id}
                      id="search-opt-0"
                      data-idx={0}
                      className="mx-3 mb-2 overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] shadow-[var(--app-shadow-1)]"
                      style={{ borderColor: "color-mix(in srgb, var(--app-brand) 26%, var(--app-border))" }}
                    >
                      <div className="flex items-start gap-3 p-3">
                        {art}
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>
                            Best match · {LABEL_BY_TYPE[r.type]}
                          </p>
                          <p className="mt-1 line-clamp-2 font-serif text-[19px] font-semibold leading-[1.05] tracking-[-0.02em]" style={{ color: "var(--app-ink)" }}>
                            {r.type === "action" ? r.title : highlight(r.title, query)}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                            {r.subtitle}{distance ? ` · ${distance}` : ""}
                          </p>
                          {trust && <TrustChip signal={trust} className="mt-1.5" />}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 border-t" style={{ borderColor: "var(--app-border)" }}>
                        <Link
                          href={r.href}
                          onClick={pick}
                          onMouseEnter={() => setHoverIdx(0)}
                          onMouseLeave={() => setHoverIdx(null)}
                          className="flex min-h-11 items-center justify-center gap-1.5 px-3 text-[12px] font-semibold"
                          style={{ color: "var(--app-ink)", background: hoverIdx === 0 ? "var(--app-bg-sunken)" : "transparent" }}
                        >
                          Open
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                        </Link>
                        {mapHref ? (
                          <Link
                            href={mapHref}
                            onClick={(event) => {
                              if (!isPlainNavigationClick(event)) return;
                              event.preventDefault();
                              if (query.trim()) pushRecent(query.trim());
                              track("search_map");
                              navigateFromSearch(mapHref);
                            }}
                            className="flex min-h-11 items-center justify-center gap-1.5 border-l px-3 text-[12px] font-semibold"
                            style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
                          >
                            <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                            Map
                          </Link>
                        ) : (
                          <Link
                            href={`/ask?q=${encodeURIComponent(query.trim())}`}
                            onClick={(event) => {
                              if (!isPlainNavigationClick(event)) return;
                              event.preventDefault();
                              track("ask_open");
                              navigateFromSearch(
                                `/ask?q=${encodeURIComponent(query.trim())}`,
                              );
                            }}
                            className="flex min-h-11 items-center justify-center gap-1.5 border-l px-3 text-[12px] font-semibold"
                            style={{ borderColor: "var(--app-border)", color: "var(--app-brand-press)" }}
                          >
                            Ask Radius
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={r.id} id={`search-opt-${idx}`} data-idx={idx}>
                    <Link
                      href={r.href}
                      onClick={pick}
                      onMouseEnter={() => setHoverIdx(idx)}
                      onMouseLeave={() => setHoverIdx(null)}
                      className="flex min-h-[62px] items-start gap-3 border-b px-4 py-2.5 sm:px-5"
                      style={{
                        borderColor: "var(--app-border)",
                        background: hoverIdx === idx ? "var(--app-bg-sunken)" : "transparent",
                      }}
                    >
                      {art}
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.11em]" style={{ color }}>
                          {LABEL_BY_TYPE[r.type]}
                        </span>
                        <span className="mt-0.5 block truncate text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                          {r.type === "action" ? r.title : highlight(r.title, query)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                          {r.subtitle}{distance ? ` · ${distance}` : ""}
                        </span>
                        {trust && <TrustChip signal={trust} className="mt-1" />}
                      </span>
                      <ArrowRight className="mt-4 h-3.5 w-3.5 shrink-0 opacity-35" strokeWidth={2.25} aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {query.trim() && results.length === 0 && !hasAnswer && status === "done" ? (
            <div className="border-t px-4 py-4" style={{ borderColor: "var(--app-border)" }}>
              <Link
                href={`/ask?q=${encodeURIComponent(query.trim())}`}
                onClick={(event) => {
                  if (!isPlainNavigationClick(event)) return;
                  event.preventDefault();
                  track("ask_open", { source: "search" });
                  navigateFromSearch(
                    `/ask?q=${encodeURIComponent(query.trim())}`,
                  );
                }}
                className="tactile-interactive flex min-h-14 items-center gap-3 border-y px-1 py-3 transition active:opacity-75"
                style={{
                  borderColor: "var(--app-border-strong)",
                }}
              >
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
                  style={{
                    background: "var(--app-brand)",
                    color: "var(--app-on-brand, #fff)",
                  }}
                >
                  <MessageCircleQuestion className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
                    Ask Radius
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                    Add details such as time, budget, or who is coming.
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-brand-press)" }} aria-hidden />
              </Link>
            </div>
          ) : null}
        </div>

        {/* Footer hints */}
        <div
          className="flex items-center justify-between border-t px-4 py-2 text-[10px]"
          style={{
            borderColor: "var(--app-border)",
            color: "var(--app-ink-3)",
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          {/* Keyboard affordances exist only where a keyboard does: on a
              touch phone none of these keys exist, so the row hides on
              coarse-pointer devices and the match count stands alone
              (fresh-eyes audit, Jul 2026). */}
          <div className="hidden items-center gap-3 [@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:flex">
            <KbdHint label="tab" desc="move" />
            <KbdHint label="↵" desc="open" />
            <KbdHint label="esc" desc="close" />
          </div>
          {/* Polite live region: announces the match count as the query
              changes, so SR users hear that results updated at all. This
              element PERSISTS across renders (live regions only announce
              text CHANGES, not regions mounted with content), so it also
              carries the zero-result case. */}
          <p role="status" aria-live="polite">
            {results.length > 0
              // This overlay intentionally returns a small, ranked window.
              // Call it what is on screen rather than presenting the window
              // size as the countywide total ("3 matches" beside a surface
              // showing four qualifying places read like a data conflict).
              ? `${results.length} shown`
              : !query.trim()
                ? ""
                : hasAnswer
                  ? "Direct answer available"
                : status === "error"
                  ? "Search unavailable"
                  : status === "loading"
                    ? "Searching"
                    : "No matches"}
          </p>
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
  onNavigate,
}: {
  recent: string[];
  onPick: (s: string) => void;
  onClearRecent: () => void;
  onNavigate: (href: string) => void;
}) {
  const hour = frederickHour();
  const quickStart: Array<{ href: string; title: string; subtitle: string; Icon: typeof Clock }> = [
    { href: "/open-now", title: "Open now", subtitle: "Use checked hours across the county.", Icon: Clock },
    {
      href: "/events?lens=today",
      title: hour >= 16 ? "Events tonight" : "Events today",
      subtitle: "See the current local calendar.",
      Icon: Calendar,
    },
    { href: "/amenities", title: "Nearby essentials", subtitle: "Find the closest mapped restroom, water, trash, seating, or dog bags.", Icon: MapPin },
    { href: "/pulse", title: "Live conditions", subtitle: "Check weather, air, roads, transit, and outages.", Icon: Activity },
  ];

  return (
    <div className="px-4 py-5 sm:px-5">
      {recent.length > 0 ? (
        <div>
          <div className="flex items-baseline justify-between">
            <p
              className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
              Recent searches
            </p>
            <button
              type="button"
              onClick={onClearRecent}
              className="tap-44 px-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--app-ink-3)" }}
              aria-label="Clear recent searches"
            >
              Clear
            </button>
          </div>
          <ul className="mt-2 border-y" style={{ borderColor: "var(--app-border-strong)" }}>
            {recent.slice(0, 2).map((s) => (
              <li key={`recent-${s}`}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="flex min-h-12 w-full items-center gap-2 border-b px-1 text-left text-[13px] font-semibold last:border-b-0"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                  <span className="min-w-0 flex-1 truncate">{s}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-35" strokeWidth={2.25} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={recent.length > 0 ? "mt-5" : undefined}>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
          Useful now
        </p>
        <ul className="mt-2 border-y" style={{ borderColor: "var(--app-border-strong)" }}>
          {quickStart.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={(event) => {
                  if (!isPlainNavigationClick(event)) return;
                  event.preventDefault();
                  onNavigate(item.href);
                }}
                className="group flex min-h-[58px] items-center gap-3 border-b px-1 py-2 last:border-b-0"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-sm)]" style={{ color: "var(--app-brand-press)", background: "var(--app-brand-tint-6)" }}>
                  <item.Icon className="h-4 w-4" strokeWidth={2.1} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>{item.title}</span>
                  <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--app-ink-3)" }}>{item.subtitle}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
        <Link
          href="/ask"
          onClick={(event) => {
            if (!isPlainNavigationClick(event)) return;
            event.preventDefault();
            onNavigate("/ask");
          }}
          className="group flex min-h-12 items-center gap-3 px-1"
        >
          <MessageCircleQuestion className="h-4 w-4 shrink-0" strokeWidth={2.1} style={{ color: "var(--app-brand)" }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold" style={{ color: "var(--app-ink)" }}>Ask Radius</span>
            <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>Use a question when a name or category is not enough.</span>
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-35 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
