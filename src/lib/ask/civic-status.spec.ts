import { describe, expect, it } from "vitest";
import {
  publicSafetyActivityAskResult,
  roadStatusAskResult,
  schoolStatusAskResult,
  wantsPublicSafetyActivity,
  wantsRoadStatus,
  wantsSchoolStatus,
  wantsWaterAdvisory,
  waterAdvisoryAskResult,
} from "./civic-status";

describe("civic Ask intent boundaries", () => {
  it.each([
    "Are roads closed near me?",
    "How are the roads?",
    "Any traffic incidents on I-70?",
    "Is I-70 open?",
    "Is MD 26 blocked?",
  ])("recognizes a road-status question: %s", (query) => {
    expect(wantsRoadStatus(query)).toBe(true);
  });

  it.each([
    "Where can I ride a road bike?",
    "Find a business on Patrick Street",
    "Show me scenic drives",
  ])("does not steal a road or business discovery request: %s", (query) => {
    expect(wantsRoadStatus(query)).toBe(false);
  });

  it.each([
    "Are Frederick County schools closed?",
    "Is FCPS delayed today?",
    "What is the FCPS schedule tomorrow?",
  ])("recognizes an FCPS operations question: %s", (query) => {
    expect(wantsSchoolStatus(query)).toBe(true);
  });

  it.each([
    "Find a school playground",
    "High school sports tonight",
    "High school sports today",
    "Where is Urbana High School?",
  ])("does not steal school place or sports discovery: %s", (query) => {
    expect(wantsSchoolStatus(query)).toBe(false);
  });

  it.each([
    "What is that police activity?",
    "Why are police officers here?",
    "Are the cops responding nearby?",
  ])("recognizes an ambiguous police-scene question: %s", (query) => {
    expect(wantsPublicSafetyActivity(query)).toBe(true);
  });

  it.each([
    "What is the police department phone number?",
    "Where is the nearest police station?",
    "How do I report a crime?",
  ])("leaves police directory requests alone: %s", (query) => {
    expect(wantsPublicSafetyActivity(query)).toBe(false);
  });

  it.each([
    "Is there a boil water advisory?",
    "Is my tap water safe to drink?",
    "Was there a water main break?",
  ])("recognizes a public-water status question: %s", (query) => {
    expect(wantsWaterAdvisory(query)).toBe(true);
  });

  it.each([
    "Where is the nearest water fountain?",
    "Find a bottle refill station",
    "I need drinking water nearby",
  ])("leaves drinking-water amenity requests alone: %s", (query) => {
    expect(wantsWaterAdvisory(query)).toBe(false);
  });
});

