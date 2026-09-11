import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_DEVICE_MAX_AGE_MS,
  OFFLINE_SNAPSHOT_VERSION,
  OFFLINE_TODAY_MAX_AGE_MS,
  buildOfflineSavedSummary,
  formatOfflineAge,
  mergeOfflineDeviceSnapshot,
  mergeOfflineTodaySnapshot,
  offlineSnapshotView,
  readOfflinePreferences,
  sanitizeOfflineSnapshot,
  type OfflineSnapshot,
} from "./offline-snapshot";

const NOW = Date.parse("2026-07-29T16:00:00.000Z");

function baseSnapshot(overrides: Partial<OfflineSnapshot> = {}): OfflineSnapshot {
  return {
    version: OFFLINE_SNAPSHOT_VERSION,
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe("offline snapshot privacy and bounds", () => {
  it("stores aggregate Saved counts without ids or saved timestamps", () => {
    const saved = buildOfflineSavedSummary(
      [
        { type: "place", id: "private-favorite", saved_at: "secret" },
        { type: "event", id: "private-plan", saved_at: "secret" },
        { type: "beer", id: "private-pour", saved_at: "secret" },
        { type: "radius", id: "private-route", saved_at: "secret" },
        { type: "unknown", id: "ignored" },
      ] as Array<{ type: string; id: string; saved_at?: string }>,
      NOW,
    );

    expect(saved).toEqual({
      updatedAt: "2026-07-29T16:00:00.000Z",
      total: 4,
      place: 1,
      event: 1,
      radius: 1,
      beer: 1,
      capped: false,
    });
    expect(JSON.stringify(saved)).not.toContain("private-");
    expect(JSON.stringify(saved)).not.toContain("secret");
  });

  it("caps Saved work and marks an oversized local list", () => {
    const saved = buildOfflineSavedSummary(
      Array.from({ length: 1_200 }, () => ({ type: "place" })),
      NOW,
    );
    expect(saved.total).toBe(999);
    expect(saved.place).toBe(999);
    expect(saved.capped).toBe(true);
  });

  it("reads only coarse approved preference identifiers", () => {
    const values: Record<string, string> = {
      "fr:home-muni:v1": "brunswick",
      "fr:scope:v1": "town:middletown",
      "fr:mode:v1": "resident",
      "fr:interests:v1": JSON.stringify([
        "food",
        "outdoors",
        "arts",
        "beer",
        "music",
        "parks",
        "history",
        "coffee",
        "ninth-is-dropped",
        "../invalid",
      ]),
      "fr:geo:v1": JSON.stringify({ lat: 39.4, lng: -77.4 }),
      "fr:notes:v1": "never read this",
      "fr-device-id": "never read this",
    };
    const getItem = vi.fn((key: string) => values[key] ?? null);

    const preferences = readOfflinePreferences({ getItem }, NOW);

    expect(preferences).toEqual({
      updatedAt: "2026-07-29T16:00:00.000Z",
      homeMunicipality: "brunswick",
      scope: "town:middletown",
      mode: "resident",
      interests: ["food", "outdoors", "arts", "beer", "music", "parks", "history", "coffee"],
    });
    expect(getItem.mock.calls.flat()).toEqual([
      "fr:interests:v1",
      "fr:home-muni:v1",
      "fr:scope:v1",
      "fr:mode:v1",
    ]);
  });

  it("fails quietly when localStorage is blocked", () => {
    const preferences = readOfflinePreferences(
      {
        getItem() {
          throw new Error("blocked");
        },
      },
      NOW,
    );
    expect(preferences).toEqual({
      updatedAt: "2026-07-29T16:00:00.000Z",
      interests: [],
    });
  });

  it("drops unknown fields and unsafe Today links", () => {
    const parsed = sanitizeOfflineSnapshot({
      version: 1,
      updatedAt: "2026-07-29T16:00:00.000Z",
      email: "person@example.com",
      coordinates: { lat: 39.4, lng: -77.4 },
      today: {
        updatedAt: "2026-07-29T16:00:00.000Z",
        dayKey: "2026-07-29",
        lead: {
          kind: "event",
          title: "A public event",
          href: "https://evil.example/phish",
          privateNote: "secret",
        },
      },
    });

    expect(parsed).toEqual({
      version: 1,
      updatedAt: "2026-07-29T16:00:00.000Z",
      today: {
        updatedAt: "2026-07-29T16:00:00.000Z",
        dayKey: "2026-07-29",
        lead: {
          kind: "event",
          title: "A public event",
        },
      },
    });
    expect(JSON.stringify(parsed)).not.toContain("person@example.com");
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(JSON.stringify(parsed)).not.toContain("evil.example");
  });
});

describe("offline snapshot freshness contract", () => {
  it("ages Today independently from a freshly updated Saved summary", () => {
    const yesterday = NOW - OFFLINE_TODAY_MAX_AGE_MS - 1;
    const oldToday = mergeOfflineTodaySnapshot(
      null,
      {
        dayKey: "2026-07-28",
        weather: { headline: "Sunny when saved", temperatureF: 80 },
      },
      yesterday,
    );
    const current = mergeOfflineDeviceSnapshot(
      oldToday,
      buildOfflineSavedSummary([{ type: "place" }], NOW),
      {
        updatedAt: new Date(NOW).toISOString(),
        interests: ["coffee"],
      },
      NOW,
    );

    const view = offlineSnapshotView(current, NOW);
    expect(view?.today).toBeUndefined();
    expect(view?.saved?.total).toBe(1);
    expect(view?.preferences?.interests).toEqual(["coffee"]);
  });

  it("discards the full handoff after the device retention ceiling", () => {
    const old = NOW - OFFLINE_DEVICE_MAX_AGE_MS - 1;
    expect(
      offlineSnapshotView(
        baseSnapshot({ updatedAt: new Date(old).toISOString() }),
        NOW,
      ),
    ).toBeNull();
  });

  it("merges Today writers on the same day and resets fields on a new day", () => {
    const withWeather = mergeOfflineTodaySnapshot(
      null,
      {
        dayKey: "2026-07-29",
        weather: { headline: "Rain later", temperatureF: 74 },
      },
      NOW,
    );
    const withLead = mergeOfflineTodaySnapshot(
      withWeather,
      {
        dayKey: "2026-07-29",
        lead: {
          kind: "place",
          title: "Gravel & Grind",
          detail: "Open until 6 PM when saved",
          href: "/places/gravel-and-grind",
        },
      },
      NOW + 1_000,
    );
    expect(withLead.today?.weather?.headline).toBe("Rain later");
    expect(withLead.today?.lead?.title).toBe("Gravel & Grind");

    const nextDay = mergeOfflineTodaySnapshot(
      withLead,
      {
        dayKey: "2026-07-30",
        weather: { headline: "Clear when saved" },
      },
      NOW + 86_400_000,
    );
    expect(nextDay.today?.weather?.headline).toBe("Clear when saved");
    expect(nextDay.today?.lead).toBeUndefined();
  });

  it("uses plain, bounded age wording", () => {
    expect(formatOfflineAge(new Date(NOW - 30_000).toISOString(), NOW)).toBe(
      "less than a minute ago",
    );
    expect(formatOfflineAge(new Date(NOW - 61 * 60_000).toISOString(), NOW)).toBe(
      "1 hour ago",
    );
    expect(formatOfflineAge(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe(
      "2 days ago",
    );
  });
});
