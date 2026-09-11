import { describe, expect, it } from "vitest";
import type { NwsAlert } from "@/lib/integrations/nws-alerts";
import type { OfficialCivicAlert } from "@/lib/integrations/official-alert-feeds";
import {
  alertCardSummary,
  dedupeUnifiedAlerts,
  nwsDisplaySeverity,
  officialCivicAlerts,
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

  it("preserves short official copy rather than guessing at sentence boundaries", () => {
    expect(
      alertCardSummary(
        "The visitor center is closed today. Trails remain open.",
      ),
    ).toBe("The visitor center is closed today. Trails remain open.");
  });

  it.each([
    "The road will be closed from Aug. 8 through Aug. 16, 2026. Detours are posted.",
    "The closure affects Washington, D.C. and Frederick County through Friday. Roads remain open.",
    "Frederick County offices at 12 E. Church St. will close at 3 p.m. today. Essential services continue.",
    "The closure begins at 8:00 a.m. Roads outside the park remain open.",
    "Call 301-600-0000 ext. 123. Service remains available.",
    "Stop at the signed gate (near the visitor center.) Follow ranger directions.",
  ])("does not corrupt punctuation in a short notice: %s", (notice) => {
    expect(alertCardSummary(notice)).toBe(notice);
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

function officialAlert(
  overrides: Partial<OfficialCivicAlert> = {},
): OfficialCivicAlert {
  return {
    id: "health-closing:test",
    kind: "health-closing",
    state: "active",
    active: true,
    title: "Closed Labor Day",
    summary: "Health Department offices will be closed Monday, September 7.",
    scope: "county",
    url: "https://health.frederickcountymd.gov/closing/test",
    publishedAt: "2026-09-01T12:00:00.000Z",
    occurredAt: "2026-09-01T12:00:00.000Z",
    expiresAt: "2026-09-15T12:00:00.000Z",
    confidence: "official",
    provenance: {
      publisher: "Frederick County Health Department",
      authority: "official-government",
      sourceUrl: "https://health.frederickcountymd.gov/closing/test",
      canonicalUrl: "https://health.frederickcountymd.gov/closing/test",
      sourceKind: "official-rss",
      retrievedAt: "2026-09-04T12:00:00.000Z",
      providerUpdatedAt: "2026-09-01T12:00:00.000Z",
      confidence: "official",
    },
    ...overrides,
  };
}

describe("officialCivicAlerts", () => {
  it("keeps a routine office closing out of Today's high-signal interruption layer", () => {
    expect(officialCivicAlerts([officialAlert()])[0]?.severity).toBe("info");
  });

  it("still promotes a closing whose copy describes an emergency", () => {
    expect(officialCivicAlerts([officialAlert({
      summary: "Offices are closed during an emergency. Avoid the affected building.",
    })])[0]?.severity).toBe("warning");
  });

  it("keeps an official city emergency prominent even with quiet copy", () => {
    expect(officialCivicAlerts([officialAlert({
      kind: "city-emergency",
      title: "City emergency notice",
      summary: "Follow the latest official instructions.",
    })])[0]?.severity).toBe("warning");
  });
});
