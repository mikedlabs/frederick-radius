import { describe, it, expect } from "vitest";
import { eventTrust, placeHoursTrust, formatChecked, TRUST_COLOR } from "@/lib/trust";
import type { OpenStatus } from "@/lib/hours";
import type { Hours } from "@/data/places";

describe("eventTrust", () => {
  it("is_verified wins over any source", () => {
    const t = eventTrust({ source: "manual", is_verified: true });
    expect(t.level).toBe("verified");
    expect(t.label).toBe("Checked at source");
  });

  it("seed is curated/verified-level with editorial basis", () => {
    const t = eventTrust({ source: "seed", is_verified: false });
    expect(t.level).toBe("verified");
    expect(t.label).toBe("Radius reviewed");
    expect(t.basis).toMatch(/reviewed/);
  });

  it("partner feeds are 'verified' with a named source", () => {
    for (const s of ["dfp", "celebrate"] as const) {
      const t = eventTrust({ source: s, is_verified: false });
      expect(t.level).toBe("verified");
      expect(t.label).toBe("Publisher listing");
      expect(t.basis.length).toBeGreaterThan(0);
    }
    const gov = eventTrust({ source: "county", is_verified: false });
    expect(gov.level).toBe("verified");
    expect(gov.label).toBe("Government listing");
    expect(gov.basis.length).toBeGreaterThan(0);
  });

  it("live-aggregated (manual) is honestly 'likely/Live'", () => {
    const t = eventTrust({ source: "manual", is_verified: false });
    expect(t.level).toBe("likely");
    expect(t.label).toBe("Live");
  });
});

describe("placeHoursTrust", () => {
  const cases: [OpenStatus, string][] = [
    [{ state: "open", closesAt: "21:00", closingSoon: false }, "verified"],
    [{ state: "closing-soon", closesAt: "21:00" }, "verified"],
    [{ state: "closed" }, "verified"],
    [{ state: "unverified" }, "likely"],
    [{ state: "unknown" }, "unconfirmed"],
  ];
  it("maps every OpenStatus state to the right trust level", () => {
    for (const [status, level] of cases) {
      expect(placeHoursTrust(status).level).toBe(level);
    }
  });
  it("never claims verified hours without a confirmed source", () => {
    expect(placeHoursTrust({ state: "unverified" }).basis).toMatch(/not yet confirmed/i);
    expect(placeHoursTrust({ state: "unknown" }).basis).toMatch(/call ahead/i);
  });
  it("separates a current checked schedule from the unknown venue opening state", () => {
    const hours: Hours = { fri: [{ open: "16:00", close: "21:00" }], _official: {
      slug: "demonstration-kitchen", kind: "merchant", source_url: "https://example.org/",
      observed_at: "2026-10-23T11:00:00Z", expires_at: "2026-10-30T11:00:00Z",
      coverage_from: "2026-10-23", coverage_through: "2026-10-29", exceptions: [],
      qualification: { scope: "kitchen", label: "Kitchen hours", note: "Bar hours may differ.", usage: "display_only" },
    } };
    const now = new Date("2026-10-23T16:00:00Z");
    expect(placeHoursTrust({ state: "unknown" }, { hours, verified: true, now })).toMatchObject({
      level: "verified", label: "Checked at source", basis: expect.stringContaining("does not confirm whether the venue is open"),
    });
    expect(placeHoursTrust({ state: "unknown" }, { hours, verified: false, now }).level).toBe("unconfirmed");
    const expired = placeHoursTrust({ state: "unknown" }, { hours, verified: true, now: new Date("2026-10-30T16:00:00Z") });
    expect(expired).toMatchObject({ level: "unconfirmed", label: "Needs a new check" });
    expect(expired.basis).not.toContain("No posted hours");
  });
});

describe("formatChecked", () => {
  const NOW = Date.UTC(2026, 4, 16, 12, 0, 0);
  const iso = (ms: number) => new Date(NOW - ms).toISOString();

  it("returns null for missing or unparseable input (no guessing)", () => {
    expect(formatChecked(undefined, NOW)).toBeNull();
    expect(formatChecked("not-a-date", NOW)).toBeNull();
  });

  it("buckets recent times in plain language", () => {
    expect(formatChecked(iso(30_000), NOW)).toBe("Updated just now");
    expect(formatChecked(iso(15 * 60_000), NOW)).toBe("Updated 15 min ago");
    expect(formatChecked(iso(3 * 3_600_000), NOW)).toBe("Updated 3 hours ago");
    expect(formatChecked(iso(1 * 3_600_000), NOW)).toBe("Updated 1 hour ago");
    expect(formatChecked(iso(26 * 3_600_000), NOW)).toBe("Updated yesterday");
    expect(formatChecked(iso(4 * 86_400_000), NOW)).toBe("Updated 4 days ago");
  });

  it("falls back to an absolute date past a week", () => {
    expect(formatChecked(iso(40 * 86_400_000), NOW)).toMatch(/Updated on \w+ \d+/);
  });

  it("a future timestamp degrades gracefully", () => {
    expect(formatChecked(new Date(NOW + 5_000).toISOString(), NOW)).toBe("Updated just now");
  });
});

describe("TRUST_COLOR", () => {
  it("maps every level to a brand token", () => {
    expect(TRUST_COLOR.verified).toContain("--app-positive");
    expect(TRUST_COLOR.likely).toContain("--app-ink-3");
    expect(TRUST_COLOR.unconfirmed).toContain("--app-ink-3");
  });
});
