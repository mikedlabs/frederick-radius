import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCountyAddressQueryUrl,
  FREDERICK_COUNTY_ADDRESS_LAYER,
  lookupOfficialCountyAddress,
  parseCountyAddressInput,
} from "@/lib/ingest/fc-address-lookup";

const originalCountyGisEnabled = process.env.FREDERICK_COUNTY_GIS_ENABLED;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalCountyGisEnabled == null) {
    delete process.env.FREDERICK_COUNTY_GIS_ENABLED;
  } else {
    process.env.FREDERICK_COUNTY_GIS_ENABLED = originalCountyGisEnabled;
  }
});

function feature(
  overrides: {
    attributes?: Record<string, unknown>;
    geometry?: Record<string, unknown>;
  } = {},
) {
  return {
    attributes: {
      OBJECTID: 37326566,
      ADDRESSPT_ID: 85342,
      ST_NUM: 121,
      ST_NUM_SUFFIX: null,
      ST_FULL: "N BENTZ ST",
      ADD_FULL: "121 N BENTZ ST",
      ADD_COMPLETE: "121 N BENTZ ST, FREDERICK, MD 21701",
      CITY: "Frederick",
      STATE: "MD",
      ZIP_ADDR: "21701",
      STATUS: "ACT",
      UNIT_TYPE: null,
      UNIT_NUM: null,
      LAST_UPDATE: 1_784_236_676_000,
      ...overrides.attributes,
    },
    geometry: {
      x: -77.41461247196958,
      y: 39.41666638899463,
      ...overrides.geometry,
    },
  };
}

function response(
  features: unknown[],
  extras: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({
    spatialReference: { wkid: 4326, latestWkid: 4326 },
    features,
    ...extras,
  }));
}

function oversizedStreamingResponse(contentLength?: string): {
  response: Response;
  wasCancelled: () => boolean;
} {
  const chunks = [
    new Uint8Array(200_000),
    new Uint8Array(100_000),
    new Uint8Array(1),
  ];
  let index = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: new Response(stream, {
      headers: contentLength == null
        ? undefined
        : { "content-length": contentLength },
    }),
    wasCancelled: () => cancelled,
  };
}

