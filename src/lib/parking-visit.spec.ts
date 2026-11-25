import { describe, expect, it } from "vitest";
import { nextParkingArrival, parkingVisit, visitDates, visitHourLabel } from "./parking-visit";

describe("short visits to downtown Frederick", () => {
  it("prices two exact four-hour blocks and charges only the sessions a stay needs", () => {
    expect(parkingVisit("2026-11-25", 12, 1)).toMatchObject({ garage: 1, lowerStreet: 1.5, upperStreet: 2.5, sessions: 1 });
    expect(parkingVisit("2026-11-25", 12, 2)).toMatchObject({ garage: 2, lowerStreet: 2.5, upperStreet: 4.5, sessions: 1 });
    expect(parkingVisit("2026-11-25", 12, 3)).toMatchObject({ garage: 3, lowerStreet: 4, upperStreet: 7, sessions: 2 });
    expect(parkingVisit("2026-11-25", 12, 4)).toMatchObject({ garage: 4, lowerStreet: 5, upperStreet: 9, sessions: 2 });
  });
  it("charges only hours inside the street or garage enforcement window", () => {
    expect(parkingVisit("2026-11-25", 8, 2)).toMatchObject({ garage: 2, lowerStreet: 1.5, upperStreet: 2.5 });
    expect(parkingVisit("2026-11-25", 17, 3)).toMatchObject({ garage: 3, lowerStreet: 1.5, upperStreet: 2.5 });
    expect(parkingVisit("2026-11-25", 18, 2)).toMatchObject({ garage: 2, lowerStreet: 0, upperStreet: 0, sessions: 0 });
    expect(parkingVisit("2026-11-22", 12, 4)).toMatchObject({ garage: 2, lowerStreet: 0, upperStreet: 0 });
    expect(parkingVisit("2026-11-22", 14, 2)).toMatchObject({ garage: 2 });
  });
  it.each(["2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-12-05", "2026-12-27", "2027-11-25", "2027-11-26"])("applies the City's actual holiday garage and street window on %s", day => {
    expect(parkingVisit(day, 8, 4)).toMatchObject({ garage: 0, lowerStreet: 0, upperStreet: 0, freeAll: true });
  });
  it("ends the holiday weekend before Monday morning and leaves ordinary weekends billable", () => {
    expect(parkingVisit("2026-11-30", 8, 1)).toMatchObject({ garage: 1, lowerStreet: 0, upperStreet: 0, freeAll: false });
    expect(parkingVisit("2027-01-02", 12, 4)).toMatchObject({ garage: 4, lowerStreet: 5, upperStreet: 9 });
  });
  it.each(["2026-12-25", "2027-01-01", "2027-01-18", "2027-05-31"])("applies the published street holiday without guessing at a garage waiver on %s", day => {
    expect(parkingVisit(day, 12, 2)).toMatchObject({ garage: null, lowerStreet: 0, upperStreet: 0, freeStreet: true, freeAll: false });
  });
  it("keeps a shifted federal closure distinct from an actual parking waiver", () => {
    expect(parkingVisit("2026-07-03", 12, 2)).toMatchObject({ garage: null, lowerStreet: null, upperStreet: null, observed: true });
    expect(parkingVisit("2026-07-03", 18, 2)).toMatchObject({ lowerStreet: 0, upperStreet: 0 });
    expect(parkingVisit("2026-10-12", 12, 1)).toMatchObject({ garage: 1, lowerStreet: 1.5, upperStreet: 2.5 });
  });
  it("defaults to the next supported Frederick hour or tomorrow morning", () => {
    expect(nextParkingArrival(new Date("2026-11-24T19:01:00Z"))).toEqual({ hour: 15, dayOffset: 0 });
    expect(nextParkingArrival(new Date("2026-11-25T01:01:00Z"))).toEqual({ hour: 8, dayOffset: 1 });
    expect(nextParkingArrival(new Date("2026-07-10T08:30:00Z"))).toEqual({ hour: 8, dayOffset: 0 });
  });
  it("keeps two weeks of Frederick dates in order across New Year and labels midnight", () => {
    const dates = visitDates("2026-12-23");
    expect(dates).toHaveLength(14);
    expect(dates[0]).toEqual({ key: "2026-12-23", label: "Wed, Dec 23" });
    expect(dates[13]).toEqual({ key: "2027-01-05", label: "Tue, Jan 5" });
    expect(visitHourLabel(24)).toBe("midnight");
  });
});
