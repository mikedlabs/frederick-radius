"use client";

import { stampEventProvenance } from "@/lib/provenance";
import { townAccent } from "@/lib/townAccent";
import { useEffect, useMemo, useState } from "react";
import { useSavedList, useMounted, type SavedRef } from "@/hooks/useSaved";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { useRecentPlaces, useClearRecentPlaces } from "@/hooks/useRecentPlaces";
import { useAllNotes, type PlaceNote } from "@/hooks/useNotes";
import { useAllSavedTags } from "@/hooks/useSavedTags";
import { useBeenList } from "@/hooks/useBeenHere";
// A2.8: SavedList no longer static-imports clientPlaceBySlug, so
// /saved's client bundle no longer ships places-client.json (~2MB).
// Place data is hydrated via /api/places/by-slugs on mount.
import type { PlaceCardData } from "@/lib/loaders/places";
import { EVENT_BY_SLUG } from "@/data/events";
import PlaceCard from "@/components/place/PlaceCard";
import MyTaps from "@/components/beer/MyTaps";
import SavedWallet from "@/components/saved/SavedWallet";
import SavedEventWallet from "@/components/saved/SavedEventWallet";
import { fmtClockShort } from "@/components/saved/walletFacts";
import AppMapClient from "@/components/map/AppMapClient";
import ShareButton from "@/components/place/ShareButton";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { getHomeMuni } from "@/lib/personalize";
import Link from "next/link";
import { MapPin, Search, Settings, ArrowRight, Layers, ChevronDown } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import SortDropdown, { type SortOption } from "@/components/ui/SortDropdown";
import FilterChip from "@/components/ui/FilterChip";
import { isOpenNow } from "@/lib/hours";
import { haversineMeters } from "@/lib/geo";
import { eventGeoConfidence } from "@/lib/events/geo-confidence";
import { isEventToday } from "@/lib/eventWhenLabel";
import Passport from "@/components/saved/Passport";
import type { ReactNode } from "react";

type SavedSortKey = "town" | "category" | "recent" | "az" | "distance" | "open";

const SORT_OPTIONS: ReadonlyArray<SortOption<SavedSortKey>> = [
  { key: "town", label: "By town", hint: "Group saved places by town" },
  { key: "open", label: "Open now", hint: "What you can go to right now" },
  { key: "category", label: "By category", hint: "Group by what kind of place" },
  { key: "recent", label: "Recent", hint: "Most recently saved first" },
  { key: "az", label: "A→Z", hint: "Alphabetical by name" },
  { key: "distance", label: "Distance", hint: "From your home town" },
];

const SAVED_SORT_STORAGE_KEY = "fr.saved-sort";
const SAVED_VIEW_STORAGE_KEY = "fr.saved-view";

// Deterministic per-town accent so each town reads as its own colored
// "chapter" of the field guide (matches the town grid on /places).

/**
 * Build a /plan share token from a set of saved place slugs — the same
 * PlanSpec the planner's shared-plan path decodes (`{ v:1, i, s:[{p}] }`,
 * URL-safe base64 of JSON). Mirrored here ON PURPOSE: importing
 * planner.ts would drag the ~2MB client place index into the Saved bundle
 * (see the by-slugs note at the top of this file). Keep in sync with
 * encodeSpec/PlanSpec in src/lib/integrations/planner.ts. `reconstructPlan`
 * preserves stop ORDER, so the slugs go in the order we want them walked.
 */
function planTokenFromSaved(slugs: string[]): string {
  const spec = {
    v: 1,
    i: { audience: "friends", vibe: "easy", duration_hours: 4 },
    s: slugs.map((p) => ({ p })),
  };
  const json = JSON.stringify(spec);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type DecoratedEvent = ReturnType<typeof decorateEvent>;

/** Compact event date/time parts for the sv-evrow calendar plate,
 *  rendered in Frederick's timezone regardless of the device. */
function evParts(iso: string): { day: string; mon: string; time: string } | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", day: "numeric" }).format(d);
  const mon = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })
    .format(d)
    .replace(":00 ", " ");
  return { day, mon, time };
}

/** One compact saved-event row: date plate + serif title + mono where/when. */
function EventRow({ event, today }: { event: DecoratedEvent; today: boolean }) {
  const parts = evParts(event.starts_at);
  const where = [today ? "Today" : null, event.venue_name || null, parts?.time ?? null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={`/events/${event.slug}`} className="sv-evrow tactile-interactive">
      <span className="cal" aria-hidden>
        <b>{parts?.day ?? ""}</b>
        <span>{parts?.mon ?? ""}</span>
      </span>
      <span className="who">
        <b>{event.title}</b>
        {where && <span className={today ? "is-today" : undefined}>{where}</span>}
      </span>
      <span className="arr" aria-hidden><ArrowRight className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} /></span>
    </Link>
  );
}

/** The page masthead: title + a mono standfirst that carries the counts as
 *  supporting detail, plus the 44px settings gear. Rendered by every branch
 *  (skeleton, empty, full) so the page opens the same way in all three. */
