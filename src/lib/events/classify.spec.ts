import { describe, it, expect } from "vitest";
import { classifyEvent, isPublicEvent } from "./classify";

describe("classifyEvent", () => {
  // Regression: the review found these leaking into public discovery (and
  // one LEADING it). They must lane out of "public".
  it("lanes commissions / committees / internal meetings as civic_meeting", () => {
    for (const title of [
      "Frederick Nonprofit Summit Planning Committee Leadership Luncheon",
      "Frederick County Sustainability Commission",
      "Parks & Recreation Commission",
      "Rustic Roads Commission",
      "Government Operations Committee",
      "Town Meeting",
      "Virtual Meeting",
      "Board of Education",
      "Public Hearing on the Budget",
      // 2026-07 external audit: these "<org> Board Meeting" / online-meeting
      // governance forms were leading public discovery.
      "Loats Board Meeting",
      "Board Meeting",
      "Monthly Board Meeting",
      "Board of Directors Meeting",
      "Zoom Meeting",
      "Teams Meeting",
    ]) {
      expect(classifyEvent({ title }), title).toBe("civic_meeting");
      expect(isPublicEvent({ title }), title).toBe(false);
    }
  });

  it("lanes pavilion bookings / reunions / picnics as private_rental", () => {
    for (const title of [
      "Large Pavilion B - Jaiden's 13th Birthday",
      "Small Pavilion - Humerick Family Reunion",
      "Saint John's Catholic Prep Reunion",
      "2026 FCG Summer Social - Employee Picnic",
      "Smith Wedding Reception",
      "Graduation Party",
      "Facility Reservation",
      "Room Reservation",
      "Private Reservation #204",
    ]) {
      expect(classifyEvent({ title }), title).toBe("private_rental");
      expect(isPublicEvent({ title }), title).toBe(false);
    }
  });

  it("keeps administrative notices out of public event discovery", () => {
    for (const title of [
      "Office Closed",
      "City Offices Closed for Labor Day",
      "Government Office Closed in Observance of Election Day",
      "Quarterly Spires Articles Due",
      "Newsletter Article Is Due",
    ]) {
      expect(classifyEvent({ title }), title).toBe("town_reminder");
      expect(isPublicEvent({ title }), title).toBe(false);
    }
  });

  it("rejects syndicated Instagram profile titles as non-events", () => {
    for (const title of [
      "RCCG- NCCC (@rccg.nccc) • Instagram photos and videos",
      "Downtown Frederick | Instagram Photos and Videos",
    ]) {
      expect(classifyEvent({ title }), title).toBe("non_event");
      expect(isPublicEvent({ title }), title).toBe(false);
    }
  });

  // Guardrail: real public events MUST stay public — no over-eager hiding.
  it("keeps genuine public events public", () => {
    for (const title of [
      "Alive @ Five - Mack Berry Band",
      "Summer Concert Series at Baker Park",
      "First Friday June Art Walk",
      "Frederick Festival of the Arts",
      "Bluegrass on the Creek",
      "Skateboard Jam at the Skate Park",
      "Punch Brothers",
      "Frederick Arts Council Gallery Opening",
      "Dinner reservations open for Restaurant Week",
      // Guards for the board-meeting widening: "board" alone (game night,
      // a bare council) must never lane out of public discovery.
      "Board Game Night at the Library",
      "Keyboard Concert",
      // Guards for the administrative and social-artifact filters.
      "Office Hours: Drop-in Business Help",
      "The Office: Closed-Door Mystery Dinner",
      "Office Closed: The Musical",
      "Instagram Photos and Videos Workshop",
      "Spires Brass Holiday Concert",
    ]) {
      expect(classifyEvent({ title }), title).toBe("public");
      expect(isPublicEvent({ title }), title).toBe(true);
    }
  });

  it("requires an event page or join path for an online-only listing", () => {
    expect(isPublicEvent({
      title: "Yoga for Mobility @ Virtual",
      attendance_mode: "online",
    })).toBe(false);
    expect(isPublicEvent({
      title: "Yoga for Mobility @ Virtual",
      attendance_mode: "online",
      source_url: "https://www.frederickcountymd.gov/Calendar.aspx?EID=15421",
    })).toBe(true);
  });
});
