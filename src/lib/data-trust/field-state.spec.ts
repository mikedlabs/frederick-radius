import { describe, expect, it } from "vitest";
import {
  assessResolvedField,
  buildFieldObservationKey,
  normalizeEntityKind,
  normalizeFieldName,
  resolvedFieldFreshness,
} from "./field-state";

const NOW = "2026-08-11T16:00:00.000Z";

describe("field truth contract", () => {
  it("builds deterministic, delimiter-safe observation keys", () => {
    const input = {
      datasetVersionKey: "city-parks:2026-08-11",
      entityKind: "GIS_Feature",
      entityKey: "park|123",
      fieldName: "Amenities.Playground",
      contentHash: "a".repeat(64),
    };

    expect(buildFieldObservationKey(input)).toBe(
      "city-parks%3A2026-08-11|gis_feature|park%7C123|amenities.playground|" +
        "a".repeat(64),
    );
    expect(buildFieldObservationKey(input)).toBe(buildFieldObservationKey(input));
  });

  it("rejects malformed field paths and non-SHA-256 hashes", () => {
    expect(() => normalizeFieldName("hours[0]")).toThrow(/fieldName/);
    expect(() => normalizeEntityKind(`place-${"x".repeat(120)}`)).toThrow(
      /entityKind/,
    );
    expect(() =>
      buildFieldObservationKey({
        entityKind: "place",
        entityKey: "gravel-and-grind",
        fieldName: "hours",
        contentHash: "not-a-hash",
      }),
    ).toThrow(/SHA-256/);
  });

  it("derives current, aging, and stale from the validity window", () => {
    expect(
      resolvedFieldFreshness(
        {
          checkedAt: "2026-08-11T12:00:00.000Z",
          validUntil: "2026-08-12T12:00:00.000Z",
        },
        NOW,
      ),
    ).toBe("current");
    expect(
      resolvedFieldFreshness(
        {
          checkedAt: "2026-08-10T17:00:00.000Z",
          validUntil: "2026-08-11T17:00:00.000Z",
        },
        NOW,
      ),
    ).toBe("aging");
    expect(
      resolvedFieldFreshness(
        {
          checkedAt: "2026-08-10T12:00:00.000Z",
          validUntil: "2026-08-11T15:59:59.000Z",
        },
        NOW,
      ),
    ).toBe("stale");
  });

  it("never promotes unknown, disputed, or stale evidence to a usable fact", () => {
    const window = {
      resolvedValue: "open",
      confidence: 0.9,
      checkedAt: "2026-08-11T12:00:00.000Z",
      validUntil: "2026-08-12T12:00:00.000Z",
    };

    expect(
      assessResolvedField({ ...window, resolutionStatus: "unknown" }, NOW),
    ).toMatchObject({ state: "unknown", usable: false });
    expect(
      assessResolvedField({ ...window, resolutionStatus: "disputed" }, NOW),
    ).toMatchObject({ state: "disputed", usable: false });
    expect(
      assessResolvedField(
        {
          ...window,
          resolutionStatus: "known",
          validUntil: "2026-08-11T15:59:59.000Z",
        },
        NOW,
      ),
    ).toMatchObject({ state: "stale", usable: false });
  });

  it("accepts only bounded, structurally valid known values", () => {
    expect(
      assessResolvedField(
        {
          resolutionStatus: "known",
          resolvedValue: { monday: "8:00 AM-5:00 PM" },
          confidence: 0.95,
          checkedAt: "2026-08-11T12:00:00.000Z",
          validUntil: "2026-08-12T12:00:00.000Z",
        },
        NOW,
      ),
    ).toMatchObject({ state: "known_current", usable: true });

    expect(
      assessResolvedField(
        {
          resolutionStatus: "known",
          resolvedValue: null,
          confidence: 0.95,
          checkedAt: "2026-08-11T12:00:00.000Z",
          validUntil: "2026-08-12T12:00:00.000Z",
        },
        NOW,
      ),
    ).toMatchObject({ state: "invalid", usable: false });

    expect(
      assessResolvedField(
        {
          resolutionStatus: "known",
          resolvedValue: "open",
          confidence: 0,
          checkedAt: "2026-08-11T12:00:00.000Z",
          validUntil: "2026-08-12T12:00:00.000Z",
        },
        NOW,
      ),
    ).toMatchObject({ state: "invalid", usable: false });
  });

  it("rejects future-dated checks beyond the clock-skew allowance", () => {
    expect(
      resolvedFieldFreshness(
        {
          checkedAt: "2026-08-11T16:06:00.000Z",
          validUntil: "2026-08-12T16:06:00.000Z",
        },
        NOW,
      ),
    ).toBe("invalid");
  });
});
