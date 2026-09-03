import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  crossSourceScheduleConflicts,
  fairDataReviewAlerts,
  FAIR_SOURCE_REDIRECT_POLICY,
  type FairDataReviewBaseline,
  type FairDataReviewSnapshot,
} from "../scripts/collect-fair-data";
import { parseOfficialFairPages } from "../src/lib/fair/data-candidate";
import { parseGreatFrederickFair2026Schedule } from "../src/lib/fair/schedule";

const schedule = parseGreatFrederickFair2026Schedule(
  readFileSync(
    new URL(
      "../src/lib/fair/__fixtures__/great-frederick-fair-2026.ics",
      import.meta.url,
    ),
    "utf8",
  ),
);

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const reviewBaseline: FairDataReviewBaseline = {
  version: 1,
  checkedAt: "2026-09-03T00:00:00.000Z",
  minimums: {
    scheduleDays: 9,
    scheduleItems: 170,
    exhibitors: 140,
    boothShapes: 450,
    matchedBoothReferences: 380,
  },
  maximums: {
    ambiguousBoothReferences: 0,
    unmatchedBoothReferences: 0,
    mapSourceWarnings: 1,
    scheduleSourceWarnings: 2,
  },
  expectedFloorplanIds: ["9564", "9565", "9566"],
  knownConflictIds: ["known-conflict"],
  officialPageVisibleTextSha256ById: { "1722": SHA_A },
  exhibitorInventorySha256: SHA_A,
  floorplanGeometrySha256: SHA_B,
};

const reviewSnapshot: FairDataReviewSnapshot = {
  scheduleStatus: "same",
  scheduleDays: 9,
  scheduleItems: 190,
  exhibitors: 155,
  boothShapes: 508,
  matchedBoothReferences: 409,
  ambiguousBoothReferences: 0,
  unmatchedBoothReferences: 0,
  mapSourceWarnings: 1,
  scheduleSourceWarnings: 2,
  floorplanIds: ["9564", "9565", "9566"],
  conflictIds: ["known-conflict"],
  officialPageVisibleTextSha256ById: { "1722": SHA_A },
  exhibitorInventorySha256: SHA_A,
  floorplanGeometrySha256: SHA_B,
};

function page(id: number, slug: string, content: string) {
  return {
    id,
    slug,
    modified_gmt: "2026-09-02T12:00:00",
    link: `https://thegreatfrederickfair.com/${slug}/`,
    title: { rendered: slug },
    content: { rendered: `<p>${content}</p>` },
  };
}

describe("Fair data collector review gates", () => {
  it("refuses source redirects before a NAS request can leave the allowlist", () => {
    expect(FAIR_SOURCE_REDIRECT_POLICY).toBe("error");
  });

  it("keeps an unchanged complete source set green", () => {
    expect(fairDataReviewAlerts(reviewBaseline, reviewSnapshot)).toEqual([]);
  });

  it("turns silent source loss and reviewed content changes into actionable failures", () => {
    const alerts = fairDataReviewAlerts(reviewBaseline, {
      ...reviewSnapshot,
      scheduleStatus: "content-changed",
      exhibitors: 1,
      boothShapes: 1,
      matchedBoothReferences: 0,
      unmatchedBoothReferences: 1,
      floorplanIds: ["9564"],
      conflictIds: ["new-conflict"],
      officialPageVisibleTextSha256ById: { "1722": SHA_B },
      exhibitorInventorySha256: SHA_B,
      floorplanGeometrySha256: SHA_A,
    });

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("official calendar differs"),
        expect.stringContaining("exhibitor count 1"),
        expect.stringContaining("booth shape count 1"),
        expect.stringContaining("matched booth reference count 0"),
        expect.stringContaining("unmatched booth reference count 1"),
        expect.stringContaining("floorplan set changed"),
        expect.stringContaining("conflict set changed"),
        expect.stringContaining("page 1722 changed"),
        expect.stringContaining("exhibitor inventory changed"),
        expect.stringContaining("floorplan geometry changed"),
      ]),
    );
  });

  it("surfaces known conflicts between current official schedule sources", () => {
    const pages = parseOfficialFairPages(
      JSON.stringify([
        page(
          3224,
          "schedule",
          "POP 2000 with Chris Kirkpatrick. Warren Zeiders with Chris Darlington. PeeWee &amp; Open Class Dairy Showmanship. Mark&#8217;s Equipment.",
        ),
        page(
          3262,
          "grandstand",
          "POP 2000 with Jeff Timmons. Warren Zeiders with Chris Darlington.",
        ),
      ]),
      [3224, 3262],
    );

    expect(
      crossSourceScheduleConflicts(schedule, pages).map((item) => item.id),
    ).toEqual([
      "pop-2000-performer",
      "warren-zeiders-opener",
      "peewee-dairy-row",
      "equipment-source-encoding",
    ]);
  });

  it("does not create a conflict from unrelated page copy", () => {
    const pages = parseOfficialFairPages(
      JSON.stringify([
        page(3224, "schedule", "The Fair runs for nine days."),
        page(3262, "grandstand", "See the current ticket page."),
      ]),
      [3224, 3262],
    );

    expect(crossSourceScheduleConflicts(schedule, pages)).toEqual([
      expect.objectContaining({ id: "equipment-source-encoding" }),
    ]);
  });
});