describe("civic Ask grounded results", () => {
  it("answers road conditions from CHART incidents without place cards", () => {
    const result = roadStatusAskResult({
      available: true,
      data: [{
        id: "chart-1",
        type: "Incident",
        description: "Crash on I-70",
        county: "Frederick",
        road: "I-70",
        direction: "EB",
        location: "I-70 eastbound near MD 144",
        lng: -77.35,
        lat: 39.39,
        started_at: "2026-07-27T13:30:00.000Z",
        severity: "High",
        lanes_affected: "Right lane blocked",
      }],
    }, {
      label: "Near you",
      origin: { lat: 39.414, lng: -77.411 },
      canShowDistance: true,
    }, new Date("2026-07-27T14:00:00.000Z"));

    expect(result.answer).toContain("MDOT CHART currently lists 1 active traffic incident");
    expect(result.answer).toContain("I-70 East");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      category: "traffic",
      eyebrow: "MDOT CHART · Live traffic",
      confidence: "high",
    });
    expect(result.sources[0]?.distance).toMatch(/(?:mi|ft)$/);
    expect(result.sources.every((source) => !source.href.startsWith("/places/"))).toBe(true);
  });

  it("does not claim every road is clear when CHART has no incidents", () => {
    const result = roadStatusAskResult({ available: true, data: [] });

    expect(result.answer).toContain("no active traffic incidents");
    expect(result.answer).toContain("does not cover every neighborhood street");
    expect(result.actions?.[0]).toMatchObject({
      label: "Open MDOT CHART",
      href: "https://chart.maryland.gov/",
    });
  });

  it("answers a named-route question with only incidents from that route", () => {
    const result = roadStatusAskResult({
      available: true,
      data: [
        {
          id: "us-15",
          type: "Incident",
          description: "Crash on US 15",
          county: "Frederick",
          road: "US 15",
          direction: "SB",
          location: "US 15 near Rosemont Avenue",
          lng: -77.421,
          lat: 39.426,
          started_at: "2026-07-27T13:45:00.000Z",
          severity: "High",
          lanes_affected: "Right lane blocked",
        },
        {
          id: "i-70",
          type: "Construction",
          description: "Work zone on I-70",
          county: "Frederick",
          road: "I-70",
          direction: "EB",
          location: "I-70 near MD 144",
          lng: -77.35,
          lat: 39.39,
          started_at: "2026-07-27T13:30:00.000Z",
          severity: "Medium",
          lanes_affected: "Shoulder closed",
        },
      ],
    }, {
      query: "Is I-70 open?",
      label: "Frederick County",
    }, new Date("2026-07-27T14:00:00.000Z"));

    expect(result.answer).toContain("1 active traffic incident for I-70");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.name).toContain("I-70");
    expect(result.sources[0]?.name).not.toContain("US 15");
  });

  it("ranks the nearest incident first for an explicit near-me question", () => {
    const result = roadStatusAskResult({
      available: true,
      data: [
        {
          id: "far-high",
          type: "Incident",
          description: "Crash on US 15",
          county: "Frederick",
          road: "US 15",
          direction: "NB",
          location: "US 15 near Emmitsburg",
          lng: -77.33,
          lat: 39.69,
          started_at: "2026-07-27T13:50:00.000Z",
          severity: "High",
          lanes_affected: "All lanes blocked",
        },
        {
          id: "near-medium",
          type: "Construction",
          description: "Work zone on US 40",
          county: "Frederick",
          road: "US 40",
          direction: "WB",
          location: "US 40 near downtown Frederick",
          lng: -77.42,
          lat: 39.42,
          started_at: "2026-07-27T13:30:00.000Z",
          severity: "Medium",
          lanes_affected: "Right lane closed",
        },
      ],
    }, {
      query: "Are roads closed near me?",
      label: "Near you",
      origin: { lat: 39.414, lng: -77.411 },
      canShowDistance: true,
    }, new Date("2026-07-27T14:00:00.000Z"));

    expect(result.sources[0]?.name).toContain("US 40");
    expect(result.sources[1]?.name).toContain("US 15");
  });

  it("does not substitute another road when a named route has no listed incident", () => {
    const result = roadStatusAskResult({
      available: true,
      data: [{
        id: "us-15",
        type: "Incident",
        description: "Crash on US 15",
        county: "Frederick",
        road: "US 15",
        direction: "SB",
        location: "US 15 near Rosemont Avenue",
        lng: -77.421,
        lat: 39.426,
        started_at: "2026-07-27T13:45:00.000Z",
        severity: "High",
      }],
    }, {
      query: "Is I-70 open?",
    });

    expect(result.answer).toContain(
      "no active traffic incident for I-70 in Frederick County",
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.slug).toBe("mdot-chart");
    expect(result.sources[0]?.reason).toContain("No active I-70 incident");
  });

  it("uses the current FCPS operations notice", () => {
    const result = schoolStatusAskResult({
      available: true,
      data: [{
        id: "fcps-1",
        title: "FCPS schools open two hours late",
        description: "Offices open on time.",
        status: "delayed",
        published_at: "2026-07-27T10:00:00.000Z",
        url: "https://www.fcps.org/alerts/delay",
      }],
    });

    expect(result.answer).toContain("FCPS currently has this operations notice");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      name: "FCPS schools open two hours late",
      reason: "Delayed opening",
      href: "https://www.fcps.org/alerts/delay",
    });
    expect(result.sources.every((source) => !source.href.startsWith("/places/"))).toBe(true);
  });

  it("is explicit when the FCPS feed cannot be checked", () => {
    const result = schoolStatusAskResult({ available: false, data: [] });

    expect(result.answer).toContain("couldn’t load the FCPS operations feed");
    expect(result.sources[0]?.reason).toBe("Operations feed unavailable");
  });

  it("lets a newer reopening notice supersede an older closure", () => {
    const result = schoolStatusAskResult({
      available: true,
      data: [
        {
          id: "closed",
          title: "FCPS schools and offices are closed",
          description: "All activities are canceled.",
          status: "closed",
          published_at: "2026-07-27T08:00:00.000Z",
          url: "https://www.fcps.org/alerts/closed",
        },
        {
          id: "reopened",
          title: "FCPS returns to normal operations",
          description: "Schools and offices are operating on time.",
          status: "open",
          published_at: "2026-07-27T11:00:00.000Z",
          url: "https://www.fcps.org/alerts/reopened",
        },
      ],
    });

    expect(result.answer).toContain("FCPS returns to normal operations");
    expect(result.answer).not.toContain("schools and offices are closed");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      name: "FCPS returns to normal operations",
      reason: "Normal operations",
    });
  });

  it("cannot invent an explanation for nearby police activity", () => {
    const result = publicSafetyActivityAskResult({ label: "Near you" });

    expect(result.answer).toContain("cannot identify a nearby police scene");
    expect(result.answer).toContain("limited public, non-medical dispatch data");
    expect(result.sources.map((source) => source.name)).toEqual([
      "Frederick Police calls for service",
      "Official police updates",
      "Radius Scanner",
    ]);
    expect(result.sources.every((source) => !source.href.startsWith("/places/"))).toBe(true);
  });

  it("surfaces a recent official water notice without claiming it remains active", () => {
    const publishedAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const result = waterAdvisoryAskResult({
      items: [{
        title: "Boil Water Advisory for East Street",
        url: "https://www.cityoffrederickmd.gov/CivicAlerts.aspx?AID=123",
        source: "City of Frederick",
        sourceShort: "City",
        publishedAt,
        lane: "advisory",
      }],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    expect(result.answer).toContain("The latest official water-related notice");
    expect(result.answer).toContain("confirm the affected area and whether it is still in effect");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.name).toBe("Boil Water Advisory for East Street");
  });

  it("does not treat a healthy empty news feed as proof that an address is safe", () => {
    const result = waterAdvisoryAskResult({
      items: [],
      sourceHealth: { degraded: false, unavailable: [] },
    });

    expect(result.answer).toContain("did not find a recent boil-water or public-water notice");
    expect(result.answer).toContain("does not confirm water safety at a specific address");
    expect(result.sources.map((source) => source.name)).toEqual([
      "City of Frederick alerts",
      "Frederick County alerts",
    ]);
  });

  it("uses an official handoff when a water-advisory feed is unavailable", () => {
    const result = waterAdvisoryAskResult({
      items: [],
      sourceHealth: {
        degraded: true,
        unavailable: ["City of Frederick"],
      },
    });

    expect(result.answer).toContain("couldn’t confirm a current boil-water");
    expect(result.sources[0]?.reason).toContain("News feed unavailable");
    expect(result.actions?.map((action) => action.label)).toEqual([
      "Check City alerts",
      "Check County alerts",
    ]);
    expect(
      result.actions?.every(
        (action) => action.kind === "open" && action.href.startsWith("https://"),
      ),
    ).toBe(true);
  });
});
