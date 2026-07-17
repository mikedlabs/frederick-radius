"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Coffee,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Martini,
  Grape,
  Trees,
  ShoppingBag,
  ShoppingCart,
  Palette,
  Music,
  FerrisWheel,
  Wine,
  BedDouble,
  Sparkles,
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
  Flag,
  Tractor,
  Film,
  Waves,
  Scissors,
  ArrowLeft,
  Navigation,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import {
  CRAVINGS,
  CRAVING_BY_KEY,
  matchesCraving,
  matchesCravingFacet,
} from "@/data/cravings";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { cuisinesOf, cuisineLabel } from "@/lib/cuisine";
import { mealForKey, matchMeal, isMealKey } from "@/lib/meal";
import { useGeolocation } from "@/hooks/useGeolocation";
import { haversineMeters } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import { haptic } from "@/lib/haptics";
import { setScope, subscribeScopeChange, scopeTownSlug, type Scope } from "@/lib/scope";

/**
 * RightNow — the one-tap craving answer.
 *
 * The whole interaction: a person standing on the sidewalk taps what they
 * want ("Ice cream"), and we answer with the NEAREST OPEN one from where
 * they're standing — no town picker, no filters, no map to pan. Say the
 * noun, get the closest open answer, go.
 *
 * Distance is honest: we only print "min walk / distance" when we actually
 * have the user's location. Without a valid town, device, or in-county IP
 * origin, results stay county-wide rather than silently ranking from Downtown.
 */

// Keyed by the `icon` strings in src/data/cravings.ts. Every craving icon must
// have an entry here or the tile crashes ("Element type is invalid ... got
// undefined"); the `?? Utensils` fallback at the lookup sites is the safety net
// for any future craving whose icon lands here unmapped.
const ICONS: Record<string, LucideIcon> = {
  Coffee,
  Martini,
  Grape,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  ShoppingCart,
  Palette,
  Music,
  FerrisWheel,
  Wine,
  BedDouble,
  Sparkles,
  // Newer craving icons (golf / farms / movies / pools / salons) — without these
  // the /nearby picker tile would fall back to the fork glyph.
  Flag,
  Tractor,
  Film,
  Waves,
  Scissors,
  // Meal-occasion glyphs (the time-aware lead from the /today I-want strip).
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
};

// ~80 m/min walking — same constant the reason chips use.
const WALK_M_PER_MIN = 80;

// Show up to this many matches. The old cap of 6 hid closed or farther-out
// downtown spots behind the open-first sort, so "where's all the ice cream /
// coffee?" looked incomplete. 16 surfaces effectively every in-town option
// while staying bounded; still sorted open-first then nearest.
const RESULT_LIMIT = 16;

// Cuisine slugs that have their OWN I-want tab (Coffee, Drinks, Sweets), so the
// Food cuisine chips stay food-focused instead of echoing the other tabs.
const FOOD_FACET_EXCLUDE = new Set(["coffee", "bar", "brewery", "dessert"]);

function walkLabel(distance_m: number): string {
  const mins = Math.max(1, Math.round(distance_m / WALK_M_PER_MIN));
  if (mins <= 25) return `${mins} min walk`;
  const mi = distance_m / 1609;
  return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
}

