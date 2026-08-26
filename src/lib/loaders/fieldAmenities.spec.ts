import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));

import {
  FIELD_AMENITIES_READ_DEADLINE_MS,
  getFieldAmenities,
} from "@/lib/loaders/fieldAmenities";

function databaseReturning(rows: unknown) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => rows),
      })),
    })),
  };
}

describe("getFieldAmenities", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("fails soft when the database is not configured", async () => {
    mocks.getDb.mockReturnValue(null);

    await expect(getFieldAmenities()).resolves.toEqual([]);
  });

  it("projects approved field rows into map amenities", async () => {
    mocks.getDb.mockReturnValue(
      databaseReturning(
        Promise.resolve([
          {
            id: "trash-1",
            kind: "trash",
            name: "Creekside trash can",
            detail: "Beside the bridge",
            note: "South rail",
            municipality: "frederick",
            lng: -77.4102,
            lat: 39.4143,
            photo_url: "https://example.com/trash.jpg",
            created_at: new Date("2026-08-13T14:30:00.000Z"),
          },
        ]),
      ),
    );

    await expect(getFieldAmenities()).resolves.toEqual([
      expect.objectContaining({
        id: "field:trash-1",
        kind: "trash",
        name: "Creekside trash can",
        detail: "South rail",
        photo: "https://example.com/trash.jpg",
        observedAt: "2026-08-13T14:30:00.000Z",
      }),
    ]);
  });

  it("derives a town slug from coordinates when an older field row has none", async () => {
    mocks.getDb.mockReturnValue(
      databaseReturning(
        Promise.resolve([
          {
            id: "bench-legacy",
            kind: "bench",
            name: null,
            detail: null,
            note: null,
            municipality: null,
            lng: -77.4102,
            lat: 39.4143,
            photo_url: null,
            created_at: new Date("2026-08-13T14:30:00.000Z"),
          },
        ]),
      ),
    );

    await expect(getFieldAmenities()).resolves.toEqual([
      expect.objectContaining({
        id: "field:bench-legacy",
        name: "Bench",
        municipality: "frederick",
      }),
    ]);
  });

  it("returns the static fallback deadline instead of holding the page open", async () => {
    vi.useFakeTimers();
    mocks.getDb.mockReturnValue(
      databaseReturning(new Promise<never>(() => undefined)),
    );

    const result = getFieldAmenities();
    await vi.advanceTimersByTimeAsync(FIELD_AMENITIES_READ_DEADLINE_MS);

    await expect(result).resolves.toEqual([]);
  });
});
