/**
 * Mode-aware scoping helpers for SHARED layers (events, closures).
 *
 * The brief: events, parking, and closures appear in both modes, but
 * with mode-specific default scope. The data layer stays single; only
 * the default query / filter predicate changes per mode.
 *
 * These helpers are pure and deterministic. They never mutate the
 * underlying collections; they return filtered slices. Callers can
 * always override the scope and show everything.
 */

import { FREDERICK_CENTER, haversineMeters, type LngLat } from "@/lib/geo";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { Mode } from "@/hooks/useMode";
import type { EventScope, ClosureScope } from "@/lib/mode-defaults";
import { defaultsFor } from "@/lib/mode-defaults";

/** "Downtown" is a 1-mile radius around FREDERICK_CENTER — the same
 *  ring the existing Radius surface already uses. We reuse it instead
 *  of inventing a new boundary so the scope is consistent everywhere. */
const DOWNTOWN_RADIUS_M = 1609;

/**
 * Compute the start/end ISO timestamps for an event scope, anchored
 * to `now`. Pure math; no client TZ dependence beyond the system
 * clock the caller passes in.
 *
 *   weekend-downtown    → Fri 5pm → Mon midnight (local)
 *   fortnight-countywide → now → now + 14 days
 */
export function eventWindowFor(scope: EventScope, now: Date): { startMs: number; endMs: number } {
  if (scope === "weekend-downtown") {
    const dow = now.getDay();
    const fri = new Date(now);
    fri.setDate(fri.getDate() + ((5 - dow + 7) % 7));
    fri.setHours(17, 0, 0, 0);
    const mon = new Date(fri);
    mon.setDate(mon.getDate() + 3);
    mon.setHours(0, 0, 0, 0);
    // If "now" is already inside the weekend window (e.g. Sat
    // afternoon), use "now" as the start so we don't show events
    // already finished.
    return { startMs: Math.max(+now, +fri), endMs: +mon };
  }
  // fortnight-countywide
  const end = new Date(now);
  end.setDate(end.getDate() + 14);
  return { startMs: +now, endMs: +end };
}

/**
 * Apply a mode's default event scope: time window + (for visitor)
 * downtown-proximity gate. Returns a new array; never mutates input.
 */
export function scopeEvents(
  events: EventWithMeta[],
  scope: EventScope,
  now: Date,
): EventWithMeta[] {
  const { startMs, endMs } = eventWindowFor(scope, now);
  const filtered = events.filter((e) => {
    const t = +new Date(e.starts_at);
    if (t < startMs || t > endMs) return false;
    if (scope === "weekend-downtown") {
      // Downtown gate: only events whose geom (or whose venue point
      // when geom is the venue's coords) sits inside the 1-mile ring
      // around FREDERICK_CENTER. Events without coords stay in by
      // default — they're often the curated marquee ones (Alive @
      // Five, Sky Stage), all downtown.
      if (e.geom && Number.isFinite(e.geom.lng) && Number.isFinite(e.geom.lat)) {
        const d = haversineMeters(FREDERICK_CENTER, e.geom as LngLat);
        return d <= DOWNTOWN_RADIUS_M;
      }
    }
    return true;
  });
  return filtered;
}

/**
 * Apply a mode's default closure scope to a flat civic-pin list
 * (MDOT incidents + 311 issues). Major-only drops the routine
 * lower-impact noise; all-ongoing returns everything.
 *
 * The "major" heuristic is conservative: keep traffic-kind pins
 * whose label mentions Closed / Closure / Detour / Crash / Down,
 * and drop the routine "Construction" / "Maintenance" rows. 311
 * issues always drop in visitor mode (they're a resident concern).
 */
const MAJOR_RX = /\b(closed?|closure|detour|crash|down|emergency|incident|signal out|disabled)\b/i;

export function scopeClosures<T extends { kind: string; label: string }>(
  pins: T[],
  scope: ClosureScope,
): T[] {
  if (scope === "all-ongoing") return pins;
  // major-only
  return pins.filter((p) => {
    if (p.kind === "issue") return false; // 311 hides from visitors
    return MAJOR_RX.test(p.label);
  });
}

/**
 * Convenience: pull the right scopes off a mode in one call.
 */
export function scopesFor(mode: Mode): { eventScope: EventScope; closureScope: ClosureScope } {
  const d = defaultsFor(mode);
  return { eventScope: d.eventScope, closureScope: d.closureScope };
}
