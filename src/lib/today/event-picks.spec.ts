import { describe, it, expect } from "vitest";
import type { EventWithMeta } from "@/lib/loaders/events";
import {
  seriesFingerprint,
  crossSourceFingerprint,
  isSeniorRoutineProgram,
  dedupeCrossSource,
  isOnlineEvent,
  isFreeEvent,
  isFamilyEvent,
  isTonightEvent,
  isDaytimeEvent,
  pickBestThree,
  pickTonightEvents,
} from "./event-picks";

function event(overrides: Partial<EventWithMeta> = {}): EventWithMeta {
  return {
    slug: "test-event",
    title: "Test Event",
    starts_at: "2026-10-06T14:00:00Z", // 10 AM Eastern
    venue_name: "Test Venue",
    municipality_name: "Frederick",
    category: "music",
    is_verified: true,
    source: "radius-curated",
    ...overrides,
  } as EventWithMeta;
}

describe("seriesFingerprint", () => {
  it("normalizes title and includes start hour", () => {
    const e = event({ title: "Game Night @ Downtown", starts_at: "2026-10-06T23:00:00Z" }); // 7 PM Eastern
    const fp = seriesFingerprint(e);
    expect(fp).toContain("game night");
    expect(fp).toContain("|19"); // 7 PM = 19:00
  });

  it("strips location suffixes", () => {
    const e1 = event({ title: "Strength & Stretch @ Brunswick" });
    const e2 = event({ title: "Strength & Stretch @ Urbana" });
    expect(seriesFingerprint(e1)).toBe(seriesFingerprint(e2));
  });

  it("strips mode suffixes", () => {
    const e1 = event({ title: "Storytime (hybrid)" });
    const e2 = event({ title: "Storytime (2nd section)" });
    expect(seriesFingerprint(e1)).toBe(seriesFingerprint(e2));
  });
});

describe("crossSourceFingerprint", () => {
  it("dedupes same title and exact start time", () => {
    const e1 = event({ title: "Mortician AMA", starts_at: "2026-10-06T14:00:00Z", source: "dfp" });
    const e2 = event({ title: "Mortician AMA", starts_at: "2026-10-06T14:00:00Z", source: "cbartz" });
    expect(crossSourceFingerprint(e1)).toBe(crossSourceFingerprint(e2));
  });
});

describe("isSeniorRoutineProgram", () => {
  it("detects Game Time", () => {
    expect(isSeniorRoutineProgram(event({ title: "Game Time" }))).toBe(true);
    expect(isSeniorRoutineProgram(event({ title: "Game Time @ Urbana" }))).toBe(true);
  });

  it("detects Strength & Stretch", () => {
    expect(isSeniorRoutineProgram(event({ title: "Strength & Stretch" }))).toBe(true);
    expect(isSeniorRoutineProgram(event({ title: "Strength and Stretch (hybrid)" }))).toBe(true);
  });

  it("detects Mah Jong", () => {
    expect(isSeniorRoutineProgram(event({ title: "Mah Jong" }))).toBe(true);
    expect(isSeniorRoutineProgram(event({ title: "Mahjong" }))).toBe(true);
  });

  it("ignores non-routine events", () => {
    expect(isSeniorRoutineProgram(event({ title: "Concert" }))).toBe(false);
  });
});

describe("dedupeCrossSource", () => {
  it("keeps more trusted source", () => {
    const events = [
      event({ title: "Mortician AMA", starts_at: "2026-10-06T14:00:00Z", source: "dfp", slug: "ama-dfp" }),
      event({ title: "Mortician AMA", starts_at: "2026-10-06T14:00:00Z", source: "cbartz", slug: "ama-cbartz" }),
    ];
    const deduped = dedupeCrossSource(events);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].slug).toBe("ama-cbartz"); // cbartz more trusted than dfp
  });
});

describe("isOnlineEvent", () => {
  it("detects attendance_mode online", () => {
    expect(isOnlineEvent(event({ attendance_mode: "online" as any }))).toBe(true);
  });

  it("treats mixed as physical", () => {
    expect(isOnlineEvent(event({ attendance_mode: "mixed" as any }))).toBe(false);
  });

  it("detects Virtual in title", () => {
    expect(isOnlineEvent(event({ title: "Virtual Yoga" }))).toBe(true);
  });
});

describe("isFreeEvent", () => {
  it("only treats is_free:true as free", () => {
    expect(isFreeEvent(event({ is_free: true } as any))).toBe(true);
    expect(isFreeEvent(event({ is_free: false } as any))).toBe(false);
    expect(isFreeEvent(event({}))).toBe(false);
  });
});

describe("isFamilyEvent", () => {
  it("detects kids-* audience", () => {
    expect(isFamilyEvent({ ...event(), audience: "kids-preschool" } as any)).toBe(true);
  });

  it("detects keywords", () => {
    expect(isFamilyEvent(event({ title: "Storytime for kids" }))).toBe(true);
    expect(isFamilyEvent(event({ description: "Family friendly" } as any))).toBe(true);
  });
});

