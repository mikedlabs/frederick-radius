import type { Event } from "@/data/events";
import { eventGeoConfidence, type GeoConfidence } from "@/lib/events/geo-confidence";
import { isUpcomingEvent } from "@/lib/events/visible";
import { isCivicEvent } from "@/lib/loaders/events";
import type { TierResult } from "./readiness";

/**
 * eventTier — the event-side analog of recommendationTier(), same Tier 1–4
 * contract and the same TierResult shape so the audit reports a single
 * vocabulary across places AND events.
 *
 *   Tier 1 Recommend    : precise, sourced, upcoming — safe to lead "Tonight".
 *   Tier 2 Browse only  : real & upcoming but weaker (area-level OK, civic ok).
 *   Tier 3 Needs review : a key field is soft (no venue/town/source).
 *   Tier 4 Hide/archive : past, cancelled, undated, or ungeocoded.
 *
 * Composes the gates the events pipeline already trusts (geo-confidence,
 * isUpcomingEvent, placement) — it does not invent a new score. Curated
 * seed/manual rows are exempt from the source-URL requirement (an editorial
 * choice is its own provenance).
 */
export function eventTier(
  // Accepts a raw Event or a loader-decorated one; when the decorated
  // `geo_confidence` is present we trust it (raw rows have no `placement`,
  // which the loader computes), else we derive it.
  e: Event & { geo_confidence?: GeoConfidence },
  now: Date = new Date(),
): TierResult {
  const curated = e.source === "seed" || e.source === "manual";

  // ── Tier 4 — hide / archive ──
  if (e.status === "cancelled") return { tier: 4, reason: "cancelled" };
  if (!Number.isFinite(Date.parse(e.starts_at))) return { tier: 4, reason: "invalid / missing date" };
  // A recurring series isn't "past" just because its anchor occurrence has
  // elapsed — it's evaluated on its series elsewhere.
  if (!e.is_recurring && !isUpcomingEvent(e, now)) return { tier: 4, reason: "past event" };

  const geo: GeoConfidence = e.geo_confidence ?? eventGeoConfidence(e);
  if (geo === "unknown") return { tier: 4, reason: "ungeocoded (needs_review)" };

  // ── Tier 3 — needs review ──
  if (!e.venue_name?.trim()) return { tier: 3, reason: "no venue" };
  if (!e.municipality?.trim()) return { tier: 3, reason: "no town / municipality" };
  if (!e.source_url && !curated) return { tier: 3, reason: "no source URL" };
  if (e.is_recurring && !e.recurrence_text?.trim()) return { tier: 3, reason: "recurring without recurrence text" };
  if (geo === "area") return { tier: 3, reason: "area-level location only (no precise spot)" };

  // ── Tier 1 vs Tier 2 ──
  const precise = geo === "venue_match" || geo === "exact_address";
  const sourced = Boolean(e.source_url) || curated;
  if (precise && sourced) return { tier: 1, reason: `recommendable (${geo})` };
  return { tier: 2, reason: "browse only" };
}

/** Civic vs social — a separate axis from the tier, used for feed separation. */
export function eventClass(e: Event): "civic" | "social" {
  return isCivicEvent(e) ? "civic" : "social";
}
