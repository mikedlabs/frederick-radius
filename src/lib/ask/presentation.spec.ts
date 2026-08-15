import { describe, expect, it } from "vitest";
import type { AskIntent } from "@/lib/ask/intent";
import type { AskResult, AskSource } from "@/lib/ask/contracts";
import {
  askResponseSectionOrder,
  withAskResponsePresentation,
  withPrimaryRankedResult,
} from "@/lib/ask/presentation";

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

describe("Ask response hierarchy", () => {
  it("puts a plan conclusion before the editable route and evidence", () => {
    const decorated = withAskResponsePresentation(result({
      answer:
        "Start with dinner at Gravel & Grind. The full route includes the timing and a second stop.",
      intent: { ...PLACE_INTENT, kind: "plan", label: "Build a real plan" },
      plan: {
        title: "An easy evening",
        summary: "Dinner followed by one nearby stop.",
        dateLabel: "Today",
        href: "/plan?from=ask",
        stops: [{
          order: 1,
          time: "6:00 PM",
          name: "Gravel & Grind",
          category: "coffee",
          href: "/places/gravel-and-grind",
          why: "It is the first stop.",
          status: "Hours confirmed",
        }],
      },
    }), "Plan an easy evening");

    expect(decorated.presentation).toEqual({
      layout: "plan",
      summary: "Start with dinner at Gravel & Grind.",
      detail: "The full route includes the timing and a second stop.",
    });
    expect(askResponseSectionOrder(decorated.presentation!)).toEqual([
      "summary",
      "context-controls",
      "plan",
      "primary-action",
      "primary-source",
      "supporting-sources",
      "secondary-actions",
      "detail",
    ]);
  });

  it("puts a ranked place before its concise explanation and alternatives", () => {
    const decorated = withAskResponsePresentation(result({
      answer:
        "Gravel & Grind is the strongest nearby match. Beans & Bagels is another option.",
    }), "Where should I get coffee?");

    expect(decorated.presentation).toEqual({
      layout: "place",
      summary: "Gravel & Grind is the strongest nearby match.",
      detail: "Beans & Bagels is another option.",
    });
    expect(askResponseSectionOrder(decorated.presentation!)).toEqual([
      "primary-source",
      "summary",
      "context-controls",
      "primary-action",
      "supporting-sources",
      "secondary-actions",
      "detail",
    ]);
  });

  it("gives direct civic handlers an explicit official-answer layout", () => {
    const decorated = withAskResponsePresentation(result({
      answer:
        "Use the official County registration form. The source below has the current requirements.",
      intent: undefined,
      sources: [{
        slug: "county-voting",
        name: "Voter registration",
        category: "civic",
        href: "https://frederickcountymd.gov/vote",
      }],
      actions: [{
        label: "Open voter registration",
        kind: "open",
        href: "https://frederickcountymd.gov/vote",
      }],
    }), "How do I register to vote?", { kind: "civic" });

    expect(decorated.intent?.kind).toBe("civic");
    expect(decorated.presentation?.layout).toBe("civic");
    expect(askResponseSectionOrder(decorated.presentation!)).toEqual([
      "summary",
      "primary-action",
      "primary-source",
      "supporting-sources",
      "secondary-actions",
      "detail",
    ]);
  });

  it("reduces an empty result to one honest limitation and one recovery action", () => {
    const decorated = withAskResponsePresentation(result({
      status: "empty",
      answer:
        "I couldn’t confirm a solid match. Change the area or the time and try again.",
      sources: [],
      actions: [
        { label: "Change the area", kind: "open", href: "/settings" },
        { label: "Browse everything", kind: "open", href: "/map" },
      ],
    }), "Find something open");

    expect(decorated.presentation).toEqual({
      layout: "recovery",
      summary: "I couldn’t confirm a solid match.",
      detail: "Change the area or the time and try again.",
    });
    expect(askResponseSectionOrder(decorated.presentation!)).toEqual([
      "summary",
      "primary-action",
    ]);
  });

  it("uses the recovery layout for a medium-confidence answer with no evidence", () => {
    const decorated = withAskResponsePresentation(result({
      status: "answered",
      answer:
        "I cannot verify a current answer from the sources that loaded. Try a broader area.",
      sources: [],
      intelligence: {
        tools: ["places"],
        confidence: "medium",
        retrieval: "keyword",
      },
      actions: [
        { label: "Search the whole county", kind: "open", href: "/map?in=county" },
      ],
    }), "Find somewhere unusual");

    expect(decorated.presentation?.layout).toBe("recovery");
    expect(askResponseSectionOrder(decorated.presentation!)).toEqual([
      "summary",
      "primary-action",
    ]);
  });

  it("does not split a complete conclusion at a local road abbreviation", () => {
    const decorated = withAskResponsePresentation(result({
      answer:
        "U.S. 15 has one reported incident near 7th St. Open the official source for lane details.",
    }), "What is happening on U.S. 15?");

    expect(decorated.presentation?.summary).toBe(
      "U.S. 15 has one reported incident near 7th St.",
    );
    expect(decorated.presentation?.detail).toBe(
      "Open the official source for lane details.",
    );
  });

  it("keeps a numbered street address together across a cardinal abbreviation", () => {
    const decorated = withAskResponsePresentation(result({
      answer:
        "The event is at 3 N. Main St. starting at 4:00 PM tonight. Doors open at 3:30 PM.",
    }), "What is on tonight?");

    expect(decorated.presentation?.summary).toBe(
      "The event is at 3 N. Main St. starting at 4:00 PM tonight.",
    );
    expect(decorated.presentation?.detail).toBe("Doors open at 3:30 PM.");
  });
});
