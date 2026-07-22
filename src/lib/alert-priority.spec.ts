import { describe, expect, it } from "vitest";
import { prioritizeAlerts } from "./alert-priority";

describe("shared alert priority", () => {
  it("leads with a severe thunderstorm watch instead of a same-tier flood watch", () => {
    const flood = {
      event: "Flood Watch",
      headline: "Flood Watch issued for Frederick County",
      description: "Flooding is possible.",
      severity: "Severe",
    };
    const storm = {
      event: "Severe Thunderstorm Watch",
      headline: "Severe Thunderstorm Watch issued for Frederick County",
      description: "Severe storms are possible.",
      severity: "Severe",
    };

    expect(prioritizeAlerts([flood, storm])[0]).toBe(storm);
    expect(prioritizeAlerts([storm, flood])[0]).toBe(storm);
  });

  it("keeps a warning ahead of a watch when their consequence tier is tied", () => {
    const floodWarning = { event: "Flood Warning", severity: "Severe" };
    const stormWatch = { event: "Severe Thunderstorm Watch", severity: "Severe" };

    expect(prioritizeAlerts([stormWatch, floodWarning])[0]).toBe(floodWarning);
  });
});
