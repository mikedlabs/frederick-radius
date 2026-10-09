import { describe, expect, it } from "vitest";
import type { Place } from "@/data/places";
import { formatHoursLine, isOpenNow } from "@/lib/hours";
import { HOURS_MAX_AGE_DAYS } from "@/lib/hours-freshness";
import { mayUseLikelyOpenFallback } from "@/lib/likely-open";
import { placeHoursTrust } from "@/lib/trust";
import { decoratePlace, getPlaceBySlug, publicPlaces } from "./places";

const DAY_MS = 24 * 60 * 60 * 1000;

function basePlace(slug: string): Place {
  const place = publicPlaces().find((candidate) => candidate.slug === slug);
  if (!place) throw new Error(`fixture place ${slug} is missing from the catalog`);
  return place;
}

/** A catalog-shaped row that no enrichment, refresh, or override can match. */
function syntheticPlace(overrides: Partial<Place>): Place {
  const base = basePlace("k-town-takeout");
  return {
    ...base,
    slug: "spec-hours-truth-place",
    name: "Spec Hours Truth Place",
    google_place_id: undefined,
    hours: undefined,
    hours_verified: false,
    hours_updated_at: undefined,
    ...overrides,
  };
}

describe("withheld hours keep the wording true at the loader boundary", () => {
  // K Town Takeout carries a Google schedule from the rolling hours refresh.
  // With that refresh on hold, the schedule ages past the freshness window and
  // every place page read "Hours not posted", which was false.
  const kTown = basePlace("k-town-takeout");
  const verifiedAt = decoratePlace(kTown).hours_updated_at;

  it("asserts open or closed while the schedule is inside the freshness window", () => {
    expect(verifiedAt).toBeDefined();
    const fresh = decoratePlace(
      kTown,
      undefined,
      new Date(Date.parse(verifiedAt!) + 60 * 60 * 1000),
    );

    expect(fresh.hours).toBeDefined();
    expect(fresh.hours_verified).toBe(true);
    expect(["open", "closing-soon", "closed"]).toContain(fresh.open_status.state);
  });

  it("reads 'Hours not confirmed' once the schedule is older than the window", () => {
    const stale = decoratePlace(
      kTown,
      undefined,
      new Date(Date.parse(verifiedAt!) + (HOURS_MAX_AGE_DAYS + 1) * DAY_MS),
    );

    expect(stale.open_status).toEqual({ state: "unknown", reason: "stale" });
    expect(formatHoursLine(stale.open_status)).toBe("Hours not confirmed");
    expect(placeHoursTrust(stale.open_status).basis).toMatch(/hours on file/i);
  });

  it("never turns a stale schedule into an open, closed, or likely claim", () => {
    const stale = decoratePlace(
      kTown,
      undefined,
      new Date(Date.parse(verifiedAt!) + (HOURS_MAX_AGE_DAYS + 1) * DAY_MS),
    );

    // The freshness policy is unchanged: the schedule itself is still withheld.
    expect(stale.hours).toBeUndefined();
    expect(stale.hours_verified).toBe(false);
    expect(stale.google_hours).toBeUndefined();
    expect(isOpenNow(stale.open_status)).toBe(false);
    // "unknown" still routes through the same likely-open gate as before, so the
    // stale reason adds wording and nothing else.
    expect(mayUseLikelyOpenFallback(stale.open_status)).toBe(true);
    expect(placeHoursTrust(stale.open_status).level).toBe("unconfirmed");
  });

  it("treats a curated schedule that was never verified as on file, not missing", () => {
    const curated = decoratePlace(
      syntheticPlace({
        hours: { mon: [{ open: "09:00", close: "17:00" }] },
        hours_verified: false,
      }),
    );

    expect(curated.hours).toBeUndefined();
    expect(formatHoursLine(curated.open_status)).toBe("Hours not confirmed");
  });

  it("keeps 'Hours not posted' for a place that never had a schedule", () => {
    const none = decoratePlace(syntheticPlace({}));

    expect(none.open_status).toEqual({ state: "unknown" });
    expect(formatHoursLine(none.open_status)).toBe("Hours not posted");
    expect(placeHoursTrust(none.open_status).basis).toBe(
      "No posted hours. Call ahead to confirm.",
    );
  });

  it("carries the stale reason onto the place page record", () => {
    const page = getPlaceBySlug(
      "k-town-takeout",
      undefined,
      new Date(Date.parse(verifiedAt!) + (HOURS_MAX_AGE_DAYS + 1) * DAY_MS),
    );

    expect(page).not.toBeNull();
    expect(formatHoursLine(page!.open_status)).toBe("Hours not confirmed");
  });
});
