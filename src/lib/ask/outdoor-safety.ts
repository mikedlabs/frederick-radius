import type { AskResult, AskSource } from "@/lib/ask/contracts";
import {
  isOutdoorRecommendation,
  type OutdoorSafetyHold,
} from "@/lib/weather-safety";
import { wantsParking } from "@/lib/ask/context";

type OutdoorSourceCheck = (source: AskSource) => boolean;

function defaultOutdoorSourceCheck(source: AskSource): boolean {
  return isOutdoorRecommendation(source);
}

function safetySource(hold: OutdoorSafetyHold): AskSource {
  if (hold.kind === "unavailable") {
    return {
      slug: "outdoor-safety-unavailable",
      name: "Outdoor conditions not verified",
      category: "weather",
      city: "Frederick County",
      href: hold.url,
      eyebrow: "Live safety check",
      reason: hold.reason,
      status: "Check official conditions",
      confidence: "medium",
    };
  }
  if (hold.kind === "air-quality" && hold.observation) {
    return {
      slug: "airnow-aqi",
      name: `Air quality · AQI ${hold.observation.aqi}`,
      category: "weather",
      city: hold.observation.reportingArea,
      href: hold.url,
      eyebrow: "Live AirNow observation",
      reason: hold.observation.category.name,
      status: hold.observation.category.name,
      confidence: "high",
    };
  }
  const eventSlug = hold.event.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  const expiry = new Date(hold.endsAt ?? "");
  const status = Number.isNaN(expiry.getTime())
    ? "Active now"
    : `Active until ${new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      }).format(expiry)}`;
  return {
    slug: `nws-alert-${eventSlug || "weather"}`,
    name: hold.event,
    category: "weather",
    city: "Frederick County",
    href: hold.url,
    eyebrow: "National Weather Service alert",
    reason: status,
    status,
    confidence: "high",
  };
}

function queryNeedsOutdoorSafety(query: string): boolean {
  if (/\b(?:outside|outdoors?|hike|hiking|trail|playground|skate ?park|pool|swim|swimming|rain|storm|lightning)\b/i.test(query)) {
    return true;
  }
  // "Where can I park near Carroll Creek?" is a parking request, not a
  // request to visit a park. Treat a bare park/parks noun as outdoor intent,
  // but never let the parking verb trigger the weather/AQI answer rewrite.
  return !wantsParking(query) && /\bparks?\b/i.test(query);
}

function isEventSource(source: Pick<AskSource, "category" | "href">): boolean {
  return source.category.toLowerCase() === "event" || source.href.startsWith("/events/");
}

