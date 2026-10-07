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

const RECOVERY_ORDER = [
  "supplement",
  "primary-action",
  "results",
  "secondary-actions",
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
      "supplement",
      "context-controls",
      "plan",
      "primary-action",
      "results",
      "secondary-actions",
    ]);
  });

  it("answers first, then shows the ranked places as one list before the action", () => {
    const decorated = withAskResponsePresentation(result({
      answer:
        "Gravel & Grind is the strongest nearby match. Beans & Bagels is another option.",
    }), "Where should I get coffee?");

    expect(decorated.presentation).toEqual({
      layout: "place",
      summary: "Gravel & Grind is the strongest nearby match.",
      detail: "Beans & Bagels is another option.",
    });
    // The summary is the heading, so no result card can sit above it, and
    // the rest of the prose is the supplement directly under it.
    expect(askResponseSectionOrder(decorated.presentation!)).toEqual([
      "supplement",
      "context-controls",
      "results",
      "primary-action",
      "secondary-actions",
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
      "supplement",
      "primary-action",
      "results",
      "secondary-actions",
    ]);
  });

  it("keeps an empty result's reason and every recovery action", () => {
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
    expect(askResponseSectionOrder(decorated.presentation!)).toEqual(
      RECOVERY_ORDER,
    );
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
    expect(askResponseSectionOrder(decorated.presentation!)).toEqual(
      RECOVERY_ORDER,
    );
  });

  it("shows a failed plan's reason, the places it names, and the map action", () => {
    const decorated = withAskResponsePresentation(result({
      status: "empty",
      answer:
        "I can’t confirm a 3-hour plan in Brunswick tonight. Radius does not have current verified hours for the places in this area. These places have contact details so you can check before going.",
      intent: { ...PLACE_INTENT, kind: "plan", label: "Build a real plan" },
      sources: [{
        ...SOURCES[0],
        eyebrow: "Coffee · Check before going",
        reason: "This is a place to check, not a scheduled stop.",
      }],
      actions: [
        { label: "Check Brunswick places", kind: "open", href: "/m/brunswick" },
        { label: "See Brunswick on the map", kind: "open", href: "/map?in=brunswick" },
      ],
      plan: null,
    }), "Plan a 3 hour evening in Brunswick tonight");

    expect(decorated.presentation).toEqual({
      layout: "recovery",
      summary: "I can’t confirm a 3-hour plan in Brunswick tonight.",
      detail:
        "Radius does not have current verified hours for the places in this area. These places have contact details so you can check before going.",
    });
    const order = askResponseSectionOrder(decorated.presentation!);
    // The reason sits directly under the limitation it explains.
    expect(order[0]).toBe("supplement");
    // The answer names places, so their rows must render with it.
    expect(order).toContain("results");
    // The second action is a real way forward, not clutter to drop.
    expect(order).toContain("secondary-actions");
    // A plan recovery has no route, so the reader is never shown one.
    expect(order).not.toContain("plan");
    // Recommendation language stays off a check-before-going list.
    expect(decorated.sources[0].isPrimaryRankedResult).toBeUndefined();
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

  it("puts the caveat under the answer and never splits the results into a lead card and an accordion", () => {
    for (const layout of ["plan", "place", "civic", "standard", "recovery"] as const) {
      const order = askResponseSectionOrder({ layout });
      // The supplement (noise caveat, unconfirmed hours) is said once,
      // directly under the heading, not in a "More context" block.
      expect(order[0]).toBe("supplement");
      expect(order.filter((section) => section === "results")).toHaveLength(1);
      expect(order.filter((section) => section === "primary-action")).toHaveLength(1);
      expect(order).not.toContain("primary-source");
      expect(order).not.toContain("supporting-sources");
      expect(order).not.toContain("detail");
    }
  });
});
