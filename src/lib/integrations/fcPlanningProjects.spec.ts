import { describe, expect, it } from "vitest";
import { normalizeCountyPlanningApplications } from "./fcPlanningProjects";

const geometry = {
  type: "Polygon",
  coordinates: [
    [
      [-77.42, 39.41],
      [-77.41, 39.41],
      [-77.41, 39.42],
      [-77.42, 39.41],
    ],
  ],
};

describe("normalizeCountyPlanningApplications", () => {
  it("keeps public application facts and never implies approval or construction", () => {
    const [record] = normalizeCountyPlanningApplications([
      {
        type: "Feature",
        geometry,
        properties: {
          OBJECTID: 42,
          PROJNAME: "Brickworks",
          APDESC: "Site plan",
          Permit: "SP123",
          Weblink: "https://planningandpermitting.frederickcountymd.gov/record/123",
          CurrentMilestone: "Awaiting applicant revisions",
          CurrentMilestoneDate: Date.UTC(2026, 6, 1),
          ApplicantEmail: "private@example.com",
          ApplicantPhone: "301-555-0100",
          Notes: "internal note",
          Reviewer: "Staff Member",
        },
      },
    ]);

    expect(record).toMatchObject({
      id: "fc-planning-42",
      name: "Brickworks",
      applicationType: "Site plan",
      permitId: "SP123",
      milestone: "Awaiting applicant revisions",
      milestoneAt: "2026-07-01T00:00:00.000Z",
      lifecycle: "open_application",
      constructionStatus: "not_established",
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("301-555");
    expect(serialized).not.toContain("internal note");
    expect(serialized).not.toContain("Staff Member");
  });

  it("drops unsafe links, nameless records, and out-of-area geometry", () => {
    const records = normalizeCountyPlanningApplications([
      {
        geometry,
        properties: {
          OBJECTID: 1,
          PROJNAME: "Safe record",
          Weblink: "javascript:alert(1)",
        },
      },
      { geometry, properties: { OBJECTID: 2, PROJNAME: " " } },
      {
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-104.99, 39.73],
              [-104.98, 39.73],
              [-104.99, 39.74],
              [-104.99, 39.73],
            ],
          ],
        },
        properties: { OBJECTID: 3, PROJNAME: "Colorado" },
      },
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].detailsUrl).toBeUndefined();
  });
});
