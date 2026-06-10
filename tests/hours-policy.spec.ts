import { describe, it, expect, afterEach } from "vitest";
import {
  isHoursFresh,
  mayAssertOpenState,
  HOURS_MAX_AGE_DAYS,
} from "@/lib/hours-freshness";

/**
 * Hours policy gate (data brief 4.3): open and closed states render only
 * from verified hours, and once enforcement is on, only from hours
 * verified inside the freshness window. The flag exists so the policy
 * can deploy ahead of the rolling refresh without blanking every open
 * state in the app; these tests pin both modes.
 */
const NOW = new Date("2026-06-10T12:00:00Z");

afterEach(() => {
  delete process.env.HOURS_FRESHNESS_ENFORCED;
});

describe("isHoursFresh", () => {
  it("accepts a timestamp inside the window", () => {
    expect(isHoursFresh("2026-06-08T12:00:00Z", NOW)).toBe(true);
  });

  it("accepts the exact window boundary", () => {
    const boundary = new Date(NOW.getTime() - HOURS_MAX_AGE_DAYS * 86400000).toISOString();
    expect(isHoursFresh(boundary, NOW)).toBe(true);
  });

  it("rejects a timestamp past the window", () => {
    expect(isHoursFresh("2026-06-01T11:59:00Z", NOW)).toBe(false);
  });

  it("rejects missing and unparseable timestamps; no benefit of the doubt", () => {
    expect(isHoursFresh(undefined, NOW)).toBe(false);
    expect(isHoursFresh("not-a-date", NOW)).toBe(false);
  });
});

describe("mayAssertOpenState", () => {
  it("never asserts without verified hours, in either mode", () => {
    expect(mayAssertOpenState(false, "2026-06-10T00:00:00Z", NOW)).toBe(false);
    process.env.HOURS_FRESHNESS_ENFORCED = "1";
    expect(mayAssertOpenState(false, "2026-06-10T00:00:00Z", NOW)).toBe(false);
  });

  it("flag off: verified hours assert regardless of age (current production behavior)", () => {
    expect(mayAssertOpenState(true, "2026-01-01T00:00:00Z", NOW)).toBe(true);
    expect(mayAssertOpenState(true, undefined, NOW)).toBe(true);
  });

  it("flag on: verified hours assert only inside the freshness window", () => {
    process.env.HOURS_FRESHNESS_ENFORCED = "1";
    expect(mayAssertOpenState(true, "2026-06-09T00:00:00Z", NOW)).toBe(true);
    expect(mayAssertOpenState(true, "2026-05-20T00:00:00Z", NOW)).toBe(false);
    expect(mayAssertOpenState(true, undefined, NOW)).toBe(false);
  });
});
