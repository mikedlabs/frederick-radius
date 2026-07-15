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
    ]) {
      expect(classifyEvent({ title }), title).toBe("public");
      expect(isPublicEvent({ title }), title).toBe(true);
    }
  });
});
