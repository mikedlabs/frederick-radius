import { describe, expect, it } from "vitest";
import type { AskResult } from "@/lib/ask/contracts";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { AqiObservation } from "@/lib/integrations/airnow";
import { applyAskOutdoorSafety } from "@/lib/ask/outdoor-safety";
import { outdoorSafetyHold } from "@/lib/weather-safety";

const ALERT: NwsAlert = {
  id: "storm-1",
  event: "Severe Thunderstorm Warning",
  headline: "Severe Thunderstorm Warning for Frederick County",
  description: "Frequent lightning is occurring.",
  severity: "Severe",
  urgency: "Immediate",
  certainty: "Observed",
  starts_at: "2026-07-21T18:00:00Z",
  ends_at: "2026-07-21T20:00:00Z",
  area: "Frederick County, MD",
  url: "https://api.weather.gov/alerts/storm-1",
};

function result(): AskResult {
  return {
    status: "answered",
    configured: true,
    usedModel: true,
    answer: "Hill Street Skate Park is the best place for the kids right now.",
    sources: [
      {
        slug: "hill-street-skate-park-frederick",
        name: "Hill Street Skate Park",
        category: "park",
        href: "/places/hill-street-skate-park-frederick",
      },
      {
        slug: "urban-air-adventure-park-frederick",
        name: "Urban Air Adventure Park",
        category: "family",
        href: "/places/urban-air-adventure-park-frederick",
      },
    ],
    actions: [{ label: "More playgrounds", kind: "refine", query: "playgrounds nearby" }],
    plan: null,
    intelligence: { tools: ["places"], confidence: "high", retrieval: "hybrid" },
  };
}

describe("applyAskOutdoorSafety", () => {
  const duringAlert = new Date("2026-07-21T19:00:00Z");
  const HOLD = outdoorSafetyHold([ALERT], [], duringAlert);

  it("removes an outdoor answer and source while preserving safe evidence", () => {
    const guarded = applyAskOutdoorSafety(result(), "kids in the rain", HOLD);
    expect(guarded.answer).toContain("leaving outdoor suggestions out");
    expect(guarded.answer).toContain("Urban Air Adventure Park");
    expect(guarded.answer).not.toContain("Hill Street Skate Park");
    expect(guarded.sources.map((source) => source.name)).toEqual([
      "Severe Thunderstorm Warning",
      "Urban Air Adventure Park",
    ]);
    expect(guarded.actions?.[0]).toMatchObject({ label: "Find indoor family options", kind: "refine" });
    expect(guarded.intelligence?.tools).toContain("weather");
  });

  it("removes an outdoor generated plan", () => {
    const withPlan = result();
    withPlan.sources = [];
    withPlan.plan = {
      title: "Outside afternoon",
      summary: "A park loop",
      dateLabel: "Today",
      href: "/plan/test",
      stops: [{
        order: 1,
        time: "2:00 PM",
        name: "Baker Park",
        category: "park",
        href: "/places/baker-park-frederick",
        why: "Room to run",
        status: "Open",
      }],
    };
    expect(applyAskOutdoorSafety(withPlan, "plan an afternoon", HOLD).plan).toBeNull();
  });

  it("leaves an unrelated indoor answer unchanged", () => {
    const indoor = result();
    indoor.answer = "Try Urban Air Adventure Park.";
    indoor.sources = indoor.sources.slice(1);
    expect(applyAskOutdoorSafety(indoor, "indoor birthday venue", HOLD)).toBe(indoor);
  });

  it("does not mistake the parking verb for an outdoor park request", () => {
    const parking: AskResult = {
      status: "matches",
      configured: true,
      usedModel: false,
      answer: "Carroll Creek Garage is the closest mapped city garage.",
      sources: [{
        slug: "carroll-creek-garage",
        name: "Carroll Creek Garage",
        category: "parking",
        href: "/parking",
      }],
      actions: [{
        label: "Open Carroll Creek Linear Park",
        kind: "open",
        href: "/places/carroll-creek-linear-park-frederick",
      }],
      intelligence: { tools: ["parking"], confidence: "high", retrieval: "keyword" },
    };

    expect(
      applyAskOutdoorSafety(
        parking,
        "Where can I park near Carroll Creek?",
        HOLD,
        (source) => source.href.includes("carroll-creek-linear-park"),
      ),
    ).toBe(parking);
  });

  it("removes unclassified event evidence for an explicit outdoor request", () => {
    const eventResult = result();
    eventResult.answer = "Try the creekside concert tonight.";
    eventResult.sources = [{
      slug: "creekside-concert",
      name: "Creekside concert",
      category: "event",
      href: "/events/creekside-concert",
    }];
    eventResult.plan = {
      title: "Outdoor music",
      summary: "An evening outside",
      dateLabel: "Today",
      href: "/plan/outdoor-music",
      stops: [{
        order: 1,
        time: "7:00 PM",
        name: "Creekside concert",
        category: "event",
        href: "/events/creekside-concert",
        why: "Live music",
        status: "Scheduled",
      }],
    };

    const guarded = applyAskOutdoorSafety(eventResult, "find an outdoor concert tonight", HOLD);
    expect(guarded.sources.map((source) => source.name)).toEqual(["Severe Thunderstorm Warning"]);
    expect(guarded.plan).toBeNull();
    expect(guarded.answer).not.toContain("creekside concert");
  });

  it("uses measured AirNow AQI as the trust source", () => {
    const observation: AqiObservation = {
      parameter: "PM2.5",
      aqi: 168,
      category: { id: 4, name: "Unhealthy", color: "#A02929" },
      reportingArea: "Frederick",
      dateObserved: "2026-07-21",
      hourObserved: 15,
    };
    const aqiHold = outdoorSafetyHold([], [observation], duringAlert);
    const guarded = applyAskOutdoorSafety(result(), "find a playground", aqiHold);

    expect(guarded.answer).toContain("AirNow reports AQI 168, Unhealthy");
    expect(guarded.sources[0]).toMatchObject({
      slug: "airnow-aqi",
      name: "Air quality · AQI 168",
      eyebrow: "Live AirNow observation",
    });
    expect(guarded.actions?.[1]).toMatchObject({ label: "Open AirNow details" });
  });
});
