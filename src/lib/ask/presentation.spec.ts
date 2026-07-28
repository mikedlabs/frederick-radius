import { describe, expect, it } from "vitest";
import type { AskIntent } from "@/lib/ask/intent";
import type { AskResult, AskSource } from "@/lib/ask/contracts";
import { withPrimaryRankedResult } from "@/lib/ask/presentation";

const PLACE_INTENT: AskIntent = {
  kind: "place",
  label: "Coffee",
  timeNeed: null,
  audience: "solo",
  vibe: "food",
  durationHours: 2,
  travelMode: null,
  budget: null,
  localOnly: false,
  surpriseMe: false,
  reservation: false,
  requestedTime: null,
  requestedDate: null,
  requestedDateTime: null,
  partySize: null,
  dietary: [],
  regions: [],
  constraints: [],
};

const SOURCES: AskSource[] = [
  {
    slug: "gravel-and-grind",
    name: "Gravel & Grind",
    category: "coffee",
    href: "/places/gravel-and-grind",
  },
  {
    slug: "beans-and-bagels",
    name: "Beans & Bagels",
    category: "coffee",
    href: "/places/beans-and-bagels",
  },
];

function result(overrides: Partial<AskResult> = {}): AskResult {
  return {
    status: "matches",
    configured: true,
    usedModel: false,
    answer: "I found two nearby coffee options.",
    sources: SOURCES,
    intent: PLACE_INTENT,
    ...overrides,
  };
}

describe("withPrimaryRankedResult", () => {
  it("marks the first deterministic discovery result", () => {
    const decorated = withPrimaryRankedResult(result());

    expect(decorated.sources[0].isPrimaryRankedResult).toBe(true);
    expect(decorated.sources[1].isPrimaryRankedResult).toBeUndefined();
  });

  it("uses the first exact recommendation named by a model answer", () => {
    const decorated = withPrimaryRankedResult(result({
      usedModel: true,
      answer: "Beans & Bagels is the better fit here. Gravel & Grind is the alternative.",
    }));

    expect(decorated.sources.map((source) => source.slug)).toEqual([
      "beans-and-bagels",
      "gravel-and-grind",
    ]);
    expect(decorated.sources[0].isPrimaryRankedResult).toBe(true);
    expect(decorated.sources[1].isPrimaryRankedResult).toBeUndefined();
  });

  it("stays neutral when a model answer does not name a discovery source", () => {
    const decorated = withPrimaryRankedResult(result({
      usedModel: true,
      answer: "I found two nearby options, but neither has recently verified hours.",
    }));

    expect(decorated.sources.every((source) => !source.isPrimaryRankedResult)).toBe(true);
  });

  it("never turns civic evidence into a best-match claim", () => {
    const decorated = withPrimaryRankedResult(result({
      intent: { ...PLACE_INTENT, kind: "civic", label: "Official local help" },
      sources: [{
        slug: "county-voting",
        name: "Voter registration",
        category: "civic",
        href: "https://frederickcountymd.gov/vote",
        isPrimaryRankedResult: true,
      }],
    }));

    expect(decorated.sources[0].isPrimaryRankedResult).toBeUndefined();
  });

  it("keeps an outdoor-safety source ahead of an indoor alternative", () => {
    const decorated = withPrimaryRankedResult(result({
      usedModel: true,
      answer: "A severe thunderstorm warning is active. Beans & Bagels is an indoor option.",
      sources: [
        {
          slug: "nws-alert-severe-thunderstorm-warning",
          name: "Severe Thunderstorm Warning",
          category: "weather",
          href: "https://api.weather.gov/alerts/storm-1",
        },
        SOURCES[1],
      ],
    }));

    expect(decorated.sources.map((source) => source.slug)).toEqual([
      "nws-alert-severe-thunderstorm-warning",
      "beans-and-bagels",
    ]);
    expect(decorated.sources.every((source) => !source.isPrimaryRankedResult)).toBe(true);
  });
});
