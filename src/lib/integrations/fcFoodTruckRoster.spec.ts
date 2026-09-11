import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverLicensedRosterUrl,
  fetchLicensedFoodTruckRosterDocument,
  fileNameFromContentDisposition,
  rosterDateFromFileName,
} from "./fcFoodTruckRoster";

const originalApproval = process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
const originalApprovedSources =
  process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalApproval == null) {
    delete process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED;
  } else {
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = originalApproval;
  }
  if (originalApprovedSources == null) {
    delete process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES;
  } else {
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES =
      originalApprovedSources;
  }
});

describe("licensed mobile-unit roster discovery", () => {
  it("discovers only the official semantically labeled DocumentCenter link", () => {
    const html = `
      <a href="https://evil.example/DocumentCenter/View/1">
        Mobile Units Licensed to operate in Frederick County
      </a>
      <a rel="noopener"
         href="/DocumentCenter/View/7041/FCHD-Licensed-Mobile-Units---As-of-8192022?bidId=">
        Mobile Units Licensed to operate in Frederick County
      </a>
    `;
    expect(discoverLicensedRosterUrl(html)).toBe(
      "https://health.frederickcountymd.gov/DocumentCenter/View/7041/FCHD-Licensed-Mobile-Units---As-of-8192022?bidId=",
    );
  });

  it("reads the issued date from the response filename, not the stale page slug", () => {
    const disposition =
      "inline;filename=FCHD%20Licensed%20Mobile%20Units%20-%20As%20of%206.29.26_202606291520534577.pdf";
    const fileName = fileNameFromContentDisposition(disposition);
    expect(fileName).toBe(
      "FCHD Licensed Mobile Units - As of 6.29.26_202606291520534577.pdf",
    );
    expect(rosterDateFromFileName(fileName)).toBe("2026-06-29");
  });

  it("returns document metadata without claiming trucks are open or located", async () => {
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = "1";
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES =
      "fc_food_truck_roster";
    const html = `
      <a href="/DocumentCenter/View/7041/FCHD-Licensed-Mobile-Units?bidId=">
        Mobile Units Licensed to operate in Frederick County
      </a>
    `;
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-length": String(html.length),
            date: "Tue, 28 Jul 2026 15:30:00 GMT",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([37, 80, 68, 70]), {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-length": "199638",
            "content-disposition":
              "inline;filename=FCHD%20Licensed%20Mobile%20Units%20-%20As%20of%206.29.26_202606291520534577.pdf",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchLicensedFoodTruckRosterDocument();

    expect(result).toMatchObject({
      configured: true,
      availability: "available",
      records: [
        {
          kind: "licensed_mobile_unit_roster",
          format: "pdf",
          dataAsOf: "2026-06-29",
          rosterEntries: "not_parsed_at_runtime",
          openStatus: "not_provided",
          currentLocation: "not_provided",
        },
      ],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the discovered document is not a PDF", async () => {
    process.env.FREDERICK_COUNTY_GIS_REUSE_APPROVED = "1";
    process.env.FREDERICK_COUNTY_GIS_APPROVED_SOURCES =
      "fc_food_truck_roster";
    const html = `
      <a href="/DocumentCenter/View/7041/current">
        Mobile Units Licensed to operate in Frederick County
      </a>
    `;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(html, {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        )
        .mockResolvedValueOnce(
          new Response("<html>error</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
    );

    await expect(fetchLicensedFoodTruckRosterDocument()).resolves.toMatchObject({
      configured: true,
      availability: "unavailable",
      records: [],
    });
  });
});
