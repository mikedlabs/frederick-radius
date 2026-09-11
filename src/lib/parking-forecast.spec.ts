import { describe, it, expect } from "vitest";
import {
  parkingForecasts,
  parkingPlanForToday,
  eventDrawsParking,
  FORECAST_LEAD_MIN_MINUTES,
  type ForecastEvent,
  type ForecastGarage,
} from "./parking-forecast";

// Two real downtown garage coords + one far-away point.
const CARROLL = { lng: -77.4096093, lat: 39.4134048 };
const COURT = { lng: -77.41204739999999, lat: 39.4135367 };
const GARAGES: ForecastGarage[] = [
  { slug: "carroll-creek-parking-garage-frederick", name: "Carroll Creek Parking Deck", geom: CARROLL },
  { slug: "court-street-parking-garage-frederick", name: "Court Street Garage", geom: COURT },
  { slug: "church-street-garage", name: "Church Street Garage", geom: { lng: -77.4100809, lat: 39.4155064 } },
];

const NOW = new Date("2026-07-02T22:00:00.000Z");
const inWindow = new Date(NOW.getTime() + 90 * 60_000).toISOString();

function ev(over: Partial<ForecastEvent>): ForecastEvent {
  return { slug: "e", title: "Show", starts_at: inWindow, geom: CARROLL, category: "music", ...over };
}

describe("eventDrawsParking", () => {
  it("accepts a crowd-draw event with geo, starting in the lead window", () => {
    expect(eventDrawsParking(ev({}), NOW)).toBe(true);
  });
  it("rejects events with no geo, wrong category, or no start time", () => {
    expect(eventDrawsParking(ev({ geom: null }), NOW)).toBe(false);
    expect(eventDrawsParking(ev({ category: "government" }), NOW)).toBe(false);
    expect(eventDrawsParking(ev({ starts_at: "not-a-date" }), NOW)).toBe(false);
  });
  it("rejects family/community events: a parenting class does not fill a deck", () => {
    expect(eventDrawsParking(ev({ category: "family", title: "Baby & Me Yoga" }), NOW)).toBe(false);
    expect(eventDrawsParking(ev({ category: "community" }), NOW)).toBe(false);
  });
  it("rejects events too soon or too far out", () => {
    const tooSoon = new Date(NOW.getTime() + (FORECAST_LEAD_MIN_MINUTES - 10) * 60_000).toISOString();
    const tooFar = new Date(NOW.getTime() + 5 * 60 * 60_000).toISOString();
    expect(eventDrawsParking(ev({ starts_at: tooSoon }), NOW)).toBe(false);
    expect(eventDrawsParking(ev({ starts_at: tooFar }), NOW)).toBe(false);
  });
});

describe("parkingForecasts", () => {
  it("picks the nearest garage as primary and the next two as alternatives", () => {
    const [f] = parkingForecasts([ev({})], GARAGES, NOW);
    expect(f.primaryGarage.slug).toBe("carroll-creek-parking-garage-frederick");
    expect(f.alternatives).toEqual(["Court Street Garage", "Church Street Garage"]);
    expect(f.dedupeKey).toBe("forecast:e:2026-07-02");
  });

  it("skips events whose nearest garage is far away (not a downtown parking case)", () => {
    const farAway = { lng: -77.20, lat: 39.41 }; // ~18 km east
    expect(parkingForecasts([ev({ geom: farAway })], GARAGES, NOW)).toHaveLength(0);
  });

  it("emits at most one forecast per event slug", () => {
    const dupes = [ev({ slug: "x" }), ev({ slug: "x" })];
    expect(parkingForecasts(dupes, GARAGES, NOW)).toHaveLength(1);
  });

  it("returns nothing when no events are eligible", () => {
    expect(parkingForecasts([ev({ category: "government" })], GARAGES, NOW)).toEqual([]);
  });
});

describe("parkingPlanForToday", () => {
  it("picks the soonest upcoming downtown draw within the day horizon", () => {
    const soon = new Date(NOW.getTime() + 3 * 60 * 60_000).toISOString();
    const later = new Date(NOW.getTime() + 6 * 60 * 60_000).toISOString();
    const plan = parkingPlanForToday(
      [ev({ slug: "later", starts_at: later, geom: COURT }), ev({ slug: "soon", starts_at: soon, geom: CARROLL })],
      GARAGES,
      NOW,
    );
    expect(plan?.event.slug).toBe("soon");
    expect(plan?.primaryGarage.slug).toBe("carroll-creek-parking-garage-frederick");
  });

  it("looks further ahead than the push window (a 3-hour-out event still shows)", () => {
    const threeHours = new Date(NOW.getTime() + 3 * 60 * 60_000).toISOString();
    expect(eventDrawsParking(ev({ starts_at: threeHours }), NOW)).toBe(false); // outside push window
    expect(parkingPlanForToday([ev({ starts_at: threeHours })], GARAGES, NOW)).not.toBeNull();
  });

  it("returns null when the only event is already past or beyond the horizon", () => {
    const past = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    const wayOut = new Date(NOW.getTime() + 20 * 60 * 60_000).toISOString();
    expect(parkingPlanForToday([ev({ starts_at: past })], GARAGES, NOW)).toBeNull();
    expect(parkingPlanForToday([ev({ starts_at: wayOut })], GARAGES, NOW)).toBeNull();
  });
});
