import { describe, it, expect } from "vitest";
import { eventTrust, placeHoursTrust, formatChecked, TRUST_COLOR } from "@/lib/trust";
import type { OpenStatus } from "@/lib/hours";

describe("eventTrust", () => {
  it("a checked live-feed event reads 'Checked at source', never 'Verified'", () => {
    // "Verified" is reserved for owner-managed records; a checked live-feed
    // row is "Confirmed". The basis must not echo the label (the old rule
    // produced the duplicated "Verified · Verified by Frederick Radius").
    const t = eventTrust({ source: "manual", is_verified: true });
    expect(t.level).toBe("official");
    expect(t.label).toBe("Checked at source");
    expect(t.basis).toMatch(/Checked by Frederick Radius/);
  });

  it("a named partner source wins over is_verified (reads 'Official')", () => {
    // Alive @ Five (DFP) must read "Official", not "Verified".
    const t = eventTrust({ source: "dfp", is_verified: true });
    expect(t.level).toBe("official");
    expect(t.label).toBe("Official");
  });

  it("seed is reviewed/verified-level with editorial basis", () => {
    const t = eventTrust({ source: "seed", is_verified: false });
    expect(t.level).toBe("verified");
    // Editorial: "Hand-picked" lands warmer than "Curated" (which
    // reads as Pinterest-corporate). Basis is "Picked by Frederick
    // Radius" — first-person, local-paper voice.
    expect(t.label).toBe("Radius reviewed");
    expect(t.basis).toMatch(/reviewed by Frederick Radius/);
  });

  it("partner feeds are 'official' with a named source", () => {
    for (const s of ["dfp", "celebrate", "county"] as const) {
      const t = eventTrust({ source: s, is_verified: false });
      expect(t.level).toBe("official");
      expect(t.label).toBe("Official");
      expect(t.basis.length).toBeGreaterThan(0);
    }
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
    expect(TRUST_COLOR.official).toContain("--app-cool");
    // "likely" (Live feed / Likely-open) is calm provenance, not caution —
    // it rides the muted ink tone; amber is reserved for stale signals.
    expect(TRUST_COLOR.likely).toContain("--app-ink-3");
    expect(TRUST_COLOR.unconfirmed).toContain("--app-ink-3");
  });
});
