import "server-only";
import { Output, ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { matchCivicAction } from "@/data/civic-actions";
import { matchDepartment } from "@/data/department-contacts";
import { parseAskIntent, type AskIntent } from "@/lib/ask/intent";
import {
  clockLine,
  concisePlainTextAnswer,
  optionCountInstruction,
  requestedOptionCount,
  scopeAskEvents,
} from "@/lib/ask/context";
import { buildAskPlanPreview } from "@/lib/ask/plan-preview";
import type { AskAction, AskPlanPreview, AskSource } from "@/lib/ask/contracts";
import { filterCitedSources, sourceIsCited } from "@/lib/ask/citations";
import { hybridPlaceSearch, fuseRankedIds } from "@/lib/ask/hybrid-search";
import {
  buildTasteProfile,
  rerankWithTaste,
  tasteSummary,
  type AskTasteSignals,
} from "@/lib/ask/taste";
import { assembleUnifiedEvents } from "@/lib/loaders/unifiedEvents";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { Event } from "@/data/events";
import { FREDERICK_CENTER, formatDistance, haversineMeters } from "@/lib/geo";
import { formatHoursLine } from "@/lib/hours";
import { isChainName } from "@/lib/category-ranking";
import { getParkingOccupancy, parkingFeedConfigured } from "@/lib/integrations/parking-live";
import { qualifiedSearch, type QualifiedSearchContext, type SearchHit } from "@/lib/search";
import { matchesSearchQualifiers, parseSearchQualifiers } from "@/lib/search/qualifiers";
import { loadAskWeather } from "@/lib/ask/weather";
import { safeAskDescription } from "@/lib/ask/source-copy";
import { placeDietaryEvidence, placeMatchesDietary } from "@/lib/ask/dietary";
import { eventFitsAskIntent } from "@/lib/ask/event-filter";
import {
  communicationAccessLabels,
  hasDeafCommunityOrCommunicationAccess,
} from "@/lib/events/communication-access";

const AGENT_MODEL = process.env.ASK_RADIUS_AGENT_MODEL || "openai/gpt-5.4-mini";
// This is an enhancement path, never the only path to an answer. Keep one
// bounded budget for the full tool loop so a slow model or optional live feed
// cannot hold the decision UI behind the function's 30-second ceiling.
const AGENT_TOTAL_TIMEOUT_MS = 7_000;
const AGENT_STEP_TIMEOUT_MS = 3_500;
const COMPLEX_RE = /\b(?:parents?|visitors?|wheelchair|accessible|mobility|deaf(?:blind)?|hard[-\s]of[-\s]hearing|ASL|captions?|assistive[-\s]listening|interpreter|can(?:not|'t) walk|less walking|parking|rain|weather|before|after|then|plus|followed by|combine|itinerary|plan|date night|afternoon|evening|morning|budget|under \$?\d+)\b/i;

export type RadiusAgentAnswer = {
  answer: string;
  sources: AskSource[];
  actions: AskAction[];
  plan: AskPlanPreview | null;
  tools: string[];
  retrieval: "keyword" | "hybrid";
  confidence: "high" | "medium";
  personalized?: string;
};

export function radiusAgentConfigured(): boolean {
  // The agent's ToolLoopAgent makes multiple model calls per query through the
  // Vercel AI Gateway. Kept ON even when ASK_AI_PROVIDER pins TEXT generation to
  // direct Anthropic: the July 2026 bill showed AI Gateway spend is negligible
  // (the real cost was Vercel Agent + build minutes), so the agent's richer
  // answers are worth keeping. Set ASK_RADIUS_AGENT=0 to force it off.
  return Boolean(
    process.env.ASK_RADIUS_AGENT !== "0" &&
      (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
  );
}

export function shouldUseRadiusAgent(query: string, intent: AskIntent): boolean {
  if (!radiusAgentConfigured()) return false;
  if (intent.kind === "civic") return false;
  if (intent.regions.length > 0) return false;
  return intent.kind === "explore" || intent.kind === "plan" || COMPLEX_RE.test(query);
}

function categoryName(slug: string): string {
  return CATEGORY_BY_SLUG[slug]?.name ?? slug.replace(/-/g, " ");
}

function placeSource(place: PlaceCardData, showDistance: boolean): AskSource {
  return {
    slug: place.slug,
    name: place.name,
    category: place.category,
    city: place.city || place.municipality,
    href: `/places/${place.slug}`,
    eyebrow: categoryName(place.category),
    reason: place.field_note_tip || place.known_for?.[0] || "Matched the request in Radius",
    detail: safeAskDescription(place.name, place.short_blurb, place.description),
    distance: showDistance && place.distance_m != null ? formatDistance(place.distance_m) : undefined,
    status: formatHoursLine(place.open_status),
    phone: place.phone || undefined,
    email: place.email || undefined,
    confidence: place.is_verified && (place.hours_verified || place.open_status.state === "unknown") ? "high" : "medium",
    photo_url: place.google_photo_url || place.hero_image,
    rating: typeof place.google_rating === "number" ? place.google_rating : undefined,
    ratingCount: typeof place.google_rating_count === "number" ? place.google_rating_count : undefined,
  };
}

function eventSource(event: Event): AskSource {
  const date = new Date(event.starts_at);
  const when = date.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return {
    slug: event.slug,
    name: event.title,
    category: event.category,
    city: event.municipality,
    href: `/events/${event.slug}`,
    eyebrow: `${when} · ${time}`,
    reason: communicationAccessLabels(event)[0]
      ?? (event.venue_name ? `At ${event.venue_name}` : "Current Radius calendar match"),
    detail: safeAskDescription(event.title, event.description)?.slice(0, 160),
    confidence: "high",
    photo_url: event.hero_image,
  };
}

function semanticPlaceAllowed(place: PlaceCardData, query: string, context: QualifiedSearchContext): boolean {
  const qualifiers = parseSearchQualifiers(query);
  const municipality = qualifiers.downtown ? "frederick" : context.municipality;
  if (!matchesSearchQualifiers(place, qualifiers, municipality)) return false;
  if (qualifiers.downtown && haversineMeters(FREDERICK_CENTER, place.geom) > 1_600) return false;
  const intent = parseAskIntent(query);
  if (intent.localOnly && isChainName(place.name)) return false;
  if (intent.travelMode === "walk" && context.origin && haversineMeters(context.origin, place.geom) > 2_400) return false;
  if (intent.budget === "free" && !(place.tags ?? []).includes("free")) return false;
  if (intent.budget === "value" && place.price_band != null && place.price_band > 2) return false;
  if (!placeMatchesDietary(place, intent.dietary)) return false;
  return true;
}

function mergePlaceHits(
  keywordHits: SearchHit[],
  semanticIds: string[],
  query: string,
  context: QualifiedSearchContext,
): SearchHit[] {
  const keywordPlaces = keywordHits.filter((hit): hit is Extract<SearchHit, { type: "place" }> => hit.type === "place");
  const bySlug = new Map(keywordPlaces.map((hit) => [hit.place.slug, hit]));
  for (const slug of semanticIds) {
    if (bySlug.has(slug)) continue;
    const raw = clientPlaceBySlug(slug);
    if (!raw) continue;
    const place = context.origin
      ? { ...raw, distance_m: haversineMeters(context.origin, raw.geom) }
      : raw;
    if (!semanticPlaceAllowed(place, query, context)) continue;
    bySlug.set(slug, { type: "place", place, score: 0 });
  }
  const ordered = fuseRankedIds(keywordPlaces.map((hit) => hit.place.slug), semanticIds, 20);
  return ordered.flatMap((slug, index): SearchHit[] => {
    const hit = bySlug.get(slug);
    return hit ? [{ ...hit, score: 20 - index }] : [];
  });
}

const outputSchema = z.object({
  answer: z.string().min(1).max(650),
  placeSlugs: z.array(z.string()).max(12).default([]),
  eventSlugs: z.array(z.string()).max(12).default([]),
  followUps: z.array(z.object({
    label: z.string().min(1).max(40),
    query: z.string().min(1).max(300),
  })).max(3).default([]),
  confidence: z.enum(["high", "medium"]),
});

const INSTRUCTIONS = `You are the decision engine inside Frederick Radius, a current local information service for Frederick County, Maryland.

Use tools before answering. Use the fewest tools that fully answer the request, normally 1 to 3. Build a plan for multi-stop requests. Check weather or parking only when it changes the decision.

Truth rules:
- Use only facts returned by tools in this run.
- Never invent a business, event, hour, price, address, accessibility feature, parking count, or local fact.
- Return only exact placeSlugs and eventSlugs that a tool returned.
- Source cards are citations. Return a slug only for a place or event you explicitly name in the answer.
- If you tell the user to call or confirm by phone, include the phone number returned by the tool. Never invent one.
- Do not claim that a place is quiet, lively, intimate, or suitable for conversation unless a tool returned explicit evidence for that trait. If the user asks and the evidence is absent, say that the noise level is unverified.
- Unknown hours are unknown. Do not turn them into an open claim.
- If the data is thin, say that plainly.

Writing rules:
- Lead with the strongest recommendation and explain the concrete tradeoff that determined it. Add a second option only when it gives the user a meaningfully different choice.
- Honor an explicitly requested number of options when the tool evidence supports that number. This overrides the one-or-two-choice default. If fewer verified choices are available, state the shortfall instead of inventing or padding.
- If the user asks for multiple, several, or a few options without a number, return more than one evidence-backed choice when possible. Include the returned slug for every place or event named in the answer so each source can be cited.
- Use complete grammatical sentences with naturally varied lengths. Do not use clipped fragments, slogans, rhetorical groups of three, filler, metaphors, or em dashes.
- Keep the answer to one concise paragraph of no more than 80 words unless an explicit option count requires a little more room. Even then, stay concise.
- Return plain text only. Do not use markdown, headings, bullets, numbered lists, emphasis marks, or links.
- Sound like a calm local expert. Follow-ups must materially change the decision, such as reducing the walk or moving the plan indoors.`;

export async function runRadiusAgent(
  query: string,
  context: QualifiedSearchContext,
  tasteSignals: AskTasteSignals,
): Promise<RadiusAgentAnswer | null> {
  if (!radiusAgentConfigured()) return null;
  const placeEvidence = new Map<string, PlaceCardData>();
  const eventEvidence = new Map<string, Event>();
  const toolsUsed = new Set<string>();
  const taste = buildTasteProfile(tasteSignals);
  const now = new Date();
  let plan: AskPlanPreview | null = null;
  let usedHybrid = false;

  const searchPlaces = tool({
    description: "Find real Frederick County places using keyword, semantic, hours, distance, town, price, and local-only constraints.",
    inputSchema: z.object({ query: z.string().min(1).max(300), limit: z.number().int().min(1).max(12).default(6) }),
    execute: async ({ query: toolQuery, limit }) => {
      toolsUsed.add("places");
      const lexical = qualifiedSearch(toolQuery, 16, undefined, context).hits;
      const semantic = await hybridPlaceSearch(toolQuery, 16);
      usedHybrid ||= semantic.length > 0;
      let hits = mergePlaceHits(lexical, semantic.map((row) => row.sourceId), toolQuery, context);
      if (
        /\b(?:(?:cannot|can['’]?t|unable to|don['’]?t want to)\s+call|without calling|written contact|contact by (?:email|text)|email (?:them|the place|the business)|text[-\s]based contact)\b/i.test(toolQuery)
      ) {
        hits = hits.filter(
          (hit) => hit.type === "place" && Boolean(hit.place.email),
        );
      }
      hits = rerankWithTaste(hits, taste).slice(0, limit);
      return hits.flatMap((hit) => {
        if (hit.type !== "place") return [];
        placeEvidence.set(hit.place.slug, hit.place);
        return [{
          slug: hit.place.slug,
          name: hit.place.name,
          category: hit.place.category,
          town: hit.place.city || hit.place.municipality,
          distance: hit.place.distance_m != null ? formatDistance(hit.place.distance_m) : null,
          hours: formatHoursLine(hit.place.open_status),
          phone: hit.place.phone ?? null,
          email: hit.place.email ?? null,
          priceBand: hit.place.price_band ?? null,
          knownFor: hit.place.known_for?.slice(0, 3) ?? [],
          fieldNote: hit.place.field_note_tip ?? null,
          blurb: safeAskDescription(hit.place.name, hit.place.short_blurb, hit.place.description) ?? null,
          dietaryEvidence: placeDietaryEvidence(hit.place, parseAskIntent(toolQuery, now).dietary),
        }];
      });
    },
  });

  const searchEvents = tool({
    description: "Find current Frederick County events from Radius's unified, deduplicated calendar.",
    inputSchema: z.object({ query: z.string().min(1).max(300), limit: z.number().int().min(1).max(12).default(6) }),
    execute: async ({ query: toolQuery, limit }) => {
      toolsUsed.add("events");
      const pool = await Promise.race([
        assembleUnifiedEvents(new Date()).then((result) => result.publicEvents).catch(() => [] as Event[]),
        new Promise<Event[]>((resolve) => setTimeout(() => resolve([]), 1_500)),
      ]);
      const eventIntent = parseAskIntent(toolQuery, now);
      const asksCommunicationAccess =
        /\b(?:deaf(?:blind)?|hard[-\s]of[-\s]hearing|ASL|American Sign Language|sign language|captioned|captions?|CART|assistive[-\s]listening|interpreter)\b/i.test(toolQuery);
      const scopedPool = scopeAskEvents(pool, context.municipality)
        .filter((event) =>
          eventFitsAskIntent(event, eventIntent, now, toolQuery) &&
          (!asksCommunicationAccess ||
            hasDeafCommunityOrCommunicationAccess(event)),
        );
      const hits = qualifiedSearch(toolQuery, 20, scopedPool, context).hits
        .filter((hit): hit is Extract<SearchHit, { type: "event" }> => hit.type === "event")
        .slice(0, limit);
      return hits.map((hit) => {
        eventEvidence.set(hit.event.slug, hit.event);
        return {
          slug: hit.event.slug,
          title: hit.event.title,
          startsAt: hit.event.starts_at,
          venue: hit.event.venue_name,
          town: hit.event.municipality,
          free: hit.event.is_free,
          description: hit.event.description?.slice(0, 180) || null,
          communicationAccess: communicationAccessLabels(hit.event),
        };
      });
    },
  });

  const checkWeather = tool({
    description: "Check the official NWS hourly forecast when weather changes a recommendation or plan.",
    inputSchema: z.object({ hours: z.number().int().min(1).max(12).default(8) }),
    execute: async ({ hours }) => {
      toolsUsed.add("weather");
      const weather = await loadAskWeather(context.origin ?? FREDERICK_CENTER, now);
      if (!weather.forecast && weather.alerts.length === 0 && !weather.aqi) {
        return { available: false, periods: [], alerts: [], airQuality: null };
      }
      return {
        available: true,
        asOf: weather.forecast?.asOf ?? null,
        alerts: weather.alerts.map((alert) => ({
          event: alert.event,
          headline: alert.headline,
          severity: alert.severity,
          endsAt: alert.ends_at,
          url: alert.url,
        })),
        airQuality: weather.aqi ? {
          aqi: weather.aqi.aqi,
          category: weather.aqi.category.name,
          reportingArea: weather.aqi.reportingArea,
        } : null,
        periods: (weather.forecast?.hourly ?? []).slice(0, hours).map((period) => ({
          start: period.startTime,
          temperature: `${period.temperature}°${period.temperatureUnit}`,
          forecast: period.shortForecast,
          rainChance: period.probabilityOfPrecipitation ?? null,
        })),
      };
    },
  });

  const checkParking = tool({
    description: "Check licensed live downtown garage occupancy. Returns unavailable rather than guessing when the feed is not configured.",
    inputSchema: z.object({}),
    execute: async () => {
      toolsUsed.add("parking");
      if (!parkingFeedConfigured()) return { available: false, garages: [] };
      const snapshot = await getParkingOccupancy();
      return {
        available: snapshot.decks.length > 0,
        asOf: snapshot.asOf,
        garages: snapshot.decks.map((deck) => ({
          slug: deck.garageSlug,
          name: deck.name,
          spaces: deck.available,
          percentFull: deck.percentFull,
          status: deck.isFull ? "full" : deck.isFilling ? "filling" : "available",
        })),
      };
    },
  });

  const civicHelp = tool({
    description: "Find an official Frederick government action or department contact.",
    inputSchema: z.object({ query: z.string().min(1).max(300) }),
    execute: async ({ query: toolQuery }) => {
      toolsUsed.add("civic");
      const action = matchCivicAction(toolQuery);
      const department = matchDepartment(toolQuery);
      return { action, department };
    },
  });

  const buildLocalPlan = tool({
    description: "Build a real, shareable Radius plan from natural constraints. Use for two or more stops.",
    inputSchema: z.object({ request: z.string().min(1).max(300), anchorSlug: z.string().max(100).optional() }),
    execute: async ({ request, anchorSlug }) => {
      toolsUsed.add("plan");
      const intent = parseAskIntent(/^plan\b/i.test(request) ? request : `Plan ${request}`);
      plan = buildAskPlanPreview(intent, context, request, anchorSlug);
      if (!plan) return { available: false, stops: [] };
      for (const stop of plan.stops) {
        if (!stop.href.startsWith("/places/")) continue;
        const place = clientPlaceBySlug(stop.href.slice("/places/".length));
        if (place) placeEvidence.set(place.slug, place);
      }
      return {
        available: true,
        title: plan.title,
        summary: plan.summary,
        stops: plan.stops.map((stop) => ({
          time: stop.time,
          name: stop.name,
          href: stop.href,
          why: stop.why,
          hours: stop.status,
          fieldNote: stop.tip ?? null,
        })),
      };
    },
  });

  const agent = new ToolLoopAgent({
    model: AGENT_MODEL,
    instructions: INSTRUCTIONS,
    tools: { searchPlaces, searchEvents, checkWeather, checkParking, civicHelp, buildLocalPlan },
    output: Output.object({ schema: outputSchema }),
    stopWhen: stepCountIs(5),
    prepareStep: ({ stepNumber }) => ({ toolChoice: stepNumber === 0 ? "required" : "auto" }),
    maxRetries: 1,
  });

  try {
    const { output } = await agent.generate({
      prompt: `User request: ${query}\nCurrent Frederick date and time: ${clockLine(now)} Eastern\nLocation context: ${context.contextLabel || "Frederick County; exact location unavailable"}\nExplicit taste signals: ${tasteSummary(taste) || "none"}\nResponse count: ${optionCountInstruction(query)}`,
      timeout: { totalMs: AGENT_TOTAL_TIMEOUT_MS, stepMs: AGENT_STEP_TIMEOUT_MS },
    });
    if (!output) return null;
    const requested = requestedOptionCount(query);
    const maxWords = typeof requested === "number"
      ? Math.min(120, Math.max(80, requested * 22))
      : requested === "multiple"
        ? 100
        : 80;
    const answer = concisePlainTextAnswer(output.answer, maxWords);
    const sources: AskSource[] = [];
    const showDistance = Boolean(context.origin && context.canShowDistance !== false);
    for (const slug of output.placeSlugs) {
      const place = placeEvidence.get(slug);
      if (place && !sources.some((source) => source.slug === slug)) {
        sources.push(placeSource(place, showDistance));
      }
    }
    for (const slug of output.eventSlugs) {
      const event = eventEvidence.get(slug);
      if (event && !sources.some((source) => source.slug === slug)) sources.push(eventSource(event));
    }
    // Citation recovery: the model sometimes narrates a pick without
    // echoing its slug into the structured output, and the answer then
    // rendered with ZERO source cards — a recommendation with no visible
    // receipt (measured live: "what should i do tonight" named two real
    // events, sources: 0). Any evidence row the answer actually NAMES
    // gets its card, by the same test filterCitedSources applies below,
    // so a named pick can never go unsourced while unnamed evidence
    // still stays off the tray.
    for (const [slug, place] of placeEvidence) {
      if (!sources.some((source) => source.slug === slug) && sourceIsCited({ name: place.name }, answer)) {
        sources.push(placeSource(place, showDistance));
      }
    }
    for (const [slug, event] of eventEvidence) {
      if (!sources.some((source) => source.slug === slug) && sourceIsCited({ name: event.title }, answer)) {
        sources.push(eventSource(event));
      }
    }
    return {
      answer,
      sources: filterCitedSources(sources, answer).slice(0, 12),
      actions: output.followUps.map((item) => ({ label: item.label, kind: "refine", query: item.query })),
      plan,
      tools: [...toolsUsed],
      retrieval: usedHybrid ? "hybrid" : "keyword",
      confidence: output.confidence,
      personalized: tasteSummary(taste) ?? undefined,
    };
  } catch {
    return null;
  }
}
