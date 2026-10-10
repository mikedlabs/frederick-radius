import { describe, expect, it } from "vitest";
import { normalizeEventTimestamp } from "./eventTimestamp";

describe("normalizeEventTimestamp", () => {
  it("rewrites fcpl-style Postgres text with a short +00 offset", () => {
    expect(normalizeEventTimestamp("2026-10-11 18:00:00+00")).toBe(
      "2026-10-11T18:00:00.000Z",
    );
  });

  it("rewrites a space separator with an explicit +00:00 offset", () => {
    expect(normalizeEventTimestamp("2026-10-11 18:00:00+00:00")).toBe(
      "2026-10-11T18:00:00.000Z",
    );
  });

  it("keeps fractional seconds", () => {
    expect(normalizeEventTimestamp("2026-10-11 18:00:00.123+00")).toBe(
      "2026-10-11T18:00:00.123Z",
    );
  });

  it("passes ISO through as canonical UTC", () => {
    expect(normalizeEventTimestamp("2026-10-11T18:00:00.000Z")).toBe(
      "2026-10-11T18:00:00.000Z",
    );
    expect(normalizeEventTimestamp("2026-10-11T18:00:00Z")).toBe(
      "2026-10-11T18:00:00.000Z",
    );
    expect(normalizeEventTimestamp("2026-10-11T14:00:00-04:00")).toBe(
      "2026-10-11T18:00:00.000Z",
    );
  });

  it("leaves null and date-only values alone", () => {
    expect(normalizeEventTimestamp(null)).toBeNull();
    expect(normalizeEventTimestamp(undefined)).toBeUndefined();
    expect(normalizeEventTimestamp("2026-10-11")).toBe("2026-10-11");
  });

  it("does not shift the instant", () => {
    const raw = "2026-10-11 18:00:00+00";
    const iso = normalizeEventTimestamp(raw);
    expect(iso).toBe("2026-10-11T18:00:00.000Z");
    expect(Date.parse(iso as string)).toBe(
      Date.parse("2026-10-11T18:00:00.000Z"),
    );
    expect(Date.parse(iso as string)).toBe(
      Date.parse("2026-10-11T18:00:00+00:00"),
    );
  });
});
