import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { Event } from "@/data/events";
import type { EventPin } from "@/components/map/types";
import { eventSourceLabel } from "@/lib/events/source-label";
import type { EventWithMeta } from "@/lib/loaders/events";
import { eventDecisionVerification } from "@/lib/events/decision-verification";

type MapEventInput = Pick<
  EventWithMeta,
  | "slug"
  | "title"
  | "starts_at"
  | "ends_at"
  | "is_all_day"
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

/**
 * Reduce one normalized event to the exact facts the browser map needs.
 * Provenance stays real but compact: no descriptions, licenses, source ids,
 * attendee data, or raw provider payload crosses the RSC boundary.
 */
export function eventPinFromEvent(
  event: MapEventInput,
  now: Date = new Date(),
): EventPin {
  const {
    sourceUrl,
    verifiedAt,
    verificationExpiresAt,
    sourceVerified,
  } = eventDecisionVerification(event, now);

  const pin: EventPin = {
    slug: event.slug,
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    is_all_day: event.is_all_day,
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
    verified_at: verifiedAt,
    verification_expires_at: verificationExpiresAt,
  };

  return Object.fromEntries(
    Object.entries(pin).filter(([, value]) => value !== undefined),
  ) as EventPin;
}
