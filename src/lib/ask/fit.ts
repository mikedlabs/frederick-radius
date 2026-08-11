import type { PlaceCardData } from "@/lib/loaders/places";
import type { SearchHit } from "@/lib/search";

export type AskFitContext = {
  /** A real default only where Radius can enforce it. Drive and transit stay
   * query-level choices until route evidence is available in every answer. */
  travelMode?: "walk";
  walkingTolerance?: "short" | "moderate";
  accessibility?: Array<"wheelchair" | "communication">;
  family?: "young-kids" | "school-age" | "teens";
  budget?: "free" | "value";
};

type AskAccessPlace = Pick<
  PlaceCardData,
  "slug" | "name" | "accessibility"
>;

const FIT_STORAGE_KEY = "fr:ask-fit:v1";
const TRAVEL_MODES = new Set<AskFitContext["travelMode"]>(["walk"]);
const WALKING_TOLERANCES = new Set<AskFitContext["walkingTolerance"]>(["short", "moderate"]);
const ACCESSIBILITY = new Set<NonNullable<AskFitContext["accessibility"]>[number]>([
  "wheelchair",
  "communication",
]);
const FAMILY = new Set<AskFitContext["family"]>(["young-kids", "school-age", "teens"]);
const BUDGET = new Set<AskFitContext["budget"]>(["free", "value"]);

function allowed<T>(value: unknown, choices: ReadonlySet<T>): T | undefined {
  return choices.has(value as T) ? value as T : undefined;
}

/**
 * Accept only a small set of explicit decision preferences. Free-form notes,
 * inferred traits, account identifiers, and coordinates never cross this
 * contract. Unknown fields are deliberately discarded at both boundaries.
 */
export function normalizeAskFitContext(value: unknown): AskFitContext {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const accessibility = Array.isArray(raw.accessibility)
    ? Array.from(new Set(raw.accessibility.flatMap((item) => {
        const normalized = allowed(item, ACCESSIBILITY);
        return normalized ? [normalized] : [];
      }))).slice(0, ACCESSIBILITY.size)
    : [];
  const fit: AskFitContext = {};
  const travelMode = allowed(raw.travelMode, TRAVEL_MODES);
  const walkingTolerance = allowed(raw.walkingTolerance, WALKING_TOLERANCES);
  const family = allowed(raw.family, FAMILY);
  const budget = allowed(raw.budget, BUDGET);
  if (travelMode) fit.travelMode = travelMode;
  if (walkingTolerance) fit.walkingTolerance = walkingTolerance;
  if (accessibility.length > 0) fit.accessibility = accessibility;
  if (family) fit.family = family;
  if (budget) fit.budget = budget;
  return fit;
}

