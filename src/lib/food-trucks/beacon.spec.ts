import { describe, expect, it } from "vitest";
import { readBeacon, liveBeaconsByTruck, beaconLabel, type TruckBeacon } from "./beacon";

const NOW = new Date("2026-07-20T18:00:00.000Z");

function beacon(over: Partial<TruckBeacon> = {}): TruckBeacon {
  return {
    truckSlug: "the-taco-guy",
    lat: 39.41,
    lng: -77.41,
    startedAt: "2026-07-20T17:00:00.000Z",
    expiresAt: "2026-07-20T20:00:00.000Z",
    ...over,
  };
}

describe("readBeacon", () => {
  it("resolves a live beacon with minutes left and the out phase", () => {
    const live = readBeacon(beacon({ spot: "Baker Park", note: "Birria" }), NOW);
    expect(live).not.toBeNull();
    expect(live?.truckSlug).toBe("the-taco-guy");
    expect(live?.minsLeft).toBe(120); // 18:00 -> 20:00
    expect(live?.phase).toBe("out");
    expect(live?.spot).toBe("Baker Park");
    expect(live?.note).toBe("Birria");
  });

  it("flips to the wrapping phase inside the final half hour", () => {
    const live = readBeacon(beacon({ expiresAt: "2026-07-20T18:20:00.000Z" }), NOW);
    expect(live?.phase).toBe("wrapping");
    expect(live?.minsLeft).toBe(20);
  });

  it("returns null for a beacon that has not started yet", () => {
    expect(readBeacon(beacon({ startedAt: "2026-07-20T19:00:00.000Z", expiresAt: "2026-07-20T22:00:00.000Z" }), NOW)).toBeNull();
  });

  it("returns null for an expired beacon — a dead pin never reads as live", () => {
    expect(readBeacon(beacon({ startedAt: "2026-07-20T14:00:00.000Z", expiresAt: "2026-07-20T17:00:00.000Z" }), NOW)).toBeNull();
  });

  it("returns null for malformed beacons (bad coords, inverted window, no slug)", () => {
    expect(readBeacon(beacon({ lat: 999 }), NOW)).toBeNull();
    expect(readBeacon(beacon({ expiresAt: "2026-07-20T17:00:00.000Z" }), NOW)).toBeNull(); // end <= start
    expect(readBeacon(beacon({ truckSlug: "" }), NOW)).toBeNull();
  });

  it("drops blank spot/note to undefined", () => {
    const live = readBeacon(beacon({ spot: "   ", note: "" }), NOW);
    expect(live?.spot).toBeUndefined();
    expect(live?.note).toBeUndefined();
  });
});

describe("liveBeaconsByTruck", () => {
  it("keeps the freshest live beacon per truck and drops the expired", () => {
    const beacons: TruckBeacon[] = [
      beacon({ startedAt: "2026-07-20T16:00:00.000Z", spot: "old spot" }),
      beacon({ startedAt: "2026-07-20T17:30:00.000Z", spot: "new spot" }), // freshest, still live
      beacon({ truckSlug: "ice-queen", startedAt: "2026-07-20T14:00:00.000Z", expiresAt: "2026-07-20T16:00:00.000Z" }), // expired
    ];
    const map = liveBeaconsByTruck(beacons, NOW);
    expect(map.get("the-taco-guy")?.spot).toBe("new spot");
    expect(map.has("ice-queen")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("returns an empty map when nothing is live", () => {
    const map = liveBeaconsByTruck([beacon({ startedAt: "2026-07-20T10:00:00.000Z", expiresAt: "2026-07-20T12:00:00.000Z" })], NOW);
    expect(map.size).toBe(0);
  });
});

describe("beaconLabel", () => {
  it("reads as a calm, complete sentence with the time as supporting detail", () => {
    expect(beaconLabel(readBeacon(beacon(), NOW)!)).toBe("Out now, about 2 hours left.");
    expect(beaconLabel(readBeacon(beacon({ expiresAt: "2026-07-20T18:15:00.000Z" }), NOW)!)).toBe("Wrapping up, about 15 minutes left.");
  });
});
