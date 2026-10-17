import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventWithMeta } from "./events";

const mocks = vi.hoisted(() => ({
  getSql: vi.fn(),
  upgradeEventGeoms: vi.fn(),
  withVenueThumbs: vi.fn(),
  applyEventNotices: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/db/client", () => ({
  getSql: mocks.getSql,
}));

vi.mock("@/lib/integrations/mapboxGeocode", () => ({
  upgradeEventGeoms: mocks.upgradeEventGeoms,
}));

vi.mock("@/lib/loaders/eventThumb", () => ({
  withVenueThumbs: mocks.withVenueThumbs,
}));

vi.mock("@/lib/events/notices", () => ({
  applyEventNotices: mocks.applyEventNotices,
}));

import { getIngestedSeries, toIsoUtcTimestamp } from "./ingested";
import { decorateUnifiedEvents } from "./unifiedEvents";

function sqlError(message: string, code?: string) {
  const error = new Error(message) as Error & { code?: string };
  if (code) error.code = code;
  return error;
}

function libraryRow(over: Record<string, unknown> = {}) {
  return {
    source_uid: "fcpl-1",
    source_domain: "fcvfra.com",
    source_url: "https://events.example/storytime",
    title: "Community Carnival",
    description: "A fire-company carnival.",
    starts_at_utc: "2026-10-22 14:30:00+00",
    ends_at_utc: "2026-10-22 15:30:00+00",
    all_day: false,
    venue_name: "C. Burr Artz Public Library",
    address: "110 E Patrick St, Frederick, MD 21701",
    lat: "39.4143",
    lng: "-77.4109",
    municipality: "frederick",
    category: "library",
    hero_image: null,
    hero_image_alt: null,
    updated_at: "2026-10-20T10:00:00.000Z",
    ...over,
  };
}

function respond(rows: ReturnType<typeof libraryRow>[]) {
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    void strings;
    void values;
    return rows;
  });
  mocks.getSql.mockReturnValue(sql);
  return sql;
}

function card(over: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "weinberg-show",
    title: "A posted concert",
    description: "A posted event.",
    starts_at: "2026-10-22T23:00:00.000Z",
    ends_at: "2026-10-23T01:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Weinberg Center",
    address: "20 W Patrick St, Frederick, MD 21701",
    geom: { lng: -77.4109, lat: 39.4143 },
    municipality: "frederick",
    category: "music",
    audience: [],
    is_free: false,
    source: "manual",
    is_verified: true,
    feature_score: 5,
    municipality_name: "Frederick",
    category_name: "music",
    geo_confidence: "venue_match",
    ...over,
  } as EventWithMeta;
}

describe("ingested reads fail loudly", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T16:00:00.000Z"));
    mocks.getSql.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rethrows a failed query after logging so an empty list is not cached", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sql = vi.fn(async () => {
      throw sqlError("terminating connection due to administrator command", "57P01");
    });
    mocks.getSql.mockReturnValue(sql);

    await expect(getIngestedSeries()).rejects.toThrow(
      "terminating connection due to administrator command",
    );
    expect(log).toHaveBeenCalledWith("[events] ingested read failed", "57P01");
  });

  it("keeps a successful empty result distinct from a failed read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    respond([]);

    await expect(getIngestedSeries()).resolves.toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it("returns an empty list when no database is configured, without logging a failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getSql.mockReturnValue(null);

    await expect(getIngestedSeries()).resolves.toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it("normalizes Postgres timestamptz text to UTC ISO at the series read", async () => {
    respond([libraryRow()]);

    const series = await getIngestedSeries();
    expect(series).toHaveLength(1);
    expect(series[0].nextStart).toBe("2026-10-22T14:30:00.000Z");
    expect(series[0].occurrences[0]).toMatchObject({
      startsAtUtc: "2026-10-22T14:30:00.000Z",
      endsAtUtc: "2026-10-22T15:30:00.000Z",
    });
    expect(series[0].nextStart.includes(" ")).toBe(false);
  });
});

describe("toIsoUtcTimestamp", () => {
  it("converts the Postgres space form and leaves ISO unchanged", () => {
    expect(toIsoUtcTimestamp("2026-10-22 14:30:00+00")).toBe(
      "2026-10-22T14:30:00.000Z",
    );
    expect(toIsoUtcTimestamp("2026-10-22T14:30:00.000Z")).toBe(
      "2026-10-22T14:30:00.000Z",
    );
  });
});

describe("unified event decorate failures", () => {
  const now = new Date("2026-10-20T16:00:00.000Z");

  beforeEach(() => {
    mocks.upgradeEventGeoms.mockReset();
    mocks.withVenueThumbs.mockReset();
    mocks.applyEventNotices.mockReset();
    mocks.upgradeEventGeoms.mockImplementation(async (events: EventWithMeta[]) => events);
    mocks.withVenueThumbs.mockImplementation((events: EventWithMeta[]) => events);
    mocks.applyEventNotices.mockImplementation((events: EventWithMeta[]) => events);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a map-positioning failure and keeps the pre-upgrade pins", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const events = [card()];
    mocks.upgradeEventGeoms.mockRejectedValue(new Error("mapbox timeout"));

    const unavailable = new Set<string>();
    const result = await decorateUnifiedEvents(events, now, {
      upgradeGeoms: true,
      unavailable,
    });

    expect(result).toEqual(events);
    expect(log).toHaveBeenCalledWith(
      "[events] event map positioning failed",
      expect.objectContaining({ message: "mapbox timeout" }),
    );
    expect(unavailable.size).toBe(0);
    expect(mocks.withVenueThumbs).toHaveBeenCalled();
    expect(mocks.applyEventNotices).toHaveBeenCalled();
  });

  it("logs a venue-thumbnail failure, flags sourceHealth, and still stamps notices", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const events = [card()];
    mocks.withVenueThumbs.mockImplementation(() => {
      throw new Error("photo join exploded");
    });

    const unavailable = new Set<string>();
    const result = await decorateUnifiedEvents(events, now, {
      upgradeGeoms: true,
      unavailable,
    });

    expect(result).toEqual(events);
    expect(unavailable).toEqual(new Set(["venue thumbs"]));
    expect(log).toHaveBeenCalledWith(
      "[events] venue thumbnails failed",
      expect.objectContaining({ message: "photo join exploded" }),
    );
    expect(mocks.applyEventNotices).toHaveBeenCalledWith(events, now);
  });

  it("logs a cancellation-badge failure, flags sourceHealth, and returns the undecorated cards", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const events = [card()];
    mocks.applyEventNotices.mockImplementation(() => {
      throw new Error("notices table missing");
    });

    const unavailable = new Set<string>();
    const result = await decorateUnifiedEvents(events, now, {
      upgradeGeoms: false,
      unavailable,
    });

    expect(result).toEqual(events);
    expect(unavailable).toEqual(new Set(["event notices"]));
    expect(log).toHaveBeenCalledWith(
      "[events] event cancellation badges failed",
      expect.objectContaining({ message: "notices table missing" }),
    );
    expect(mocks.upgradeEventGeoms).not.toHaveBeenCalled();
  });
});
