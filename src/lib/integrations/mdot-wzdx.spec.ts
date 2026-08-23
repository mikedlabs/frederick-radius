import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMdotWorkZonesFrederickResult,
  MDOT_WZDX_SOURCE_URL,
  normalizeMdotWzdx,
} from "./mdot-wzdx";

const NOW = new Date("2026-07-28T16:00:00.000Z");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    type: "FeatureCollection",
    feed_info: {
      publisher: "Maryland DOT SHA",
      update_frequency: 60,
      update_date: "2026-07-28T15:59:00Z",
      version: "4.1",
      contact_email: "do-not-leak@example.test",
    },
    features: [{
      id: "zone-1",
      type: "Feature",
      properties: {
        is_start_position_verified: true,
        is_end_position_verified: true,
        vehicle_impact: "some-lanes-closed",
        lanes: [
          { order: 1, status: "open", type: "general" },
          { order: 2, status: "closed", type: "general" },
        ],
        core_details: {
          data_source_id: "internal-provider-id",
          event_type: "work-zone",
          road_names: ["I70", "BALTO NATIONAL PIKE"],
          direction: "westbound",
          description: "Active Closure @ I-70 WEST BETWEEN MD 85 AND US 15",
          creation_date: "2026-07-27T12:00:00Z",
          update_date: "2026-07-28T15:58:00Z",
        },
        start_date: "2026-07-28T14:00:00Z",
        end_date: "2026-07-29T04:00:00Z",
        is_start_date_verified: true,
        is_end_date_verified: false,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-77.452, 39.403],
          [-77.347, 39.404],
        ],
      },
    }],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Maryland WZDx normalization", () => {
  it("returns only clean consumer fields and preserves line geometry", () => {
    const result = normalizeMdotWzdx(payload(), NOW);

    expect(result).toMatchObject({
      available: true,
      asOf: "2026-07-28T15:59:00.000Z",
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    });
    expect(result.data).toEqual([expect.objectContaining({
      id: "zone-1",
      road: "I-70",
      roadNames: ["I-70", "BALTO NATIONAL PIKE"],
      description: "I-70 WEST BETWEEN MD 85 AND US 15",
      direction: "westbound",
      status: "active",
      lanes: {
        total: 2,
        closed: 1,
        summary: "some-lanes-closed",
      },
      positionConfidence: "verified",
      geometry: {
        type: "LineString",
        coordinates: [
          [-77.452, 39.403],
          [-77.347, 39.404],
        ],
      },
    })]);
    expect(JSON.stringify(result)).not.toContain("contact_email");
    expect(JSON.stringify(result)).not.toContain("internal-provider-id");
  });

  it("keeps a scheduled zone distinct from an active closure", () => {
    const raw = payload();
    const feature = (raw.features as Array<Record<string, unknown>>)[0];
    const properties = feature.properties as Record<string, unknown>;
    properties.start_date = "2026-07-28T20:00:00Z";
    properties.end_date = "2026-07-29T04:00:00Z";

    expect(normalizeMdotWzdx(raw, NOW).data[0].status).toBe("scheduled");
  });

  it("turns provider route codes and repeated directions into readable copy", () => {
    const raw = payload();
    const core = (((raw.features as Array<Record<string, unknown>>)[0]
      .properties as Record<string, unknown>).core_details as Record<string, unknown>);
    core.road_names = ["US15BU"];
    core.description = "Active Closure @ US 15 SOUTH SOUTH OF MM 1.0";

    expect(normalizeMdotWzdx(raw, NOW).data[0]).toMatchObject({
      road: "US 15 Business",
      description: "US 15 SOUTH OF MM 1.0",
    });
  });

  it("suppresses expired, stale, malformed, and out-of-county records", () => {
    const expired = payload();
    const expiredProperties = ((expired.features as Array<Record<string, unknown>>)[0]
      .properties as Record<string, unknown>);
    expiredProperties.end_date = "2026-07-28T12:00:00Z";
    expect(normalizeMdotWzdx(expired, NOW).data).toEqual([]);

    const stale = payload();
    const staleCore = (((stale.features as Array<Record<string, unknown>>)[0]
      .properties as Record<string, unknown>).core_details as Record<string, unknown>);
    staleCore.update_date = "2026-07-28T08:00:00Z";
    expect(normalizeMdotWzdx(stale, NOW).data).toEqual([]);

    const outside = payload();
    (outside.features as Array<Record<string, unknown>>)[0].geometry = {
      type: "LineString",
      coordinates: [[-76.61, 39.29], [-76.60, 39.30]],
    };
    expect(normalizeMdotWzdx(outside, NOW).data).toEqual([]);

    const malformed = payload();
    (malformed.features as Array<Record<string, unknown>>)[0].geometry = {
      type: "LineString",
      coordinates: [["bad", 39.4]],
    };
    expect(normalizeMdotWzdx(malformed, NOW).data).toEqual([]);
  });

  it("marks an old or wrong-version feed unavailable, not successfully empty", () => {
    expect(normalizeMdotWzdx(payload({
      feed_info: {
        version: "4.1",
        update_date: "2026-07-28T15:00:00Z",
      },
    }), NOW).available).toBe(false);
    expect(normalizeMdotWzdx(payload({
      feed_info: {
        version: "5.0",
        update_date: "2026-07-28T15:59:00Z",
      },
    }), NOW).available).toBe(false);
  });
});

describe("Maryland WZDx fetch boundary", () => {
  it("uses a bounded cached fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload()));
    vi.stubGlobal("fetch", fetchMock);
    vi.setSystemTime(NOW);

    await expect(getMdotWorkZonesFrederickResult({
      deadlineMs: 500,
      revalidateSeconds: 90,
    })).resolves.toMatchObject({ available: true });
    expect(fetchMock).toHaveBeenCalledWith(
      MDOT_WZDX_SOURCE_URL,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        next: { revalidate: 90 },
      }),
    );
  });

  it("aborts a stalled feed and fails closed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")));
      });
    }));

    const pending = getMdotWorkZonesFrederickResult({ deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toEqual({
      data: [],
      available: false,
      sourceUrl: MDOT_WZDX_SOURCE_URL,
    });
    expect(signal?.aborted).toBe(true);
  });
});
