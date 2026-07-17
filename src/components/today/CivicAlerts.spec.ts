import { describe, expect, it } from "vitest";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import { nwsDisplaySeverity } from "./CivicAlerts";

function alert(overrides: Partial<NwsAlert> = {}): NwsAlert {
  return {
    id: "test",
    event: "Air Quality Alert",
    headline: "Air Quality Alert in effect",
    description: "",
    severity: "Unknown",
    urgency: "Expected",
    certainty: "Likely",
    starts_at: "2026-07-17T09:45:00-04:00",
    ends_at: "2026-07-18T00:00:00-04:00",
    area: "Frederick",
    url: "https://api.weather.gov/alerts/test",
    ...overrides,
  };
}

describe("nwsDisplaySeverity", () => {
  it("does not discard a Code Purple product just because NWS calls its severity Unknown", () => {
    expect(nwsDisplaySeverity(alert({
      description: "A Code Purple Air Quality Alert means air is very unhealthy for the general population.",
    }))).toBe("emergency");
  });

  it("keeps Code Orange visible as a health advisory", () => {
    expect(nwsDisplaySeverity(alert({
      description: "A Code Orange Air Quality Alert is unhealthy for sensitive groups.",
    }))).toBe("advisory");
  });

  it("continues to suppress unrelated Unknown products", () => {
    expect(nwsDisplaySeverity(alert({
      event: "Special Weather Statement",
      headline: "Routine statement",
      description: "No immediate action required.",
    }))).toBe("info");
  });
});
