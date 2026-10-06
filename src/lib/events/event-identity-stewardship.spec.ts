import { describe, expect, it } from "vitest";
import { archivedEventFromSnapshot } from "./event-identity";

describe("Event identity stewardship — census-driven hydrate", () => {
  it("classifies end-of-day sentinel timing", () => {
    const dailyExercise = {
      slug: "daily-exercise-emmitsburg",
      title: "Daily Exercise",
      description: "Morning workout program",
      starts_at: "2026-10-06T09:15:00-04:00",
      ends_at: "2026-10-06T23:59:00-04:00",
      timezone: "America/New_York",
      venue_name: "Emmitsburg Community Center",
      address: "300 S Seton Ave, Emmitsburg, MD 21727",
      geom: { lng: -77.3272, lat: 39.7048 },
      municipality: "emmitsburg",
      municipality_name: "Emmitsburg",
      category: "fitness",
      audience: ["adults"],
      is_free: true,
      source: "manual",
      source_id: "daily-exercise-1",
      is_verified: true,
      geo_confidence: "exact_address",
      category_name: "Fitness",
    };

    const hydrated = archivedEventFromSnapshot(dailyExercise);

    expect(hydrated).not.toBeNull();
    expect(hydrated?.end_trust).toBe("sentinel");
    expect(hydrated?.municipality_name).toBe("Emmitsburg");
  });

  it("classifies equal start/end timing", () => {
    const bingoNight = {
      slug: "bingo-night-brunswick",
      title: "Bingo Night",
      description: "Weekly bingo",
      starts_at: "2026-10-06T19:00:00-04:00",
      ends_at: "2026-10-06T19:00:00-04:00",
      timezone: "America/New_York",
      venue_name: "Brunswick Community Center",
      address: "100 W Potomac St, Brunswick, MD 21716",
      geom: { lng: -77.6296, lat: 39.3088 },
      municipality: "brunswick",
      municipality_name: "Brunswick",
      category: "community",
      audience: ["adults"],
      is_free: false,
      source: "manual",
      source_id: "bingo-1",
      is_verified: true,
      geo_confidence: "exact_address",
      category_name: "Community",
    };

    const hydrated = archivedEventFromSnapshot(bingoNight);

    expect(hydrated).not.toBeNull();
    expect(hydrated?.end_trust).toBe("equal");
  });

  it("generates series_key for recurring storytimes", () => {
    const storytimes = [
      {
        slug: "family-storytime-cba",
        title: "Family Storytime at C. Burr Artz",
        description: "Weekly storytime for families",
        starts_at: "2026-10-06T10:30:00-04:00",
        ends_at: "2026-10-06T11:00:00-04:00",
        timezone: "America/New_York",
        is_recurring: true,
        venue_name: "C. Burr Artz Library",
        address: "110 E Patrick St, Frederick, MD 21701",
        geom: { lng: -77.4083, lat: 39.4140 },
        municipality: "frederick",
        municipality_name: "Frederick City",
        category: "family",
        audience: ["kids-0-5"],
        is_free: true,
        source: "fcpl",
        source_id: "storytime-cba",
        is_verified: true,
        geo_confidence: "exact_address",
        category_name: "Family",
      },
      {
        slug: "family-storytime-brunswick",
        title: "Family Storytime at Brunswick Library",
        description: "Weekly storytime for families",
        starts_at: "2026-10-07T10:30:00-04:00",
        ends_at: "2026-10-07T11:00:00-04:00",
        timezone: "America/New_York",
        is_recurring: true,
        venue_name: "Brunswick Library",
        address: "915 N Maple Ave, Brunswick, MD 21716",
        geom: { lng: -77.6200, lat: 39.3150 },
        municipality: "brunswick",
        municipality_name: "Brunswick",
        category: "family",
        audience: ["kids-0-5"],
        is_free: true,
        source: "fcpl",
        source_id: "storytime-brunswick",
        is_verified: true,
        geo_confidence: "exact_address",
        category_name: "Family",
      },
    ];

    const hydrated = storytimes.map((st) => archivedEventFromSnapshot(st));

    expect(hydrated[0]?.series_key).toBe("storytime");
    expect(hydrated[1]?.series_key).toBe("storytime");
    expect(hydrated[0]?.series_key).toBe(hydrated[1]?.series_key);
  });

  it("backfills municipality_name from municipality slug when missing", () => {
    const eventWithoutName = {
      slug: "event-thurmont",
      title: "Test Event",
      description: "Event description",
      starts_at: "2026-10-06T19:00:00-04:00",
      ends_at: "2026-10-06T21:00:00-04:00",
      timezone: "America/New_York",
      venue_name: "Test Venue",
      address: "Main St, Thurmont, MD 21788",
      geom: { lng: -77.4108, lat: 39.6231 },
      municipality: "thurmont",
      municipality_name: "",
      category: "community",
      audience: [],
      is_free: true,
      source: "manual",
      source_id: "test-1",
      is_verified: true,
      geo_confidence: "exact_address",
      category_name: "Community",
    };

    const hydrated = archivedEventFromSnapshot(eventWithoutName);

    expect(hydrated).not.toBeNull();
    expect(hydrated?.municipality_name).toBe("Thurmont");
  });

  it("preserves existing municipality_name", () => {
    const eventWithName = {
      slug: "event-frederick",
      title: "Test Event",
      description: "Event description",
      starts_at: "2026-10-06T19:00:00-04:00",
      ends_at: "2026-10-06T21:00:00-04:00",
      timezone: "America/New_York",
      venue_name: "Test Venue",
      address: "Market St, Frederick, MD 21701",
      geom: { lng: -77.4109, lat: 39.4150 },
      municipality: "frederick",
      municipality_name: "Frederick City",
      category: "community",
      audience: [],
      is_free: true,
      source: "manual",
      source_id: "test-2",
      is_verified: true,
      geo_confidence: "exact_address",
      category_name: "Community",
    };

    const hydrated = archivedEventFromSnapshot(eventWithName);

    expect(hydrated).not.toBeNull();
    expect(hydrated?.municipality_name).toBe("Frederick City");
  });

  it("classifies normal event timing as 'ok'", () => {
    const normalEvent = {
      slug: "concert-weinberg",
      title: "Concert at the Weinberg",
      description: "Evening concert",
      starts_at: "2026-10-06T20:00:00-04:00",
      ends_at: "2026-10-06T22:00:00-04:00",
      timezone: "America/New_York",
      venue_name: "Weinberg Center",
      address: "20 W Patrick St, Frederick, MD 21701",
      geom: { lng: -77.4124, lat: 39.4145 },
      municipality: "frederick",
      municipality_name: "Frederick City",
      category: "music",
      audience: ["adults"],
      is_free: false,
      price_text: "$25-$45",
      source: "weinberg",
      source_id: "concert-1",
      is_verified: true,
      geo_confidence: "exact_address",
      category_name: "Music",
    };

    const hydrated = archivedEventFromSnapshot(normalEvent);

    expect(hydrated).not.toBeNull();
    expect(hydrated?.end_trust).toBe("ok");
  });
});