export default function RightNow({
  places,
  initialCraving = null,
  initialFacet = null,
  initialTown = null,
  initialScope = null,
  approxOrigin = null,
  approxCity = null,
  approxStatus = "missing",
}: {
  places: PlaceCardData[];
  /** Preselected craving from a deep link (?c=coffee) — skips the picker
   *  straight to the answer when arriving from a Today craving chip. */
  initialCraving?: string | null;
  /** Preselected sub-facet from a deep link (?c=shops&facet=thrift) — lands on
   *  the already-narrowed list (e.g. Shop → Thrift & vintage from /today). */
  initialFacet?: string | null;
  /** Preselected town scope from a deep link (?c=coffee&town=brunswick) — set
   *  when the visitor has a home town, so answers default to it. */
  initialTown?: string | null;
  /** Shared browsing lens. County is a deliberate no-origin mode; near-me
   * may use device/IP; a town remains a hard municipality filter. */
  initialScope?: Scope | null;
  /** Coarse edge-IP origin used to rank BEFORE a precise device fix (never to
   *  print a distance). Null when out of area → Downtown default. */
  approxOrigin?: { lng: number; lat: number } | null;
  /** City label for the coarse location ("near Thurmont"). */
  approxCity?: string | null;
  /** Why edge-IP geo could not seed ranking, for honest fallback copy. */
  approxStatus?: "available" | "missing" | "outside-county";
}) {
  const { state, request } = useGeolocation();
  const [cravingKey, setCravingKey] = useState<string | null>(
    initialCraving && (CRAVING_BY_KEY[initialCraving] || isMealKey(initialCraving))
      ? initialCraving
      : null,
  );
  // Sub-filters on the results page ("find more specific things"): a facet
  // narrows within the craving (Food → Pizza), and Open now hides closed —
  // ON by default so the page leads with what you can actually walk into.
  const [facetKey, setFacetKey] = useState<string | null>(initialFacet ?? null);
  // Show EVERYTHING by default (open first, closed clearly marked below) so you
  // can see what's out there in general; the Open-now toggle narrows to open.
  const [openOnly, setOpenOnly] = useState(false);
  // "Catch it before it closes" — narrow to places open but closing within the
  // hour. Off by default; the chip only appears when there ARE any (below).
  const [closingSoonOnly, setClosingSoonOnly] = useState(false);
  // Town scope: null = everywhere (ranked by distance), or a municipality slug
  // to narrow the answer to one town ("coffee in Brunswick"). Seeded from the
  // visitor's home town via the deep link when present.
  const [townKey, setTownKey] = useState<string | null>(
    initialTown && MUNICIPALITY_BY_SLUG[initialTown] ? initialTown : null,
  );
  const [scope, setScopeState] = useState<Scope | null>(initialScope);

  useEffect(() => subscribeScopeChange((nextScope) => {
    setScopeState(nextScope);
    setTownKey(scopeTownSlug(nextScope));
  }), []);

  function chooseTown(nextTown: string | null) {
    const nextScope: Scope = nextTown ? `town:${nextTown}` : "county";
    setTownKey(nextTown);
    setScopeState(nextScope);
    setScope(nextScope);
  }

  function activateMyLocation() {
    setTownKey(null);
    setScopeState("nearme");
    setScope("nearme");
    request();
  }
  // Sort: nearest-first (default) or top-rated-first. Open places always lead
  // either way — you can't walk into a closed one.
  const [sort, setSort] = useState<"nearest" | "rated">("nearest");

  // Arriving straight to an answer from a Today craving tile (?c=coffee skips
  // the picker) should still ask for location, exactly like tapping a craving
  // in the picker does — otherwise the deep-link path silently answers "near
  // Downtown" and the only way to get "near you" is to spot the secondary
  // button. Ask once, on arrival, when we haven't asked yet.
  const askedOnArrival = useRef(false);
  useEffect(() => {
    if (askedOnArrival.current) return;
    if (
      initialCraving &&
      !initialTown &&
      scope !== "county" &&
      (CRAVING_BY_KEY[initialCraving] || isMealKey(initialCraving)) &&
      state.status === "idle"
    ) {
      askedOnArrival.current = true;
      // The scope event updates local scope/town state through the subscription
      // above; the device request owns its own async geolocation state.
      setScope("nearme");
      request();
    }
  }, [initialCraving, initialTown, scope, state.status, request]);

  // A town-scoped distance is distance from the town centroid, not the user.
  // Never print it as if it came from the device.
  const hasFix = state.status === "granted" && !townKey && scope !== "county";
  // A selected town is a deliberate lens and therefore outranks a device
  // fix. Sorting Thurmont results from a Frederick phone location made the
  // town scope technically filtered but locally wrong.
  const origin = useMemo(() => {
    if (townKey) return MUNICIPALITY_BY_SLUG[townKey]?.centroid ?? null;
    if (scope === "county") return null;
    return state.status === "granted"
      ? { lng: state.position.lng, lat: state.position.lat }
      : approxOrigin;
  }, [state, approxOrigin, townKey, scope]);

  // The selection is either a noun craving or a time-aware meal occasion
  // (breakfast/lunch/dinner/brunch/late, arrived at via the /today meal tile).
  // Both expose {key,label,color,icon}; the meal carries an honest framing
  // phrase and matches by category gate rather than a craving predicate.
  const meal = cravingKey ? mealForKey(cravingKey) : null;
  const craving = cravingKey && !meal ? CRAVING_BY_KEY[cravingKey] : null;
  const active = meal ?? craving;

  // Every place matching the craving/meal with NO facet yet — the basis for
  // the facet chips (which cuisines are actually nearby) and the open count.
  const cravingMatchedAll = useMemo(() => {
    const m = cravingKey ? mealForKey(cravingKey) : null;
    const c = cravingKey && !m ? CRAVING_BY_KEY[cravingKey] : null;
    const matchFn = m
      ? (p: PlaceCardData) => matchMeal(m, p)
      : c
        ? (p: PlaceCardData) => matchesCraving(c, p)
        : null;
    return matchFn ? places.filter(matchFn) : [];
  }, [cravingKey, places]);

  // The sub-filter chips. For a cuisine craving (Food) they're DERIVED from the
  // cuisines actually present in the matched set — top by count, county-wide —
  // so you can narrow to Mexican / Asian / BBQ / Seafood / etc. Otherwise the
  // craving's fixed facets (Drinks → Breweries/Bars, …). Meals get none.
  const facetDefs = useMemo<{ key: string; label: string }[]>(() => {
    if (craving?.cuisineFacets) {
      const counts = new Map<string, number>();
      for (const p of cravingMatchedAll) for (const slug of cuisinesOf(p)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
      return [...counts.entries()]
        // Skip cuisines that have their OWN I-want tab (Coffee, Drinks, Sweets)
        // so the Food chips stay food-focused, and one-offs so they're meaningful.
        .filter(([slug, n]) => n >= 2 && !FOOD_FACET_EXCLUDE.has(slug))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([slug]) => ({ key: slug, label: cuisineLabel(slug) }));
    }
    return (craving?.facets ?? []).map((f) => ({ key: f.key, label: f.label }));
  }, [craving, cravingMatchedAll]);

  // The narrowest active noun for copy: the chosen facet ("pizza") if set, else
  // the craving/meal label ("food").
  const activeNoun = (facetDefs.find((f) => f.key === facetKey)?.label ?? active?.label ?? "").toLowerCase();

  // matched = the craving set narrowed by the active facet, sorted open-first
  // then nearest. The basis for the open count and the displayed list.
  const matched = useMemo(() => {
    const passFacet = (p: PlaceCardData): boolean => {
      if (!facetKey) return true;
      if (craving?.cuisineFacets) return cuisinesOf(p).includes(facetKey);
      const f = craving?.facets?.find((x) => x.key === facetKey);
      return f ? matchesCravingFacet(f, p) : true;
    };
    return cravingMatchedAll
      .filter(passFacet)
      .filter((p) => !townKey || p.municipality === townKey)
      .map((p) => {
        const dist = origin ? haversineMeters(origin, p.geom) : Infinity;
        // Always-available cravings (lodging) count as open regardless of
        // verified hours — a hotel you can book any night must never be hidden
        // by the open-now gate just because its front-desk hours aren't posted.
        const open = Boolean(craving?.alwaysOpen) || isOpenNow(p.open_status);
        return { p, dist, open };
      })
      .sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1; // open first, always
        if (sort === "rated") {
          const r = (b.p.google_rating ?? 0) - (a.p.google_rating ?? 0);
          if (r) return r;
          const c = (b.p.google_rating_count ?? 0) - (a.p.google_rating_count ?? 0);
          if (c) return c;
        }
        return a.dist - b.dist; // nearest (and the tiebreak for top-rated)
      });
  }, [cravingMatchedAll, craving, facetKey, townKey, sort, origin]);

  // A town with no verified in-town match should not become a blank page.
  // Keep the scope honest, then offer the three closest verified alternatives
  // measured from that town's centroid. This is deliberately separate from
  // `matched`: the header and count still say there are zero IN the town.
  const nearbyTownFallback = useMemo(() => {
    if (!townKey || matched.length > 0 || !origin) return [];
    const passFacet = (p: PlaceCardData): boolean => {
      if (!facetKey) return true;
      if (craving?.cuisineFacets) return cuisinesOf(p).includes(facetKey);
      const facet = craving?.facets?.find((candidate) => candidate.key === facetKey);
      return facet ? matchesCravingFacet(facet, p) : true;
    };
    return cravingMatchedAll
      .filter(passFacet)
      .filter((place) => place.municipality !== townKey)
      .map((place) => ({
        place,
        distance: haversineMeters(origin, place.geom),
        open: Boolean(craving?.alwaysOpen) || isOpenNow(place.open_status),
      }))
      .sort((a, b) => Number(b.open) - Number(a.open) || a.distance - b.distance)
      .slice(0, 3)
      .map(({ place, distance }) => ({ place, distance }));
  }, [cravingMatchedAll, craving, facetKey, townKey, matched.length, origin]);

  // Towns that actually have a result for this craving — so the town row only
  // offers places that lead somewhere, never a dead "0 in Myersville" chip.
  const townsWithResults = useMemo(() => {
    const present = new Set(cravingMatchedAll.map((p) => p.municipality));
    return MUNICIPALITIES.filter((m) => present.has(m.slug));
  }, [cravingMatchedAll]);

  const openCount = useMemo(() => matched.filter((m) => m.open).length, [matched]);
  // Open, but closing within the hour (getOpenStatus → "closing-soon"). Drives
  // the urgency chip + filter; closing-soon places are a subset of "open".
  const closingSoonCount = useMemo(
    () => matched.filter((m) => m.p.open_status.state === "closing-soon").length,
    [matched],
  );

  const results = useMemo(() => {
    const list = closingSoonOnly
      ? matched.filter((m) => m.p.open_status.state === "closing-soon")
      : openOnly
        ? matched.filter((m) => m.open)
        : matched;
    return (
      list
        .slice(0, RESULT_LIMIT)
        // Attach distance for the card ONLY when we have a real fix — never
        // print a distance measured from a place the user isn't standing at.
        .map(({ p, dist }) => ({ ...p, distance_m: hasFix ? dist : undefined }))
    );
  }, [matched, openOnly, closingSoonOnly, hasFix]);

  function pick(key: string) {
    haptic("light"); // the tap should feel like a tap
    setCravingKey(key);
    setFacetKey(null); // a fresh craving starts unfiltered
    setClosingSoonOnly(false); // and not stuck on a previous craving's urgency filter
    // Give the selection a real URL/history entry while preserving the active
    // location scope. Back returns to the picker; refresh/share keeps the pick.
    const params = new URLSearchParams(window.location.search);
    params.set("c", key);
    params.delete("facet");
    window.history.pushState(null, "", `/nearby?${params.toString()}`);
    // First craving with no location yet → ask, so the answer can be
    // "nearest to YOU" rather than nearest to downtown. One prompt, then
    // it's cached for the session.
    if (state.status === "idle" && scope !== "county") activateMyLocation();
  }

  useEffect(() => {
    const onPop = () => {
      const params = new URL(window.location.href).searchParams;
      const next = params.get("c");
      setCravingKey(next && (CRAVING_BY_KEY[next] || isMealKey(next)) ? next : null);
      setFacetKey(params.get("facet"));
      setClosingSoonOnly(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ── Craving picker (the front door) ──
  if (!active) {
    return (
      <div className="space-y-5">
        <header className="space-y-1.5">
          <h1
            className="font-serif text-[26px] font-semibold leading-tight tracking-tight"
            style={{ color: "var(--app-ink)" }}
          >
            What do you want right now?
          </h1>
          <p className="text-[14px]" style={{ color: "var(--app-ink-3)" }}>
            Tap it. We&rsquo;ll find the nearest one that&rsquo;s open.
          </p>
        </header>

        <ul className="grid grid-cols-2 gap-2">
          {CRAVINGS.map((c) => {
            const Icon = ICONS[c.icon] ?? Utensils;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => pick(c.key)}
                  className="tactile tactile-interactive flex min-h-[56px] w-full items-center gap-2.5 rounded-[var(--app-radius-md)] bg-[var(--app-bg-elevated)] px-3 py-2.5 text-left"
                  style={{ boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                    style={{
                      background: `color-mix(in srgb, ${c.color} 14%, var(--app-bg-elevated-solid))`,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c.color} 20%, transparent)`,
                    }}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} style={{ color: c.color }} />
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-tight"
                    style={{ color: "var(--app-ink)" }}
                  >
                    {c.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ── The answer (nearest open of the chosen craving / meal occasion) ──
  const ActiveIcon = ICONS[active.icon] ?? Utensils;
  const townName = townKey ? (MUNICIPALITY_BY_SLUG[townKey]?.name ?? null) : null;
  // The heading reflects what you actually picked: the active facet ("Thrift &
  // vintage") when one is set, otherwise the craving/meal ("Shops"). Without
  // this, arriving from a Today sub like Shop → Thrift still read "Shops".
  const headingNoun = facetDefs.find((f) => f.key === facetKey)?.label ?? active.label;
  const sortLabel = sort === "rated"
    ? "top rated first"
    : origin
      ? "nearest first"
      : "best matches";
  const areaLabel = townName
    ? `in ${townName}`
    : hasFix
      ? "near you"
      : approxOrigin
        ? approxCity
          ? `approximately near ${approxCity}`
          : "approximately within Frederick County"
        : "across Frederick County";
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        {/* The cravings live on /today now (the "I want…" grid), so the
            answer's back affordance returns there rather than swapping to a
            duplicate on-page picker. */}
        <Link
          href="/today"
          className="tactile-interactive -ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Back to Today
        </Link>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-md)]"
            style={{ background: `color-mix(in srgb, ${active.color} 14%, var(--app-bg-elevated-solid))` }}
          >
            <ActiveIcon className="h-5 w-5" strokeWidth={2} style={{ color: active.color }} />
          </span>
          <div>
            <h1
              className="font-serif text-[22px] font-semibold leading-tight tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {headingNoun} {areaLabel}
            </h1>
            {/* Meals frame the count on the CLOCK fact ("open for dinner now")
                — never a service claim. Nouns keep the plain "open now". */}
            <p className="text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              {meal
                ? openCount > 0
                  ? `${openCount} open ${meal.phrase} right now · ${sortLabel}`
                  : `Nothing open ${meal.phrase} right now · ${sortLabel}`
                : craving?.alwaysOpen
                  ? `${matched.length} ${matched.length === 1 ? "place" : "places"} · ${sortLabel}`
                  : openOnly
                    ? openCount > 0
                      ? `${openCount} open now · ${sortLabel}`
                      : sortLabel.charAt(0).toUpperCase() + sortLabel.slice(1)
                    : townName
                      ? `${openCount} open · ${matched.length} in ${townName} · ${sortLabel}`
                      : `${openCount} open · ${matched.length} ${origin ? "nearby" : "in the county"} · ${sortLabel}`}
            </p>
          </div>
        </div>
      </header>

      {/* Sticky filter bar — town scope, what-kind filters, and sort stay
          pinned under the top bar as the results scroll, so you can re-filter
          without scrolling back up. */}
      <div
        className="sticky z-30 space-y-1.5 border-b py-2 backdrop-blur-sm"
        style={{
          // --app-topbar-offset tracks the auto-hiding TopBar (0px while it's
          // slid away), so this bar rides up with the chrome instead of
          // pinning 56px down and letting cards scroll visibly above it.
          top: "calc(var(--app-topbar-offset) + env(safe-area-inset-top))",
          transition: "top var(--app-dur-med) var(--app-ease-out)",
          borderColor: "var(--app-border)",
          background: "color-mix(in srgb, var(--app-bg) 92%, transparent)",
        }}
      >
        {/* Town scope — "everywhere" or one town ("coffee in Brunswick"). A
            horizontal rail; only offers towns that actually have a result for
            this craving, so a chip never dead-ends. Sits above the what-kind
            filters: pick WHERE, then narrow WHAT. */}
        {townsWithResults.length > 1 && (
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max items-center gap-1.5">
              <FacetChip label="All towns" active={townKey === null} color="var(--app-ink-2)" onClick={() => chooseTown(null)} />
              {townsWithResults.map((m) => (
                <FacetChip
                  key={m.slug}
                  label={m.name}
                  active={townKey === m.slug}
                  color="var(--app-ink-2)"
                  onClick={() => chooseTown(m.slug)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Find more specific things: an Open-now toggle (on by default) plus
            the craving's sub-facet chips (Food → Pizza / Food trucks, …). The
            facet row only appears when the craving defines facets, so single-
            answer cravings (Coffee, Grocery) stay clean. */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {/* Open-now toggle — hidden for always-available cravings (lodging),
              where "open now" is meaningless and every place always passes. */}
          {!craving?.alwaysOpen && (
          <button
            type="button"
            onClick={() => setOpenOnly((v) => !v)}
            aria-pressed={openOnly}
            className="tap-44-y tactile-interactive inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
            style={
              openOnly
                ? {
                    background: "color-mix(in srgb, var(--app-positive) 16%, transparent)",
                    color: "var(--app-positive)",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-positive) 32%, transparent)",
                  }
                : { background: "var(--app-bg-elevated)", color: "var(--app-ink-3)", boxShadow: "inset 0 0 0 1px var(--app-border)" }
            }
          >
            <span
              aria-hidden
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ background: openOnly ? "var(--app-positive)" : "var(--app-ink-3)" }}
            />
            Open now
          </button>
          )}
          {/* Closing soon — only when there's something to catch. Amber urgency;
              tapping it narrows to the open-but-closing-within-the-hour set. */}
          {!craving?.alwaysOpen && closingSoonCount > 0 && (
            <button
              type="button"
              onClick={() => setClosingSoonOnly((v) => !v)}
              aria-pressed={closingSoonOnly}
              className="tap-44-y tactile-interactive inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
              style={
                closingSoonOnly
                  ? {
                      background: "color-mix(in srgb, var(--app-warning) 18%, transparent)",
                      color: "var(--app-ink)",
                      boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--app-warning) 38%, transparent)",
                    }
                  : { background: "var(--app-bg-elevated)", color: "var(--app-ink-3)", boxShadow: "inset 0 0 0 1px var(--app-border)" }
              }
            >
              <span
                aria-hidden
                className="inline-block h-[6px] w-[6px] rounded-full"
                style={{ background: "var(--app-warning)" }}
              />
              Closing soon · {closingSoonCount}
            </button>
          )}
          {craving && facetDefs.length > 0 && (
            <>
              <FacetChip label="All" active={facetKey === null} color={craving.color} onClick={() => setFacetKey(null)} />
              {facetDefs.map((f) => (
                <FacetChip
                  key={f.key}
                  label={f.label}
                  active={facetKey === f.key}
                  color={craving.color}
                  onClick={() => setFacetKey(f.key)}
                />
              ))}
            </>
          )}
        </div>

        {/* Sort — open places lead either way; this toggles the secondary
            ordering (distance vs rating). Its own quiet row so it reads as a
            sort, not another filter. */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-ink-3)" }}>
            Sort
          </span>
          <FacetChip label="Nearest" active={sort === "nearest"} color="var(--app-ink-2)" onClick={() => setSort("nearest")} />
          <FacetChip label="Top rated" active={sort === "rated"} color="var(--app-ink-2)" onClick={() => setSort("rated")} />
        </div>
      </div>

      {/* Location trust: only when we DON'T have a fix AND aren't scoped to a
          town (a town scope makes "nearest to you" moot). With a fix we silently
          show real walk times; without one we say so and offer the button —
          never a distance we can't stand behind. */}
      {!hasFix && !townKey && (
        <button
          type="button"
          onClick={activateMyLocation}
          className="tactile tactile-interactive flex w-full items-center gap-2.5 rounded-[var(--app-radius-md)] border px-3.5 py-2.5 text-left"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <Navigation className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
          <span className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            {state.status === "denied" || state.status === "unavailable"
              ? approxStatus === "outside-county"
                ? "Your network location is outside Frederick County, so these are county-wide. Turn on location for nearest-first results."
                : `Showing ${approxCity ? `${approxCity} (approximate)` : "county-wide matches"}. Turn on location for what's nearest to you.`
              : "Use my location to see what's nearest to where you're standing."}
          </span>
        </button>
      )}

      {results.length === 0 && townName && matched.length === 0 && nearbyTownFallback.length > 0 ? (
        <section aria-labelledby="nearby-town-fallback-heading" className="space-y-3">
          <div
            className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)" }}
          >
            <h2 id="nearby-town-fallback-heading" className="text-[15px] font-semibold" style={{ color: "var(--app-ink)" }}>
              Closest verified options
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
              Radius doesn&rsquo;t have a verified {activeNoun} listing in {townName} yet. These are the nearest matches outside town.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => chooseTown(null)}
                className="tactile-interactive inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold"
                style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
              >
                Search all towns
              </button>
              <Link
                href="/submit/place"
                className="tactile-interactive inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold"
                style={{ background: "var(--app-bg-elevated)", color: "var(--app-brand-press)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
              >
                Tell us what&rsquo;s missing
              </Link>
            </div>
          </div>
          <ul className="space-y-2" aria-label={`Closest ${activeNoun} outside ${townName}`}>
            {nearbyTownFallback.map(({ place, distance }) => (
              <li key={place.slug}>
                <p className="mb-1 px-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                  {MUNICIPALITY_BY_SLUG[place.municipality ?? ""]?.name ?? place.city}
                  {` · ${(distance / 1609).toFixed(distance < 16090 ? 1 : 0)} mi from ${townName}`}
                </p>
                <PlaceCard place={place} />
              </li>
            ))}
          </ul>
        </section>
      ) : results.length === 0 ? (
        <div
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--app-ink-3)" }}>
            {townName
              ? matched.length === 0
                ? `Radius doesn't have a verified ${activeNoun} listing in ${townName} yet.`
                : `Nothing ${openOnly && !closingSoonOnly ? "open " : ""}for ${activeNoun} in ${townName} right now.`
              : closingSoonOnly
                ? `Nothing closing soon for ${activeNoun}${hasFix ? " near you" : ""}.`
                : openOnly && matched.length > 0
                  ? `Nothing open right now for ${activeNoun}.`
                  : meal
                    ? `Nothing open ${meal.phrase} near you right now.`
                    : `Nothing for ${activeNoun} ${hasFix ? "near you" : "in range"} right now.`}
          </p>
          {/* Clear the town scope, the closing-soon filter, or (when Open-now hid
              everything but closed matches exist) offer those — never dead-end. */}
          {townName ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => chooseTown(null)}
                className="tactile-interactive inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold"
                style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
              >
                Search all towns
              </button>
              {matched.length === 0 ? (
                <Link
                  href="/submit/place"
                  className="tactile-interactive inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold"
                  style={{ background: "var(--app-bg-elevated)", color: "var(--app-brand-press)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
                >
                  Tell us what&rsquo;s missing
                </Link>
              ) : null}
            </div>
          ) : closingSoonOnly ? (
            <button
              type="button"
              onClick={() => setClosingSoonOnly(false)}
              className="tactile-interactive mt-3 inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold"
              style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
            >
              Show all open
            </button>
          ) : (
            openOnly && matched.length > 0 && (
              <button
                type="button"
                onClick={() => setOpenOnly(false)}
                className="tactile-interactive mt-3 inline-flex items-center rounded-full px-3 py-1.5 text-[13px] font-semibold"
                style={{ background: "var(--app-bg-elevated)", color: "var(--app-ink-2)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
              >
                Show all {matched.length}, including closed
              </button>
            )
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map((p) => (
            <li key={p.slug}>
              {/* Business decision card — the place's photo leads (category
                  glyph fallback), then name, open status, walk time, one tap
                  to details + directions. */}
              <PlaceCard place={p} />
              {p.distance_m !== undefined && (
                <span className="sr-only">{walkLabel(p.distance_m)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A sub-facet pill on the results page. Active = a wash of the craving's own
 *  ink with an ink label; inactive = a quiet outline. Pure + presentational. */
function FacetChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="tap-44-y tactile-interactive rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={
        active
          ? {
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color: "var(--app-ink)",
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
            }
          : { background: "var(--app-bg-elevated)", color: "var(--app-ink-3)", boxShadow: "inset 0 0 0 1px var(--app-border)" }
      }
    >
      {label}
    </button>
  );
}
