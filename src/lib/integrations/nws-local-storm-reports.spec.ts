import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNwsLocalStormReportsResult,
  localStormReportState,
  parseNwsLocalStormReportProduct,
} from "./nws-local-storm-reports";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const PRODUCT_URL =
  "https://api.weather.gov/products/f312cb02-d9dd-45ee-aec6-3c7b21fd5eb0";
const PRODUCT_TEXT = `
Preliminary Local Storm Report
National Weather Service Baltimore MD/Washington DC
327 PM EDT Wed May 20 2026

..TIME...   ...EVENT...      ...CITY LOCATION...     ...LAT.LON...
..DATE...   ....MAG....      ..COUNTY LOCATION..ST.. ...SOURCE....
            ..REMARKS..

0311 PM     Tstm Wnd Dmg     2 SE Jefferson          39.34N  77.51W
05/20/2026                   Frederick          MD   Dept of Highways

            Trees blew down on US-15 at Mountville Road.

0520 PM     Tstm Wnd Dmg     1 W High View Manor     39.16N  78.35W
05/20/2026                   Frederick          VA   911 Call Center

            Tree down on Fishel Road near Back Mountain Road.

&&
$$
`;

function parse(now = new Date("2026-05-20T20:00:00.000Z")) {
  return parseNwsLocalStormReportProduct(PRODUCT_TEXT, {
    productUrl: PRODUCT_URL,
    issuedAt: "2026-05-20T19:27:00.000Z",
    retrievedAt: "2026-05-20T20:00:00.000Z",
    now,
  });
}

describe("NWS LWX Local Storm Report parsing", () => {
  it("keeps Frederick County MD and excludes Frederick County VA", () => {
    const reports = parse();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      kind: "local-storm-report",
      title: "Tstm Wnd Dmg",
      event: "Tstm Wnd Dmg",
      location: "2 SE Jefferson",
      county: "Frederick",
      stateCode: "MD",
      lat: 39.34,
      lng: -77.51,
      summary: "Trees blew down on US-15 at Mountville Road.",
      reportingSource: "Dept of Highways",
      state: "recent",
      active: false,
      confidence: "preliminary-official",
      preliminary: true,
      occurredAt: "2026-05-20T19:11:00.000Z",
      publishedAt: "2026-05-20T19:27:00.000Z",
    });
    expect(reports[0].provenance).toMatchObject({
      publisher: "National Weather Service Baltimore/Washington",
      authority: "official-government",
      sourceKind: "nws-text-product",
      canonicalUrl: PRODUCT_URL,
      confidence: "preliminary-official",
    });
  });

  it("marks an old observation expired without calling it an active warning", () => {
    const [report] = parse(new Date("2026-05-22T20:00:00.000Z"));
    expect(report.state).toBe("expired");
    expect(report.active).toBe(false);
    expect(
      localStormReportState(
        report.occurredAt!,
        new Date("2026-05-20T20:00:00.000Z"),
      ),
    ).toBe("recent");
  });

  it("rejects non-NWS canonical product URLs", () => {
    expect(
      parseNwsLocalStormReportProduct(PRODUCT_TEXT, {
        productUrl: "https://example.com/products/bad",
        issuedAt: "2026-05-20T19:27:00.000Z",
      }),
    ).toEqual([]);
  });
});

describe("NWS LWX Local Storm Report availability", () => {
  it("treats a valid empty product index as available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ "@graph": [] }),
      ),
    );

    await expect(
      getNwsLocalStormReportsResult({
        now: new Date("2026-05-20T20:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      reports: [],
      available: true,
      degraded: false,
      attemptedProducts: 0,
      loadedProducts: 0,
    });
  });

  it("loads recent products, filters geography, and reports adapter health", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/products/types/LSR/locations/LWX")) {
        return Response.json({
          "@graph": [
            {
              "@id": PRODUCT_URL,
              id: "f312cb02-d9dd-45ee-aec6-3c7b21fd5eb0",
              issuingOffice: "KLWX",
              issuanceTime: "2026-05-20T19:27:00.000Z",
              productCode: "LSR",
            },
          ],
        });
      }
      return Response.json({
        "@id": PRODUCT_URL,
        id: "f312cb02-d9dd-45ee-aec6-3c7b21fd5eb0",
        issuingOffice: "KLWX",
        issuanceTime: "2026-05-20T19:27:00.000Z",
        productCode: "LSR",
        productText: PRODUCT_TEXT,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getNwsLocalStormReportsResult({
      now: new Date("2026-05-20T20:00:00.000Z"),
    });

    expect(result).toMatchObject({
      available: true,
      degraded: false,
      asOf: "2026-05-20T19:27:00.000Z",
      attemptedProducts: 1,
      loadedProducts: 1,
    });
    expect(result.reports).toHaveLength(1);
    expect(result.coverageNote).toMatch(/use active NWS alerts/i);
  });

  it("fails soft when the product index stalls", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
    );

    const pending = getNwsLocalStormReportsResult({ deadlineMs: 50 });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toMatchObject({
      reports: [],
      available: false,
    });
    expect(signal?.aborted).toBe(true);
  });
});
