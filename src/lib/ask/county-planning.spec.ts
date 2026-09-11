import { describe, expect, it } from "vitest";
import {
  countyPlanningAskResult,
  wantsCountyPlanningApplications,
} from "./county-planning";
import type { CountyPlanningApplication } from "@/lib/integrations/fcPlanningProjects";
import type { CountyDataSnapshot } from "@/lib/integrations/fcCountySource";

const APPLICATION: CountyPlanningApplication = {
  id: "fc-planning-1",
  name: "Market Street infill",
  applicationType: "Site plan",
  permitId: "SP-26-01",
  detailsUrl: "https://example.test/application/1",
  milestone: "Agency review",
  milestoneAt: "2026-07-25T12:00:00.000Z",
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-77.411, 39.414],
      [-77.409, 39.414],
      [-77.409, 39.416],
      [-77.411, 39.416],
      [-77.411, 39.414],
    ]],
  },
  lifecycle: "open_application",
  constructionStatus: "not_established",
};

function snapshot(
  availability: CountyDataSnapshot<CountyPlanningApplication>["availability"],
): CountyDataSnapshot<CountyPlanningApplication> {
  return {
    configured: availability !== "disabled",
    availability,
    records: availability === "available" ? [APPLICATION] : [],
    provenance: {
      id: "frederick-county-open-planning-applications",
      ledgerId: "fc_planning_projects",
      title: "Open Planning Applications",
      authority: "Frederick County Government",
      sourceUrl: "https://example.test/planning",
      dataUrl: "https://example.test/planning/query",
      cacheSeconds: 21_600,
      caveat:
        "An open application is not evidence of approval, active construction, or a completion date.",
      checkedAt: "2026-07-28T16:00:00.000Z",
    },
  };
}

describe("County planning Ask", () => {
  it.each([
    "What is being built near me?",
    "Show me open planning applications",
    "Any proposed developments nearby?",
  ])("recognizes a planning question: %s", (query) => {
    expect(wantsCountyPlanningApplications(query)).toBe(true);
  });

  it("does not steal a road-construction question", () => {
    expect(
      wantsCountyPlanningApplications("Any road construction near me?"),
    ).toBe(false);
  });

  it("ranks an open application without calling it approved construction", () => {
    const result = countyPlanningAskResult(snapshot("available"), {
      label: "your location",
      origin: { lng: -77.4105, lat: 39.4143 },
      canShowDistance: true,
    });
    expect(result.sources[0]).toMatchObject({
      name: "Market Street infill",
      eyebrow: "Open planning application",
      confidence: "medium",
    });
    expect(result.answer).toContain(
      "An open application is not proof of approval or active construction.",
    );
    expect(result.sources[0]?.reason).toContain("from your location");
    expect(result.actions?.[0]).toMatchObject({
      label: "Show the lead area on the map",
      href: "/map?at=39.415000,-77.410000",
    });
  });

  it("honors a town named in the planning question", () => {
    const result = countyPlanningAskResult(snapshot("available"), {
      query: "What planning applications are in Urbana?",
    });
    expect(result.context).toBe("Urbana");
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain(
      "no open planning applications in the Urbana area",
    );
  });

  it("links to the official map instead of inventing projects while disabled", () => {
    const result = countyPlanningAskResult(snapshot("disabled"));
    expect(result.answer).toContain("cannot rank County planning applications");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.eyebrow).toBe("Official County map");
  });
});
