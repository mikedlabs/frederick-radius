import { describe, expect, it } from "vitest";
import {
  eventParkingDirections,
  eventParkingSummary,
  nearestEventParking,
} from "./parking";

describe("event parking decision", () => {
  it("uses one city-garage distance for the summary and directions copy", () => {
    const parking = nearestEventParking({
      lng: -77.4087681,
      lat: 39.4126271,
    });

    expect(parking).toMatchObject({
      slug: "carroll-creek-parking-garage-frederick",
      name: "Carroll Creek Garage",
    });
    expect(eventParkingSummary(parking)).toContain(
      `Carroll Creek Garage is the nearest listed city garage, ${parking?.distanceLabel} away in a straight line`,
    );
    expect(eventParkingDirections(parking)).toContain(
      `Carroll Creek Garage is ${parking?.distanceLabel} away in a straight line.`,
    );
    expect(eventParkingDirections(parking)).toContain(
      "Garage parking is $1 / hour; the overnight maximum is $5.",
    );
    expect(eventParkingDirections(parking)).not.toContain("Garage garage");
    expect(eventParkingDirections(parking)).not.toMatch(/minute.walk/);
  });

  it("returns no claim when no city garage is within the trusted range", () => {
    const parking = nearestEventParking({ lng: -77.32, lat: 39.64 });
    expect(parking).toBeNull();
    expect(eventParkingSummary(parking)).toBeNull();
    expect(eventParkingDirections(parking)).toBeNull();
  });
});
