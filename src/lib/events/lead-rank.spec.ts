import { describe, it, expect } from "vitest";
import {
  isRoutineProgram,
  eventLeadTier,
  eventProminence,
  compareForLead,
  hasMarqueeTitle,
  pickLeadEvent,
} from "./lead-rank";
import type { EventWithMeta } from "@/lib/loaders/events";

// Minimal stand-ins — the ranker only reads title, hero_image, category, starts_at.
function ev(p: Partial<EventWithMeta>): EventWithMeta {
  return { title: "", starts_at: "2026-06-20T18:00:00Z", category: "community", ...p } as EventWithMeta;
}

describe("isRoutineProgram", () => {
  it("flags standing programs, not draws", () => {
    expect(isRoutineProgram({ title: "Family Storytime" })).toBe(true);
    expect(isRoutineProgram({ title: "Toddler Time" })).toBe(true);
    expect(isRoutineProgram({ title: "Beginner Yoga" })).toBe(true);
    expect(isRoutineProgram({ title: "Tech Help Drop-in" })).toBe(true);
    // The standing library/office-hours programs the July /today audit caught
    // riding the photo rail (and one headlining the live strip).
    expect(isRoutineProgram({ title: "DCFS Family Support Specialist" })).toBe(true);
    expect(isRoutineProgram({ title: "Build and Play" })).toBe(true);
    expect(isRoutineProgram({ title: "School Skills" })).toBe(true);
    expect(isRoutineProgram({ title: "ESL Conversation Classes" })).toBe(true);
    // Real draws are NOT routine.
    expect(isRoutineProgram({ title: "Thurmont Firemen's Carnival" })).toBe(false);
    expect(isRoutineProgram({ title: "Vigilant Hose Co Friday Bingo" })).toBe(false);
    expect(isRoutineProgram({ title: "Alive @ Five" })).toBe(false);
  });
});

describe("eventLeadTier", () => {
  it("orders draw < routine program < utility (imagery is a within-tier tiebreak, not a tier)", () => {
    expect(eventLeadTier(ev({ title: "Firemen's Carnival" }))).toBe(0);
    expect(eventLeadTier(ev({ title: "Concert", hero_image: "x.jpg" }))).toBe(0);
    expect(eventLeadTier(ev({ title: "Family Storytime" }))).toBe(1);
    expect(eventLeadTier(ev({ title: "Embroidery Guild" }))).toBe(1);
    expect(eventLeadTier(ev({ title: "City Council Meeting" }))).toBe(2);
  });

  it("demotes a series that meets again within 14 days to the routine tier", () => {
    expect(eventLeadTier(ev({ title: "Game Night" }))).toBe(0);
    expect(eventLeadTier({ ...ev({ title: "Game Night" }), frequent_series: true })).toBe(1);
    // A frequent civic series stays utility, never promoted by the stamp.
    expect(eventLeadTier({ ...ev({ title: "City Council Meeting" }), frequent_series: true })).toBe(2);
  });

  it("does NOT let a venue-thumb storytime outrank a real draw", () => {
    // withVenueThumbs gives most events a hero_image; the routine demotion must
    // still win over a thumbnail.
    const storytime = ev({ title: "Family Storytime", hero_image: "thumb.jpg", starts_at: "2026-06-20T14:00:00Z" });
    const carnival = ev({ title: "Firemen's Carnival", starts_at: "2026-06-20T23:00:00Z" });
    expect([storytime, carnival].sort(compareForLead)[0]).toBe(carnival);
  });
});

describe("eventProminence", () => {
  it("scores the browse payload's has_tickets flag like a ticket link", () => {
    const linked = ev({ category: "theater", ticket_url: "https://tickets.example.com" });
    const flagged = { ...ev({ category: "theater" }), has_tickets: true };
    expect(eventProminence(flagged)).toBe(eventProminence(linked));
    expect(eventProminence(flagged)).toBe(eventProminence(ev({ category: "theater" })) + 3);
  });

  it("runs the marquee test on the title as well as the category, counting it once", () => {
    // "72 Film Fest" arrived filed under community; the title says it is a draw.
    expect(eventProminence(ev({ title: "72 Film Fest 2026 - Friday", category: "community" }))).toBe(2);
    expect(eventProminence(ev({ title: "Fall Fest at Everedy Square", category: "family" }))).toBe(2);
    expect(eventProminence(ev({ title: "Great Frederick Fair", category: "community" }))).toBe(2);
    expect(eventProminence(ev({ title: "Holiday Concert", category: "community" }))).toBe(2);
    expect(eventProminence(ev({ title: "Comedy Night", category: "community" }))).toBe(2);
    // Category and title both marquee: still +2, not +4.
    expect(eventProminence(ev({ title: "Jazz Festival", category: "music" }))).toBe(2);
  });

  it("does not read instruction or recruiting events as marquee titles", () => {
    for (const title of [
      "Standup Comedy Class",
      "Internship Fair",
      "Education Transfer Fair",
      "Public Safety Career and College Fair",
      "Fair Housing Workshop",
      "Manifest Your Goals",
      "Concert Band Camp",
    ]) {
      expect(hasMarqueeTitle({ title }), title).toBe(false);
      expect(eventProminence(ev({ title, category: "community" })), title).toBe(0);
    }
    for (const title of ["Catoctin Colorfest", "Oktoberfest", "Frederick Fiberfest", "County Fair"]) {
      expect(hasMarqueeTitle({ title }), title).toBe(true);
    }
  });

  it("gives a hand-curated row +2", () => {
    const base = { title: "Harvest Supper", category: "community" };
    expect(eventProminence(ev({ ...base, source: "manual" }))).toBe(2);
    expect(eventProminence(ev({ ...base, source: "seed" }))).toBe(2);
    expect(eventProminence(ev({ ...base, source: "dfp" }))).toBe(0);
    expect(eventProminence(ev(base))).toBe(0);
  });

  it("does not treat unknown admission as paid prominence", () => {
    expect(eventProminence(ev({
      category: "community",
      is_free: false,
      price_text: undefined,
      ticket_url: undefined,
    }))).toBe(0);
    expect(eventProminence(ev({
      category: "community",
      is_free: false,
      price_text: "$10",
      ticket_url: undefined,
    }))).toBe(1);
  });
});

