import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENTS } from "@/data/events";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { SearchHit } from "@/lib/search";
import { ASK_EVAL_CASES, type AskEvalCase } from "./evaluation";
import { evaluateAskCase, runAskEvaluation } from "./evaluation-runner";

const openCase: AskEvalCase = {
  name: "restaurants open nearby",
  query: "restaurants open now near me",
  intent: "place",
  requireSafeOpenIfPresent: true,
  maxLeadDistanceM: 5_000,
  allowedPlaceCategories: ["restaurant"],
};
const freeCase: AskEvalCase = {
  name: "free weekend",
  query: "free events this weekend",
  intent: "event",
  requireEvent: true,
  requireFreeEvent: true,
};
const catalogPlace = clientPlaceBySlug("hootch-and-banter-frederick")!;
function placeHit(patch: Partial<PlaceCardData> = {}): SearchHit {
  return {
    type: "place",
    score: 1,
    place: {
      ...catalogPlace,
      category: "restaurant",
      distance_m: 100,
      open_status: { state: "open", closesAt: "22:00", closingSoon: false },
      ...patch,
    },
  };
}
function eventHit(isFree: boolean): SearchHit {
  return { type: "event", score: 1, event: { ...EVENTS[0], is_free: isFree } };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Offline Ask eval attempted a network request"); }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("committed Ask retrieval quality gate", () => {
  it.each(ASK_EVAL_CASES)("$name", (test) => {
    expect(runAskEvaluation([test])[0].failures).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses its fixture calendar even after wall-clock time moves beyond every seed event", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-01-01T05:00:00.000Z"));
    const outcomes = runAskEvaluation();
    expect(outcomes).toHaveLength(ASK_EVAL_CASES.length);
    expect(outcomes.filter((outcome) => outcome.failures.length > 0)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails a required event when the supplied fixture pool cannot prove one", () => {
    const [outcome] = runAskEvaluation([freeCase], { events: [] });
    expect(outcome.failures).toContain("no event result in deterministic seed set");
  });
});

describe("Ask eval rejection contracts", () => {
  it("accepts an honest empty open-now result without requiring a place", () => {
    expect(evaluateAskCase(openCase, { intent: "place", hits: [] }).failures).toEqual([]);
  });

  it.each(["unknown", "unverified", "closed"] as const)("rejects %s hours in a safety-only case", (state) => {
    const outcome = evaluateAskCase(openCase, {
      intent: "place", hits: [placeHit({ open_status: { state } })],
    });
    expect(outcome.failures).toEqual([`returned ${catalogPlace.name} without verified open status`]);
  });

  it("rejects an unsafe secondary choice after a valid open restaurant", () => {
    const outcome = evaluateAskCase(openCase, {
      intent: "place",
      hits: [placeHit(), placeHit({ name: "Unconfirmed second choice", open_status: { state: "unknown" } })],
    });
    expect(outcome.failures).toEqual(["returned Unconfirmed second choice without verified open status"]);
  });

  it("still evaluates proximity and category expectations without presence flags", () => {
    const outcome = evaluateAskCase(openCase, {
      intent: "place",
      hits: [placeHit({ name: "Far cafe", category: "coffee", distance_m: 6_000 })],
    });
    expect(outcome.failures).toEqual([
      "lead Far cafe is 6000m away",
      "unrelated coffee result Far cafe",
    ]);
  });

  it("allows verified closing-soon hours and keeps the other constraints", () => {
    expect(evaluateAskCase(openCase, {
      intent: "place", hits: [placeHit({ open_status: { state: "closing-soon", closesAt: "13:00" } })],
    }).failures).toEqual([]);
  });

  it("rejects paid admission even after a valid free event", () => {
    const outcome = evaluateAskCase(freeCase, {
      intent: "event", hits: [eventHit(true), eventHit(false)],
    });
    expect(outcome.failures).toEqual([`returned event ${EVENTS[0].title} is not admission-free`]);
  });

  it("does not treat a missing event as a successful free-admission check", () => {
    expect(evaluateAskCase({ ...freeCase, requireEvent: false }, {
      intent: "event", hits: [],
    }).failures).toEqual(["no event result in deterministic seed set"]);
  });

  it("checks a forbidden lead without requiring a place result", () => {
    const test = { name: "independent coffee", query: "independent coffee", intent: "place" as const, forbidLead: /starbucks/gi };
    const result = { intent: "place" as const, hits: [placeHit({ name: "Starbucks" })] };
    expect(evaluateAskCase(test, result).failures).toEqual(["forbidden lead Starbucks"]);
    expect(evaluateAskCase(test, result).failures).toEqual(["forbidden lead Starbucks"]);
  });
});
