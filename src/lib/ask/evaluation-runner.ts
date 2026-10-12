import { EVENTS, type Event } from "@/data/events";
import { FREDERICK_CENTER } from "@/lib/geo";
import { qualifiedSearch, type SearchHit } from "@/lib/search";
import { ASK_EVAL_CASES, type AskEvalCase } from "./evaluation";
import { parseAskIntent, type AskIntentKind } from "./intent";

/** Historical fixture time, not a claim about today's calendar. June 4 has
 * a real Alive @ Five evening and free seed events in the following weekend.
 * Both intent parsing and retrieval must use this same clock. */
export const ASK_EVAL_FIXTURE_TIME = "2026-06-04T16:00:00.000Z";

export type AskEvalOutcome = {
  name: string;
  failures: string[];
};

/** Evaluate every declared expectation, including safety-only cases whose
 * empty result is valid. Keeping this separate lets tests supply unsafe rows
 * and prove the quality gate rejects them instead of merely passing fixtures. */
export function evaluateAskCase(
  test: AskEvalCase,
  result: { intent: AskIntentKind; hits: readonly SearchHit[] },
): AskEvalOutcome {
  const failures: string[] = [];
  if (result.intent !== test.intent) {
    failures.push(`intent ${result.intent}, expected ${test.intent}`);
  }
  const places = result.hits.filter((hit) => hit.type === "place");
  const leadPlace = places[0]?.place;
  const events = result.hits.filter((hit) => hit.type === "event");
  const leadEvent = events[0]?.event;

  if (test.requirePlace && !leadPlace) failures.push("no place result");
  if ((test.requireEvent || test.requireFreeEvent) && !leadEvent) {
    failures.push("no event result in deterministic seed set");
  }
  if (test.requireFreeEvent) {
    for (const { event } of events) {
      if (event.is_free !== true) failures.push(`returned event ${event.title} is not admission-free`);
    }
  }
  if (test.requireSafeOpenIfPresent) {
    for (const { place } of places) {
      if (place.open_status.state !== "open" && place.open_status.state !== "closing-soon") {
        failures.push(`returned ${place.name} without verified open status`);
      }
    }
  }
  if (leadPlace) {
    if (test.maxLeadDistanceM != null && (leadPlace.distance_m ?? Infinity) > test.maxLeadDistanceM) {
      failures.push(`lead ${leadPlace.name} is ${Math.round(leadPlace.distance_m ?? 0)}m away`);
    }
    if (test.forbidLead && new RegExp(test.forbidLead).test(leadPlace.name)) {
      failures.push(`forbidden lead ${leadPlace.name}`);
    }
  }
  if (test.allowedPlaceCategories) {
    for (const { place } of places) {
      if (!test.allowedPlaceCategories.includes(place.category)) {
        failures.push(`unrelated ${place.category} result ${place.name}`);
      }
    }
  }
  return { name: test.name, failures };
}

/** Local catalog and seed events only. No model, database, or provider work. */
export function runAskEvaluation(
  cases: readonly AskEvalCase[] = ASK_EVAL_CASES,
  { events = EVENTS, now = new Date(ASK_EVAL_FIXTURE_TIME) }: {
    events?: readonly Event[];
    now?: Date;
  } = {},
): AskEvalOutcome[] {
  return cases.map((test) => {
    const intent = parseAskIntent(test.query, now);
    const result = qualifiedSearch(test.query, 12, events, {
      origin: FREDERICK_CENTER,
      contextLabel: "Downtown Frederick",
      now,
    });
    return evaluateAskCase(test, { intent: intent.kind, hits: result.hits });
  });
}
