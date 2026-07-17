import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { AskIntent } from "@/lib/ask/intent";
import type { AskPlanPreview } from "@/lib/ask/contracts";
import type { QualifiedSearchContext } from "@/lib/search";
import { buildPlan, type PlanInputs } from "@/lib/integrations/planner";

function categoryName(slug: string): string {
  return CATEGORY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ");
}

function planStart(intent: AskIntent, query: string): string | undefined {
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
  const input: PlanInputs = {
    audience: intent.audience,
    vibe: intent.vibe,
    duration_hours: intent.durationHours,
    start_at: planStart(intent, query),
    start_near: context.origin ?? undefined,
    max_distance_m: intent.travelMode === "walk" ? 2_400 : undefined,
    local_only: intent.localOnly || undefined,
    budget: intent.budget ?? undefined,
    parking_priority: reducedMobility || undefined,
    max_stops: reducedMobility ? 2 : undefined,
    seed: intent.surpriseMe ? querySeed(query) : undefined,
    anchor_slug: anchorSlug,
  };
  const plan = buildPlan(input);
  if (plan.stops.length === 0) return null;
  return {
    title: plan.title,
    summary: plan.summary,
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
      why: stop.why,
      status: stop.open === "open" ? "Open" : stop.open === "closed" ? "Check hours" : "Hours unconfirmed",
      tip: stop.tip,
    })),
  };
}
