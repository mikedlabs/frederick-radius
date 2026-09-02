import { describe, it, expect } from "vitest";
import {
  findHourlyAt,
  weatherPhrase,
  parkingPhrase,
  eatBeforePhrase,
} from "@/lib/event-pairings";
import type { NwsForecast, NwsHourly } from "@/lib/integrations/nws";
import type { PlaceCardData } from "@/lib/loaders/places";
import type { EventParkingDecision } from "@/lib/events/parking";

// ── findHourlyAt ──────────────────────────────────────────────────

function hour(start: string, end: string, extra: Partial<NwsHourly> = {}): NwsHourly {
  return {
    startTime: start,
    endTime: end,
    temperature: 65,
    temperatureUnit: "F",
    shortForecast: "Sunny",
    windSpeed: "5 mph",
    windDirection: "W",
    icon: "",
    ...extra,
  };
}

function forecast(...periods: NwsHourly[]): NwsForecast {
  return {
    asOf: "2026-05-28T12:00:00Z",
    hourly: periods,
    daily: [],
  };
}

describe("findHourlyAt", () => {
  const fc = forecast(
    hour("2026-05-28T17:00:00Z", "2026-05-28T18:00:00Z", { temperature: 72 }),
    hour("2026-05-28T18:00:00Z", "2026-05-28T19:00:00Z", { temperature: 74 }),
    hour("2026-05-28T19:00:00Z", "2026-05-28T20:00:00Z", { temperature: 71 }),
  );

  it("returns the period containing the target time", () => {
    const h = findHourlyAt(fc, new Date("2026-05-28T17:30:00Z"));
    expect(h?.temperature).toBe(72);
  });

  it("inclusive of startTime, exclusive of endTime", () => {
    // Exactly at startTime → matches that period (inclusive lower bound).
    const h1 = findHourlyAt(fc, new Date("2026-05-28T18:00:00Z"));
    expect(h1?.temperature).toBe(74);
    // Exactly at endTime → matches the NEXT period (exclusive upper).
    const h2 = findHourlyAt(fc, new Date("2026-05-28T19:00:00Z"));
    expect(h2?.temperature).toBe(71);
  });

  it("returns null when the target is outside any period", () => {
    const h = findHourlyAt(fc, new Date("2026-05-28T23:00:00Z"));
    expect(h).toBeNull();
  });

  it("returns null for empty / null forecast", () => {
    expect(findHourlyAt(null, new Date())).toBeNull();
    expect(findHourlyAt(forecast(), new Date())).toBeNull();
  });
});

// ── weatherPhrase ─────────────────────────────────────────────────

describe("weatherPhrase", () => {
  it("returns null for null period", () => {
    expect(weatherPhrase(null)).toBeNull();
  });

  it("leads with rain when precip ≥ 60%", () => {
    const p = hour("a", "b", { shortForecast: "Sunny", probabilityOfPrecipitation: 65, temperature: 72 });
    expect(weatherPhrase(p)).toMatch(/rain/i);
  });

  it("leads with rain when shortForecast names rain regardless of precip", () => {
    const p = hour("a", "b", { shortForecast: "Light Rain Showers", probabilityOfPrecipitation: 10, temperature: 72 });
    expect(weatherPhrase(p)).toMatch(/rain/i);
  });

  it("calls out storms specifically when conditions name them", () => {
    const p = hour("a", "b", { shortForecast: "Thunderstorms", probabilityOfPrecipitation: 70, temperature: 80 });
    expect(weatherPhrase(p)).toMatch(/storm/i);
  });

  it("hedges chance of rain in the 40-59% band", () => {
    const p = hour("a", "b", { shortForecast: "Mostly cloudy", probabilityOfPrecipitation: 45, temperature: 70 });
    expect(weatherPhrase(p)).toMatch(/chance/i);
  });

  it("names cold for temp ≤ 40°F", () => {
    const p = hour("a", "b", { shortForecast: "Clear", temperature: 32 });
    expect(weatherPhrase(p)).toMatch(/cold|layers/i);
  });

  it("names hot for temp ≥ 90°F", () => {
    const p = hour("a", "b", { shortForecast: "Sunny", temperature: 95 });
    expect(weatherPhrase(p)).toMatch(/hot|water/i);
  });

  it("looks good for 60-82°F clear/sunny", () => {
    const p = hour("a", "b", { shortForecast: "Sunny", temperature: 74 });
    expect(weatherPhrase(p)).toMatch(/conditions should be sunny/i);
  });

  it("falls back to temp + condition when nothing else matches", () => {
    const p = hour("a", "b", { shortForecast: "Partly cloudy", temperature: 55 });
    const out = weatherPhrase(p);
    expect(out).toContain("55");
    expect(out?.toLowerCase()).toContain("partly cloudy");
  });
});

// ── parkingPhrase ─────────────────────────────────────────────────

function place(name: string, distance_m: number): PlaceCardData {
  return {
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    category: "parking",
    short_blurb: "",
    geom: { lng: 0, lat: 0 },
    address: "",
    city: "Frederick",
    state: "MD",
    postal_code: "",
    municipality: "frederick",
    is_verified: true,
    is_operational: "operational",
    feature_score: 5,
    source: "seed",
    updated_at: "2026-05-28",
    open_status: { state: "unknown" },
    distance_m,
  } as PlaceCardData;
}

describe("parkingPhrase", () => {
  it("names the closest parking with a distance", () => {
    const parking: EventParkingDecision = {
      slug: "court-street-garage",
      name: "Court Street Garage",
      distanceM: 120,
      distanceLabel: "394 ft",
      walkMinutes: 2,
    };
    const out = parkingPhrase(parking);
    expect(out).toContain("Court Street Garage");
    expect(out).toContain("394 ft");
  });

  it("returns null when there is no canonical parking decision", () => {
    expect(parkingPhrase(null)).toBeNull();
  });
});

// ── eatBeforePhrase ───────────────────────────────────────────────

describe("eatBeforePhrase", () => {
  it("names the lead spot with a walking-time estimate + a count of more", () => {
    const out = eatBeforePhrase([
      place("Cellar Door", 200), // ~3 min walk at 80 m/min
      place("Volt", 400),
      place("Brewer's Alley", 600),
    ]);
    expect(out).toContain("Cellar Door");
    expect(out).toMatch(/minute walk/i);
    expect(out).toMatch(/2 more/);
  });

  it("omits the 'or N more' tail when only one match", () => {
    const out = eatBeforePhrase([place("Only Spot", 100)]);
    expect(out).toContain("Only Spot");
    expect(out).not.toMatch(/more/);
  });

  it("returns null when the list is empty", () => {
    expect(eatBeforePhrase([])).toBeNull();
  });

  it("rounds walking time up so '0 min walk' never appears", () => {
    const out = eatBeforePhrase([place("Right Outside", 30)]);
    expect(out).not.toMatch(/\b0-minute/);
    expect(out).toMatch(/1-minute/);
  });
});
