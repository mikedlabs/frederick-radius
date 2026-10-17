/** Catalog-free plan types and token encoding shared by the planner and Saved. */
import type { LngLat } from "@/lib/geo";
import { MUNICIPALITIES } from "@/data/municipalities";
import { isResolvableEventSlug } from "@/lib/events/resolvable-event-slug";

export type PlanInputs = {
  audience: "solo" | "date" | "family" | "friends" | "visitor";
  vibe: "easy" | "active" | "cultural" | "outdoors" | "food";
  duration_hours: 2 | 3 | 4 | 6;
  /** ISO string so the spec is serializable. Defaults to now. */
  start_at?: string;
  start_near?: LngLat;
  /** A deliberately selected town is a hard boundary, not merely a centroid
   * used to make out-of-town stops look local. */
  municipality?: string;
  /** Optional Ask Radius constraints. Older shared plans omit these and
   *  continue to reconstruct exactly as before. */
  max_distance_m?: number;
  local_only?: boolean;
  budget?: "free" | "value";
  /** Exclude only a recorded wheelchair barrier. Unknown access remains
   * eligible and is qualified by the Ask presentation layer. */
  require_wheelchair_access?: boolean;
  /** Favor stops with verified parking guidance and keep the outing compact. */
  parking_priority?: boolean;
  /** Optional cap for people who want fewer transitions or less walking. */
  max_stops?: number;
  /** A place explicitly named by Ask Radius ("make a plan around this"). */
  anchor_slug?: string;
  /** A selected event resolved against the current server event archive. */
  event_anchor_slug?: string;
  /**
   * Require a fresh, verified schedule to cover every stop. Ask Radius sets
   * this for dated, "tonight," and other live-clock plans. An undated idea
   * ("plan a date night") may still use a strong place whose hours need
   * confirmation, but the stop remains visibly "Hours unconfirmed."
   */
  require_verified_hours?: boolean;
  /**
   * Optional integer that nudges candidate ranking deterministically.
   * Same inputs with a different seed yield a *different but valid*
   * plan — the user's "Shuffle" affordance. Omitted = stable ranking.
   */
  seed?: number;
};

/** The minimum needed to rebuild a plan deterministically. */
export type PlanSpec = {
  v: 1;
  i: PlanInputs;
  /** Ordered stop refs. p = place slug, e = event slug. */
  s: Array<{ p: string } | { e: string }>;
};

// URL safe base64 of the JSON spec. Small (slugs only), so links stay
// short enough to share in a text message.
export function shareSafeInputs(input: PlanInputs): PlanInputs {
  // Exact device coordinates do not belong in a reversible share URL. A
  // municipality is public context; the chosen stops preserve the route.
  const safe = { ...input };
  delete safe.start_near;
  return safe;
}

export function encodeSpec(spec: PlanSpec): string {
  const json = JSON.stringify({ ...spec, i: shareSafeInputs(spec.i) });
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(json, "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSpec(token: string): PlanSpec | null {
  try {
    if (!token || token.length > 8_000) return null;
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof Buffer !== "undefined"
      ? Buffer.from(b64, "base64").toString("utf8")
      : decodeURIComponent(escape(atob(b64)));
    const spec = JSON.parse(json) as PlanSpec;
    if (!spec || spec.v !== 1 || !spec.i || typeof spec.i !== "object") return null;
    if (!Array.isArray(spec.s) || spec.s.length > 8) return null;
    if (!["solo", "date", "family", "friends", "visitor"].includes(spec.i.audience)) return null;
    if (!["easy", "active", "cultural", "outdoors", "food"].includes(spec.i.vibe)) return null;
    if (![2, 3, 4, 6].includes(spec.i.duration_hours)) return null;
    if (spec.i.start_at && !Number.isFinite(new Date(spec.i.start_at).getTime())) return null;
    if (spec.i.municipality && !MUNICIPALITIES.some((town) => town.slug === spec.i.municipality)) return null;
    if (spec.i.event_anchor_slug !== undefined && !isResolvableEventSlug(spec.i.event_anchor_slug)) return null;
    const validRefs = spec.s.every((ref) => {
      if (!ref || typeof ref !== "object") return false;
      if ("p" in ref) return typeof ref.p === "string" && ref.p.length > 0 && ref.p.length < 160;
      if ("e" in ref) return isResolvableEventSlug(ref.e);
      return false;
    });
    return validRefs ? spec : null;
  } catch {
    return null;
  }
}

/** Maximum decoded bytes allowed by an 8,000-character base64 token. */
export const MAX_SAVED_PLAN_JSON_BYTES = 6_000;

/**
 * Validate a token before browser-local persistence. Shared-link decoding keeps
 * its legacy acceptance rules; this boundary additionally checks optional
 * constraints and exact URL-safe encoding. The caller retains the original
 * token, and this function returns every decoded field and reference in order.
 * It neither looks up current places/events nor rewrites a saved choice.
 */
export function decodeSavedPlanToken(token: unknown): PlanSpec | null {
  if (typeof token !== "string" || !token || token.length > 8_000) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length % 4 === 1) return null;
  try {
    const binary = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    if (binary.length > MAX_SAVED_PLAN_JSON_BYTES) return null;
    // atob/Buffer can accept alternate trailing bits. Do not silently treat
    // a different token as the same stored identity, or accept invalid UTF-8.
    if (btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== token) return null;
    decodeURIComponent(escape(binary));
    const spec = decodeSpec(token);
    if (!spec || Array.isArray(spec) || Array.isArray(spec.i)) return null;
    const input = spec.i;
    if (input.start_at !== undefined && (typeof input.start_at !== "string" || !Number.isFinite(new Date(input.start_at).getTime()))) return null;
    if (input.municipality !== undefined && !MUNICIPALITIES.some((town) => town.slug === input.municipality)) return null;
    if (input.max_distance_m !== undefined && (!Number.isFinite(input.max_distance_m) || input.max_distance_m <= 0)) return null;
    if (input.max_stops !== undefined && (!Number.isInteger(input.max_stops) || input.max_stops < 1 || input.max_stops > 8)) return null;
    if (input.seed !== undefined && !Number.isSafeInteger(input.seed)) return null;
    if (input.budget !== undefined && input.budget !== "free" && input.budget !== "value") return null;
    for (const key of ["local_only", "require_wheelchair_access", "parking_priority", "require_verified_hours"] as const) {
      if (input[key] !== undefined && typeof input[key] !== "boolean") return null;
    }
    const near = input.start_near;
    if (near !== undefined && (!near || typeof near !== "object" || Array.isArray(near) || !Number.isFinite(near.lng) || !Number.isFinite(near.lat) || Math.abs(near.lng) > 180 || Math.abs(near.lat) > 90)) return null;
    if (input.anchor_slug !== undefined && (typeof input.anchor_slug !== "string" || !input.anchor_slug.length || input.anchor_slug.length >= 160)) return null;
    if (spec.s.some((ref) => Array.isArray(ref) || ("p" in ref && "e" in ref))) return null;
    return spec;
  } catch {
    return null;
  }
}
