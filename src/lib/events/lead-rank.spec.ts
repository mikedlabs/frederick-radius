import { describe, it, expect } from "vitest";
import { isRoutineProgram, eventLeadTier, compareForLead, pickLeadEvent } from "./lead-rank";
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

  it("does NOT let a venue-thumb storytime outrank a real draw", () => {
    // withVenueThumbs gives most events a hero_image; the routine demotion must
    // still win over a thumbnail.
    const storytime = ev({ title: "Family Storytime", hero_image: "thumb.jpg", starts_at: "2026-06-20T14:00:00Z" });
    const carnival = ev({ title: "Firemen's Carnival", starts_at: "2026-06-20T23:00:00Z" });
    expect([storytime, carnival].sort(compareForLead)[0]).toBe(carnival);
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
