import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  fetchParkingOccupancyFresh,
  getParkingOccupancy,
  getParkingOccupancyResult,
  parseOccupancy,
  resolveParkingOccupancyResult,
  GARAGE_FULL_THRESHOLD,
  PARKING_OCCUPANCY_MAX_AGE_MS,
  PARKING_OCCUPANCY_MAX_BYTES,
  PARKING_OCCUPANCY_MAX_FIELD_LENGTH,
  PARKING_OCCUPANCY_MAX_ROWS,
  type ParkingOccupancySnapshot,
} from "./parking-live";

const NOW_MS = Date.parse("2026-07-31T12:00:00.000Z");
const ORIGINAL = {
  PARKING_OCCUPANCY_ENABLED: process.env.PARKING_OCCUPANCY_ENABLED,
  PARKING_OCCUPANCY_URL: process.env.PARKING_OCCUPANCY_URL,
  PARKING_OCCUPANCY_KEY: process.env.PARKING_OCCUPANCY_KEY,
};

function restore(name: keyof typeof ORIGINAL) {
  const value = ORIGINAL[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  delete process.env.PARKING_OCCUPANCY_ENABLED;
  delete process.env.PARKING_OCCUPANCY_URL;
  delete process.env.PARKING_OCCUPANCY_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of Object.keys(ORIGINAL) as Array<keyof typeof ORIGINAL>) {
    restore(name);
  }
});

describe("parseOccupancy", () => {
  it("returns an empty snapshot for junk / empty input (never fabricates)", () => {
    expect(parseOccupancy(null).decks).toEqual([]);
    expect(parseOccupancy({}).decks).toEqual([]);
    expect(parseOccupancy({ decks: "nope" }).decks).toEqual([]);
  });

  it("derives available from capacity − occupied, and percent_full", () => {
    const snap = parseOccupancy({
      decks: [{ name: "Court Street Garage", capacity: 400, occupied: 380 }],
    });
    const d = snap.decks[0];
    expect(d.available).toBe(20);
    expect(d.percentFull).toBe(95);
    expect(d.isFull).toBe(true); // 95 >= threshold
  });

  it("maps feed deck names to our canonical garage slugs", () => {
    const snap = parseOccupancy({
      decks: [
        { name: "Carroll Creek Deck", capacity: 100, available: 40 },
        { name: "West Patrick St", capacity: 100, available: 10 },
        { name: "Church Street", capacity: 100, available: 90 },
        { name: "East All Saints", capacity: 100, available: 0 },
      ],
    });
    const slugs = snap.decks.map((d) => d.garageSlug);
    expect(slugs).toEqual([
      "carroll-creek-parking-garage-frederick",
      "west-patrick-street-parking-deck",
      "church-street-garage",
      "east-all-saints-street-parking-garage",
    ]);
  });

  it("treats zero spaces or a FULL status as full even without a percentage", () => {
    const zero = parseOccupancy({ decks: [{ name: "Court", available: 0 }] }).decks[0];
    expect(zero.isFull).toBe(true);
    const status = parseOccupancy({ decks: [{ name: "Court", status: "FULL" }] }).decks[0];
    expect(status.isFull).toBe(true);
  });

  it("does not mistake a NOT FULL status for a full garage", () => {
    const d = parseOccupancy({
      decks: [{ name: "Court", status: "NOT FULL" }],
    }).decks[0];
    expect(d.isFull).toBe(false);
  });

  it("keeps an explicitly closed garage separate from full and available", () => {
    const d = parseOccupancy({
      decks: [{
        name: "Court",
        status: "CLOSED",
        available: 0,
        percent_full: 100,
      }],
    }).decks[0];
    expect(d).toMatchObject({
      isClosed: true,
      isFull: false,
      isFilling: false,
    });
  });

  it("does not translate a sensor outage into a garage closure", () => {
    const d = parseOccupancy({
      decks: [{ name: "Court", status: "SENSOR OFFLINE" }],
    }).decks[0];
    expect(d).toMatchObject({
      isClosed: false,
      isFull: false,
      isFilling: false,
    });
  });

  it("flags filling-up (75–89%) without marking it full", () => {
    const d = parseOccupancy({ decks: [{ name: "Court", capacity: 100, occupied: 80 }] }).decks[0];
    expect(d.percentFull).toBe(80);
    expect(d.isFull).toBe(false);
    expect(d.isFilling).toBe(true);
    expect(GARAGE_FULL_THRESHOLD).toBeGreaterThan(80);
  });

  it("leaves unknown counts null rather than guessing, and keeps unmatched decks", () => {
    const d = parseOccupancy({ decks: [{ name: "Some New Lot" }] }).decks[0];
    expect(d.available).toBeNull();
    expect(d.occupied).toBeNull();
    expect(d.percentFull).toBeNull();
    expect(d.isFull).toBe(false);
    expect(d.garageSlug).toBeNull(); // unmatched name → no card badge, but not dropped
  });

  it("accepts a bare array and common field aliases", () => {
    const d = parseOccupancy([{ garage: "Court Street", spaces: 300, free: 5 }]).decks[0];
    expect(d.capacity).toBe(300);
    expect(d.available).toBe(5);
    expect(d.occupied).toBe(295);
    expect(d.garageSlug).toBe("court-street-parking-garage-frederick");
  });

  it("keeps non-numeric placeholders null instead of turning them into zero", () => {
    const d = parseOccupancy({
      decks: [{
        name: "Court Street Garage",
        available: "N/A",
        occupied: "unknown",
        capacity: "--",
        percent_full: "not reported",
      }],
    }).decks[0];

    expect(d).toMatchObject({
      available: null,
      occupied: null,
      capacity: null,
      percentFull: null,
      isFull: false,
    });
  });
});

