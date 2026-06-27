"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Coffee,
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
  Sunrise,
  Croissant,
  Sandwich,
  UtensilsCrossed,
  Moon,
  ArrowLeft,
  Navigation,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import { CRAVINGS, CRAVING_BY_KEY } from "@/data/cravings";
import { cuisinesOf, cuisineLabel } from "@/lib/cuisine";
import { mealForKey, matchMeal, isMealKey } from "@/lib/meal";
import { useGeolocation } from "@/hooks/useGeolocation";
import { FREDERICK_CENTER, haversineMeters } from "@/lib/geo";
import { isOpenNow } from "@/lib/hours";
import { haptic } from "@/lib/haptics";

/**
 * RightNow — the one-tap craving answer.
 *
 * The whole interaction: a person standing on the sidewalk taps what they
 * want ("Ice cream"), and we answer with the NEAREST OPEN one from where
 * they're standing — no town picker, no filters, no map to pan. Say the
 * noun, get the closest open answer, go.
 *
 * Distance is honest: we only print "min walk / distance" when we actually
 * have the user's location. With no fix we still rank by proximity to
 * Downtown (the sensible default) but never claim a distance we can't stand
 * behind — we say so and offer the location button instead.
 */

// Keyed by the `icon` strings in src/data/cravings.ts. Every craving icon must
// have an entry here or the tile crashes ("Element type is invalid ... got
// undefined"); the `?? Utensils` fallback at the lookup sites is the safety net
// for any future craving whose icon lands here unmapped.
const ICONS: Record<string, LucideIcon> = {
  Coffee,
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
  approxOrigin = null,
  approxCity = null,
}: {
  places: PlaceCardData[];
  /** Preselected craving from a deep link (?c=coffee) — skips the picker
   *  straight to the answer when arriving from a Today craving chip. */
  initialCraving?: string | null;
  /** Coarse edge-IP origin used to rank BEFORE a precise device fix (never to
   *  print a distance). Null when out of area → Downtown default. */
  approxOrigin?: { lng: number; lat: number } | null;
  /** City label for the coarse location ("near Thurmont"). */
  approxCity?: string | null;
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
  const [facetKey, setFacetKey] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(true);
  // "Catch it before it closes" — narrow to places open but closing within the
  // hour. Off by default; the chip only appears when there ARE any (below).
  const [closingSoonOnly, setClosingSoonOnly] = useState(false);

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
      (CRAVING_BY_KEY[initialCraving] || isMealKey(initialCraving)) &&
      state.status === "idle"
    ) {
      askedOnArrival.current = true;
      request();
    }
  }, [initialCraving, state.status, request]);

  const hasFix = state.status === "granted";
  // Origin precedence: a precise device fix → the coarse edge-IP seed → Downtown.
  // The IP seed only improves the fallback RANKING; printed distances stay gated
  // on `hasFix` so we never claim a precision we don't have.
  const origin = hasFix
    ? { lng: state.position.lng, lat: state.position.lat }
    : (approxOrigin ?? FREDERICK_CENTER);

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
    const matchFn = m ? (p: PlaceCardData) => matchMeal(m, p) : c ? c.match : null;
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
      return f ? f.match(p) : true;
    };
    return cravingMatchedAll
      .filter(passFacet)
      .map((p) => {
        const dist = haversineMeters(origin, p.geom);
        // Always-available cravings (lodging) count as open regardless of
        // verified hours — a hotel you can book any night must never be hidden
        // by the open-now gate just because its front-desk hours aren't posted.
        const open = Boolean(craving?.alwaysOpen) || isOpenNow(p.open_status);
        return { p, dist, open };
      })
      .sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1; // open first
        return a.dist - b.dist; // then nearest
      });
  }, [cravingMatchedAll, craving, facetKey, origin]);

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
    // First craving with no location yet → ask, so the answer can be
    // "nearest to YOU" rather than nearest to downtown. One prompt, then
    // it's cached for the session.
    if (state.status === "idle") request();
  }

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

        <ul className="grid grid-cols-2 gap-3">
          {CRAVINGS.map((c) => {
            const Icon = ICONS[c.icon] ?? Utensils;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => pick(c.key)}
                  className="tactile tactile-interactive flex w-full flex-col items-start gap-3 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated)] p-4 text-left"
                  style={{ boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
                >
                  <span
                    aria-hidden
                    className="grid h-12 w-12 place-items-center rounded-[var(--app-radius-md)]"
                    style={{
                      background: `color-mix(in srgb, ${c.color} 14%, var(--app-bg-elevated-solid))`,
                      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c.color} 20%, transparent)`,
                    }}
                  >
                    <Icon className="h-6 w-6" strokeWidth={1.9} style={{ color: c.color }} />
                  </span>
                  <span
                    className="text-[16px] font-semibold tracking-tight"
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
              {active.label} near {hasFix ? "you" : (approxCity ?? "Downtown")}
            </h1>
            {/* Meals frame the count on the CLOCK fact ("open for dinner now")
                — never a service claim. Nouns keep the plain "open now". */}
            <p className="text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              {meal
                ? openCount > 0
                  ? `${openCount} open ${meal.phrase} right now · nearest first`
                  : `Nothing open ${meal.phrase} right now · nearest first`
                : craving?.alwaysOpen
                  ? `${matched.length} ${matched.length === 1 ? "place" : "places"} · nearest first`
                  : openCount > 0
                    ? `${openCount} open now · nearest first`
                    : "Nearest first"}
            </p>
          </div>
        </div>

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
            className="tactile-interactive inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
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
              className="tactile-interactive inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
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
      </header>

      {/* Location trust: only when we DON'T have a fix. With one we silently
          show real walk times; without one we say so and offer the button —
          never a distance we can't stand behind. */}
      {!hasFix && (
        <button
          type="button"
          onClick={request}
          className="tactile tactile-interactive flex w-full items-center gap-2.5 rounded-[var(--app-radius-md)] border px-3.5 py-2.5 text-left"
          style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
        >
          <Navigation className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-brand)" }} aria-hidden />
          <span className="text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            {state.status === "denied" || state.status === "unavailable"
              ? `Showing ${approxCity ? `${approxCity} (approximate)` : "Downtown Frederick"}. Turn on location for what's nearest to you.`
              : "Use my location to see what's nearest to where you're standing."}
          </span>
        </button>
      )}

      {results.length === 0 ? (
        <div
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--app-ink-3)" }}>
            {closingSoonOnly
              ? `Nothing closing soon for ${activeNoun}${hasFix ? " near you" : ""}.`
              : openOnly && matched.length > 0
                ? `Nothing open right now for ${activeNoun}.`
                : meal
                  ? `Nothing open ${meal.phrase} near you right now.`
                  : `Nothing for ${activeNoun} ${hasFix ? "near you" : "in range"} right now.`}
          </p>
          {/* Clear the closing-soon filter, or (when Open-now hid everything but
              closed matches exist) offer those — never dead-end. */}
          {closingSoonOnly ? (
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
      className="tactile-interactive rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
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
