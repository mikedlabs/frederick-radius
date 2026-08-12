import { describe, expect, it } from "vitest";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import {
  alertCardSummary,
  dedupeUnifiedAlerts,
  nwsDisplaySeverity,
  untilLabel,
  type UnifiedAlert,
} from "./CivicAlerts";

describe("alertCardSummary", () => {
  it("does not mistake the periods in a.m. for the end of an official notice", () => {
    const summary = alertCardSummary(
      "Due to increased security measures, portions of Catoctin Mountain Park will be closed from approximately 8:00 a.m. Friday, August 8 through Sunday, August 16, 2026. Roads outside the park remain open.",
    );

    expect(summary).toContain("8:00 a.m.");
    expect(summary).not.toMatch(/8:00 a\.$/);
    expect(summary).toMatch(/…$/);
  });

  it("keeps a complete short first sentence", () => {
    expect(
      alertCardSummary(
        "The visitor center is closed today. Trails remain open.",
      ),
    ).toBe("The visitor center is closed today.");
  });
});

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

  it("does not promote an issued Code Orange alert because its timing notes mention Purple", () => {
    expect(nwsDisplaySeverity(alert({
      description: `MDE has issued a Code Orange Air Quality Alert Saturday.
Smoke was expected at Red to Very Unhealthy (Purple Alert) levels Friday night into Saturday morning.`,
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

describe("untilLabel", () => {
  it("compares alert days in Frederick time across the UTC midnight boundary", () => {
    expect(
      untilLabel(
        "2026-07-29T02:00:00.000Z",
        new Date("2026-07-28T23:30:00.000Z"),
      ),
    ).toBe("Until 10:00 PM");

    expect(
      untilLabel(
        "2026-07-29T04:30:00.000Z",
        new Date("2026-07-29T03:50:00.000Z"),
      ),
    ).toBe("Until 12:30 AM Wed");
  });
});

describe("dedupeUnifiedAlerts", () => {
  const roadAlert = (identity: string): UnifiedAlert => ({
    identity,
    source: "MDOT",
    severity: "warning",
    title: "US 15 work-zone closure",
    tail: "All lanes closed",
    scope: "US 15 · northbound",
    url: "/pulse?open=traffic",
    external: false,
  });

  it("counts one provider event once when a feed repeats it", () => {
    expect(
      dedupeUnifiedAlerts([
        roadAlert("mdot-road:work-zone:123"),
        roadAlert("mdot-road:work-zone:123"),
      ]),
    ).toHaveLength(1);
  });

  it("does not merge distinct incidents just because they share a road", () => {
    expect(
      dedupeUnifiedAlerts([
        roadAlert("mdot-road:work-zone:123"),
        roadAlert("mdot-road:work-zone:456"),
      ]),
    ).toHaveLength(2);
  });
});
