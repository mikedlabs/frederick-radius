"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFollowedSlugs } from "@/hooks/useFollows";
import { CRAVINGS, CRAVING_BY_KEY, type CravingMatchable } from "@/data/cravings";
import { getHomeMuni } from "@/lib/personalize";
import type { PlaceCardData } from "@/lib/loaders/places";

/**
 * TasteNudge — a single quiet shortcut derived from the user's OWN saved places.
 * It tallies the dominant craving across what you've kept ("you keep a lot of
 * coffee") and links to that answer on /nearby (scoped to your home town when
 * set). This is FINDING from your own signal, not telling: it recommends no
 * specific place, names no pick, and only speaks once your saves show a clear
 * pattern. Fully self-hiding; client-only; never on the I-want grid's paint path.
 */
const MIN_SAVED = 3; // don't speak until there's a real pattern
const MIN_TOP = 3; // the winning craving needs at least this many matches
const DOMINANCE = 0.4; // and a clear plurality (>=40% of craving-matched saves)

// When a place matches several cravings, prefer the most SPECIFIC noun a person
// would actually say. Broad buckets (food, drinks, shops, outside) lose to the
// precise ones. Order = specificity (earlier wins).
const CRAVING_PRIORITY = [
  "coffee", "ice-cream", "grocery", "breweries", "wineries", "liquor", "movies",
  "golf", "farms", "music", "pools", "salon", "wellness", "family", "stay", "art",
  "drinks", "shops", "outside", "food",
];

// Display nouns per craving key. `lower` is a PLACE-noun that reads naturally
// after "You keep a lot of ___." (the nudge is about saved PLACES, so every
// value is a plural/mass place-noun, never a singular count noun like "a
// drink"). `cap` is the short label for the "<X> near you" link.
const NOUN: Record<string, { lower: string; cap: string }> = {
  coffee: { lower: "coffee spots", cap: "Coffee" },
  "ice-cream": { lower: "ice cream shops", cap: "Ice cream" },
  food: { lower: "places to eat", cap: "Food" },
  drinks: { lower: "bars and taprooms", cap: "Drinks" },
  breweries: { lower: "breweries", cap: "Breweries" },
  wineries: { lower: "wineries", cap: "Wineries" },
  grocery: { lower: "grocery stores", cap: "Grocery" },
  outside: { lower: "parks and trails", cap: "Parks" },
  shops: { lower: "shops", cap: "Shops" },
  art: { lower: "galleries and museums", cap: "Art" },
  music: { lower: "live-music spots", cap: "Live music" },
  family: { lower: "family spots", cap: "Family fun" },
  golf: { lower: "golf courses", cap: "Golf" },
  farms: { lower: "farms", cap: "Farms" },
  movies: { lower: "movie theaters", cap: "Movies" },
  pools: { lower: "pools", cap: "Pools" },
  salon: { lower: "salons", cap: "Salons" },
  wellness: { lower: "wellness spots", cap: "Wellness" },
  liquor: { lower: "bottle shops", cap: "Wine & liquor" },
  stay: { lower: "places to stay", cap: "Stays" },
};

/** Resolve one place to its single best (most specific) craving key, or null. */
function bestCraving(p: CravingMatchable): string | null {
  let best: string | null = null;
  let bestRank = Infinity;
  for (const c of CRAVINGS) {
    if (!c.match(p)) continue;
    const idx = CRAVING_PRIORITY.indexOf(c.key);
    const rank = idx === -1 ? 999 : idx;
    if (rank < bestRank) {
      bestRank = rank;
      best = c.key;
    }
  }
  return best;
}

export default function TasteNudge() {
  const { slugs, loading } = useFollowedSlugs();
  const [places, setPlaces] = useState<PlaceCardData[] | null>(null);
  const [homeMuni, setHomeMuni] = useState<string | null>(null);
  const slugsKey = useMemo(() => [...slugs].sort().join(","), [slugs]);

  // Post-hydration only, and skipped entirely under threshold so a light user
  // never even triggers a request from this component.
  useEffect(() => {
    if (!slugsKey || slugs.size < MIN_SAVED) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results when saves drop below the speak threshold; no fetch fires
      setPlaces(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/places/by-slugs?slugs=${encodeURIComponent(slugsKey)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((d: { places: PlaceCardData[] }) => setPlaces(d.places ?? []))
      .catch((err) => {
        if (err && err.name !== "AbortError") setPlaces([]);
      });
    return () => ctrl.abort();
  }, [slugsKey, slugs.size]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount localStorage read; SSR can't see the home town
    setHomeMuni(getHomeMuni());
  }, []);

  const top = useMemo(() => {
    if (!places || places.length < MIN_SAVED) return null;
    const saved = new Set(slugs);
    const tally = new Map<string, number>();
    const townsByCraving = new Map<string, Set<string>>();
    let matched = 0;
    for (const p of places) {
      if (!saved.has(p.slug)) continue; // intersect the LIVE saved set
      const key = bestCraving(p as CravingMatchable);
      if (!key) continue;
      tally.set(key, (tally.get(key) ?? 0) + 1);
      if (p.municipality) {
        const set = townsByCraving.get(key) ?? new Set<string>();
        set.add(p.municipality);
        townsByCraving.set(key, set);
      }
      matched++;
    }
    if (matched === 0) return null;
    const [winner, n] = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (n < MIN_TOP || n / matched < DOMINANCE) return null; // no clear top
    if (!CRAVING_BY_KEY[winner]) return null;
    // Town-scope the /nearby link ONLY when the user actually saved one of these
    // in their home town, which guarantees a non-empty town-scoped result. If
    // their saves of this craving are all elsewhere, answer county-wide so we
    // never deep-link into an empty town filter.
    const scopeTown = Boolean(homeMuni && townsByCraving.get(winner)?.has(homeMuni));
    return { key: winner, n, scopeTown };
  }, [places, slugs, homeMuni]);

  if (loading || !top) return null; // honest empty: render nothing

  const noun = NOUN[top.key] ?? {
    lower: CRAVING_BY_KEY[top.key].label.toLowerCase(),
    cap: CRAVING_BY_KEY[top.key].label,
  };
  const href = `/nearby?c=${encodeURIComponent(top.key)}${top.scopeTown && homeMuni ? `&town=${encodeURIComponent(homeMuni)}` : ""}`;

  return (
    <Link
      href={href}
      aria-label={`${noun.cap} near you`}
      className="tap-44 mt-3 flex items-center gap-2 px-0.5 text-[13px]"
      style={{ color: "var(--app-ink-2)" }}
    >
      <span aria-hidden className="block h-[3px] w-5 shrink-0 rounded-full" style={{ background: "var(--app-brand)" }} />
      <span className="min-w-0 flex-1">
        You keep a lot of {noun.lower}.{" "}
        <span className="font-semibold" style={{ color: "var(--app-brand-press)" }}>
          {noun.cap} near you
        </span>
      </span>
      <span aria-hidden className="shrink-0 font-bold" style={{ color: "var(--app-ink-3)" }}>→</span>
    </Link>
  );
}
