import "server-only";

import { CATEGORY_BY_SLUG } from "@/data/categories";
import { isPizzaPlace } from "@/data/cravings";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { withBrowseReturnTo } from "@/lib/browse-return";
import { formatTime, getOpenStatus, type OpenStatus } from "@/lib/hours";
import { mayAssertOpenState } from "@/lib/hours-freshness";
import { decoratePlace, publicPlaces, type PlaceCardData } from "@/lib/loaders/places";
import { placeVisitDetails } from "@/lib/loaders/placeVisitDetails";
import { parseScope, scopeToParam, scopeTownSlug, type Scope } from "@/lib/scope";
import { easternParts, easternWallToUtcISO } from "@/lib/tz";

export type TonightIntent = "dinner" | "drinks" | "pizza";

export type TonightPick = {
  slug: string;
  name: string;
  categoryLabel: string;
  town: string;
  address: string;
  why: string;
  hoursLabel: string;
  availabilityLabel: string;
  sourceLabel: string;
  detailHref: string;
  description?: string;
  image?: string;
  imageCredit?: string;
  website?: string;
  phone?: string;
  directionsHref?: string;
};

export type TonightPreviewData = {
  title: string;
  date: string;
  windowLabel: string;
  scopeLabel: string;
  scope: Scope;
  scopeNote?: string;
  intent: TonightIntent;
  town: string | null;
  startsAt: string;
  endsAt: string;
  picks: TonightPick[];
};

type Options = { now?: Date; town?: string | null; intent?: string | null };
type Availability = { rank: number; label: string; hours: string };

const EASTERN = "America/New_York";
const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN, hour: "numeric", minute: "2-digit", hour12: true,
});
const DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN, weekday: "long", month: "long", day: "numeric",
});
const TITLES: Record<TonightIntent, string> = {
  dinner: "Dinner tonight", drinks: "Drinks tonight", pizza: "Pizza tonight",
};
const CONFIDENCE_RANK = { curated: 0, partner: 1, verified: 2, scraped: 3 };
const SOURCE_LABELS = {
  curated: "Curated Radius listing",
  partner: "Partner listing",
  verified: "Source-confirmed listing",
  scraped: "Discovered listing",
};

function matchesIntent(place: PlaceCardData, intent: TonightIntent): boolean {
  if (intent === "pizza") return isPizzaPlace(place);
  const roles = new Set([place.category, ...(place.subcategories ?? [])]);
  return intent === "drinks"
    ? ["pub", "bar", "brewery", "winery", "distillery"].some((role) => roles.has(role))
    : roles.has("restaurant") || isPizzaPlace(place);
}

function availability(
  place: PlaceCardData, start: Date, end: Date, future: boolean,
): Availability | null {
  // decoratePlace has already suppressed stale/unreviewed schedules. Use its
  // publishable schedule and the shared freshness policy, never seed guesses.
  const status: OpenStatus = getOpenStatus(place.hours, {
    verified: mayAssertOpenState(place.hours_verified, place.hours_updated_at, start),
  }, start);
  if (status.state === "unknown" || status.state === "unverified") {
    return {
      rank: 2, label: "Hours not confirmed",
      hours: "Check with the venue before going.",
    };
  }
  if (status.state === "closed") {
    if (!status.opensToday || !status.opensAt) return null;
    const parts = easternParts(start);
    const [hour, minute] = status.opensAt.split(":").map(Number);
    const opens = Date.parse(easternWallToUtcISO(parts.year, parts.month, parts.day, hour, minute));
    if (!Number.isFinite(opens) || opens >= end.getTime()) return null;
    return {
      rank: 1, label: `Listed to open at ${formatTime(status.opensAt)}`,
      hours: "Opening time comes from the published schedule.",
    };
  }
  return {
    rank: status.state === "closing-soon" ? 1 : 0,
    label: future ? `Listed open at ${CLOCK.format(start)}`
      : status.state === "closing-soon" ? "Closing soon" : "Open now",
    hours: status.state === "open" && status.allDay
      ? "Published hours list a 24-hour schedule."
      : `Published hours list closing at ${formatTime(status.closesAt)}.`,
  };
}

