import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { Event } from "@/data/events";
import type { EventPin } from "@/components/map/types";
import { eventSourceLabel } from "@/lib/events/source-label";
import type { EventWithMeta } from "@/lib/loaders/events";
import type { SourceConfidence } from "@/lib/provenance";

type MapEventInput = Pick<
  EventWithMeta,
  | "slug"
  | "title"
  | "starts_at"
  | "ends_at"
  | "venue_name"
  | "venue_place_slug"
  | "geom"
  | "category"
  | "source"
  | "source_url"
  | "confidence"
  | "last_verified_at"
  | "is_verified"
  | "organizer"
>;

const TRUSTED_EVENT_CONFIDENCE = new Set<SourceConfidence>([
  "curated",
  "partner",
  "verified",
]);
const HOUR_MS = 60 * 60 * 1_000;
const MAP_EVENT_NEAR_TERM_MS = 48 * HOUR_MS;
const MAP_EVENT_NEAR_TERM_FRESHNESS_MS = 24 * HOUR_MS;
const MAP_EVENT_LATER_FRESHNESS_MS = 7 * 24 * HOUR_MS;
const MAP_EVENT_CLOCK_SKEW_MS = 5 * 60 * 1_000;

function publicSourceUrl(value: string | null | undefined): string | undefined {
  const url = value?.trim();
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

function validIso(value: string | null | undefined): string | undefined {
  if (!value || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

/**
 * Reduce one normalized event to the exact facts the browser map needs.
 * Provenance stays real but compact: no descriptions, licenses, source ids,
 * attendee data, or raw provider payload crosses the RSC boundary.
 */
export function eventPinFromEvent(
  event: MapEventInput,
  now: Date = new Date(),
): EventPin {
  const sourceUrl = publicSourceUrl(event.source_url);
  const verifiedAt = validIso(event.last_verified_at);
  const verifiedAtMs = verifiedAt ? Date.parse(verifiedAt) : Number.NaN;
  const startsAtMs = Date.parse(event.starts_at);
  const nowMs = now.getTime();
  // Keep this aligned with Ask's decision-time event policy: an event in the
  // next 48 hours needs a publisher check from the last day; later events may
  // use a check from the last week. An invalid start is treated conservatively
  // as near-term, and a timestamp more than five minutes ahead is not evidence.
  const nearTerm =
    !Number.isFinite(startsAtMs) || startsAtMs - nowMs <= MAP_EVENT_NEAR_TERM_MS;
  const maxAge = nearTerm
    ? MAP_EVENT_NEAR_TERM_FRESHNESS_MS
    : MAP_EVENT_LATER_FRESHNESS_MS;
  const verificationAge = nowMs - verifiedAtMs;
  const acceptedVerifiedAt =
    Number.isFinite(verificationAge) &&
    verificationAge >= -MAP_EVENT_CLOCK_SKEW_MS
      ? verifiedAt
      : undefined;
  const verificationExpiresAt = acceptedVerifiedAt
    ? new Date(verifiedAtMs + maxAge).toISOString()
    : undefined;
  const sourceVerified = Boolean(
    sourceUrl &&
      acceptedVerifiedAt &&
      TRUSTED_EVENT_CONFIDENCE.has(event.confidence) &&
      verificationAge <= maxAge,
  );

  const pin: EventPin = {
    slug: event.slug,
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    venue_name: event.venue_name,
    venue_place_slug: event.venue_place_slug,
    lng: event.geom.lng,
    lat: event.geom.lat,
    category: event.category,
    category_color: CATEGORY_BY_SLUG[event.category]?.color,
    source_label: eventSourceLabel(
      event.source as Event["source"],
      event.organizer,
    ),
    source_url: sourceUrl,
    source_confidence: event.confidence,
    source_verified: sourceVerified,
    verified_at: acceptedVerifiedAt,
    verification_expires_at: verificationExpiresAt,
  };

  return Object.fromEntries(
    Object.entries(pin).filter(([, value]) => value !== undefined),
  ) as EventPin;
}
