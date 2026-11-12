import { describe, it, expect } from "vitest";
import { classifyEvent, isClosureNotice, isPublicEvent } from "./classify";

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
      "Quarterly Spires Articles Due",
      "Newsletter Article Is Due",
    ]) {
      expect(classifyEvent({ title }), title).toBe("town_reminder");
      expect(isPublicEvent({ title }), title).toBe(false);
    }
  });

  // November 11, 2026 hierarchy audit: Thurmont's "Town Offices Closed" sat
  // under Happening now on Veterans Day. Closures are not events in any lane.
  it("lanes office, library and holiday closures as closure notices", () => {
    for (const title of [
      "Office Closed",
      "Town Offices Closed",
      "City Offices Closed for Labor Day",
      "Government Office Closed in Observance of Election Day",
      "Town Offices Closed - Veterans Day",
      "Veterans Day - Town Offices Closed",
      "Veterans Day \u2013 Town Offices Closed",
      "Veterans Day (Town Offices Closed)",
      "Veterans Day Holiday: Offices Closed",
      "Thanksgiving - Offices Closed",
      "Town Hall Closed",
      "Library Closed",
      "All Branches Closed for Veterans Day",
      "FCPL Libraries Closed - Thanksgiving Day",
      "Closed for Veterans Day",
      "Veterans Day - Closed",
      "Holiday Closure",
      "Christmas Eve - Library Closes Early",
      "Holiday - Office Closed",
      "Office Closed - Nov 11",
    ]) {
      expect(isClosureNotice(title), title).toBe(true);
      expect(classifyEvent({ title }), title).toBe("closure_notice");
      expect(isPublicEvent({ title }), title).toBe(false);
    }
  });

  // Review finding (events-and-map-context): every part of the title had to
  // match a fixed subject list, so these real feed shapes fell through to
  // "public". The first one was in the county RSS feed for November 26, 2026.
  it("lanes closures with a town, branch or bare subject, joined reasons, weather and staff days", () => {
    for (const title of [
      "Centers are Closed for Thanksgiving Day",
      "Senior Centers Closed for Thanksgiving Day",
      "Veteran's Day - Town Offices Closed",
      "Veteran\u2019s Day - Town Offices Closed",
      "Thurmont Town Office Closed",
      "Brunswick City Offices Closed",
      "Emmitsburg Branch Closed",
      "Thurmont Regional Library Closed",
      "FCPL Closed - Thanksgiving",
      "Library Closed - Staff Development Day",
      "All Branches Closed - Staff Training",
      "Town Offices Closed Thanksgiving",
      "Town Offices Closed 11/11",
      "Town Offices Closed November 27-28",
      "Town Offices Close Early",
      "Town Offices Closed - Christmas Eve & Christmas Day",
      "Office Closed - Columbus Day / Indigenous Peoples' Day",
      "Town Office Closed (Snow)",
      "Offices Closed: Inclement Weather",
      "Holiday Closure - Libraries",
      "Closed Thanksgiving",
      "Library Closed Sunday",
      "Library Closes at 3 PM",
      "Closed for the Holidays",
    ]) {
      expect(isClosureNotice(title), title).toBe(true);
      expect(classifyEvent({ title }), title).toBe("closure_notice");
      expect(isPublicEvent({ title }), title).toBe(false);
    }
  });

  it("does not treat a title that merely mentions closing as a closure", () => {
    for (const title of [
      "Office Closed: The Musical",
      "The Office: Closed-Door Mystery Dinner",
      "Behind Closed Doors",
      "Closed for Business",
      "Closed",
      "Veterans Day Ceremony",
      "Thanksgiving Day Parade",
      "Library Closing Party",
      "Community Center Open House",
      // The wider closure grammar must still leave these alone.
      "Closed Loop Recycling Workshop",
      "Closing Reception",
      "Last Day Before We Close: Farewell Concert",
      "Library Closed Stacks Tour",
      "Holiday Market",
      "Closure",
      "Closed Sunday",
      "Thurmont Closed",
      "Closed Captioned Screening at the Library",
      "Ice Cream Social - Closed Early",
    ]) {
      expect(isClosureNotice(title), title).toBe(false);
      expect(classifyEvent({ title }), title).not.toBe("closure_notice");
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
      "Last Day Before We Close: Farewell Concert",
      "Library Closed Stacks Tour",
      "Holiday Market",
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
