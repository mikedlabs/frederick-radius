import { describe, expect, it } from "vitest";
import { featuredEventSlugs, resolveFeatured } from "./featured";

const NOW = new Date("2026-07-11T12:00:00-04:00"); // Eastern day 2026-07-11

describe("resolveFeatured", () => {
  it("keeps a live entry and drops an expired one (expires is inclusive)", () => {
    const set = resolveFeatured(
      [
        { slug: "carnival-tonight", expires: "2026-07-11" },
        { slug: "last-week-market", expires: "2026-07-10" },
        { slug: "next-month-fair", expires: "2026-08-01" },
      ],
      NOW,
    );
    expect([...set].sort()).toEqual(["carnival-tonight", "next-month-fair"]);
  });

  it("drops malformed entries instead of throwing (phone-edit typos)", () => {
    const set = resolveFeatured(
      [
        { slug: "", expires: "2026-08-01" },
        { slug: "no-expiry" },
        { slug: "bad-date", expires: "August 1" },
        { slug: "bad-instant", expires_at: "after the show" },
        42,
        null,
        { slug: "good", expires: "2026-08-01" },
      ],
      NOW,
    );
    expect([...set]).toEqual(["good"]);
  });

  it("a non-array payload resolves to no features", () => {
    expect(resolveFeatured(undefined, NOW).size).toBe(0);
    expect(resolveFeatured({ oops: true }, NOW).size).toBe(0);
  });

  it("uses an exact cutoff for an overnight event", () => {
    const entry = [
      {
        slug: "overnight-show",
        expires_at: "2026-08-16T05:30:00.000Z",
      },
    ];

    expect(
      resolveFeatured(entry, new Date("2026-08-16T01:00:00-04:00")),
    ).toEqual(new Set(["overnight-show"]));
    expect(
      resolveFeatured(entry, new Date("2026-08-16T01:31:00-04:00")),
    ).toEqual(new Set());
  });
});

describe("featuredEventSlugs", () => {
  it("reads the current editorial features and retires them after the festival", () => {
    expect(
      [...featuredEventSlugs(new Date("2026-08-13T12:00:00-04:00"))].sort(),
    ).toEqual([
      "snallyfest-2026-festival-day",
      "snallyfest-2026-kickoff",
    ]);
    expect(
      [...featuredEventSlugs(new Date("2026-08-16T01:00:00-04:00"))],
    ).toEqual(["snallyfest-2026-festival-day"]);
    expect(
      featuredEventSlugs(new Date("2026-08-16T01:31:00-04:00")).size,
    ).toBe(0);
  });
});
