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
  Palette,
  ArrowLeft,
  Navigation,
  type LucideIcon,
} from "lucide-react";
import type { PlaceCardData } from "@/lib/loaders/places";
import PlaceCard from "@/components/place/PlaceCard";
import { CRAVINGS, CRAVING_BY_KEY } from "@/data/cravings";
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

const ICONS: Record<string, LucideIcon> = {
  Coffee,
  IceCream,
  Utensils,
  Pizza,
  Cookie,
  Beer,
  Trees,
  ShoppingBag,
  Palette,
};

// ~80 m/min walking — same constant the reason chips use.
const WALK_M_PER_MIN = 80;

// Show up to this many matches. The old cap of 6 hid closed or farther-out
// downtown spots behind the open-first sort, so "where's all the ice cream /
// coffee?" looked incomplete. 16 surfaces effectively every in-town option
// while staying bounded; still sorted open-first then nearest.
const RESULT_LIMIT = 16;

function walkLabel(distance_m: number): string {
  const mins = Math.max(1, Math.round(distance_m / WALK_M_PER_MIN));
  if (mins <= 25) return `${mins} min walk`;
  const mi = distance_m / 1609;
  return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
}

export default function RightNow({
  places,
  initialCraving = null,
}: {
  places: PlaceCardData[];
  /** Preselected craving from a deep link (?c=coffee) — skips the picker
   *  straight to the answer when arriving from a Today craving chip. */
  initialCraving?: string | null;
}) {
  const { state, request } = useGeolocation();
  const [cravingKey, setCravingKey] = useState<string | null>(
    initialCraving && CRAVING_BY_KEY[initialCraving] ? initialCraving : null,
  );

  // Arriving straight to an answer from a Today craving tile (?c=coffee skips
  // the picker) should still ask for location, exactly like tapping a craving
  // in the picker does — otherwise the deep-link path silently answers "near
  // Downtown" and the only way to get "near you" is to spot the secondary
  // button. Ask once, on arrival, when we haven't asked yet.
  const askedOnArrival = useRef(false);
  useEffect(() => {
    if (askedOnArrival.current) return;
    if (initialCraving && CRAVING_BY_KEY[initialCraving] && state.status === "idle") {
      askedOnArrival.current = true;
      request();
    }
  }, [initialCraving, state.status, request]);

  const hasFix = state.status === "granted";
  const origin = hasFix
    ? { lng: state.position.lng, lat: state.position.lat }
    : FREDERICK_CENTER;

  const craving = cravingKey ? CRAVING_BY_KEY[cravingKey] : null;

  const results = useMemo(() => {
    if (!craving) return [];
    return places
      .filter((p) => craving.match(p))
      .map((p) => {
        const dist = haversineMeters(origin, p.geom);
        return { p, dist, open: isOpenNow(p.open_status) };
      })
      .sort((a, b) => {
        if (a.open !== b.open) return a.open ? -1 : 1; // open first
        return a.dist - b.dist; // then nearest
      })
      .slice(0, RESULT_LIMIT)
      // Attach distance for the card ONLY when we have a real fix — never
      // print a distance measured from a place the user isn't standing at.
      .map(({ p, dist }) => ({ ...p, distance_m: hasFix ? dist : undefined }));
  }, [craving, places, origin, hasFix]);

  const openCount = useMemo(
    () => results.filter((p) => isOpenNow(p.open_status)).length,
    [results],
  );

  function pick(key: string) {
    haptic("light"); // the tap should feel like a tap
    setCravingKey(key);
    // First craving with no location yet → ask, so the answer can be
    // "nearest to YOU" rather than nearest to downtown. One prompt, then
    // it's cached for the session.
    if (state.status === "idle") request();
  }

  // ── Craving picker (the front door) ──
  if (!craving) {
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
            const Icon = ICONS[c.icon];
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

  // ── The answer (nearest open of the chosen craving) ──
  const CravingIcon = ICONS[craving.icon];
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <button
          type="button"
          onClick={() => setCravingKey(null)}
          className="tactile-interactive -ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold"
          style={{ color: "var(--app-ink-3)" }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Something else
        </button>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-md)]"
            style={{ background: `color-mix(in srgb, ${craving.color} 14%, var(--app-bg-elevated-solid))` }}
          >
            <CravingIcon className="h-5 w-5" strokeWidth={2} style={{ color: craving.color }} />
          </span>
          <div>
            <h1
              className="font-serif text-[22px] font-semibold leading-tight tracking-tight"
              style={{ color: "var(--app-ink)" }}
            >
              {craving.label} near {hasFix ? "you" : "Downtown"}
            </h1>
            <p className="text-[12.5px]" style={{ color: "var(--app-ink-3)" }}>
              {openCount > 0
                ? `${openCount} open now · nearest first`
                : "Nearest first"}
            </p>
          </div>
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
              ? "Showing Downtown Frederick. Turn on location for what's nearest to you."
              : "Use my location to see what's nearest to where you're standing."}
          </span>
        </button>
      )}

      {results.length === 0 ? (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-10 text-center text-sm"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          Nothing for {craving.label.toLowerCase()} {hasFix ? "near you" : "in range"} right now.
        </p>
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
