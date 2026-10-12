import type { Place } from "@/data/places";
import type { Plan, PlanSpec, PlanStop } from "@/lib/integrations/planner";
import { planOpenStateForWindow } from "@/lib/integrations/planner";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { HOURS_MAX_AGE_DAYS, isHoursFresh } from "@/lib/hours-freshness";
import { mayPublishVisitabilityHours } from "@/lib/hours-visitability";
import { isValidCoord } from "@/lib/geo";
import { eventDecisionVerification } from "@/lib/events/decision-verification";
import { stampEventProvenance, type SourceConfidence } from "@/lib/provenance";

export type VisitSourceStatus = "available" | "partial" | "unavailable";
export type PlanStopVisitCheck = {
  spec_index: number;
  kind: "place" | "event";
  name?: string;
  status: "available" | "unavailable" | "changed";
  message: string;
  at?: string;
  duration_min?: number;
  sourceLabel: string;
  sourceAsOf?: string;
  sourceValidUntil?: string;
  sourceHref?: string;
};
export type PlanWeatherVisitCheck = {
  status: VisitSourceStatus;
  coverage: "full" | "partial" | "outside" | "unavailable";
  message: string;
  sourceLabel: "National Weather Service";
  sourceAsOf?: string;
  sourceHref: string;
  periods: Array<Pick<NwsHourly, "startTime" | "endTime" | "temperature" | "temperatureUnit" | "shortForecast" | "probabilityOfPrecipitation">>;
};
export type PlanVisitCheck = {
  checkedAt: string;
  /** A short-lived briefing, not a promise of venue or weather conditions. */
  validUntil?: string;
  status: VisitSourceStatus;
  message: string;
  stops: PlanStopVisitCheck[];
  weather: PlanWeatherVisitCheck;
};
export type PlanVisitCheckResult = { plan: Plan; briefing: PlanVisitCheck };
const MINUTE_MS = 60_000;
const FORECAST_MAX_AGE_MS = 3 * 60 * MINUTE_MS;
const CLOCK_SKEW_MS = 5 * MINUTE_MS;