describe("parseCountyAddressInput", () => {
  it("normalizes common direction, street-type, city, state, and ZIP forms", () => {
    expect(
      parseCountyAddressInput(
        "121 North Bentz Street, Frederick, Maryland 21701",
      ),
    ).toEqual({
      ok: true,
      query: {
        houseNumber: 121,
        houseNumberSuffix: undefined,
        streetFull: "N BENTZ ST",
        unitType: undefined,
        unitNumber: undefined,
        city: "FREDERICK",
        zip: "21701",
        normalizedAddress: "121 N BENTZ ST, FREDERICK, MD 21701",
      },
    });
  });

  it("keeps an exact unit and normalizes generic number signs", () => {
    expect(parseCountyAddressInput("4 East Church Street #4, Frederick, MD")).toMatchObject({
      ok: true,
      query: {
        houseNumber: 4,
        streetFull: "E CHURCH ST",
        unitType: "UNIT",
        unitNumber: "4",
        city: "FREDERICK",
      },
    });
    expect(parseCountyAddressInput("4 E Church St Suite 200")).toMatchObject({
      ok: true,
      query: { unitType: "SUITE", unitNumber: "200" },
    });
  });

  it("treats Mt Airy as a locality while still rejecting terminal out-of-state codes", () => {
    expect(
      parseCountyAddressInput("8 N Main St, Mt Airy, MD 21771"),
    ).toEqual({
      ok: true,
      query: {
        houseNumber: 8,
        houseNumberSuffix: undefined,
        streetFull: "N MAIN ST",
        unitType: undefined,
        unitNumber: undefined,
        city: "MT AIRY",
        zip: "21771",
        normalizedAddress: "8 N MAIN ST, MT AIRY, MD 21771",
      },
    });
    expect(
      parseCountyAddressInput("121 N Bentz St, Winchester, VA 22601"),
    ).toEqual({ ok: false, reason: "unsupported_state" });
  });

  it("rejects inputs that cannot identify one Maryland street address", () => {
    expect(parseCountyAddressInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseCountyAddressInput("Frederick, MD 21701")).toEqual({
      ok: false,
      reason: "imprecise",
    });
    expect(parseCountyAddressInput("PO Box 12, Frederick, MD")).toEqual({
      ok: false,
      reason: "imprecise",
    });
    expect(parseCountyAddressInput("121 N Bentz St, Winchester, VA 22601")).toEqual({
      ok: false,
      reason: "unsupported_state",
    });
    expect(parseCountyAddressInput(`1 ${"X".repeat(230)} Street`)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});

describe("buildCountyAddressQueryUrl", () => {
  it("builds an exact, active, WGS84, capped query with no credential", () => {
    const parsed = parseCountyAddressInput(
      "121 N Bentz Street, Frederick, MD 21701",
    );
    if (!parsed.ok) throw new Error("fixture did not parse");
    const url = new URL(buildCountyAddressQueryUrl(parsed.query));

    expect(`${url.origin}${url.pathname}`).toBe(
      `${FREDERICK_COUNTY_ADDRESS_LAYER}/query`,
    );
    expect(url.searchParams.get("where")).toBe(
      "ST_NUM = 121 AND ST_FULL = 'N BENTZ ST' AND STATUS = 'ACT' AND STATE = 'MD' AND (ST_NUM_SUFFIX IS NULL OR ST_NUM_SUFFIX = '') AND (UNIT_NUM IS NULL OR UNIT_NUM = '') AND ZIP_ADDR LIKE '21701%'",
    );
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("returnGeometry")).toBe("true");
    expect(url.searchParams.get("resultRecordCount")).toBe("25");
    expect(url.searchParams.get("orderByFields")).toBe("OBJECTID ASC");
    expect(url.search).not.toMatch(/(?:key|token|credential)=/i);
  });

  it("escapes apostrophes in the allowlisted exact street clause", () => {
    const parsed = parseCountyAddressInput("12 O'Connell Street, Frederick, MD");
    if (!parsed.ok) throw new Error("fixture did not parse");
    const where = new URL(buildCountyAddressQueryUrl(parsed.query)).searchParams.get(
      "where",
    );
    expect(where).toContain("ST_FULL = 'O''CONNELL ST'");
  });
});

describe("lookupOfficialCountyAddress", () => {
  it("honors the County GIS kill switch without making a request", async () => {
    process.env.FREDERICK_COUNTY_GIS_ENABLED = "0";
    const fetchImpl = vi.fn();

    await expect(
      lookupOfficialCountyAddress("121 N Bentz St, Frederick, MD 21701", {
        fetchImpl,
      }),
    ).resolves.toEqual({
      status: "disabled",
      reason: "county_gis_disabled",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns one exact official match and its source freshness", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([feature()]));

    await expect(
      lookupOfficialCountyAddress(
        "121 North Bentz Street, Frederick, MD 21701",
        { fetchImpl },
      ),
    ).resolves.toEqual({
      status: "match",
      source: "frederick_county_address_points",
      normalizedAddress: "121 N BENTZ ST, FREDERICK, MD 21701",
      officialAddress: "121 N BENTZ ST, FREDERICK, MD 21701",
      coordinate: {
        lng: -77.41461247196958,
        lat: 39.41666638899463,
      },
      objectId: 37326566,
      addressPointId: 85342,
      updatedAt: "2026-07-16T21:17:56.000Z",
      sourceRecords: 1,
    });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init).toMatchObject({
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("collapses duplicate source rows only when address and point agree", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response([
        feature(),
        feature({ attributes: { OBJECTID: 37326567 } }),
      ]),
    );

    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", { fetchImpl }),
    ).resolves.toMatchObject({ status: "match", sourceRecords: 2 });
  });

  it("rejects multiple exact candidates at different points as ambiguous", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response([
        feature(),
        feature({
          attributes: { OBJECTID: 37326567 },
          geometry: { x: -77.4141, y: 39.4168 },
        }),
      ]),
    );

    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", { fetchImpl }),
    ).resolves.toEqual({
      status: "ambiguous",
      reason: "multiple_exact_matches",
      normalizedAddress: "121 N BENTZ ST, MD",
      candidateCount: 2,
    });
  });

  it("rejects truncated results rather than guessing from the first page", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response([feature()], { exceededTransferLimit: true }),
    );

    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", { fetchImpl }),
    ).resolves.toMatchObject({
      status: "ambiguous",
      reason: "result_limit",
      candidateCount: 1,
    });
  });

  it("separates exact misses from out-of-county source coordinates", async () => {
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", {
        fetchImpl: vi.fn().mockResolvedValue(response([])),
      }),
    ).resolves.toMatchObject({
      status: "not_found",
      reason: "no_exact_match",
    });

    // Smithsburg is inside the coarse bbox but outside Frederick County.
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", {
        fetchImpl: vi.fn().mockResolvedValue(
          response([feature({ geometry: { x: -77.5728, y: 39.6551 } })]),
        ),
      }),
    ).resolves.toMatchObject({
      status: "not_found",
      reason: "outside_county",
    });
  });

  it("does not accept an inexact feature returned by the upstream service", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response([feature({ attributes: { ST_FULL: "S BENTZ ST" } })]),
    );
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", { fetchImpl }),
    ).resolves.toMatchObject({
      status: "not_found",
      reason: "no_exact_match",
    });
  });

  it("accepts a generic number-sign unit only when the unit number agrees", async () => {
    const church = feature({
      attributes: {
        OBJECTID: 37313689,
        ADDRESSPT_ID: 97292,
        ST_NUM: 4,
        ST_FULL: "E CHURCH ST",
        ADD_FULL: "4 E CHURCH ST APT 4",
        ADD_COMPLETE: "4 E CHURCH ST APT 4, FREDERICK, MD 21701",
        UNIT_TYPE: "APT",
        UNIT_NUM: "4",
      },
      geometry: { x: -77.410417293, y: 39.4151988644 },
    });
    const fetchImpl = vi.fn().mockResolvedValue(response([church]));

    await expect(
      lookupOfficialCountyAddress("4 E Church St #4, Frederick, MD 21701", {
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "match",
      officialAddress: "4 E CHURCH ST APT 4, FREDERICK, MD 21701",
    });
  });

  it("uses an exact ZIP over a different County mailing-locality label", async () => {
    const bennettCreek = feature({
      attributes: {
        OBJECTID: 4001,
        ADDRESSPT_ID: 5001,
        ST_NUM: 3260,
        ST_FULL: "BENNETT CREEK AVE",
        ADD_FULL: "3260 BENNETT CREEK AVE",
        ADD_COMPLETE: "3260 BENNETT CREEK AVE, FREDERICK, MD 21704",
        CITY: "Frederick",
        ZIP_ADDR: "21704",
      },
      geometry: { x: -77.344, y: 39.326 },
    });

    await expect(
      lookupOfficialCountyAddress(
        "3260 Bennett Creek Avenue, Urbana, MD 21704",
        { fetchImpl: vi.fn().mockResolvedValue(response([bennettCreek])) },
      ),
    ).resolves.toMatchObject({
      status: "match",
      officialAddress: "3260 BENNETT CREEK AVE, FREDERICK, MD 21704",
    });
  });

  it("still requires an exact city when no ZIP is supplied", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response([feature({ attributes: { CITY: "Middletown" } })]),
    );
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St, Frederick, MD", {
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "not_found",
      reason: "no_exact_match",
    });
  });

  it("reports malformed payloads, ArcGIS errors, and HTTP failures honestly", async () => {
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", {
        fetchImpl: vi.fn().mockResolvedValue(new Response("not json")),
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "invalid_response" });
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", {
        fetchImpl: vi.fn().mockResolvedValue(response([null])),
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "invalid_response" });
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", {
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: { code: 400 } })),
        ),
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "arcgis_error" });
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", {
        fetchImpl: vi.fn().mockResolvedValue(new Response("down", { status: 503 })),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "http_error",
      httpStatus: 503,
    });
  });

  it("bounds response size", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("{}", { headers: { "content-length": "300000" } }),
    );
    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", { fetchImpl }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "response_too_large",
    });
  });

  it("enforces the byte ceiling when Content-Length is missing or false", async () => {
    for (const declaredLength of [undefined, "1"]) {
      const streamed = oversizedStreamingResponse(declaredLength);
      await expect(
        lookupOfficialCountyAddress("121 N Bentz St", {
          fetchImpl: vi.fn().mockResolvedValue(streamed.response),
        }),
      ).resolves.toEqual({
        status: "unavailable",
        reason: "response_too_large",
      });
      expect(streamed.wasCancelled()).toBe(true);
    }
  });

  it("counts UTF-8 bytes instead of JavaScript characters", async () => {
    const text = JSON.stringify({
      features: [],
      padding: "😀".repeat(66_000),
    });
    expect(text.length).toBeLessThan(256 * 1_024);
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(
      256 * 1_024,
    );

    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", {
        fetchImpl: vi.fn().mockResolvedValue(new Response(text)),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "response_too_large",
    });
  });

  it("distinguishes a timeout from another network failure", async () => {
    vi.useFakeTimers();
    const timeoutFetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = lookupOfficialCountyAddress("121 N Bentz St", {
      fetchImpl: timeoutFetch as typeof fetch,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toEqual({
      status: "unavailable",
      reason: "timeout",
    });
    vi.useRealTimers();

    await expect(
      lookupOfficialCountyAddress("121 N Bentz St", {
        fetchImpl: vi.fn().mockRejectedValue(new TypeError("offline")),
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "network" });
  });

  it("keeps the timeout active while the response body is being read", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      });
      return new Response(stream);
    });
    const pending = lookupOfficialCountyAddress("121 N Bentz St", {
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).resolves.toEqual({
      status: "unavailable",
      reason: "timeout",
    });
  });
});
