import { describe, it, expect } from "vitest";
import { isHappeningNow, buildActivities } from "@/lib/live-activity";

const NOW = new Date("2026-05-18T19:00:00Z");
const iso = (d: Date) => d.toISOString();
const plus = (ms: number) => new Date(NOW.getTime() + ms);
const H = 60 * 60 * 1000;

describe("isHappeningNow (now injected, pure)", () => {
  it("false for a future-dated event (the audit's bug)", () => {
    expect(isHappeningNow(iso(plus(60 * 24 * H)), iso(plus(60 * 24 * H + 2 * H)), NOW)).toBe(false);
  });
  it("true while the event window contains now", () => {
    expect(isHappeningNow(iso(plus(-H)), iso(plus(H)), NOW)).toBe(true);
  });
  it("false after the event has ended", () => {
    expect(isHappeningNow(iso(plus(-5 * H)), iso(plus(-2 * H)), NOW)).toBe(false);
  });
  it("fails closed when ends_at is missing", () => {
    expect(isHappeningNow(iso(plus(-2 * H)), undefined, NOW)).toBe(false);
    expect(isHappeningNow(iso(plus(-4 * H)), undefined, NOW)).toBe(false);
  });
  it("fails closed when ends_at is invalid or <= start", () => {
    expect(isHappeningNow(iso(plus(-H)), "not-a-date", NOW)).toBe(false);
    expect(isHappeningNow(iso(plus(-H)), iso(plus(-2 * H)), NOW)).toBe(false);
  });
  it("false for an unparseable start", () => {
    expect(isHappeningNow("garbage", iso(plus(H)), NOW)).toBe(false);
  });
});

describe("buildActivities — Live now is temporal", () => {
  const base = { slug: "x", title: "Show", venue_name: "The Venue" };

  it("does NOT emit Live now for a future-dated live event", () => {
    const out = buildActivities({
      liveEvents: [{ ...base, starts_at: iso(plus(90 * 24 * H)), ends_at: iso(plus(90 * 24 * H + 2 * H)) }],
      upcomingEvents: [],
      now: NOW,
    });
    expect(out.find((a) => a.kind === "live-event")).toBeUndefined();
  });

  it("emits Live now for an event happening now", () => {
    const out = buildActivities({
      liveEvents: [{ ...base, starts_at: iso(plus(-H)), ends_at: iso(plus(H)) }],
      upcomingEvents: [],
      now: NOW,
    });
    const live = out.find((a) => a.kind === "live-event");
    expect(live?.label).toBe("Live now");
  });

  it("does not let a time-less live-feed row make a live claim", () => {
    const out = buildActivities({
      liveEvents: [base],
      upcomingEvents: [],
      now: NOW,
    });
    expect(out.find((a) => a.kind === "live-event")).toBeUndefined();
  });
});
