/**
 * normalizeStatsApiSchedule: the parse boundary for the keyless MLB Stats API
 * Frederick Keys schedule. Asserts the honest choices — home games only (a
 * Frederick field guide skips away games), real first-pitch times, the stadium
 * coordinate with placement:"geocoded" (a real distance), status mapping — and
 * the load-bearing dedupe contract: a Keys row's clean slug must equal the
 * equivalent Ticketmaster row's, so the unified assembly collapses them to one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeStatsApiSchedule } from "@/lib/integrations/frederickKeys";
import { liveToCardEvent, liveCleanSlug } from "@/lib/loaders/liveEvents";
import { stampEventProvenance } from "@/lib/provenance";
import type { LiveEvent } from "@/lib/integrations/ical-live";

const schedule = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/statsapi-keys-schedule.json", import.meta.url)), "utf8"),
);

describe("normalizeStatsApiSchedule", () => {
  it("keeps Keys home games only, with stadium geo and real times", () => {
    const out = normalizeStatsApiSchedule(schedule);
    // Fixture has 2 home games + 1 away game (Keys @ Brooklyn) -> away dropped.
    expect(out).toHaveLength(2);
    const g = out[0];
    expect(g.id).toBe("keys-800001");
    expect(g.title).toBe("Frederick Keys vs. Hudson Valley Renegades");
    expect(g.source).toBe("frederick-keys");
    expect(g.category).toBe("sports");
    expect(g.municipality).toBe("frederick");
    expect(g.venue_name).toBe("Nymeo Field at Harry Grove Stadium");
    expect(g.placement).toBe("geocoded");
    expect(g.starts_at).toBe("2026-07-01T23:00:00.000Z"); // real first pitch, not a noon anchor
    expect(g.geom).toEqual({ lng: -77.4179, lat: 39.408 });
  });

  it("maps a postponed game's status", () => {
    const postponed = normalizeStatsApiSchedule(schedule).find((g) => g.id === "keys-800002");
    expect(postponed?.status).toBe("postponed");
  });

  it("a home game resolves to exact_address (a real distance) via placement", () => {
    const g = normalizeStatsApiSchedule(schedule)[0];
    expect(liveToCardEvent(g).geo_confidence).toBe("exact_address");
  });

  it("returns [] for malformed input, never throws", () => {
    expect(normalizeStatsApiSchedule(null)).toEqual([]);
    expect(normalizeStatsApiSchedule({})).toEqual([]);
    expect(normalizeStatsApiSchedule({ dates: "nope" })).toEqual([]);
  });

  it("stamps at the verified tier (statsapi is authoritative)", () => {
    expect(stampEventProvenance({ slug: "x", source: "frederick-keys" }).confidence).toBe("verified");
  });

  it("DEDUPE CONTRACT: a Keys row's clean slug equals the Ticketmaster row's for the same game/day", () => {
    const keys = normalizeStatsApiSchedule(schedule)[0]; // 2026-07-01 home vs Hudson Valley
    // A Ticketmaster row for the same game: same title form, same Eastern day.
    const tm: LiveEvent = {
      ...keys,
      id: "tm-xyz",
      source: "ticketmaster",
      source_label: "Ticketmaster",
      starts_at: "2026-07-01T23:05:00.000Z", // a few minutes off, same ET day
    };
    expect(liveCleanSlug(keys)).toBe(liveCleanSlug(tm));
  });
});
