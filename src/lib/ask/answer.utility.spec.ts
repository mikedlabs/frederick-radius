import { afterEach, describe, expect, it, vi } from "vitest";
import { clientPlaceBySlug } from "@/lib/loaders/places-client";
import { askFrederick } from "./answer";

const downtown = {
  origin: { lng: -77.4105, lat: 39.4143 },
  municipality: "frederick",
  contextLabel: "your location",
  canShowDistance: true,
} as const;

describe("Ask strict daily-utility place requests", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only confirmed-open pharmacy records for a live nearest query", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T15:00:00.000Z"));

    const result = await askFrederick(
      "What is the closest pharmacy open now?",
      downtown,
    );

    expect(result.status).toBe("matches");
    expect(result.usedModel).toBe(false);
    expect(result.sources[0]).toMatchObject({
      slug: "whitesell-pharmacy",
      category: "pharmacy",
    });
    expect(result.sources[0]?.status).toMatch(/^(?:Open|Closing soon)\b/);
    expect(result.sources[0]?.distance).toBeTruthy();
    expect(result.sources.every((source) => {
      const place = clientPlaceBySlug(source.slug);
      return place?.category === "pharmacy" || place?.primary_type === "pharmacy";
    })).toBe(true);
    expect(result.answer).toContain(
      "closest pharmacy Radius can confirm open now",
    );
    expect(result.answer).not.toMatch(/Cafe Nola|Madrones|laundromat/i);
  });

  it("ranks only gas-station records for a nearest gas query", async () => {
    const result = await askFrederick(
      "Where is the nearest gas station?",
      downtown,
    );

    expect(result.status).toBe("matches");
    expect(result.usedModel).toBe(false);
    expect(result.sources[0]?.name).toBe("BP 20");
    expect(result.sources[0]?.distance).toBeTruthy();
    expect(result.sources.every((source) => {
      const place = clientPlaceBySlug(source.slug);
      return place?.primary_type === "gas_station";
    })).toBe(true);
    expect(result.answer).toContain("nearest cataloged gas station");
    expect(result.answer).not.toMatch(/theater|massage|psychological/i);
  });

  it("returns an honest empty answer when Radius lacks ATM evidence", async () => {
    const result = await askFrederick(
      "Where is the nearest ATM?",
      downtown,
    );

    expect(result.status).toBe("empty");
    expect(result.usedModel).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain(
      "does not have an ATM record with enough category evidence",
    );
    expect(result.answer).toContain(
      "will not substitute a nearby bank or an unrelated place",
    );
    expect(result.actions).toContainEqual({
      label: "Search ATMs on the map",
      kind: "open",
      href: "/map?q=ATM",
    });
  });
});