function namesLine(sources: AskSource[]): string | null {
  const names = sources.slice(0, 2).map((source) => source.name);
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is an indoor option.`;
  return `${names[0]} and ${names[1]} are indoor options.`;
}

/**
 * Final response constraint for Ask Radius. The retrieval and model can still
 * do their normal work, but an active severe-weather product gets the last word
 * before the JSON reaches the client. That prevents an unsafe model sentence,
 * source card, follow-up, or generated plan from leaking through.
 */
export function applyAskOutdoorSafety(
  result: AskResult,
  query: string,
  hold: OutdoorSafetyHold | null,
  sourceIsOutdoor: OutdoorSourceCheck = defaultOutdoorSourceCheck,
): AskResult {
  if (!hold) return result;

  const explicitOutdoorRequest = queryNeedsOutdoorSafety(query);
  const sourceIsUnsafe = (source: AskSource) => sourceIsOutdoor(source)
    || (explicitOutdoorRequest && isEventSource(source));
  const removedSource = result.sources.some(sourceIsUnsafe);
  const safeSources = result.sources.filter((source) => !sourceIsUnsafe(source));
  const unsafePlan = Boolean(result.plan?.stops.some((stop) => sourceIsOutdoor({
    slug: stop.href.startsWith("/places/") ? stop.href.slice("/places/".length) : stop.href,
    name: stop.name,
    category: stop.category,
    href: stop.href,
  }) || (explicitOutdoorRequest && isEventSource(stop))));
  const parkingRequest = wantsParking(query);
  const unsafeAction = Boolean(result.actions?.some((action) => {
    if (action.kind === "refine") return queryNeedsOutdoorSafety(action.query);
    // A parking answer may link back to the outdoor destination the user
    // named. That link is context, not an outdoor recommendation, and must
    // not replace verified garage directions with an AQI failure message.
    // Explicit outdoor language elsewhere in the query still triggers the
    // hold through explicitOutdoorRequest.
    if (parkingRequest && !explicitOutdoorRequest) return false;
    if (explicitOutdoorRequest && action.href.startsWith("/events/")) return true;
    if (!action.href.startsWith("/places/")) return false;
    return sourceIsOutdoor({
      slug: action.href.slice("/places/".length),
      name: action.label,
      category: "",
      href: action.href,
    });
  }));
  const mustHold = removedSource || unsafePlan || unsafeAction || explicitOutdoorRequest;
  if (!mustHold) return result;

  const officialSource = safetySource(hold);

  // A monitoring gap is not a hazard. `loadOutdoorSafetyHold` returns an
  // active NWS alert or an unhealthy-air reading BEFORE it ever returns
  // "unavailable", so this branch means we found no known danger and simply
  // could not reach a feed. Do not bury the answer for that: keep the places
  // and lead with an honest "could not confirm, check before you go" note.
  // This still refuses to imply an all-clear (the caveat leads and the safety
  // card is first) while not hiding real parks on a brief feed outage. A real
  // NWS/air-quality hold falls through to the full suppression below.
  if (hold.kind === "unavailable") {
    return {
      ...result,
      answer: `${hold.reason} I could not confirm live conditions, so check official conditions before you head out. ${result.answer}`.trim(),
      sources: [officialSource, ...result.sources].slice(0, 5),
      actions: [
        { label: "Check live conditions", kind: "open" as const, href: hold.url },
        ...(result.actions ?? []),
      ].slice(0, 3),
      intelligence: result.intelligence
        ? { ...result.intelligence, tools: [...new Set([...result.intelligence.tools, "weather"])] }
        : { tools: ["weather"], confidence: "medium", retrieval: "keyword" },
    };
  }

  const preserved = safeSources.slice(0, 4);
  const remaining = namesLine(preserved);
  const holdWindow = hold.kind === "nws"
    ? "until the alert ends"
    : hold.kind === "air-quality"
      ? "while the air remains unhealthy"
      : "until live conditions can be verified";
  const officialCheck = hold.kind === "nws"
    ? "official alert"
    : hold.kind === "air-quality"
      ? "latest AirNow reading"
      : "official conditions";
  const answer = remaining
    ? `${hold.reason} I am leaving outdoor suggestions out ${holdWindow}. ${remaining} Check the ${officialCheck} before you leave.`
    : `${hold.reason} I am leaving outdoor suggestions out ${holdWindow}. I do not have an indoor match for this request right now. Check the ${officialCheck} before heading out.`;
  const family = /\b(?:kid|kids|child|children|family)\b/i.test(query);

  return {
    ...result,
    status: "matches",
    answer,
    sources: [officialSource, ...preserved],
    actions: [
      {
        label: family ? "Find indoor family options" : "Find indoor options",
        kind: "refine",
        query: family ? "indoor things to do with kids right now" : "indoor things to do right now",
      },
      {
        label: hold.kind === "nws"
          ? "Open official alert"
          : hold.kind === "air-quality"
            ? "Open AirNow details"
            : "Check live conditions",
        kind: "open",
        href: hold.url,
      },
    ],
    plan: unsafePlan ? null : result.plan,
    intelligence: result.intelligence
      ? { ...result.intelligence, tools: [...new Set([...result.intelligence.tools, "weather"])] }
      : {
          tools: ["weather"],
          // The "unavailable" hold is handled and returned earlier, so a hold
          // reaching this suppression block is always a verified hazard.
          confidence: "high",
          retrieval: "keyword",
        },
  };
}
