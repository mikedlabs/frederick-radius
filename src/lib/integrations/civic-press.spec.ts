import { describe, expect, it } from "vitest";
import {
  featuredPoliceRelease,
  getCivicPressReleasesResult,
  type CivicPressItem,
} from "./civic-press";

const NOW = Date.parse("2026-07-21T20:00:00.000Z");

function policeItem(title: string, ageHours: number): CivicPressItem {
  return {
    title,
    url: `https://example.gov/${encodeURIComponent(title)}`,
    source: "City of Frederick",
    sourceShort: "City",
    publishedAt: new Date(NOW - ageHours * 3_600_000).toISOString(),
    lane: "police",
  };
}

describe("featuredPoliceRelease", () => {
  it("does not promote a routine police announcement", () => {
    const item = policeItem("Frederick Police Invites Community to National Night Out", 1);
    expect(featuredPoliceRelease([item], NOW)).toBeNull();
  });

  it.each([
    "Frederick Police Announces Shooting Range Training",
    "Police Academy Hosts Active Shooter Drill",
    "Frederick Police Hold Community Meeting About a Recent Shooting",
    "Emergency Preparedness Training Announcement",
  ])("does not promote the routine title %s", (title) => {
    expect(featuredPoliceRelease([policeItem(title, 1)], NOW)).toBeNull();
  });

  it("does not promote an old urgent release", () => {
    const item = policeItem("Frederick Police Investigate Shooting", 8);
    expect(featuredPoliceRelease([item], NOW)).toBeNull();
  });

  it("finds a fresh urgent release even when a newer routine item exists", () => {
    const routine = policeItem("Frederick Police Announces Community Meeting", 0.5);
    const urgent = policeItem("Frederick Police Investigate Shooting", 1);

    expect(featuredPoliceRelease([routine, urgent], NOW)?.url).toBe(urgent.url);
  });

  it.each([
    "Frederick Police Investigate Shooting",
    "Police Announce Arrest in Fatal Shooting",
    "Emergency Announcement: Shelter in Place",
  ])("keeps the real incident or directive %s eligible", (title) => {
    expect(featuredPoliceRelease([policeItem(title, 1)], NOW)?.title).toBe(title);
  });
});

describe("promoted-data build boundary", () => {
  it("does not request civic feeds while generating a release", async () => {
    const previous = process.env.RADIUS_DATA_MODE;
    process.env.RADIUS_DATA_MODE = "promoted";
    try {
      const result = await getCivicPressReleasesResult();
      expect(result.items).toEqual([]);
      expect(result.sourceHealth).toEqual({
        degraded: true,
        unavailable: ["City of Frederick", "Frederick County"],
      });
    } finally {
      if (previous === undefined) delete process.env.RADIUS_DATA_MODE;
      else process.env.RADIUS_DATA_MODE = previous;
    }
  });
});
