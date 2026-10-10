import { stampEventProvenance, type SourceConfidence } from "@/lib/provenance";
import { eventDecisionVerification } from "@/lib/events/decision-verification";
import type { Place } from "@/data/places";
import type { Event } from "@/data/events";
import { isRangeListing } from "@/lib/eventHorizon";
import {
  eventHasTrustworthyEnd,
  isDateOnlyEventAnchor,
} from "@/lib/eventWhenLabel";
import { hasPhysicalAttendance } from "@/lib/events/attendance";
import { isPublicEvent } from "@/lib/events/classify";
import {
  eventHasPreciseLocation,
  type GeoConfidence,
} from "@/lib/events/geo-confidence";
import { isValidCoord } from "@/lib/geo";

export type EventPlanEligibility =
  | { eligible: true; durationMinutes: number }
  | {
      eligible: false;
      reason:
        | "cancelled"
        | "postponed"
        | "non_public"
        | "not_physical"
        | "location_unknown"
        | "timing_unknown"
        | "already_started"
        | "duration_too_long"
        | "source_unconfirmed"
        | "venue_closed";
    };

/** The entry and server resolver must agree before reserving an event slot. */
export function eventPlanEligibility(
  event: Event & { geo_confidence?: GeoConfidence; confidence?: SourceConfidence },
  options: { nowMs: number; hasResolvedVenue?: boolean; venueOperational?: Place["is_operational"] },
): EventPlanEligibility {
  if (event.status === "cancelled" || event.status === "postponed") {
    return { eligible: false, reason: event.status };
  }
  if (!isPublicEvent(event)) {
    return { eligible: false, reason: "non_public" };
  }
  if (options.venueOperational === "closed_permanently" || options.venueOperational === "closed_temporarily") {
    return { eligible: false, reason: "venue_closed" };
  }
  if (!hasPhysicalAttendance(event)) {
    return { eligible: false, reason: "not_physical" };
  }
  if (
    event.placement === "needs_review" ||
    !isValidCoord(event.geom) ||
    !eventHasPreciseLocation(event, options.hasResolvedVenue)
  ) {
    return { eligible: false, reason: "location_unknown" };
  }
  if (
    !Number.isFinite(options.nowMs) ||
    event.is_all_day ||
    isDateOnlyEventAnchor(event) ||
    isRangeListing(event) ||
    !eventHasTrustworthyEnd(event)
  ) {
    return { eligible: false, reason: "timing_unknown" };
  }
  const startMs = Date.parse(event.starts_at);
  if (startMs <= options.nowMs) {
    return { eligible: false, reason: "already_started" };
  }
  if (Date.parse(event.ends_at) - startMs > 6 * 3_600_000) {
    return { eligible: false, reason: "duration_too_long" };
  }
  const confidence = event.confidence ?? stampEventProvenance(event).confidence;
  if (!eventDecisionVerification({ ...event, confidence }, new Date(options.nowMs)).sourceVerified) {
    return { eligible: false, reason: "source_unconfirmed" };
  }
  return {
    eligible: true,
    durationMinutes: Math.ceil((Date.parse(event.ends_at) - startMs) / 60_000),
  };
}
