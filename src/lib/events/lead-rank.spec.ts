import { describe, it, expect } from "vitest";
import {
  isRoutineProgram,
  isPublisherProgram,
  eventLeadTier,
  eventProminence,
  compareForLead,
  compareRecommendationAttendance,
  compareForRecommendation,
  rankRecommendations,
  pickLeadEvent,
} from "./lead-rank";
import type { EventWithMeta } from "@/lib/loaders/events";
import { compareEventsForDecision } from "./decision-rank";

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

  it("does NOT let a venue-thumb storytime outrank a real draw", () => {
    // withVenueThumbs gives most events a hero_image; the routine demotion must
    // still win over a thumbnail.
    const storytime = ev({ title: "Family Storytime", hero_image: "thumb.jpg", starts_at: "2026-06-20T14:00:00Z" });
    const carnival = ev({ title: "Firemen's Carnival", starts_at: "2026-06-20T23:00:00Z" });
    expect([storytime, carnival].sort(compareForLead)[0]).toBe(carnival);
  });
});

// Titles, feed ids and links below are copied from the production board on
// Nov 9, 2026, when 774 of 975 listed events ranked as draws.
describe("isPublisherProgram", () => {
  it("treats a program publisher's ordinary rows as programs", () => {
    expect(isPublisherProgram({ source: "fcc", title: "On Campus Recruitment UMD, College Park Biocomputational Engineering" })).toBe(true);
    expect(isPublisherProgram({ source: "fcc", title: "Hood College: Instant Decision Day" })).toBe(true);
    expect(isPublisherProgram({ source: "mount-st-marys", title: "Club Tennis Practice" })).toBe(true);
    expect(isPublisherProgram({ source: "county", title: "Line Dance @ Urbana" })).toBe(true);
    expect(isPublisherProgram({ source: "city-frederick", title: "Cardio Sculpt" })).toBe(true);
    expect(isPublisherProgram({ source: "fcpl", title: "Meet-a-Book Monday (Ages 5-10)" })).toBe(true);
    expect(isPublisherProgram({ source: "msd", title: "Noon Dismissal for Students" })).toBe(true);
  });

  it("keeps the same publishers' outings as draws", () => {
    expect(isPublisherProgram({ source: "mount-st-marys", title: "Mount Men’s Basketball vs. Drexel" })).toBe(false);
    expect(isPublisherProgram({ source: "fcpl", title: "Celtic Harp Trio" })).toBe(false);
    expect(isPublisherProgram({ source: "fcpl", title: "Christmas in Thurmont: Holiday Sing-along" })).toBe(false);
    expect(isPublisherProgram({ source: "county", title: "Thurmont Community Ambulance Service-Gun Dinner" })).toBe(false);
    expect(isPublisherProgram({ source: "county", title: "FSK Post No. 11 Veterans Day Ceremony" })).toBe(false);
    expect(isPublisherProgram({ source: "fcc", title: "FCC Chamber Ensemble Recital" })).toBe(false);
    expect(isPublisherProgram({ source: "hood", title: "Hood String Ensemble, Fall 2026 Concert" })).toBe(false);
    expect(isPublisherProgram({ source: "elc", title: "Kris Kringle Parade" })).toBe(false);
  });

  it("does not let an outing word rescue a class, a rehearsal or an admissions errand", () => {
    expect(isPublisherProgram({ source: "city-frederick", title: "Musical Theatre Class" })).toBe(true);
    expect(isPublisherProgram({ source: "hood", title: "Concert Band Rehearsal" })).toBe(true);
    expect(isPublisherProgram({ source: "fcc", title: "Campus Tour" })).toBe(true);
    expect(isPublisherProgram({ source: "fcc", title: "Dual Enrollment Information Night" })).toBe(true);
  });

  it("treats both congregation calendars the same way", () => {
    expect(isPublisherProgram({ source: "elc", title: "Wednesday Evening Dinners" })).toBe(true);
    expect(isPublisherProgram({ source: "isf", title: "Community Potluck" })).toBe(true);
    expect(isPublisherProgram({ source: "elc", title: "Historic Houses of Worship Holiday Tour" })).toBe(false);
  });

  it("separates Delaplaine classes from exhibitions by the registrar's course link", () => {
    expect(isPublisherProgram({
      source: "delaplaine",
      title: "Pen and Ink",
      source_url: "https://delaplaine.org/event/27-2-dr06/",
    })).toBe(true);
    expect(isPublisherProgram({
      source: "delaplaine",
      title: "Advanced Ceramics Studio",
      source_url: "https://delaplaine.org/event/27-2-ce07/",
    })).toBe(true);
    expect(isPublisherProgram({
      source: "delaplaine",
      title: "Johan Lowie - Silent Witness",
      source_url: "https://delaplaine.org/event/johan-lowie-silent-witness/",
    })).toBe(false);
    expect(isPublisherProgram({
      source: "delaplaine",
      title: "Art at Noon: Felix Gonzalez-Torres at Glenstone",
      source_url: "https://delaplaine.org/event/art-at-noon-felix-gonzalez-torres-at-glenstone/",
    })).toBe(false);
  });

  it("leaves venue, downtown and fire company calendars alone", () => {
    expect(isPublisherProgram({ source: "dfp", title: "Board Game Night" })).toBe(false);
    expect(isPublisherProgram({ source: "venue-extract", title: "Pour House Trivia" })).toBe(false);
    expect(isPublisherProgram({ source: "fcvfra", title: "Vigilant Hose Co Friday Bingo" })).toBe(false);
    expect(isPublisherProgram({ source: "monocacy", title: "Food Truck: D's Delights" })).toBe(false);
    // A shape with no feed id keeps today's behavior.
    expect(isPublisherProgram({ title: "Club Tennis Practice" })).toBe(false);
  });

  it("ranks an evening show ahead of an earlier campus table", () => {
    const table = ev({
      title: "Frederick Health Hospital Recruitment Table",
      source: "fcc",
      category: "community",
      starts_at: "2026-11-10T15:00:00Z",
    });
    const show = ev({
      title: "the Whippits - Size Doesn't Matter Tour! Special Tuesday Punk Show!",
      source: "venue-extract",
      category: "music",
      starts_at: "2026-11-11T00:30:00Z",
    });
    expect(eventLeadTier(table)).toBe(1);
    expect(eventLeadTier(show)).toBe(0);
    expect([table, show].sort(compareForLead)[0]).toBe(show);
    expect(pickLeadEvent([table, show])).toBe(show);
  });
});

