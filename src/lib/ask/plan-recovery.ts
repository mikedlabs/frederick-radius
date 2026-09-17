import type { AskAction, AskSource } from "@/lib/ask/contracts";
import type { AskIntent } from "@/lib/ask/intent";
import type { AskFitContext } from "@/lib/ask/fit";
import { placeAllowedByAskFit } from "@/lib/ask/fit";
import type { PlaceCardData } from "@/lib/loaders/places";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import type { QualifiedSearchContext } from "@/lib/search";
import { namedMunicipalityScope } from "@/lib/search";
import { isChainName } from "@/lib/category-ranking";

/** Preserve a named destination even when the visitor is browsing elsewhere. */
export function askPlanContext(query: string, context: QualifiedSearchContext): QualifiedSearchContext {
  const town = namedMunicipalityScope(query);
  return town ? {
    ...context, municipality: town.slug, origin: town.centroid,
    contextLabel: town.name, canShowDistance: false,
  } : context;
}

/** A failed timed plan can still offer contactable places to check. These
 * records are explicitly unscheduled and never become inferred open stops. */
export function buildAskPlanRecovery(
  intent: AskIntent,
  context: QualifiedSearchContext,
  places: readonly PlaceCardData[],
  fit: AskFitContext = {},
): { answer: string; sources: AskSource[]; actions: AskAction[] } {
  const town = context.municipality ? MUNICIPALITY_BY_SLUG[context.municipality] : undefined;
  const area = town ? ` in ${town.name}` : " in Frederick County";
  const scoped = places.filter((place) => !town || place.municipality === town.slug);
  const currentHoursMissing = scoped.length > 0 && !scoped.some((place) => place.hours_verified && place.hours);
  // A route, dietary need, admission budget or access requirement needs more
  // evidence than an unscheduled directory suggestion can provide. Keep the
  // user's question intact and provide manual, explicitly broader browsing.
  const mayOfferUnscheduled = Boolean(town && !intent.budget && !fit.budget &&
    intent.dietary.length === 0 && !intent.travelMode && !fit.travelMode &&
    !fit.accessibility?.length && fit.walkingTolerance !== "short");
  const categories = intent.vibe === "food"
    ? new Set(["coffee", "restaurant", "bakery"])
    : intent.vibe === "outdoors" || intent.vibe === "active"
      ? new Set(["park", "trail"])
      : intent.vibe === "cultural"
        ? new Set(["museum", "gallery", "library"])
        : new Set(["park", "trail", "library", "museum", "coffee"]);
  const candidates = mayOfferUnscheduled ? scoped.filter((place) =>
    categories.has(place.category) && Boolean(place.phone || place.website) &&
    place.open_status.state !== "closed" &&
    (!intent.localOnly || !isChainName(place.name)) &&
    placeAllowedByAskFit(place, fit) &&
    (intent.audience !== "family" || (place.tags ?? []).some((tag) => ["family", "kid-friendly", "kids-0-5", "kids-6-12"].includes(tag)))
  ).sort((a, b) => b.feature_score - a.feature_score || a.name.localeCompare(b.name)) : [];
  const selected: PlaceCardData[] = [];
  for (const place of candidates) {
    if (selected.some((existing) => existing.category === place.category)) continue;
    selected.push(place);
    if (selected.length === 2) break;
  }
  const sources: AskSource[] = selected.map((place) => ({
    slug: place.slug, name: place.name, category: place.category,
    city: town?.name, href: `/places/${place.slug}`,
    eyebrow: `${CATEGORY_BY_SLUG[place.category]?.name ?? place.category} · Check before going`,
    reason: "This is a place to check, not a scheduled stop.",
    status: "Visit time unconfirmed", phone: place.phone, email: place.email,
    confidence: "medium",
  }));
  const time = intent.timeNeed === "afternoon" ? " this afternoon"
    : intent.timeNeed === "morning" ? " this morning"
      : intent.timeNeed === "tonight" ? " tonight"
        : intent.timeNeed === "today" || intent.timeNeed === "now" ? " today"
          : intent.timeNeed === "tomorrow" ? " tomorrow"
            : intent.requestedDate ? ` on ${intent.requestedDate}` : "";
  const limitation = currentHoursMissing
    ? "Radius does not have current verified hours for the places in this area."
    : "The available information does not confirm stops that fit all your constraints.";
  return {
    answer: `I can't confirm a ${intent.durationHours}-hour plan${area}${time}. ${limitation}${sources.length
      ? " These places have contact details so you can check before going. They are unscheduled options; their opening times and fit within your available time are unconfirmed."
      : " You can check the local directory while keeping this request unchanged."}`,
    sources,
    actions: [
      { label: town ? `Check ${town.name} places` : "Choose a town to check", kind: "open", href: town ? `/m/${town.slug}` : "/towns" },
      { label: town ? `See ${town.name} on the map` : "Open the county map", kind: "open", href: `/map?in=${town?.slug ?? "county"}` },
    ],
  };
}
