import { describe, expect, it } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import { selectTodayEvents } from "@/lib/today-events";
import { deriveTodayProgram } from "./event-program";

const now = new Date("2026-07-16T17:45:00.000Z");
function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "source-checked-concert", title: "Community concert", description: "A public concert.",
    starts_at: "2026-07-16T23:00:00.000Z", ends_at: "2026-07-17T01:00:00.000Z",
    timezone: "America/New_York", venue_name: "Baker Park", address: "121 N Bentz St, Frederick, MD",
    geom: { lng: -77.4201, lat: 39.4143 }, municipality: "frederick", category: "music", audience: [], is_free: true,
    source: "city-frederick", is_verified: false, source_id: "source-checked-concert",
    source_url: "https://www.cityoffrederickmd.gov/calendar/event-control", license: "Publisher facts",
    confidence: "verified", first_seen_at: "2026-07-14T15:00:00.000Z", last_verified_at: "2026-07-16T15:00:00.000Z",
    geo_confidence: "exact_address", category_name: "Music", municipality_name: "Frederick", ...overrides,
  };
}

const rejected: Array<{ label: string; patch: Partial<EventWithMeta> }> = [
  { label: "town-only destination", patch: { venue_name: "Frederick" } },
  { label: "off-campus placeholder", patch: { venue_name: "Off Campus" } },
  { label: "unresolved destination", patch: { venue_name: "" } },
  { label: "stale evidence", patch: { last_verified_at: "2026-07-15T17:44:59.000Z" } },
  { label: "missing check", patch: { last_verified_at: null } },
  { label: "future check", patch: { last_verified_at: "2026-07-16T17:51:00.000Z" } },
  { label: "no source page", patch: { source_url: null } },
  { label: "unreviewed provenance", patch: { confidence: "scraped" } },
  { label: "routine program", patch: { title: "Library storytime" } },
  { label: "cancelled event", patch: { status: "cancelled" } },
  { label: "postponed event", patch: { status: "postponed" } },
  { label: "ended event", patch: { starts_at: "2026-07-16T14:00:00.000Z", ends_at: "2026-07-16T15:00:00.000Z" } },
  { label: "all-day nighttime fiction", patch: { title: "Thursday Night Bingo", is_all_day: true, starts_at: "2026-07-16T04:00:00.000Z", ends_at: "2026-07-17T03:59:00.000Z" } },
  { label: "online feed without event action", patch: { attendance_mode: "online", venue_name: "Online", source_url: "https://example.test/calendar.ics", ticket_url: undefined } },
];

describe("Today server and recovery prime eligibility", () => {
  it.each(rejected)("both reject $label from prime selection", ({ patch }) => {
    const control = event();
    const decoy = event({ title: "Decoy community concert", ticket_url: "https://example.test/tickets/decoy", ...patch, slug: "decoy" });
    const pool = Object.freeze([Object.freeze(decoy), Object.freeze(control)]);
    const before = JSON.stringify(pool);
    expect(deriveTodayProgram(pool, now).feature?.slug).toBe(control.slug);
    expect(selectTodayEvents(pool, now).map(row => row.slug)).toEqual([control.slug]);
    expect(JSON.stringify(pool)).toBe(before);
  });

  it.each(["area", "unknown"] as const)("keeps a specific named venue with %s coordinates without a proximity claim", geo_confidence => {
    const row = event({ geo_confidence });
    expect(deriveTodayProgram([row], now).feature?.slug).toBe(row.slug);
    expect(selectTodayEvents([row], now)[0]).toMatchObject({ slug: row.slug, venue: "Baker Park" });
  });

  it("keeps a fresh public church event without a Radius verification claim", () => {
    const row = event({ source: "elc", venue_name: "Evangelical Lutheran Church", title: "Community choir concert", is_verified: false });
    expect(deriveTodayProgram([row], now).feature?.slug).toBe(row.slug);
    expect(selectTodayEvents([row], now)[0]?.slug).toBe(row.slug);
    expect(row.is_verified).toBe(false);
  });

  it("keeps an actionable online event with no physical venue", () => {
    const row = event({ attendance_mode: "online", venue_name: "", online_url: "https://example.test/join/community-conversation" });
    expect(deriveTodayProgram([row], now).feature?.slug).toBe(row.slug);
    expect(selectTodayEvents([row], now)[0]).toMatchObject({ slug: row.slug, venue: "Online" });
  });

  it("keeps a live named-venue event eligible", () => {
    const row = event({ starts_at: "2026-07-16T17:00:00.000Z", ends_at: "2026-07-16T18:30:00.000Z" });
    expect(deriveTodayProgram([row], now).feature?.slug).toBe(row.slug);
    expect(selectTodayEvents([row], now)[0]?.moment).toBe("Now");
  });

  it("retains non-prime public rows quietly and preserves the complete source pool", () => {
    const prime = event();
    const stale = event({ slug: "stale-concert", title: "An earlier checked concert", last_verified_at: "2026-07-14T12:00:00.000Z" });
    const routine = event({ slug: "storytime", title: "Library storytime" });
    const earlier = event({ slug: "earlier-concert", title: "An earlier finished concert", starts_at: "2026-07-16T14:00:00.000Z", ends_at: "2026-07-16T15:00:00.000Z" });
    const unresolved = event({ slug: "unresolved-concert", title: "An off-campus film screening", venue_name: "Off Campus" });
    const pool = Object.freeze([prime, stale, routine, earlier, unresolved].map(row => Object.freeze(row)));
    const before = JSON.stringify(pool);
    const program = deriveTodayProgram(pool, now);
    expect(program.feature?.slug).toBe(prime.slug);
    expect(program.upcomingRest).toEqual([]);
    expect(program.remainingAlsoToday.map(row => row.slug)).toEqual([stale.slug, routine.slug, unresolved.slug]);
    expect(program.remainingEarlierToday.map(row => row.slug)).toEqual([earlier.slug]);
    const quiet = deriveTodayProgram([stale, routine, unresolved], now);
    expect(quiet.feature).toBeNull();
    expect(quiet.remainingAlsoToday).toHaveLength(3);
    expect(selectTodayEvents([stale, routine, unresolved], now)).toEqual([]);
    expect(JSON.stringify(pool)).toBe(before);
  });
});
