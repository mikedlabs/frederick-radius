import "server-only";
import { EVENT_BY_SLUG, type Event } from "@/data/events";
import { archivedEventsBySlugs, type ArchivedEventBatchResolution } from "@/lib/events/event-identity";
import { servedEventBySlug } from "@/lib/events/served-event-snapshot";
import { applyEventNotices } from "@/lib/events/notices";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { isPublicEvent } from "@/lib/events/classify";
import { deriveEventStatus, stripStatusMarker } from "@/lib/event-status";
import { eventHasTrustworthyEnd } from "@/lib/eventWhenLabel";
import { eventPlanEligibility } from "@/lib/plan/event-plan-eligibility";
import { eventPlanSpec, planAnchorEvent, reconstructPlan, type Plan, type PlanEventEvidence, type PlanInputs, type PlanNotice, type PlanSpec } from "@/lib/integrations/planner";

export type PlanEventSources = {
  archive: (slugs: readonly string[], options: { signal: AbortSignal; timeoutMs: number }) => Promise<ArchivedEventBatchResolution>;
  served: (slug: string, nowMs: number) => Event | null;
  seed: (slug: string) => Event | null;
};
const sources: PlanEventSources = {
  archive: archivedEventsBySlugs,
  served: servedEventBySlug,
  seed: (slug) => Object.hasOwn(EVENT_BY_SLUG, slug) ? EVENT_BY_SLUG[slug] : null,
};
const UNAVAILABLE = {
  code: "unavailable" as const,
  message: "Radius could not confirm this event right now. Its place in your plan is saved. Try again shortly.",
};

function evidenceFor(current: Event, now: Date): PlanEventEvidence[string] {
  const event = applyEventNotices([current], now)[0];
  // A cancelled private booking must not leak its name or detail route. Strip
  // only lifecycle markers before checking the normal public eligibility.
  if (!isPublicEvent({ ...event, status: "scheduled", title: stripStatusMarker(event.title) })) {
    return { notice: UNAVAILABLE };
  }
  const status = event.status === "cancelled" || event.status === "postponed"
    ? event.status : deriveEventStatus(event.title);
  const event_href = `/events/${event.slug}`;
  const notice = (code: PlanNotice["code"], message: string) => ({ notice: { code, message, event_href } });
  if (status === "cancelled") return notice("cancelled", "The organizer has cancelled this event. It is no longer a scheduled stop. Your reference is saved so you can review the update.");
  if (status === "postponed") return notice("postponed", "The organizer has postponed this event. Confirm the new date before planning around it. Your reference is saved.");
  if (eventHasTrustworthyEnd(event) && Date.parse(event.ends_at) <= now.getTime()) {
    return notice("ended", "This event has ended. It is no longer a scheduled stop. Your reference is saved.");
  }
  const venue = event.venue_place_slug ? clientPlaceBySlug(event.venue_place_slug) : undefined;
  const eligibility = eventPlanEligibility(event, { nowMs: now.getTime(), hasResolvedVenue: Boolean(venue), venueOperational: venue?.is_operational });
  if (!eligibility.eligible) {
    if (eligibility.reason === "venue_closed") return notice("does_not_fit", "The event venue is currently listed as closed. Review the event details before setting out.");
    if (eligibility.reason === "source_unconfirmed") return notice("unavailable", "Radius has not confirmed this event with its publisher recently enough to schedule a visit. Your reference is saved. Review the organizer's listing before setting out.");
    if (eligibility.reason === "duration_too_long") return notice("does_not_fit", "The full event is longer than this planner's six-hour window. Review the listing before choosing your visit time.");
    if (eligibility.reason === "already_started") return notice("already_started", "This event has already started. Radius cannot plan a full visit from its original start time. Your reference is saved.");
    if (eligibility.reason === "location_unknown") return notice("location_unknown", "This event no longer has a confirmed physical location for a route. Review its listing before setting out.");
    if (eligibility.reason === "timing_unknown") return notice("timing_unknown", "This event's start or end time is unconfirmed. It is saved here without a scheduled visit.");
    return { notice: UNAVAILABLE };
  }
  return { event };
}

/** One bounded, exact-identity archive read. No publisher or model fanout. */
export async function resolvePlanEventEvidence(
  spec: PlanSpec,
  options: { now?: Date; sources?: PlanEventSources; timeoutMs?: number } = {},
): Promise<PlanEventEvidence> {
  const requested = [...new Set(spec.s.flatMap((ref) => "e" in ref ? [ref.e] : []))];
  if (!requested.length) return {};
  const now = options.now ?? new Date();
  const readers = options.sources ?? sources;
  const timeoutMs = Math.min(1_500, Math.max(1, options.timeoutMs ?? 1_000));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      readers.archive(requested, { signal: controller.signal, timeoutMs }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Event plan lookup timed out")), timeoutMs); }),
    ]);
    const matches = new Map(result.matches.map((row) => [row.requestedSlug, row]));
    const unresolved = new Set(result.unresolvedSlugs);
    const evidence: PlanEventEvidence = Object.create(null);
    for (const slug of requested) {
      const match = matches.get(slug);
      // Tombstones and malformed archive records fail closed even if an old
      // curated row or process-local board still contains the same slug.
      if (match?.tombstoned || unresolved.has(slug)) { evidence[slug] = { notice: UNAVAILABLE }; continue; }
      const event = match?.event ?? readers.served(slug, now.getTime()) ?? readers.seed(slug);
      evidence[slug] = event ? evidenceFor(event, now) : { notice: UNAVAILABLE };
    }
    return evidence;
  } catch {
    return Object.fromEntries(requested.map((slug) => [slug, { notice: UNAVAILABLE }]));
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}

export async function resolveSharedPlan(spec: PlanSpec, options: Parameters<typeof resolvePlanEventEvidence>[1] = {}): Promise<Plan | null> {
  return reconstructPlan(spec, await resolvePlanEventEvidence(spec, options));
}

export async function planAroundEvent(slug: string, input?: PlanInputs, options: Parameters<typeof resolvePlanEventEvidence>[1] = {}): Promise<Plan | null> {
  const fallback: PlanSpec = { v: 1, i: input ?? { audience: "friends", vibe: "easy", duration_hours: 3, event_anchor_slug: slug }, s: [{ e: slug }] };
  const evidence = await resolvePlanEventEvidence(fallback, options);
  const event = evidence[slug]?.event;
  if (!event) return reconstructPlan(fallback, evidence);
  const spec = eventPlanSpec(event, input);
  return reconstructPlan(spec, { [event.slug]: evidence[slug] });
}

/** Give the existing place chooser the event's real location and finish time.
 * These coordinates exist only inside this server call, never in the token. */
export async function resolvePlanChoiceContext(spec: PlanSpec, options: Parameters<typeof resolvePlanEventEvidence>[1] = {}): Promise<{ spec: PlanSpec; events: PlanEventEvidence; eventAvailable: boolean }> {
  if (!spec.s.some((ref) => "e" in ref)) return { spec, events: {}, eventAvailable: true };
  const events = await resolvePlanEventEvidence(spec, options);
  const event = planAnchorEvent(spec, events);
  if (!event) return { spec, events, eventAvailable: false };
  return { events, eventAvailable: true, spec: { ...spec, i: { ...spec.i, event_anchor_slug: event.slug, start_near: event.geom, start_at: event.ends_at, max_distance_m: 1_600, require_verified_hours: false } } };
}