describe("eventProminence", () => {
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

describe("recommended attendance before existing rank", () => {
  it("does not let a featured or image-backed ambiguous row outrank a named venue", () => {
    const weak = ev({ slug: "featured-off-campus", title: "Film festival tickets", venue_name: "Off Campus", category: "film", hero_image: "fixture.jpg" });
    const real = ev({ slug: "named-concert", title: "Concert", venue_name: "Sky Stage", category: "music" });
    const featured = new Set(["featured-off-campus"]);
    // The old comparator remains unchanged for its other callers.
    expect(compareForLead(weak, real, featured)).toBeLessThan(0);
    expect([weak, real].sort((a, b) => compareRecommendationAttendance(a, b) || compareForLead(a, b, featured))).toEqual([real, weak]);
  });

  it("preserves featured and Near Me ranking within the eligible partition", () => {
    const near = ev({ slug: "near", title: "Near concert", venue_name: "Near Hall", category: "music", distance_m: 100 });
    const far = ev({ slug: "far", title: "Far concert", venue_name: "Far Hall", category: "music", distance_m: 1_000 });
    const weak = ev({ slug: "weak", title: "Nearby offer", venue_name: "Off Campus", category: "music", distance_m: 1 });
    const rank = (featured: Set<string>) => [weak, far, near].sort((a, b) =>
      compareRecommendationAttendance(a, b) || compareEventsForDecision(a, b, featured));
    expect(rank(new Set(["weak"]))).toEqual([near, far, weak]);
    expect(rank(new Set(["weak", "far"]))).toEqual([far, near, weak]);
  });
});


describe("useful and varied recommendations", () => {
  it("does not mistake bookable product promotion for a stronger public outing", () => {
    const sales = ev({ slug: "showroom", title: "Home Improvement Expo", venue_name: "Exhibition Hall", category: "community", ticket_url: "https://example.test/tickets", price_text: "$20", hero_image: "showroom.jpg", starts_at: "2026-06-20T12:00:00Z" });
    const outing = ev({ slug: "community-day", title: "Summer Festival", venue_name: "Town Park", category: "community", starts_at: "2026-06-20T18:00:00Z" });
    expect(compareForLead(sales, outing)).toBeLessThan(0);
    expect([sales, outing].sort(compareForRecommendation)).toEqual([outing, sales]);
    expect(rankRecommendations([sales, outing])).toEqual([outing, sales]);
  });

  it("keeps a public science expo eligible without treating expo as sales language", () => {
    const science = ev({ slug: "science", title: "Community Science Expo", venue_name: "Discovery Center", category: "family", hero_image: "science.jpg" });
    const concert = ev({ slug: "concert", title: "Concert", venue_name: "Music Hall", category: "music" });
    expect(compareForRecommendation(science, concert)).toBeLessThan(0);
    expect(rankRecommendations([concert, science])[0]).toBe(science);
  });

  it("ignores admission and ticket-link completeness when comparing equivalent outings", () => {
    const free = ev({ title: "Outdoor Concert", venue_name: "Town Park", category: "music", starts_at: "2026-06-20T17:00:00Z", is_free: true });
    const paid = ev({ title: "Evening Concert", venue_name: "Music Hall", category: "music", starts_at: "2026-06-20T20:00:00Z", ticket_url: "https://example.test/tickets", price_text: "$15", is_free: false });
    expect(compareForRecommendation(free, paid)).toBeLessThan(0);
    expect(compareForRecommendation({ ...free, is_free: false }, paid)).toBeLessThan(0);
  });

  it("offers different places and interests without removing other occurrences", () => {
    const first = ev({ slug: "same-series", title: "Morning Concert", venue_name: "Music Hall", category: "music", starts_at: "2026-06-20T14:00:00Z" });
    const duplicateSlug = ev({ slug: "same-series", title: "Afternoon Concert", venue_name: "Music Hall", category: "music", starts_at: "2026-06-20T17:00:00Z" });
    const thirdConcert = ev({ slug: "other-concert", title: "Evening Concert", venue_name: "Music Hall", category: "music", starts_at: "2026-06-20T19:00:00Z" });
    const outdoor = ev({ slug: "walk", title: "Guided Nature Walk", venue_name: "Forest Park", category: "outdoors", starts_at: "2026-06-20T20:00:00Z" });
    const theatre = ev({ slug: "play", title: "Theatre Performance", venue_name: "Community Theatre", category: "arts", starts_at: "2026-06-20T21:00:00Z" });
    const source = Object.freeze([first, duplicateSlug, thirdConcert, outdoor, theatre].map(event => Object.freeze(event)));
    const before = JSON.stringify(source);
    const ranked = rankRecommendations(source, { limit: 3 });
    expect(ranked.slice(0, 3)).toEqual([first, outdoor, theatre]);
    expect(ranked.slice(3)).toEqual([duplicateSlug, thirdConcert]);
    expect(ranked).toHaveLength(source.length);
    expect(new Set(ranked).size).toBe(source.length);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("keeps editorial picks and valid destinations ahead of variety", () => {
    const first = ev({ slug: "featured-1", title: "First Concert", venue_name: "Music Hall", category: "music" });
    const second = ev({ slug: "featured-2", title: "Second Concert", venue_name: "Music Hall", category: "music" });
    const outside = ev({ slug: "outside", title: "Guided Walk", venue_name: "Forest Park", category: "outdoors" });
    const weak = ev({ slug: "weak", title: "Festival", venue_name: "Off Campus", category: "family", hero_image: "weak.jpg" });
    const source = [weak, first, second, outside];
    expect(rankRecommendations(source, { featured: new Set([first.slug, second.slug, weak.slug]), limit: 3 })).toEqual([first, second, outside, weak]);
  });

  it("uses consented distance between comparable choices and remains bounded", () => {
    const far = ev({ slug: "far", title: "Concert", venue_name: "Far Hall", category: "music", distance_m: 3_000 });
    const near = ev({ slug: "near", title: "Concert", venue_name: "Near Hall", category: "music", distance_m: 300 });
    expect(compareForRecommendation(near, far)).toBeLessThan(0);
    expect(rankRecommendations([far, near], { limit: 1 })).toEqual([near, far]);
    expect(rankRecommendations([], { limit: 6 })).toEqual([]);
    expect(rankRecommendations([far, near], { limit: -1 })).toEqual([near, far]);
  });
});