describe("fetchParkingOccupancyFresh", () => {
  beforeEach(() => {
    process.env.PARKING_OCCUPANCY_URL =
      "https://parking.example.test/occupancy";
  });

  it("accepts current JSON for a known garage and sends the optional key only upstream", async () => {
    process.env.PARKING_OCCUPANCY_KEY = "licensed-test-key";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        as_of: "2026-07-31T11:58:00.000Z",
        decks: [{
          name: "Court Street Garage",
          capacity: 400,
          available: 12,
        }],
      }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    const snapshot = await fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    });

    expect(snapshot).toMatchObject({
      asOf: "2026-07-31T11:58:00.000Z",
      decks: [{
        garageSlug: "court-street-parking-garage-frederick",
        available: 12,
        capacity: 400,
        updated: "2026-07-31T11:58:00.000Z",
      }],
    });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init).toMatchObject({ cache: "no-store" });
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer licensed-test-key",
    });
  });

  it("accepts deck timestamps when the feed has no root timestamp", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        decks: [{
          name: "Carroll Creek Deck",
          available: 40,
          updated: "2026-07-31T11:57:00.000Z",
        }],
      }), {
        headers: { "content-type": "application/json" },
      }),
    );

    const snapshot = await fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    });

    expect(snapshot.decks).toHaveLength(1);
    expect(snapshot.decks[0].updated).toBe("2026-07-31T11:57:00.000Z");
  });

  it("accepts small count drift inside the documented estimate tolerance", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [{
          name: "Court Street Garage",
          capacity: 400,
          available: 99,
          occupied: 300,
          percent_full: 75,
        }],
      }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).resolves.toMatchObject({
      decks: [{ available: 99, occupied: 300, percentFull: 75 }],
    });
  });

  it("preserves an explicit closed state from the trusted loader", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [{
          name: "Court Street Garage",
          available: 0,
          status: "OUT OF SERVICE",
        }],
      }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).resolves.toMatchObject({
      decks: [{ isClosed: true, isFull: false, isFilling: false }],
    });
  });

  it.each([
    {
      name: "HTML",
      response: new Response("<html>not a feed</html>", {
        headers: { "content-type": "text/html" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "an empty deck list",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "only unknown decks",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [{ name: "Unrelated Lot", available: 20 }],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "a known deck with placeholder occupancy",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [{
          name: "Court Street Garage",
          capacity: 400,
          available: "N/A",
        }],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "duplicate rows for one canonical garage",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [
          { name: "Court Street Garage", available: 20 },
          { name: "Court Street Deck", available: 21 },
        ],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "contradictory available and occupied counts",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [{
          name: "Court Street Garage",
          capacity: 400,
          available: 100,
          occupied: 100,
        }],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "a percentage that contradicts the counts",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [{
          name: "Court Street Garage",
          capacity: 400,
          available: 100,
          occupied: 300,
          percent_full: 10,
        }],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "too many rows",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: Array.from(
          { length: PARKING_OCCUPANCY_MAX_ROWS + 1 },
          (_, index) => ({ name: `Lot ${index}`, available: 20 }),
        ),
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "an oversized field",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [{
          name: `Court ${"x".repeat(PARKING_OCCUPANCY_MAX_FIELD_LENGTH)}`,
          available: 20,
        }],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "invalid-payload",
    },
    {
      name: "stale known-deck data",
      response: new Response(JSON.stringify({
        as_of: new Date(
          NOW_MS - PARKING_OCCUPANCY_MAX_AGE_MS - 1,
        ).toISOString(),
        decks: [{ name: "Court Street Garage", available: 20 }],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "stale",
    },
    {
      name: "a current envelope containing a stale deck",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T11:59:00.000Z",
        decks: [{
          name: "Court Street Garage",
          available: 20,
          updated: new Date(
            NOW_MS - PARKING_OCCUPANCY_MAX_AGE_MS - 1,
          ).toISOString(),
        }],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "stale",
    },
    {
      name: "a source timestamp too far in the future",
      response: new Response(JSON.stringify({
        as_of: "2026-07-31T12:03:00.000Z",
        decks: [{ name: "Court Street Garage", available: 20 }],
      }), {
        headers: { "content-type": "application/json" },
      }),
      reason: "stale",
    },
  ])("rejects $name without producing an empty success", async ({
    response,
    reason,
  }) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).rejects.toMatchObject({
      name: "ParkingOccupancyUnavailableError",
      reason,
    });
  });

  it("classifies an aborted fetch as a timeout without exposing the error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(
      new DOMException("licensed-test-key", "TimeoutError"),
    );

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).rejects.toMatchObject({
      name: "ParkingOccupancyUnavailableError",
      reason: "timeout",
      message: "Parking occupancy unavailable: timeout",
    });
  });

  it("rejects a non-HTTPS endpoint before making a request", async () => {
    process.env.PARKING_OCCUPANCY_URL =
      "http://parking.example.test/occupancy";
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).rejects.toMatchObject({ reason: "invalid-url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sanitizes a generic network failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError("fetch https://user:licensed-test-key@example.test failed"),
    );

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).rejects.toMatchObject({
      reason: "network",
      message: "Parking occupancy unavailable: network",
    });
  });

  it("classifies non-2xx responses without accepting their body", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "secret upstream detail" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).rejects.toMatchObject({ reason: "http" });
  });

  it("rejects a declared response larger than the feed budget", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        headers: {
          "content-type": "application/json",
          "content-length": String(PARKING_OCCUPANCY_MAX_BYTES + 1),
        },
      }),
    );

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).rejects.toMatchObject({ reason: "invalid-payload" });
  });

  it("stops an undeclared response that crosses the feed budget", async () => {
    const payload = JSON.stringify({
      as_of: "2026-07-31T11:59:00.000Z",
      decks: [{
        name: "Court Street Garage",
        available: 20,
        padding: "x".repeat(PARKING_OCCUPANCY_MAX_BYTES),
      }],
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(payload, {
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchParkingOccupancyFresh({
      fetchImpl,
      nowMs: NOW_MS,
    })).rejects.toMatchObject({ reason: "invalid-payload" });
  });
});

describe("parking occupancy availability", () => {
  const cachedSnapshot = (updated: string): ParkingOccupancySnapshot => ({
    asOf: updated,
    decks: [{
      garageSlug: "court-street-parking-garage-frederick",
      name: "Court Street Garage",
      available: 25,
      occupied: 375,
      capacity: 400,
      percentFull: 94,
      status: "OPEN",
      isClosed: false,
      isFull: true,
      isFilling: false,
      updated,
    }],
  });

  it("rejects a cached snapshot after the hard freshness limit", async () => {
    const staleAt = new Date(
      NOW_MS - PARKING_OCCUPANCY_MAX_AGE_MS - 1,
    ).toISOString();

    await expect(resolveParkingOccupancyResult(
      async () => cachedSnapshot(staleAt),
      NOW_MS,
    )).resolves.toMatchObject({
      status: "unavailable",
      reason: "stale",
    });
  });

  it("does not turn a failed cache refresh into an empty green snapshot", async () => {
    const result = await resolveParkingOccupancyResult(
      async () => {
        throw new Error("licensed-test-key");
      },
      NOW_MS,
    );

    expect(result).toEqual({
      status: "unavailable",
      checkedAt: "2026-07-31T12:00:00.000Z",
      reason: "network",
    });
    expect(JSON.stringify(result)).not.toContain("licensed-test-key");
  });

  it("requires explicit approval even when a URL was accidentally set", async () => {
    process.env.PARKING_OCCUPANCY_URL =
      "https://www.cityoffrederickmd.gov/161/Parking";

    await expect(getParkingOccupancyResult()).resolves.toMatchObject({
      status: "unavailable",
      reason: "disabled",
    });
    await expect(getParkingOccupancy()).resolves.toEqual({
      asOf: null,
      decks: [],
    });
  });

  it("reports a missing endpoint after explicit approval", async () => {
    process.env.PARKING_OCCUPANCY_ENABLED = "1";

    await expect(getParkingOccupancyResult()).resolves.toMatchObject({
      status: "unavailable",
      reason: "missing-url",
    });
  });
});