export function readAskFitContext(storage?: Pick<Storage, "getItem"> | null): AskFitContext {
  const target = storage ?? (() => {
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null;
    }
  })();
  if (!target) return {};
  try {
    const raw = target.getItem(FIT_STORAGE_KEY);
    return raw ? normalizeAskFitContext(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeAskFitContext(
  value: AskFitContext,
  storage?: Pick<Storage, "setItem" | "removeItem"> | null,
): AskFitContext {
  const fit = normalizeAskFitContext(value);
  const target = storage ?? (() => {
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null;
    }
  })();
  if (!target) return fit;
  try {
    if (Object.keys(fit).length === 0) target.removeItem(FIT_STORAGE_KEY);
    else target.setItem(FIT_STORAGE_KEY, JSON.stringify(fit));
  } catch {
    // Preferences are an enhancement. Locked or full storage must not block Ask.
  }
  return fit;
}

function hasCommunicationEvidence(
  place: Pick<AskAccessPlace, "accessibility">,
): boolean {
  const communication = place.accessibility?.communication;
  return Boolean(
    communication && (
      communication.deaf_community ||
      communication.asl_environment ||
      communication.asl_interpretation ||
      communication.captions ||
      communication.assistive_listening ||
      communication.relay_supported ||
      communication.written_contact ||
      communication.videophone
    ),
  );
}

/** Visible access receipt for answers using an explicit access preference. */
export function askFitAccessNote(
  place: Pick<AskAccessPlace, "accessibility">,
  fit: AskFitContext,
): string | null {
  const wheelchair = fit.accessibility?.includes("wheelchair")
    ? place.accessibility?.wheelchair === true
      ? "Wheelchair access is recorded"
      : "Wheelchair access is not confirmed"
    : null;
  const communication = fit.accessibility?.includes("communication")
    ? hasCommunicationEvidence(place)
      ? "Communication access is recorded"
      : "Communication access is not confirmed"
    : null;
  return [wheelchair, communication]
    .filter((item): item is string => Boolean(item))
    .join(" · ") || null;
}

/** A recorded access barrier is a hard constraint. Missing data remains a
 * candidate so Radius does not erase most of the county, but it must be
 * qualified in both prose and the source card. */
export function placeAllowedByAskFit(
  place: Pick<AskAccessPlace, "accessibility">,
  fit: AskFitContext,
): boolean {
  return !(
    fit.accessibility?.includes("wheelchair") &&
    place.accessibility?.wheelchair === false
  );
}

/** Add a deterministic qualification to an answer that cites places whose
 * selected access needs are still unknown. The model may write the main
 * recommendation, but it never gets to decide whether this caveat is shown. */
export function qualifyAskAnswerForAccess(
  answer: string,
  places: readonly AskAccessPlace[],
  fit: AskFitContext,
): string {
  const uniquePlaces = Array.from(
    new Map(places.map((place) => [place.slug, place])).values(),
  );
  const qualifications: string[] = [];

  if (fit.accessibility?.includes("wheelchair")) {
    const names = uniquePlaces
      .filter((place) => place.accessibility?.wheelchair == null)
      .map((place) => place.name);
    if (names.length === 1) {
      qualifications.push(`Wheelchair access is not confirmed for ${names[0]}.`);
    } else if (names.length > 1) {
      qualifications.push(`Wheelchair access is not confirmed for ${names.join(", ")}.`);
    }
  }

  if (fit.accessibility?.includes("communication")) {
    const names = uniquePlaces
      .filter((place) => !hasCommunicationEvidence(place))
      .map((place) => place.name);
    if (names.length === 1) {
      qualifications.push(`Communication access is not confirmed for ${names[0]}.`);
    } else if (names.length > 1) {
      qualifications.push(`Communication access is not confirmed for ${names.join(", ")}.`);
    }
  }

  if (qualifications.length === 0) return answer;
  const missing = qualifications.filter((qualification) => {
    const signal = qualification.startsWith("Wheelchair")
      ? /wheelchair access is not confirmed/i
      : /communication access is not confirmed/i;
    return !signal.test(answer);
  });
  return missing.length > 0 ? `${answer.trim()} ${missing.join(" ")}`.trim() : answer;
}

/** A bounded preference lift. Fit may break a close tie; it cannot turn an
 * irrelevant result into a match or silently hide a place with unknown data. */
export function askFitBoost(place: PlaceCardData, fit: AskFitContext): number {
  const tags = new Set(place.tags ?? []);
  let score = 0;

  if (fit.travelMode === "walk" && place.distance_m != null) {
    const near = fit.walkingTolerance === "short" ? 900 : 2_400;
    if (place.distance_m <= near) score += 1.2;
    else if (place.distance_m > near * 2) score -= 0.8;
  }
  if (fit.walkingTolerance === "short" && place.distance_m != null) {
    if (place.distance_m <= 800) score += 0.8;
    else if (place.distance_m > 2_400) score -= 0.6;
  }

  if (fit.accessibility?.includes("wheelchair")) {
    if (place.accessibility?.wheelchair === true || tags.has("accessible")) score += 1.4;
    else if (place.accessibility?.wheelchair === false) score -= 1.2;
  }
  if (fit.accessibility?.includes("communication") && hasCommunicationEvidence(place)) {
    score += 1.4;
  }

  const familyTags = fit.family === "young-kids"
    ? ["kids-0-5", "family"]
    : fit.family === "school-age"
      ? ["kids-6-12", "family"]
      : fit.family === "teens"
        ? ["teens", "family"]
        : [];
  if (familyTags.some((tag) => tags.has(tag))) score += 1.2;
  if (fit.family && (place.category === "bar" || place.category === "brewery")) score -= 0.6;

  if (fit.budget === "free" && tags.has("free")) score += 1.3;
  if (fit.budget === "value") {
    if (place.price_band != null && place.price_band <= 2) score += 0.7;
    else if (place.price_band != null && place.price_band >= 4) score -= 0.7;
  }
  return Math.max(-2.5, Math.min(2.5, score));
}

export function rerankWithAskFit(hits: SearchHit[], fit: AskFitContext): SearchHit[] {
  if (Object.keys(fit).length === 0) return hits;
  return hits
    // A selected access need is a constraint when Radius has negative
    // evidence. Unknown remains available, but answer cards label it honestly.
    .filter((hit) =>
      hit.type !== "place" ||
      placeAllowedByAskFit(hit.place, fit)
    )
    .map((hit, index) => ({
      hit,
      index,
      score: hit.score + (hit.type === "place" ? askFitBoost(hit.place, fit) : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ hit, score }) => ({ ...hit, score }) as SearchHit);
}

export function askFitSummary(fit: AskFitContext): string | null {
  const labels = [
    fit.travelMode === "walk" ? "walking" : null,
    fit.walkingTolerance === "short" ? "shorter walks" : fit.walkingTolerance === "moderate" ? "moderate walks" : null,
    fit.accessibility?.includes("wheelchair") ? "wheelchair access" : null,
    fit.accessibility?.includes("communication") ? "communication access" : null,
    fit.family === "young-kids" ? "young kids" : fit.family === "school-age" ? "school-age kids" : fit.family === "teens" ? "teens" : null,
    fit.budget === "free" ? "free options" : fit.budget === "value" ? "good value" : null,
  ].filter((label): label is string => Boolean(label));
  return labels.length > 0 ? labels.join(", ") : null;
}

/** A stored preference is a default, never a command. If the current question
 * names a different mode, party, walking goal, or budget, the question wins. */
export function askFitForQuery(fit: AskFitContext, query: string): AskFitContext {
  const next = normalizeAskFitContext(fit);
  if (/\b(?:walk|walking|walkable|on foot|drive|driving|by car|transit|bus|train|bike|biking|cycling)\b/i.test(query)) {
    delete next.travelMode;
  }
  if (/\b(?:short(?:er)? walk|less walking|minimal walking|long walk|walking distance|can(?:not|'t) walk|mobility|wheelchair|walker)\b/i.test(query)) {
    delete next.walkingTolerance;
  }
  if (/\b(?:free|cheap|inexpensive|budget|affordable|splurge|price does(?: not|n't) matter|under \$?\d+)\b/i.test(query)) {
    delete next.budget;
  }
  if (/\b(?:kids?|children|family|toddler|teens?|adults?|solo|date|romantic|friends?|group|visitor)\b/i.test(query)) {
    delete next.family;
  }
  if (/\b(?:wheelchair|walker|mobility|step[- ]?free|accessible parking|ADA)\b/i.test(query)) {
    next.accessibility = Array.from(new Set([
      ...(next.accessibility ?? []),
      "wheelchair" as const,
    ]));
  }
  if (/\b(?:deaf(?:blind)?|hard[-\s]of[-\s]hearing|ASL|American Sign Language|sign language|captioned|captions?|CART|assistive[-\s]listening|interpreter|written contact|videophone|relay)\b/i.test(query)) {
    next.accessibility = Array.from(new Set([
      ...(next.accessibility ?? []),
      "communication" as const,
    ]));
  }
  if (next.accessibility?.length === 0) delete next.accessibility;
  return next;
}