function Masthead({ stand }: { stand: ReactNode }) {
  return (
    <header className="sv-mast">
      <div className="min-w-0">
        <h1>Saved</h1>
        <p className="sv-stand truncate">{stand}</p>
      </div>
      <Link href="/settings" aria-label="Settings" className="sv-gear tactile tactile-interactive">
        <Settings className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
      </Link>
    </header>
  );
}

function decorateEvent(e: NonNullable<(typeof EVENT_BY_SLUG)[string]>) {
  return {
    ...e,
    ...stampEventProvenance(e, e.last_verified_at),
    distance_m: undefined,
    geo_confidence: eventGeoConfidence(e),
    category_name: CATEGORY_BY_SLUG[e.category]?.name ?? e.category,
    municipality_name: MUNICIPALITY_BY_SLUG[e.municipality]?.name ?? e.municipality,
  };
}

export default function SavedList({ userEmail }: { userEmail?: string | null }) {
  const mounted = useMounted();
  const items = useSavedList();
  // ── Split-store fix (experience review, save-loop finding #1). Signed-in
  // saves are written to the DB (useToggleFollow) while `items` is
  // localStorage-only, so this page silently omitted DB follows: save on the
  // place page, open Saved, gone (and a second device showed nothing). Every
  // OTHER consumer (AppMap, FromYourSaved, PlanBuilder) already reads the
  // auth-aware truth via useFollowedSlugs — merge it here too. When signed in
  // and hydrated, DB membership WINS (an unfollow on another device removes
  // the card here); saved_at keeps the local ref's stamp when we have it,
  // else epoch (sorts oldest under "Recent": honest, we don't know when).
  // While hydrating, and for anonymous users, local refs pass through
  // untouched. Events, radii, and beer saves stay device-local by contract.
  const { slugs: followedSlugs, loading: followsLoading, authed: followsAuthed } = useFollowedSlugs();
  const placeRefsAll = useMemo<SavedRef[]>(() => {
    const local = items.filter((i) => i.type === "place");
    if (!followsAuthed || followsLoading) return local;
    const bySlug = new Map(local.map((i) => [i.id, i]));
    return [...followedSlugs].map(
      (slug) => bySlug.get(slug) ?? { type: "place" as const, id: slug, saved_at: "1970-01-01T00:00:00.000Z" },
    );
  }, [items, followedSlugs, followsAuthed, followsLoading]);
  // Soft signal — slugs the user has opened (PlaceSheet) but maybe
  // never bookmarked. Filtered to slugs still in the client place
  // index and to ones not already in the explicit Saved set so the
  // section never duplicates a card the user has already bookmarked.
  const recentSlugs = useRecentPlaces();
  const clearRecent = useClearRecentPlaces();
  // The user's own margin notes ("great patio, ask for Maria") keyed by slug.
  const notes = useAllNotes();
  // Places the user tapped "Been here" on (the visited list). Same per-device
  // localStorage + useSyncExternalStore store as notes/saved, so toggling on a
  // place page updates the Visited section here live.
  const beenSlugs = useBeenList();
  // The user's personal lists ("date night", "takeout") keyed by slug, plus the
  // currently selected list filter (null = show all).
  const savedTags = useAllSavedTags();
  const [activeList, setActiveList] = useState<string | null>(null);
  const [organizerOpen, setOrganizerOpen] = useState(false);

  // Union of every slug this component might need: saved bookmarks,
  // recently viewed, and the empty-state seeds. We hand the whole set
  // to /api/places/by-slugs in a single request and hydrate from the
  // returned map. slugsKey is a primitive string so React's effect
  // identity check is reference-stable across renders.
  const { slugsToFetch, slugsKey } = useMemo(() => {
    const set = new Set<string>();
    for (const i of placeRefsAll) set.add(i.id);
    for (const s of recentSlugs) set.add(s);
    // Noted places too — a note can exist on a place the user never bookmarked,
    // and its card must still resolve for the Notes section.
    for (const s of Object.keys(notes)) set.add(s);
    // Visited places too — "been here" can be set on a place that was never
    // saved or noted, and its card must still resolve for the Visited section.
    for (const s of beenSlugs) set.add(s);
    const slugsToFetch = Array.from(set);
    return { slugsToFetch, slugsKey: slugsToFetch.join(",") };
  }, [placeRefsAll, recentSlugs, notes, beenSlugs]);

  // Start empty so a truly blank device can render its honest empty state in
  // the server shell. When saved slugs hydrate, `placesPending` below detects
  // missing records and swaps in the stable loading region until one request
  // resolves them.
  const [placesBySlug, setPlacesBySlug] = useState<Map<string, PlaceCardData>>(() => new Map());
  // Which slugsKey the by-slugs request has ANSWERED (success or collapse).
  // Pending must key off this, not off every slug being present in the map:
  // the API quietly drops unknown slugs, so a single stale ref (a place
  // later removed from the catalog) would otherwise pin the whole page on
  // the loading skeleton forever.
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted) return;
    if (slugsToFetch.length === 0) {
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(slugsKey)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { places: PlaceCardData[] }) => {
        const m = new Map<string, PlaceCardData>();
        for (const p of data.places) m.set(p.slug, p);
        setPlacesBySlug(m);
        setResolvedKey(slugsKey);
      })
      .catch((err) => {
        // AbortError = navigated/unmounted; ignore. Anything else,
        // collapse to an empty map so the UI keeps rendering rather
        // than spinning forever.
        if (err && err.name !== "AbortError") {
          setPlacesBySlug(new Map());
          setResolvedKey(slugsKey);
        }
      });
    return () => ctrl.abort();
  }, [mounted, slugsKey, slugsToFetch.length]);

  // Persisted sort preference (defaults to "category" — the original
  // grouping behavior). Read on mount so SSR + first paint stay
  // consistent (mounted gate above already prevents server/client mismatch).
  const [sort, setSort] = useState<SavedSortKey>("town");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SAVED_SORT_STORAGE_KEY);
      // Validate against the live SORT_OPTIONS, not a hand-kept list — the old
      // hardcoded check omitted "open", so choosing "Open now" silently failed
      // to persist (2026-07-12 audit). Deriving it means a new sort can never
      // desync again.
      if (saved && SORT_OPTIONS.some((o) => o.key === saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-mount hydration of a localStorage preference; SSR can't read localStorage
        setSort(saved as SavedSortKey);
      }
    } catch {
      /* localStorage unavailable; keep default */
    }
  }, []);
  function setSortAndStore(next: SavedSortKey) {
    setSort(next);
    try {
      window.localStorage.setItem(SAVED_SORT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  // List vs map view of the Places section. Persisted like the sort so a user
  // who prefers the map lands on it next time. The Mapbox canvas only mounts in
  // map view (AppMapClient dynamic-imports AppMap), so list-view visitors never
  // pay the map JS.
  // Default to the WALLET fan (owner call 2026-07-02): saved places are a
  // personal collection, so the "cards you carry" treatment leads; List + Map
  // stay a tap away and a returning user's stored choice wins. Neither wallet
  // nor list pays the map JS (only "map" dynamic-imports AppMap).
  const [view, setView] = useState<"wallet" | "list" | "map">("wallet");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SAVED_VIEW_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount localStorage hydration of a view preference; SSR can't read it
      if (v === "map" || v === "list" || v === "wallet") setView(v);
    } catch {
      /* ignore */
    }
  }, []);
  function setViewAndStore(next: "wallet" | "list" | "map") {
    setView(next);
    try {
      window.localStorage.setItem(SAVED_VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  // The wallet's raised card, lifted here so the On-now running line can
  // raise a card by name — the strip and the deck are one instrument.
  // null = the wallet's default (top card).
  const [raisedSlug, setRaisedSlug] = useState<string | null>(null);
  function raiseCard(slug: string) {
    setRaisedSlug(slug);
    // Raising implies the wallet. Deliberately setView, not setViewAndStore:
    // a chip tap shouldn't overwrite the user's stored view preference.
    if (view !== "wallet") setView("wallet");
    // Bring the raised card into view once the accordion margins settle.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      document
        .getElementById(`sw-slot-${slug}`)
        ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }, 60);
  }

  // Past saved events are kept (you saved them) but tucked behind a toggle so a
  // months-old show never clutters the upcoming list.
  const [showPast, setShowPast] = useState(false);

  // The "distance" sort needs an origin. Read the user's home muni
  // from localStorage (the same key PreferencesPanel writes); fall
  // back to no-origin (places-without-geom safely sort last via the
  // Infinity sentinel below).
  const [homeOrigin, setHomeOrigin] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    try {
      // Use the canonical home-town source (getHomeMuni reads "fr:home-muni:v1");
      // this used to read a stale "fr_home_muni" key that was never written, so
      // the Distance sort silently tied every row at Infinity (audit 2026-07).
      const slug = getHomeMuni();
      if (slug) {
        const m = MUNICIPALITY_BY_SLUG[slug];
        // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical post-mount hydration of a localStorage preference; SSR can't read localStorage
        if (m) setHomeOrigin(m.centroid);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Places the user has written a margin note on, freshest note first. Resolves
  // each note's slug against the hydrated place map; a note whose place didn't
  // resolve is simply skipped (never a broken card).
  const notedPlaces = useMemo<Array<{ place: PlaceCardData; note: PlaceNote }>>(() => {
    if (!placesBySlug) return [];
    return Object.entries(notes)
      .map(([slug, note]) => ({ place: placesBySlug.get(slug), note }))
      .filter((x): x is { place: PlaceCardData; note: PlaceNote } => Boolean(x.place))
      .sort((a, b) => (b.note.updated_at || "").localeCompare(a.note.updated_at || ""));
  }, [notes, placesBySlug]);

  // Places the user has marked "been here." Resolves each visited slug against
  // the hydrated map; un-deduped from Saved/Notes on purpose — "I saved it",
  // "I noted it", and "I've been" are distinct, so a place can honestly appear
  // in more than one section.
  const visitedPlaces = useMemo<PlaceCardData[]>(() => {
    if (!placesBySlug) return [];
    return beenSlugs
      .map((slug) => placesBySlug.get(slug))
      .filter((p): p is PlaceCardData => Boolean(p));
  }, [beenSlugs, placesBySlug]);

  // One render-stable "now" for the actionable lead (open-now + today's events).
  // A single value per mount is plenty — Saved isn't a live ticker.
  const now = useMemo(() => new Date(), []);

  // ── ON NOW IN YOUR RADIUS — the actionable lead. Saved places OPEN right now
  // (closing-soonest first, so the page reads as a "go" tool, not an archive),
  // computed from open_status the by-slugs API already hydrates. Independent of
  // the sort/list filter below — this is always "what of mine is live now".
  const liveNowPlaces = useMemo<PlaceCardData[]>(() => {
    if (!placesBySlug) return [];
    const open = placeRefsAll
      .map((i) => placesBySlug.get(i.id))
      .filter((p): p is PlaceCardData => p !== undefined && isOpenNow(p.open_status));
    return open.sort((a, b) => {
      const ca = a.open_status.state === "open" || a.open_status.state === "closing-soon" ? a.open_status.closesAt ?? "99:99" : "99:99";
      const cb = b.open_status.state === "open" || b.open_status.state === "closing-soon" ? b.open_status.closesAt ?? "99:99" : "99:99";
      return ca.localeCompare(cb);
    });
  }, [placeRefsAll, placesBySlug]);

  // Distinct personal lists across SAVED places, with counts, for the filter row.
  const availableLists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of placeRefsAll) {
      for (const t of savedTags[i.id] ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [placeRefsAll, savedTags]);

  // Derive the EFFECTIVE filter during render (not via a state-resetting effect):
  // if the selected label no longer exists (its last place was unlabeled or
  // unsaved), it resolves to null so the list can't get stuck showing nothing.
  const effectiveList =
    activeList && availableLists.some(([l]) => l === activeList) ? activeList : null;

  const { places, events, byCategory, byTown, townTally } = useMemo(() => {
    if (!placesBySlug) {
      return {
        places: [] as PlaceCardData[],
        events: [] as ReturnType<typeof decorateEvent>[],
        byCategory: new Map<string, PlaceCardData[]>(),
        byTown: new Map<string, PlaceCardData[]>(),
        townTally: new Map<string, number>(),
      };
    }
    // Build (ref, place) tuples so we can sort by saved_at when the
    // user picks "Recent". Other sorts only need the place itself.
    const placeRefs = placeRefsAll
      .map((i) => ({ ref: i, place: placesBySlug.get(i.id) }))
      .filter((x): x is { ref: typeof x.ref; place: PlaceCardData } => Boolean(x.place));

    // Personal-list filter: when a list is selected, keep only saved places
    // the user has labelled with it. Applied BEFORE sort + bucketing so every
    // view (town/category/flat) honours the filter.
    const visibleRefs = effectiveList
      ? placeRefs.filter((x) => (savedTags[x.place.slug] ?? []).includes(effectiveList))
      : placeRefs;

    // Apply the user's sort. "category" keeps the original recent-first
    // order before bucketing (so within each category, the freshest
    // saves still come first).
    let sorted: typeof placeRefs;
    switch (sort) {
      case "az":
        sorted = [...visibleRefs].sort((a, b) =>
          a.place.name.localeCompare(b.place.name, undefined, { sensitivity: "base" }),
        );
        break;
      case "open":
        // Open places first, the one closing soonest leading — the
        // saved list as a "right now" tool, not a museum. Closed and
        // unverified places keep their recency order below the fold.
        sorted = [...visibleRefs].sort((a, b) => {
          const oa = isOpenNow(a.place.open_status);
          const ob = isOpenNow(b.place.open_status);
          if (oa !== ob) return oa ? -1 : 1;
          if (oa && ob) {
            const ca = a.place.open_status.state === "open" || a.place.open_status.state === "closing-soon" ? a.place.open_status.closesAt : "99:99";
            const cb = b.place.open_status.state === "open" || b.place.open_status.state === "closing-soon" ? b.place.open_status.closesAt : "99:99";
            return ca.localeCompare(cb);
          }
          return +new Date(b.ref.saved_at) - +new Date(a.ref.saved_at);
        });
        break;
      case "distance":
        sorted = [...visibleRefs].sort((a, b) => {
          const da = homeOrigin && a.place.geom ? haversineMeters(homeOrigin, a.place.geom) : Infinity;
          const db = homeOrigin && b.place.geom ? haversineMeters(homeOrigin, b.place.geom) : Infinity;
          return da - db;
        });
        break;
      case "category":
      case "recent":
      default:
        sorted = [...visibleRefs].sort(
          (a, b) => +new Date(b.ref.saved_at) - +new Date(a.ref.saved_at),
        );
        break;
    }
    const places = sorted.map((x) => x.place);

    const events = items
      .filter((i) => i.type === "event")
      .map((i) => EVENT_BY_SLUG[i.id])
      .filter(Boolean)
      .map(decorateEvent);

    // Bucket places by their top-level category — gives the page a
    // "shape" so the user can scan what kind of Frederick they're
    // collecting (mostly food, mostly outdoors, a mix). Only used
    // when sort === "category"; other sorts render a flat list.
    const byCategory = new Map<string, PlaceCardData[]>();
    for (const p of places) {
      const top = CATEGORY_BY_SLUG[p.category]?.parent ?? p.category;
      const arr = byCategory.get(top) ?? [];
      arr.push(p);
      byCategory.set(top, arr);
    }

    // Town tally — if a town dominates, the page can surface a "make a
    // route" suggestion. Only counts places (events have venues but
    // their town signal is noisier).
    const townTally = new Map<string, number>();
    for (const p of places) {
      townTally.set(p.municipality, (townTally.get(p.municipality) ?? 0) + 1);
    }

    // Bucket places by town — the field-guide view ("what I'm keeping in
    // Frederick, in Brunswick…"). Used when sort === "town" (default).
    const byTown = new Map<string, PlaceCardData[]>();
    for (const p of places) {
      const arr = byTown.get(p.municipality) ?? [];
      arr.push(p);
      byTown.set(p.municipality, arr);
    }

    return { places, events, byCategory, byTown, townTally };
  }, [items, placeRefsAll, placesBySlug, sort, homeOrigin, savedTags, effectiveList]);

  // Saved events happening TODAY — the other half of the actionable lead. The
  // full Events section below keeps the whole saved set; this is just "tonight".
  const eventsToday = useMemo(
    () =>
      events.filter((event) => {
        if (!isEventToday(event.starts_at, now)) return false;
        const endMs = Date.parse(event.ends_at || event.starts_at);
        return !Number.isFinite(endMs) || endMs >= now.getTime();
      }),
    [events, now],
  );

  // Saved-event hygiene: upcoming (soonest first) vs past (most-recent first).
  // A saved event whose end is behind us is "past" — kept, not deleted, but
  // demoted so it stops cluttering the active list.
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const up: DecoratedEvent[] = [];
    const pa: DecoratedEvent[] = [];
    for (const e of events) {
      const endMs = Date.parse(e.ends_at || e.starts_at);
      if (!Number.isNaN(endMs) && endMs < now.getTime()) pa.push(e);
      else up.push(e);
    }
    up.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    pa.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
    return { upcomingEvents: up, pastEvents: pa };
  }, [events, now]);

  // Shareable read-only "radius": the ordered saved PLACE slugs, encoded into a
  // /radius/shared link. Places only (events are time-bound; a shared list is a
  // "here's my Frederick" recommendation, which is about places).
  // SCOPED to the active personal list: sharing your "date night" list used to
  // ship your ENTIRE radius — the URL ignored the filter the screen showed.
  const scopedSlugs = useMemo(
    () =>
      placeRefsAll
        .map((i) => i.id)
        .filter((slug) => !effectiveList || (savedTags[slug] ?? []).includes(effectiveList)),
    [placeRefsAll, effectiveList, savedTags],
  );
  const shareUrl = useMemo(
    () => (scopedSlugs.length > 0 ? `/radius/shared?p=${scopedSlugs.map(encodeURIComponent).join(",")}` : null),
    [scopedSlugs],
  );
  // The missing bridge from "saved 20 places" to "planned my Saturday": when a
  // personal list is active, one tap builds an itinerary from THAT list.
  const listPlanHref = useMemo(
    () =>
      effectiveList && scopedSlugs.length >= 2
        ? `/plan?p=${planTokenFromSaved(scopedSlugs.slice(0, 6))}`
        : null,
    [effectiveList, scopedSlugs],
  );

  // Resolve recent slugs to PlaceCardData, drop ones now-saved (the
  // "Saved" sections already surface them) and ones not in the place
  // index. Capped to 6 so the row stays scannable.
  const savedSlugs = useMemo(
    () => new Set(placeRefsAll.map((i) => i.id)),
    [placeRefsAll],
  );
  const recentPlaces = useMemo<PlaceCardData[]>(() => {
    if (!placesBySlug || !recentSlugs.length) return [];
    const out: PlaceCardData[] = [];
    for (const slug of recentSlugs) {
      if (savedSlugs.has(slug)) continue;
      const p = placesBySlug.get(slug);
      if (p) out.push(p);
      if (out.length >= 6) break;
    }
    return out;
  }, [recentSlugs, savedSlugs, placesBySlug]);

  // saved_at per slug for the wallet stub's Saved cell. The epoch sentinel
  // (a DB follow whose local stamp we never saw) is refused downstream by
  // walletFacts.savedDateLabel, so it never prints as Jan 1 1970.
  const savedAtBySlug = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of placeRefsAll) m[r.id] = r.saved_at;
    return m;
  }, [placeRefsAll]);

  // saved_at per EVENT slug, for the event wallet stub's Saved cell. Events
  // are device-local by contract, so the local ref's stamp is the truth.
  const savedAtByEventSlug = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of items) if (i.type === "event") m[i.id] = i.saved_at;
    return m;
  }, [items]);

  const placesPending = slugsToFetch.length > 0 && resolvedKey !== slugsKey;
  if (placesPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Masthead stand="Loading saved places" />
        <div className="space-y-3">
          <Skeleton.Block height={46} round="var(--app-radius-sm)" />
          <Skeleton.Block height={56} round="var(--app-radius-md)" />
          <Skeleton.Row />
          <Skeleton.Row />
          <Skeleton.Row />
        </div>
      </div>
    );
  }

  // Notes OR visited places alone are enough to skip the blank-journal empty
  // state — a user can annotate or mark "been here" without bookmarking.
  // (placesBySlug is resolved by here, so both lists are final — no flash.)
  if (items.length === 0 && placeRefsAll.length === 0 && notedPlaces.length === 0 && visitedPlaces.length === 0) {
    return (
      <div className="space-y-4">
        <Masthead stand="Places and events you want to keep" />
        <EmptyState />
      </div>
    );
  }

  // Cluster signal: if ≥3 places are in one town, suggest a route.
  const dominantTown = [...townTally.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])[0];
  const dominantMuni = dominantTown
    ? MUNICIPALITY_BY_SLUG[dominantTown[0]]
    : null;

  // Plan a day from the cluster: the dominant town's saved places (cap 6 — a
  // day out, not a march), encoded into the planner's shared-plan token so
  // /plan rebuilds them into a real itinerary. Order = current Places order.
  const planClusterSlugs = dominantTown
    ? (byTown.get(dominantTown[0]) ?? []).slice(0, 6).map((p) => p.slug)
    : [];
  const planHref =
    planClusterSlugs.length >= 2 ? `/plan?p=${planTokenFromSaved(planClusterSlugs)}` : "/plan";

  // Masthead standfirst: the counts as supporting detail, never a headline.
  // Places + towns only — events would overflow 390px, and the colophon's
  // fin line already carries the full tally.
  const townN = townTally.size;
  const standParts: ReactNode[] = [];
  if (places.length > 0) {
    standParts.push(
      <em key="p">{places.length} place{places.length === 1 ? "" : "s"}</em>,
    );
    if (townN > 1) standParts.push(<span key="t">{townN} towns</span>);
  } else if (events.length > 0) {
    standParts.push(<em key="e">{events.length} event{events.length === 1 ? "" : "s"}</em>);
  }
  // Wallet is the calm default. Legacy stored "wallet" preferences map to the
  // organizer's list view; Map only mounts after the person opens the advanced
  // disclosure and explicitly keeps that preference.
  const organizerView: "list" | "map" = view === "map" ? "map" : "list";

  return (
    <div className="space-y-4">
      <Masthead
        stand={
          <>
            {standParts.length > 0
              ? standParts.map((part, i) => (
                  <span key={i}>{i > 0 ? " · " : ""}{part}</span>
                ))
              : "Places and events you want to keep"}
          </>
        }
      />

      {(liveNowPlaces.length > 0 || eventsToday.length > 0) && (
        <section aria-labelledby="saved-useful-now" className="space-y-2">
          <h2
            id="saved-useful-now"
            className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Useful now
          </h2>
          {/* Saved places open this minute, closing-soonest first; each name
              raises its card in the wallet below. */}
          {liveNowPlaces.length > 0 && (
            <div className="sv-onnow" role="group" aria-label="Open right now">
              <span className="sv-onnow-label">
                <span aria-hidden className="sw-dot" />
                Open
              </span>
              <div className="sv-onnow-scroll">
                {liveNowPlaces.map((p) => {
                  const allDay = p.open_status.state === "open" && p.open_status.allDay;
                  const till =
                    !allDay && (p.open_status.state === "open" || p.open_status.state === "closing-soon")
                      ? fmtClockShort(p.open_status.closesAt)
                      : null;
                  const when = allDay ? "24 hours" : till ? `till ${till}` : "open now";
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      className="sv-onnow-chip"
                      onClick={() => raiseCard(p.slug)}
                      aria-label={`${p.name}, open now${allDay ? ", 24 hours" : till ? ` till ${till}` : ""}. Raise its card`}
                    >
                      <b>{p.name}</b>
                      {when}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {eventsToday.length > 0 && (
            <ul className="space-y-2">
              {eventsToday.slice(0, 3).map((e) => (
                <li key={`${e.slug}-${e.starts_at}`}>
                  <EventRow event={e} today />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {places.length > 0 && (
        <section aria-labelledby="saved-places-heading" className="space-y-2.5">
          <header className="flex items-baseline gap-2.5">
            <h2
              id="saved-places-heading"
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink)" }}
            >
              Saved places
            </h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {places.length}
            </span>
          </header>
          <SavedWallet
            places={places}
            savedAt={savedAtBySlug}
            openSlug={raisedSlug}
            onOpenSlug={setRaisedSlug}
          />
        </section>
      )}

      {/* Upcoming remains part of the default page, before any organizer or
          collection-history controls. */}
      {events.length > 0 && (
        <section aria-label="Upcoming saved events" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-brand)" }}
            />
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-brand-press)" }}
            >
              Upcoming
            </h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {upcomingEvents.length}
            </span>
          </header>
          {upcomingEvents.length > 0 ? (
            <SavedEventWallet events={upcomingEvents} savedAt={savedAtByEventSlug} now={now} />
          ) : (
            <p className="px-0.5 text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              There are no upcoming events. Your saved events have all passed.
            </p>
          )}
          {pastEvents.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                className="tap-44 text-[11px] font-semibold underline-offset-2 hover:underline"
                style={{ color: "var(--app-ink-3)" }}
                aria-expanded={showPast}
              >
                {showPast ? "Hide" : "Show"} {pastEvents.length} past event{pastEvents.length === 1 ? "" : "s"}
              </button>
              {showPast && (
                <div className="opacity-70">
                  <SavedEventWallet
                    events={pastEvents}
                    savedAt={savedAtByEventSlug}
                    now={now}
                    startRaised={false}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <details
        id="saved-organizer"
        onToggle={(event) => setOrganizerOpen(event.currentTarget.open)}
        className="group overflow-hidden rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)]"
        style={{ borderColor: "var(--app-border-strong)" }}
      >
        <summary className="tap-44 flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px]"
            style={{
              color: "var(--app-cool)",
              background: "color-mix(in srgb, var(--app-cool) 11%, transparent)",
            }}
          >
            <Layers className="h-4 w-4" strokeWidth={2.1} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Organize and revisit
            </span>
            <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              Lists, map, notes, visits, and sharing
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
            strokeWidth={2.25}
            style={{ color: "var(--app-ink-3)" }}
            aria-hidden
          />
        </summary>
        <div className="space-y-5 border-t p-3" style={{ borderColor: "var(--app-border)" }}>

      {places.length > 0 && (
        <section aria-label="Organize saved places" className="space-y-3">
          {/* The calm wallet is already above. This disclosed workspace offers
              the two analytical views: grouped list or map. */}
          <div className="flex items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="Organize saved places as a list or map"
              className="inline-flex rounded-full border p-0.5"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
            >
              {(["list", "map"] as const).map((v) => {
                const active = organizerView === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setViewAndStore(v)}
                    className="tap-44-y flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
                    style={{
                      background: active ? "var(--app-bg-elevated)" : "transparent",
                      color: active ? "var(--app-ink)" : "var(--app-ink-3)",
                      boxShadow: active ? "var(--app-edge), var(--app-hi)" : "none",
                    }}
                  >
                    {v === "map" && <MapPin className="h-3 w-3" strokeWidth={2.25} aria-hidden />}
                    {v === "list" ? "List" : "Map"}
                  </button>
                );
              })}
            </div>
            {organizerView !== "map" && (
              <SortDropdown
                options={SORT_OPTIONS}
                value={sort}
                onChange={setSortAndStore}
              />
            )}
          </div>

          {/* Personal lists filter — the user's own labels ("date night",
              "takeout") become one-tap collections. Only shows once at least
              one saved place has been labelled (on the place page). */}
          {availableLists.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip label="All" active={effectiveList === null} onClick={() => setActiveList(null)} />
              {availableLists.map(([label, n]) => (
                <FilterChip
                  key={label}
                  label={label}
                  count={n}
                  active={effectiveList === label}
                  onClick={() => setActiveList(effectiveList === label ? null : label)}
                />
              ))}
              {listPlanHref && (
                <Link
                  href={listPlanHref}
                  className="tap-44-y ml-auto inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold"
                  style={{ color: "var(--app-brand-press)" }}
                >
                  Plan this list
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                </Link>
              )}
            </div>
          )}

          {organizerView === "map" && organizerOpen ? (
            (() => {
              const mapPlaces = places.filter((p) => p.geom);
              return mapPlaces.length > 0 ? (
                <div
                  className="relative h-[60vh] min-h-[360px] w-full overflow-hidden rounded-[var(--app-radius-lg)] border"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <AppMapClient places={mapPlaces} fullBleed />
                </div>
              ) : (
                <p
                  className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-8 text-center text-[13px]"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
                >
                  None of your saved places have a location to map yet.
                </p>
              );
            })()
          ) : sort === "town" || sort === "category" ? (
            <div className="space-y-4">
              {(sort === "town"
                ? [...byTown.entries()]
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([slug, group]) => {
                      const m = MUNICIPALITY_BY_SLUG[slug];
                      return {
                        key: slug,
                        label: m?.name ?? slug,
                        color: townAccent(slug),
                        // The town's identity line — its one-liner fact,
                        // else population — turns a header into a chapter.
                        subtitle: m?.fact ?? (m ? `pop. ${m.population.toLocaleString()}` : null),
                        group,
                      };
                    })
                : [...byCategory.entries()]
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([catSlug, group]) => ({
                      key: catSlug,
                      label: CATEGORY_BY_SLUG[catSlug]?.name ?? catSlug,
                      color: CATEGORY_BY_SLUG[catSlug]?.color ?? "var(--app-cool)",
                      subtitle: null as string | null,
                      group,
                    }))
              ).map(({ key, label, color, subtitle, group }) => (
                <section key={key} className="space-y-2">
                  {/* Chapter header — an accent-tinted band in the town's
                      own color, with a serif name + count + identity line,
                      so each section reads as its own page of the guide. */}
                  <header
                    className="flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-2"
                    style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
                  >
                    <span
                      aria-hidden
                      className="block h-7 w-1.5 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h3
                          className="truncate font-serif text-[15px] font-semibold tracking-tight"
                          style={{ color: "var(--app-ink)" }}
                        >
                          {label}
                        </h3>
                        <span
                          className="shrink-0 rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
                        >
                          {group.length}
                        </span>
                      </div>
                      {subtitle && (
                        <p
                          className="truncate text-[11px] leading-tight"
                          style={{ color: "var(--app-ink-3)" }}
                        >
                          {subtitle}
                        </p>
                      )}
                    </div>
                  </header>
                  <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {group.map((p) => (
                      <li key={p.slug}>
                        <PlaceCard place={p} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {places.map((p) => (
                <li key={p.slug}>
                  <PlaceCard place={p} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Plan-a-day — one ruled line, only when there's a real cluster. */}
      {dominantMuni && (
        <Link href={planHref} className="sv-planline">
          <span className="txt">
            <b>{dominantTown![1]} of your saves are in {dominantMuni.name}.</b>{" "}
            String them into one day out.
          </span>
          <span className="go">Plan a day <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} /></span>
        </Link>
      )}

      {/* Your notes — the user's own margin notes on places. A naturalist's
          jottings ("great patio, ask for Maria"), shown under each place as an
          accent-ruled note. Distinct from the verified Field Notes moat. */}
      {notedPlaces.length > 0 && (
        <section aria-label="Your notes" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-accent)" }}
            />
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-accent-press)" }}
            >
              Your notes
            </h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {notedPlaces.length}
            </span>
          </header>
          <ul className="space-y-2.5">
            {notedPlaces.map(({ place, note }) => (
              <li key={place.slug} className="space-y-1">
                <PlaceCard place={place} />
                <p
                  className="ml-3 border-l-2 pl-2.5 font-serif text-[13px] italic leading-snug"
                  style={{ borderColor: "var(--app-accent)", color: "var(--app-ink-2)" }}
                >
                  {note.text}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Visited — places the user tapped "Been here" on, from the place page.
          Same calm slate accent as the toggle; a plain noun header to sit
          alongside Places / Your notes / Events. */}
      {visitedPlaces.length > 0 && (
        <section aria-label="Visited" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-cool)" }}
            />
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-cool)" }}
            >
              Visited
            </h2>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
              {visitedPlaces.length}
            </span>
          </header>
          <ul className="space-y-2.5">
            {visitedPlaces.map((place) => (
              <li key={place.slug}>
                <PlaceCard place={place} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Passport — the earned layer. Field-guide cancellation stamps derived
          from real local signals (saves, been-here, notes, taps); presses the
          first-earned date into each stamp. Self-hides for a brand-new user. */}
      <Passport placesBySlug={placesBySlug} />

      {/* Recently viewed — soft signal. Surfaces places the user has opened
          (via PlaceSheet) but hasn't explicitly bookmarked. Quieter visual
          weight than the deliberate Saved sections above. */}
      {recentPlaces.length > 0 && (
        <section aria-label="Recently viewed" className="space-y-2">
          <header className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="block h-[3px] w-7 rounded-full"
              style={{ background: "var(--app-ink-3)" }}
            />
            <h2
              className="text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--app-ink-3)" }}
            >
              Recently viewed
            </h2>
            <button
              type="button"
              onClick={clearRecent}
              className="tap-44 ml-auto text-[11px] font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--app-ink-3)" }}
            >
              Clear
            </button>
          </header>
          <ul className="space-y-2">
            {recentPlaces.map((p) => (
              <li key={p.slug}>
                <PlaceCard place={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* My taps — beers saved from the beer taste finder (/beer). Its own
          store type in the shared saved system; self-hides when empty. */}
      <MyTaps />

      {/* Quiet utility colophon: sharing and place sync only. */}
      <footer className="sv-colophon" aria-label="About this page">
        <div className="inner">
          {shareUrl && (
            <div className="sv-colophon-row">
              <span className="k">Share this list with a friend</span>
              <ShareButton
                title="My saved Frederick list"
                text="Places I'm keeping an eye on in Frederick County"
                url={shareUrl}
                className="v tap-44-y inline-flex items-center gap-1 font-semibold"
              />
            </div>
          )}
          {!userEmail && (
            <Link className="sv-colophon-row" href="/auth/login?next=/my-radius">
              <span className="k">Keep saved places on your other devices</span>
              <span className="v link">Magic link <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} /></span>
            </Link>
          )}
          <Link className="sv-colophon-row" href="/settings/notifications">
            <span className="k">A nudge before a saved place closes</span>
            <span className="v link">Turn on <ArrowRight aria-hidden className="ml-1 inline h-3.5 w-3.5 -translate-y-px" strokeWidth={2.25} /></span>
          </Link>
        </div>
        <p className="sv-colophon-fin">
          {userEmail ? `Saved places synced as ${userEmail}` : "Saved on this device"}
          {places.length > 0 && ` · ${places.length} place${places.length === 1 ? "" : "s"}`}
          {events.length > 0 && (
            userEmail
              ? ` · ${events.length} device-only event${events.length === 1 ? "" : "s"}`
              : ` · ${events.length} event${events.length === 1 ? "" : "s"}`
          )}
          {userEmail && " · routes and taps stay on this device"}
        </p>
      </footer>
        </div>
      </details>
    </div>
  );
}


/** Honest and never a dead end: one sentence and one primary next step. The
 * app shell already exposes Map, Events, and Ask, so repeating those doors here
 * makes an empty collection feel like another tools directory. */
export function EmptyState() {
  return (
    <div className="max-w-sm space-y-4 py-2">
      <p
        className="px-0.5 font-serif text-[18px] font-semibold leading-snug"
        style={{ color: "var(--app-ink)" }}
      >
        Save a place or event to keep it here for later.
      </p>
      <Link
        href="/search"
        className="tap-44 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-semibold"
        style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}
      >
        <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
        Find something to save
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </Link>
    </div>
  );
}
