import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { AskIntent } from "@/lib/ask/intent";
import type { AskPlanPreview } from "@/lib/ask/contracts";
import type { QualifiedSearchContext } from "@/lib/search";
import { buildPlan, type PlanInputs } from "@/lib/integrations/planner";
import { easternWallToUtcISO } from "@/lib/tz";

function categoryName(slug: string): string {
  return CATEGORY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ");
}

function planStart(intent: AskIntent, query: string): string | undefined {
  if (intent.requestedDateTime) return intent.requestedDateTime;
  if (intent.requestedDate) {
    const [year, month, day] = intent.requestedDate.split("-").map(Number);
    const hour = intent.timeNeed === "morning"
      ? 9
      : intent.timeNeed === "afternoon"
        ? 13
        : intent.audience === "date" || intent.vibe === "food"
          ? 18
          : 10;
    return easternWallToUtcISO(year, month, day, hour, 0);
  }
  const explicitWindow = ("morning afternoon tonight".split(" ") as string[]).includes(intent.timeNeed ?? "");
  // An undated "date night" is not a request to leave this instant. Late at
  // night, using `now` filtered the user's named anchor as closed and quietly
  // replaced it. The same is true of "plan an evening": the phrase defines
  // the outing window even when it does not mean *this* evening. Give both
  // requests the next useful evening window; explicit "tonight" requests
  // still keep their live-clock semantics.
  const defaultEvening = !explicitWindow && (
    intent.audience === "date" || /\b(?:an |the )?evening(?: out)?\b/i.test(query)
  );
  if (!explicitWindow && !defaultEvening) return undefined;
  const now = new Date();
  const clock = intent.timeNeed === "morning"
    ? { start: 9, end: 12 }
    : intent.timeNeed === "afternoon"
      ? { start: 13, end: 17 }
      : { start: 18, end: 24 };
  let date = now;
  let parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  if (hour >= clock.start && hour < clock.end && !(defaultEvening && hour >= 20)) {
    return now.toISOString();
  }
  if (hour >= clock.end || (defaultEvening && hour >= 20)) {
    date = new Date(now.getTime() + 86_400_000);
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZoneName: "longOffset",
      }).formatToParts(date).map((part) => [part.type, part.value]),
    );
  }
  const offset = (parts.timeZoneName || "GMT-05:00").replace("GMT", "");
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${String(clock.start).padStart(2, "0")}:00:00${offset}`).toISOString();
}

function nextFullEveningAfter(startAt: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(startAt)).map((part) => [part.type, part.value]),
  );
  // Move the calendar date rather than adding 24 hours so DST transitions do
  // not move the retry away from 6 PM Eastern.
  const nextDay = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + 1,
  ));
  return easternWallToUtcISO(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    18,
    0,
  );
}

function planDateLabel(startAt: string, now = new Date()): string {
  const start = new Date(startAt);
  const key = (date: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const today = key(now);
  const startDay = key(start);
  if (startDay === today) return "Today";

  const todayParts = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(
    todayParts[0],
    todayParts[1] - 1,
    todayParts[2] + 1,
    12,
  ));
  if (startDay === key(tomorrow)) return "Tomorrow";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(start);
}

function querySeed(query: string): number {
  let hash = 2166136261;
  for (const char of query) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash >>> 0) || 1;
}

export function buildAskPlanPreview(
  intent: AskIntent,
  context: QualifiedSearchContext,
  query: string,
  anchorSlug?: string,
): AskPlanPreview | null {
  const reducedMobility = /\b(?:less walking|minimal walking|can(?:not|'t) walk|limited mobility|mobility issues?|wheelchair|walker|easy parking|close parking)\b/i.test(query);
  const requiresVerifiedHours = Boolean(
    intent.requestedDate ||
      intent.requestedDateTime ||
      intent.timeNeed === "now" ||
      /\b(?:right now|open now|today|tonight|tomorrow|this (?:morning|afternoon|evening)|late[- ]?night)\b/i.test(query),
  );
  const input: PlanInputs = {
    audience: intent.audience,
    vibe: intent.vibe,
    duration_hours: intent.durationHours,
    start_at: planStart(intent, query),
    start_near: context.origin ?? undefined,
    municipality: context.municipality ?? undefined,
    max_distance_m: intent.travelMode === "walk" ? 2_400 : undefined,
    local_only: intent.localOnly || undefined,
    budget: intent.budget ?? undefined,
    parking_priority: reducedMobility || undefined,
    max_stops: reducedMobility ? 2 : undefined,
    seed: intent.surpriseMe ? querySeed(query) : undefined,
    anchor_slug: anchorSlug,
    // planStart also assigns a display clock to undated ideas. Pass the
    // distinction explicitly so that clock alone does not turn a draft into
    // an unsupported "open at this time" claim.
    require_verified_hours: requiresVerifiedHours,
  };
  let plan = buildPlan(input);
  const namedAnchorWasOmitted = Boolean(
    anchorSlug && !plan.stops.some((stop) => stop.place?.slug === anchorSlug),
  );
  const canRetryAtNextEvening = Boolean(
    namedAnchorWasOmitted &&
      input.start_at &&
      intent.timeNeed === null &&
      !intent.requestedDate &&
      !intent.requestedDateTime &&
      (intent.audience === "date" || /\b(?:an |the )?evening(?: out)?\b/i.test(query)),
  );
  // Keep the existing current-evening plan when the named place fits. Only a
  // dropped anchor earns one retry at the next complete evening window. This
  // preserves verified-hours filtering without silently replacing the place
  // the user explicitly asked to plan around.
  if (canRetryAtNextEvening) {
    plan = buildPlan({
      ...input,
      start_at: nextFullEveningAfter(input.start_at!),
    });
  }
  if (plan.stops.length === 0) return null;
  return {
    title: plan.title,
    summary: plan.summary,
    dateLabel: planDateLabel(plan.stops[0].at),
    href: `/plan?p=${encodeURIComponent(plan.share)}`,
    stops: plan.stops.map((stop) => ({
      order: stop.order,
      time: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(stop.at)),
      name: stop.place?.name ?? stop.event?.title ?? "Frederick stop",
      category: stop.place ? categoryName(stop.place.category) : "Event",
      href: stop.place ? `/places/${stop.place.slug}` : `/events/${stop.event?.slug ?? ""}`,
      photo_url: stop.photo_url,
      why: stop.why,
      status: stop.open === "open" ? "Open" : stop.open === "closed" ? "Check hours" : "Hours unconfirmed",
      tip: stop.tip,
    })),
  };
}