describe("isTonightEvent", () => {
  it("detects 5 PM or later", () => {
    expect(isTonightEvent(event({ starts_at: "2026-10-06T21:00:00Z" }))).toBe(true); // 5 PM
    expect(isTonightEvent(event({ starts_at: "2026-10-06T22:00:00Z" }))).toBe(true); // 6 PM
  });

  it("excludes before 5 PM", () => {
    expect(isTonightEvent(event({ starts_at: "2026-10-06T20:59:00Z" }))).toBe(false); // 4:59 PM
  });
  
  it("excludes all-day", () => {
    expect(isTonightEvent(event({ is_all_day: true, starts_at: "2026-10-06T21:00:00Z" }))).toBe(false);
  });
});

describe("isDaytimeEvent", () => {
  it("includes all-day", () => {
    expect(isDaytimeEvent(event({ is_all_day: true }))).toBe(true);
  });

  it("includes before 5 PM", () => {
    expect(isDaytimeEvent(event({ starts_at: "2026-10-06T14:00:00Z" }))).toBe(true); // 10 AM
  });

  it("excludes 5 PM or later", () => {
    expect(isDaytimeEvent(event({ starts_at: "2026-10-06T21:00:00Z" }))).toBe(false); // 5 PM
  });
});

describe("pickBestThree", () => {
  it("picks daytime, evening, and free", () => {
    const events = [
      event({ slug: "morning", starts_at: "2026-10-06T14:00:00Z" }), // 10 AM
      event({ slug: "evening", starts_at: "2026-10-06T23:00:00Z" }), // 7 PM
      event({ slug: "free", starts_at: "2026-10-06T18:00:00Z", is_free: true } as any), // 2 PM
    ];
    const now = new Date("2026-10-06T13:00:00Z"); // 9 AM Eastern
    const picks = pickBestThree(events, now);
    expect(picks).toHaveLength(3);
    expect(picks.map((p) => p.slug)).toContain("morning");
    expect(picks.map((p) => p.slug)).toContain("evening");
    expect(picks.map((p) => p.slug)).toContain("free");
  });

  it("shows only two when no free/family exists", () => {
    const events = [
      event({ slug: "morning", starts_at: "2026-10-06T14:00:00Z" }), // 10 AM
      event({ slug: "evening", starts_at: "2026-10-06T23:00:00Z" }), // 7 PM
    ];
    const now = new Date("2026-10-06T13:00:00Z");
    const picks = pickBestThree(events, now);
    expect(picks).toHaveLength(2);
  });

  it("excludes FCC source", () => {
    const events = [
      event({ slug: "good", starts_at: "2026-10-06T14:00:00Z" }),
      event({ slug: "fcc-bad", starts_at: "2026-10-06T15:00:00Z", source: "fcc" }),
    ];
    const now = new Date("2026-10-06T13:00:00Z");
    const picks = pickBestThree(events, now);
    expect(picks.map((p) => p.slug)).not.toContain("fcc-bad");
  });

  it("excludes senior routine programs", () => {
    const events = [
      event({ slug: "good", starts_at: "2026-10-06T14:00:00Z" }),
      event({ slug: "routine", title: "Game Time", starts_at: "2026-10-06T15:00:00Z" }),
    ];
    const now = new Date("2026-10-06T13:00:00Z");
    const picks = pickBestThree(events, now);
    expect(picks.map((p) => p.slug)).not.toContain("routine");
  });
});

describe("pickTonightEvents", () => {
  it("picks only 5 PM or later", () => {
    const events = [
      event({ slug: "early", starts_at: "2026-10-06T20:00:00Z" }), // 4 PM
      event({ slug: "on-time", starts_at: "2026-10-06T21:00:00Z" }), // 5 PM
      event({ slug: "late", starts_at: "2026-10-06T23:00:00Z" }), // 7 PM
    ];
    const now = new Date("2026-10-06T13:00:00Z");
    const tonight = pickTonightEvents(events, now);
    expect(tonight).toHaveLength(2);
    expect(tonight.map((e) => e.slug)).toContain("on-time");
    expect(tonight.map((e) => e.slug)).toContain("late");
    expect(tonight.map((e) => e.slug)).not.toContain("early");
  });

  it("dedupes series", () => {
    const events = [
      event({ slug: "trivia-1", title: "Trivia Night @ Downtown", starts_at: "2026-10-06T23:00:00Z" }),
      event({ slug: "trivia-2", title: "Trivia Night @ Urbana", starts_at: "2026-10-06T23:00:00Z" }),
    ];
    const now = new Date("2026-10-06T13:00:00Z");
    const tonight = pickTonightEvents(events, now);
    expect(tonight).toHaveLength(1);
  });
});