// Recent review improves the explanation, not the availability claim. A
// 30-day ranking preference never hides an older listing or changes its hours.
const REVIEW_PREFERENCE_MS = 30 * 24 * 60 * 60 * 1000;
function evidenceRank(place: PlaceCardData, now: Date): number {
  const recent = (date: string | undefined): boolean => {
    const age = now.getTime() - Date.parse(date ?? "");
    return Number.isFinite(age) && age >= 0 && age <= REVIEW_PREFERENCE_MS;
  };
  if (recent(placeVisitDetails(place.slug)?.reviewed_at)) return 0;
  if (place.description_reviewed && place.short_blurb?.trim() &&
      recent(place.description_verified_at)) return 1;
  return 2;
}

function publicWebsite(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A bounded, server-only view of the existing catalog, with no provider reads. */
export function loadTonightPreview({ now = new Date(), town: rawTown, intent: rawIntent }: Options = {}): TonightPreviewData {
  const intent: TonightIntent = rawIntent === "drinks" || rawIntent === "pizza" ? rawIntent : "dinner";
  const scope = parseScope(rawTown) ?? "county";
  const town = scopeTownSlug(scope);
  const scopeLabel = town ? MUNICIPALITY_BY_SLUG[town].name : "Whole county";
  const parts = easternParts(now);
  const future = parts.hour < 18;
  const start = future ? new Date(easternWallToUtcISO(parts.year, parts.month, parts.day, 18, 0)) : now;
  // Calendar arithmetic, followed by Eastern conversion, stays correct on
  // both sides of DST and when the Eastern day differs from the UTC day.
  const tomorrow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const end = new Date(easternWallToUtcISO(
    tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 0, 0,
  ));
  const returnParams = new URLSearchParams({ intent, in: scopeToParam(scope) });
  const returnTo = `/today/tonight?${returnParams}`;
  const candidates = publicPlaces()
    .filter((place) => !town || place.municipality === town)
    .map((place) => decoratePlace(place, undefined, start))
    .filter((place) => matchesIntent(place, intent) && place.name.trim() && place.address.trim())
    .filter((place) => place.confidence !== "scraped" &&
      place.is_operational !== "closed_permanently" && place.is_operational !== "closed_temporarily")
    .flatMap((place) => {
      const status = availability(place, start, end, future);
      return status ? [{ place, status, evidence: evidenceRank(place, now) }] : [];
    })
    .sort((a, b) => a.status.rank - b.status.rank ||
      a.evidence - b.evidence ||
      CONFIDENCE_RANK[a.place.confidence] - CONFIDENCE_RANK[b.place.confidence] ||
      b.place.feature_score - a.place.feature_score ||
      a.place.name.localeCompare(b.place.name) || a.place.slug.localeCompare(b.place.slug));
  const seen = new Set<string>();
  const picks: TonightPick[] = [];
  for (const { place, status } of candidates) {
    if (seen.has(place.slug)) continue;
    seen.add(place.slug);
    const placeTown = MUNICIPALITY_BY_SLUG[place.municipality]?.name ?? place.city;
    const categoryLabel = CATEGORY_BY_SLUG[place.category]?.name ?? "Place";
    picks.push({
      slug: place.slug, name: place.name, categoryLabel, town: placeTown,
      address: place.address,
      why: place.short_blurb?.trim() || (intent === "pizza"
        ? `${place.name} is listed for pizza in ${placeTown}.`
        : `${place.name} is listed under ${categoryLabel.toLowerCase()} in ${placeTown}.`),
      availabilityLabel: status.label, hoursLabel: status.hours,
      sourceLabel: SOURCE_LABELS[place.confidence],
      ...(place.short_blurb ? { description: place.short_blurb } : {}),
      ...(publicWebsite(place.website) ? { website: publicWebsite(place.website) } : {}),
      ...(place.phone ? { phone: place.phone } : {}),
      directionsHref: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.name}, ${place.address}, ${place.city}, MD`)}`,
      detailHref: withBrowseReturnTo(`/places/${encodeURIComponent(place.slug)}`, returnTo),
      // No generic venue art or paid photo proxy is substituted for a place.
      // The preview's category treatment is the fallback until a documented
      // local photograph exists for this exact catalog record.
    });
    if (picks.length === 3) break;
  }
  return {
    title: TITLES[intent], date: DATE.format(now), scopeLabel, scope, intent, town,
    ...(scope === "nearme" ? {
      scopeNote: "Showing the whole county. Choose a town for local recommendations; these places aren’t ranked by your location.",
    } : {}),
    windowLabel: future ? "Tonight, 6:00 PM to midnight Eastern"
      : `Tonight, from now (${CLOCK.format(now)}) to midnight Eastern`,
    startsAt: start.toISOString(), endsAt: end.toISOString(), picks,
  };
}
