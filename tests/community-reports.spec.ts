/**
 * Community-report moderation + spam logic + taxonomy. Locks the Phase-1 rules:
 * trusted-instant / else-queue, per-category expiry, and the cheap spam screen.
 */
import { describe, it, expect } from "vitest";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_BY_KEY,
  isReportCategory,
  isValidSubtype,
} from "@/lib/reports/categories";
import {
  statusForSubmission,
  expiresAtFor,
  sanitizeText,
  textSpamConcern,
} from "@/lib/reports/logic";

describe("report taxonomy", () => {
  it("has the four locked Phase-1 categories", () => {
    expect(REPORT_CATEGORIES.map((c) => c.key).sort()).toEqual(["condition", "hazard", "note", "tip"]);
  });
  it("validates categories + subtypes", () => {
    expect(isReportCategory("hazard")).toBe(true);
    expect(isReportCategory("bogus")).toBe(false);
    expect(isValidSubtype("hazard", "pothole")).toBe(true);
    expect(isValidSubtype("hazard", "parking_full")).toBe(false); // wrong category
    expect(isValidSubtype("tip", undefined)).toBe(true); // tips have no subtype
    expect(isValidSubtype("condition", "")).toBe(true);
  });
  it("requires a photo only for hazards", () => {
    expect(REPORT_CATEGORY_BY_KEY.hazard.photoRequired).toBe(true);
    expect(REPORT_CATEGORY_BY_KEY.condition.photoRequired).toBe(false);
  });
});

describe("moderation status", () => {
  it("trusted publishes; others queue", () => {
    expect(statusForSubmission(true)).toBe("approved");
    expect(statusForSubmission(false)).toBe("pending");
  });
});

describe("expiry by category", () => {
  const now = new Date(Date.UTC(2026, 6, 1, 12, 0));
  it("conditions are short-lived; hazards persist", () => {
    const cond = expiresAtFor("condition", now).getTime() - now.getTime();
    const haz = expiresAtFor("hazard", now).getTime() - now.getTime();
    expect(cond).toBe(6 * 3_600_000);
    expect(haz).toBe(30 * 24 * 3_600_000);
    expect(cond).toBeLessThan(haz);
  });
});

describe("text sanitize + spam screen", () => {
  it("trims, collapses, clamps", () => {
    expect(sanitizeText("  hello   world  ", 100)).toBe("hello world");
    expect(sanitizeText("", 100)).toBeNull();
    expect(sanitizeText("x".repeat(50), 10)).toHaveLength(10);
    expect(sanitizeText(42, 10)).toBeNull();
  });
  it("flags links, shouting, and repetition; passes normal text", () => {
    expect(textSpamConcern("check http://spam.example")).toBe("link");
    expect(textSpamConcern("visit cheapdeals.shop now")).toBe("link");
    expect(textSpamConcern("BUY NOW CHEAP DEALS")).toBe("shouting");
    expect(textSpamConcern("whoaaaaaaa")).toBe("repetition");
    expect(textSpamConcern("Big pothole near the library entrance")).toBeNull();
    expect(textSpamConcern("OK")).toBeNull(); // short caps fine
    expect(textSpamConcern(null)).toBeNull();
  });
});