function dated(value: string | null | undefined): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}
function publicHref(value: string | null | undefined): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined;
}
function timingPassed(stop: PlanStop | undefined, now: Date): boolean {
  return Boolean(stop && Date.parse(stop.at) < now.getTime() - CLOCK_SKEW_MS);
}
function hourCheck(place: Place, stop: PlanStop | undefined, now: Date): Pick<PlanStopVisitCheck, "status" | "message"> {
  if (place.is_operational === "closed_permanently" || place.is_operational === "closed_temporarily") {
    return { status: "changed", message: "This place is currently listed as closed. Review its details before setting out." };
  }
  if (!stop) return { status: "unavailable", message: "This choice is saved without a scheduled visit. Confirm its hours and timing before setting out." };
  const arrival = new Date(stop.at);
  if (timingPassed(stop, now)) return { status: "changed", message: "This stop's saved start time has passed. Review your timing before setting out." };
  if (!place.hours_verified || !isHoursFresh(place.hours_updated_at, now) || !isHoursFresh(place.hours_updated_at, arrival) || !isHoursFresh(place.hours_updated_at, new Date(arrival.getTime() + stop.duration_min * MINUTE_MS)) || !mayPublishVisitabilityHours(place.slug, place.hours, arrival)) {
    return { status: "unavailable", message: "Unable to verify hours for this stop. Check directly with the venue before setting out." };
  }
  const open = planOpenStateForWindow(place, arrival, stop.duration_min);
  if (open === "closed") return { status: "changed", message: "The hours on file do not cover the full visit. Confirm a suitable time directly with the venue." };
  return open === "open"
    ? { status: "available", message: "The hours on file cover this stop. Radius has not checked the venue live; confirm directly before setting out." }
    : { status: "unavailable", message: "Unable to verify hours for this stop. Check directly with the venue before setting out." };
}
function checksForStops(spec: PlanSpec, plan: Plan, now: Date, placeFor: (slug: string) => Place | undefined): PlanStopVisitCheck[] {
  return spec.s.map((ref, spec_index) => {
    const stop = plan.stops.find((item) => item.spec_index === spec_index);
    const notice = plan.notices?.find((item) => item.spec_index === spec_index);
    const held = plan.unscheduled?.find((item) => item.spec_index === spec_index);
    if ("p" in ref) {
      const place = stop?.place ?? held?.place ?? placeFor(ref.p);
      const base = { spec_index, kind: "place" as const, sourceLabel: "Posted hours on file" };
      if (!place || !isValidCoord(place.geom) || (spec.i.municipality && place.municipality !== spec.i.municipality)) {
        return { ...base, status: "unavailable", message: "Unable to verify this saved place in your selected area. Your choice is retained." };
      }
      return { ...base, name: place.name, ...hourCheck(place, stop, now), ...(!stop && held?.why ? { message: `${held.why} Your choice remains saved.` } : {}), ...(stop ? { at: stop.at, duration_min: stop.duration_min } : {}),
        sourceAsOf: dated(place.hours_updated_at), sourceHref: publicHref(place.website) ?? publicHref(place.source_url) ?? `/places/${place.slug}` };
    }
    const base = { spec_index, kind: "event" as const, sourceLabel: "Saved publisher listing" };
    if (!stop?.event) return { ...base, status: notice && notice.code !== "unavailable" ? "changed" : "unavailable",
      message: notice?.message ?? "Unable to verify this saved event right now. Your reference is retained.", sourceHref: notice?.event_href };
    const event = stop.event;
    const confidence = (event as typeof event & { confidence?: SourceConfidence }).confidence ?? stampEventProvenance(event).confidence;
    const evidence = eventDecisionVerification({ ...event, confidence }, now);
    const changedAnchor = spec.i.event_anchor_slug === ref.e && Boolean(spec.i.start_at && Date.parse(spec.i.start_at) !== Date.parse(event.starts_at));
    const changed = changedAnchor || timingPassed(stop, now);
    return { ...base, name: event.title, status: !evidence.sourceVerified ? "unavailable" : changed ? "changed" : "available",
      message: !evidence.sourceVerified ? "Unable to verify this event with a recent publisher record. Check the organizer before setting out."
        : changedAnchor ? "The saved publisher listing now gives a different start time. Review the updated schedule before setting out."
        : changed ? "This stop's saved start time has passed. Review the organizer's timing before setting out."
        : "The latest saved publisher listing gives this start and end time. This check does not contact the organizer live; confirm directly before setting out.",
      at: stop.at, duration_min: stop.duration_min, sourceAsOf: evidence.verifiedAt, sourceValidUntil: evidence.verificationExpiresAt, sourceHref: evidence.sourceUrl ?? `/events/${event.slug}` };
  });
}
function weatherCheck(plan: Plan, forecast: NwsForecast | null, now: Date): PlanWeatherVisitCheck {
  const geom = plan.stops[0]?.place?.geom ?? plan.stops[0]?.event?.geom;
  const base = { sourceLabel: "National Weather Service" as const, sourceHref: geom && isValidCoord(geom)
    ? `https://forecast.weather.gov/MapClick.php?lat=${geom.lat.toFixed(4)}&lon=${geom.lng.toFixed(4)}` : "https://www.weather.gov/lwx/", periods: [] };
  const unavailable = (message: string, coverage: PlanWeatherVisitCheck["coverage"] = "unavailable"): PlanWeatherVisitCheck => ({ ...base, status: "unavailable", coverage, message });
  if (!plan.stops.length || !isValidCoord(geom)) return unavailable("Unable to verify weather until this plan has a scheduled local stop.");
  const first = Math.min(...plan.stops.map((stop) => Date.parse(stop.at)));
  const end = Math.max(...plan.stops.map((stop) => Date.parse(stop.at) + stop.duration_min * MINUTE_MS));
  if (!Number.isFinite(first) || !Number.isFinite(end) || end <= now.getTime()) return unavailable("This outing's saved times have passed. Choose a new time before checking weather.", "outside");
  if (first >= now.getTime() + 72 * 3_600_000) return unavailable("Radius has no hourly forecast for this outing yet. Check the National Weather Service closer to your visit.", "outside");
  const asOf = dated(forecast?.hourlyAsOf);
  const age = asOf ? now.getTime() - Date.parse(asOf) : Number.NaN;
  if (!forecast || !Number.isFinite(age) || age < -CLOCK_SKEW_MS || age > FORECAST_MAX_AGE_MS) {
    return { ...unavailable("Unable to verify a recent forecast for this outing. Check the National Weather Service before setting out."), sourceAsOf: asOf };
  }
  const start = Math.max(first, now.getTime());
  // Use actual hourly coverage, not the separate day/night payload, and
  // never infer a continuous plan window from isolated forecast periods.
  const matching = forecast.hourly.filter((p) => Number.isFinite(Date.parse(p.startTime)) && Number.isFinite(Date.parse(p.endTime))
    && Date.parse(p.endTime) > Date.parse(p.startTime) && Date.parse(p.endTime) > start && Date.parse(p.startTime) < end
    && Number.isFinite(p.temperature) && (p.temperatureUnit === "F" || p.temperatureUnit === "C") && Boolean(p.shortForecast?.trim()))
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  if (!matching.length) return { ...unavailable("Radius has no hourly forecast for this outing yet. Check the National Weather Service closer to your visit.", "outside"), sourceAsOf: asOf };
  let coveredUntil = start;
  for (const p of matching) {
    if (Date.parse(p.startTime) > coveredUntil) break;
    coveredUntil = Math.max(coveredUntil, Date.parse(p.endTime));
  }
  const full = coveredUntil >= end;
  const periods = matching.slice(0, 12).map((p) => ({ startTime: p.startTime, endTime: p.endTime, temperature: p.temperature,
    temperatureUnit: p.temperatureUnit, shortForecast: p.shortForecast, ...(p.probabilityOfPrecipitation != null && Number.isFinite(p.probabilityOfPrecipitation) && p.probabilityOfPrecipitation >= 0 && p.probabilityOfPrecipitation <= 100 ? { probabilityOfPrecipitation: p.probabilityOfPrecipitation } : {}) }));
  return { ...base, sourceAsOf: asOf, status: full ? "available" : "partial", coverage: full ? "full" : "partial", periods,
    message: full ? "The hourly forecast covers this outing at the first stop. Conditions may differ elsewhere or change before you arrive."
      : "The hourly forecast covers only part of this outing. Radius cannot verify the remaining time; check again closer to your visit." };
}

