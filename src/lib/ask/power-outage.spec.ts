import { describe, expect, it } from "vitest";
import { powerOutageAskResult, wantsPowerOutage } from "./power-outage";

describe("power-outage Ask grounder", () => {
  it.each([
    "Is my power out?",
    "Are there any power outages in Frederick County?",
    "We lost electricity",
    "When will the power be back on?",
  ])("recognizes a utility-status question: %s", (query) => {
    expect(wantsPowerOutage(query)).toBe(true);
  });

  it.each([
    "Where can I find a public power outlet?",
    "Where is the nearest EV charger?",
    "How powerful is the river current?",
  ])("does not steal a different power-related request: %s", (query) => {
    expect(wantsPowerOutage(query)).toBe(false);
  });

  it("returns the live county count with only official power actions", () => {
    const result = powerOutageAskResult({
      available: true,
      asOf: "2026-07-27T13:00:00.000Z",
      data: {
        total_out: 42,
        total_served: 100_000,
        munis: [],
      },
    }, "Near you");

    expect(result.answer).toContain("42 customers without power");
    expect(result.answer).toContain("cannot tell whether a specific address is included");
    expect(result.sources.map((source) => source.name)).toEqual([
      "Potomac Edison outage report",
    ]);
    expect(result.sources[0]?.href).toBe("https://outages-mdwv.firstenergycorp.com/");
    expect(result.actions?.map((action) => action.label)).toEqual([
      "Open the official outage map",
      "See county power details",
    ]);
    expect(result.intelligence?.tools).toEqual(["power"]);
  });

  it("keeps the official handoff when the live feed is unavailable", () => {
    const result = powerOutageAskResult({
      available: false,
      data: { total_out: 0, total_served: 0, munis: [] },
    });

    expect(result.answer).toContain("couldn’t load Potomac Edison’s live outage report");
    expect(result.answer).toContain("cannot confirm service at a specific address");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.reason).toBe("Live feed unavailable");
  });
});
