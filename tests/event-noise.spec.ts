import { describe, it, expect } from "vitest";
import { isVenueStatusNonEvent, isRoutineRecurringClass, isNonPublicListing } from "@/lib/event-noise";

describe("isVenueStatusNonEvent — suppresses venue open-status, not events", () => {
  it("flags the reported case and similar terminal open-statuses", () => {
    expect(isVenueStatusNonEvent("True Standard Distilling - Tasting Room Open")).toBe(true);
    expect(isVenueStatusNonEvent("Tasting Room Open")).toBe(true);
    expect(isVenueStatusNonEvent("Springfield Manor Taproom Open")).toBe(true);
    expect(isVenueStatusNonEvent("McClintock Distillery Cellar Door Open")).toBe(true);
    expect(isVenueStatusNonEvent("Open Daily")).toBe(true);
    expect(isVenueStatusNonEvent("Tasting Room Hours")).toBe(true);
  });

  it("never hides a real event that merely contains these words", () => {
    // The flagship case: First Saturday gallery walk must survive.
    expect(isVenueStatusNonEvent("Galleries Open Late for First Saturday")).toBe(false);
    expect(isVenueStatusNonEvent("Tasting Room Open House with Live Music")).toBe(false);
    expect(isVenueStatusNonEvent("Opening Night: The Nutcracker")).toBe(false);
    expect(isVenueStatusNonEvent("Grand Opening Celebration")).toBe(false);
    expect(isVenueStatusNonEvent("Gallery Opening Reception")).toBe(false);
    expect(isVenueStatusNonEvent("Open Mic Night at JoJo's")).toBe(false);
    expect(isVenueStatusNonEvent("Concert at Baker Park")).toBe(false);
    expect(isVenueStatusNonEvent("Lecture at the Museum")).toBe(false);
    expect(isVenueStatusNonEvent("")).toBe(false);
  });
});

describe("isRoutineRecurringClass — only the caller's recurring entries", () => {
  it("flags routine class and government-session titles", () => {
    expect(isRoutineRecurringClass("Gentle Yoga")).toBe(true);
    expect(isRoutineRecurringClass("Pilates")).toBe(true);
    expect(isRoutineRecurringClass("Cardio Sculpt")).toBe(true);
    expect(isRoutineRecurringClass("Zumba Gold")).toBe(true);
    expect(isRoutineRecurringClass("Mayor and Board Work Session")).toBe(true);
    expect(isRoutineRecurringClass("Planning Commission Meeting")).toBe(true);
  });

  it("does not match cultural or one-off event titles", () => {
    expect(isRoutineRecurringClass("Summer Concert Series")).toBe(false);
    expect(isRoutineRecurringClass("First Friday Art Walk")).toBe(false);
    expect(isRoutineRecurringClass("Town Council Candidate Forum")).toBe(false);
    expect(isRoutineRecurringClass("")).toBe(false);
  });
});

describe("isNonPublicListing — private bookings and service notices", () => {
  it("flags private facility bookings the county pavilion feed leaks", () => {
    expect(isNonPublicListing("Large Pavilion A - Rosenberger Baby Shower")).toBe(true);
    expect(isNonPublicListing("Price Birthday Party")).toBe(true);
    expect(isNonPublicListing("Maggie Campbell Rehearsal Dinner")).toBe(true);
    expect(isNonPublicListing("Wedding Reception")).toBe(true);
    expect(isNonPublicListing("Smith Family Reunion")).toBe(true);
    expect(isNonPublicListing("Private Event")).toBe(true);
  });

  it("flags municipal service notices", () => {
    expect(isNonPublicListing("Grass/Leaf Curbside Pickup")).toBe(true);
    expect(isNonPublicListing("Bulk Trash Collection")).toBe(true);
  });

  it("never hides a public event that merely shares a word", () => {
    expect(isNonPublicListing("Baby Storytime at the Library")).toBe(false);
    expect(isNonPublicListing("Frederick Wedding Expo")).toBe(false);
    expect(isNonPublicListing("Holiday Party at the Brewery")).toBe(false);
    expect(isNonPublicListing("Leaf Peeping Hike at Catoctin")).toBe(false);
    expect(isNonPublicListing("First Saturday Art Walk")).toBe(false);
    expect(isNonPublicListing("")).toBe(false);
  });
});