/** Read the refreshed exact choices without replacing them or claiming that
 * cached venue records were checked live. No model or publisher fanout. */
export function buildPlanVisitCheck(spec: PlanSpec, plan: Plan, forecast: NwsForecast | null, options: { now?: Date; placeFor?: (slug: string) => Place | undefined } = {}): PlanVisitCheck {
  const now = options.now ?? new Date();
  const stops = checksForStops(spec, plan, now, options.placeFor ?? clientPlaceBySlug);
  const weather = weatherCheck(plan, forecast, now);
  const available = stops.filter((stop) => stop.status === "available").length + (weather.status === "available" ? 1 : 0);
  const status: VisitSourceStatus = available === stops.length + 1 && stops.length > 0 ? "available" : available > 0 || weather.status === "partial" || stops.some((stop) => stop.status === "changed") ? "partial" : "unavailable";
  const deadlines = [now.getTime() + 15 * MINUTE_MS];
  if (weather.sourceAsOf && weather.status !== "unavailable") deadlines.push(Date.parse(weather.sourceAsOf) + FORECAST_MAX_AGE_MS);
  for (const stop of stops) {
    if (stop.status !== "available") continue;
    if (stop.sourceAsOf && stop.kind === "place") deadlines.push(Date.parse(stop.sourceAsOf) + HOURS_MAX_AGE_DAYS * 24 * 60 * MINUTE_MS);
    if (stop.sourceValidUntil) deadlines.push(Date.parse(stop.sourceValidUntil));
    if (stop.at && Date.parse(stop.at) > now.getTime()) deadlines.push(Date.parse(stop.at));
  }
  return { checkedAt: now.toISOString(), validUntil: new Date(Math.max(now.getTime(), Math.min(...deadlines))).toISOString(), status, stops, weather,
    message: status === "available" ? "Saved venue records and the local forecast are available. Confirm directly with venues before setting out."
      : status === "partial" ? "Some details changed or could not be verified. Review the notes below before setting out."
      : "Unable to verify this outing right now. Your choices are saved; check the official sources before setting out." };
}
