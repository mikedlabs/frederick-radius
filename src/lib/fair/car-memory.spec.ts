import { describe, expect, it } from "vitest";

import {
  FAIR_CAR_STORAGE_KEY,
  FAIR_CAR_TTL_MS,
  cardinalDirectionToCar,
  clearSavedFairCar,
  createSavedFairCar,
  fairCarGpsQuality,
  parseSavedFairCar,
  readSavedFairCar,
  straightLineDistanceMeters,
  writeSavedFairCar,
} from "./car-memory";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("device-only Fair car memory", () => {
  it("expires the precise return point after 18 hours", () => {
    const now = new Date("2026-09-20T16:00:00Z");
    const saved = createSavedFairCar(
      {
        lotId: "lot-d",
        lotLabel: "Lot D",
        note: "Blue row, by the light pole",
        latitude: 39.4105,
        longitude: -77.3865,
        accuracyMeters: 18,
      },
      now,
    );

    expect(Date.parse(saved.expiresAt) - now.getTime()).toBe(FAIR_CAR_TTL_MS);
    expect(parseSavedFairCar(JSON.stringify(saved), now)).toEqual(saved);
    expect(
      parseSavedFairCar(
        JSON.stringify(saved),
        new Date(now.getTime() + FAIR_CAR_TTL_MS),
      ),
    ).toBeNull();
  });

  it("supports a lot-and-note fallback without pretending GPS exists", () => {
    const saved = createSavedFairCar(
      { lotId: "lot-a", lotLabel: "Lot A", note: "Near Franklin Street" },
      new Date("2026-09-20T16:00:00Z"),
    );
    expect(fairCarGpsQuality(saved)).toBe("unavailable");
  });

  it("warns when browser accuracy is worse than 100 metres", () => {
    const weak = createSavedFairCar(
      {
        lotId: "unsure",
        latitude: 39.41,
        longitude: -77.39,
        accuracyMeters: 145,
      },
      new Date("2026-09-20T16:00:00Z"),
    );
    expect(fairCarGpsQuality(weak)).toBe("weak");
  });

  it("keeps storage local and removes it explicitly", () => {
    const storage = memoryStorage();
    const now = new Date("2026-09-20T16:00:00Z");
    const saved = createSavedFairCar({ lotId: "lot-infield" }, now);

    expect(writeSavedFairCar(storage, saved)).toBe(true);
    expect(readSavedFairCar(storage, now)).toEqual(saved);
    clearSavedFairCar(storage);
    expect(storage.getItem(FAIR_CAR_STORAGE_KEY)).toBeNull();
  });

  it("computes return guidance locally", () => {
    const current = { latitude: 39.41, longitude: -77.39 };
    const car = { latitude: 39.411, longitude: -77.39 };
    expect(straightLineDistanceMeters(current, car)).toBeGreaterThan(100);
    expect(cardinalDirectionToCar(current, car)).toBe("N");
  });
});