describe("compareForLead + pickLeadEvent", () => {
  it("floats a carnival above a 10am storytime", () => {
    const storytime = ev({ title: "Family Storytime", starts_at: "2026-06-20T14:00:00Z" });
    const carnival = ev({ title: "Firemen's Carnival", starts_at: "2026-06-20T23:00:00Z" });
    const sorted = [storytime, carnival].sort(compareForLead);
    expect(sorted[0]).toBe(carnival);
  });

  it("a photo-led event still leads everything", () => {
    const carnival = ev({ title: "Carnival", starts_at: "2026-06-20T18:00:00Z" });
    const photo = ev({ title: "Sky Stage Show", hero_image: "p.jpg", starts_at: "2026-06-20T23:00:00Z" });
    expect(pickLeadEvent([carnival, photo])).toBe(photo);
  });

  it("soonest-first within a tier", () => {
    const later = ev({ title: "Market", starts_at: "2026-06-20T22:00:00Z" });
    const sooner = ev({ title: "Festival", starts_at: "2026-06-20T15:00:00Z" });
    expect([later, sooner].sort(compareForLead)[0]).toBe(sooner);
  });

  it("pickLeadEvent returns null on empty", () => {
    expect(pickLeadEvent([])).toBeNull();
  });

  it("the bigger draw leads over a small library program, even if it starts later", () => {
    // The July report: a photo-backed library talk headlined /today ahead of
    // the night's real event. Prominence (ticketed + music, and NOT in a
    // library room) now leads within the draw tier.
    const libraryTalk = ev({
      title: "Author Talk",
      category: "community",
      hero_image: "lib.jpg",
      venue_name: "Thurmont Regional Library",
      is_free: true,
      starts_at: "2026-06-20T18:00:00Z",
    });
    const concert = ev({
      title: "Summer Concert",
      category: "music",
      // No hero image on purpose: prominence must beat the library talk's photo.
      venue_name: "Sky Stage",
      ticket_url: "https://tickets.example.com/show",
      is_free: false,
      starts_at: "2026-06-20T23:00:00Z",
    });
    expect([libraryTalk, concert].sort(compareForLead)[0]).toBe(concert);
    expect(pickLeadEvent([libraryTalk, concert])).toBe(concert);
  });

  it("a curated one-off weekend draw beats a weekly Game Night (2026-10 UI audit)", () => {
    // The audit: Catoctin Colorfest (a curated row filed under "arts") and
    // David Sedaris sat behind Show more while a weekly Game Night led.
    const gameNight = {
      ...ev({ title: "Game Night", category: "community", venue_name: "Frederick Social", starts_at: "2026-10-09T20:00:00Z" }),
      frequent_series: true,
    };
    const colorfest = ev({
      title: "Catoctin Colorfest",
      category: "arts",
      source: "manual",
      venue_name: "Thurmont Community Park",
      starts_at: "2026-10-10T13:00:00Z",
    });
    const sedaris = {
      ...ev({ title: "David Sedaris", category: "theater", venue_name: "Weinberg Center for the Arts", starts_at: "2026-10-11T00:00:00Z" }),
      has_tickets: true,
    };
    const ranked = [gameNight, colorfest, sedaris].sort(compareForLead);
    expect(ranked.map((e) => e.title)).toEqual(["David Sedaris", "Catoctin Colorfest", "Game Night"]);
  });

  it("an owner-featured slug beats the heuristic (UX-05)", () => {
    const storytime = ev({ title: "Family Storytime", starts_at: "2026-06-20T14:00:00Z", slug: "storytime" });
    const photo = ev({ title: "Sky Stage Show", hero_image: "p.jpg", starts_at: "2026-06-20T23:00:00Z", slug: "sky-stage" });
    // The heuristic would pick the photo draw; the editorial set overrides.
    expect(pickLeadEvent([storytime, photo], new Set(["storytime"]))).toBe(storytime);
    // A featured slug that isn't in this pool changes nothing.
    expect(pickLeadEvent([storytime, photo], new Set(["elsewhere"]))).toBe(photo);
    // An empty set is the everyday no-editorial case.
    expect(pickLeadEvent([storytime, photo], new Set())).toBe(photo);
  });
});
