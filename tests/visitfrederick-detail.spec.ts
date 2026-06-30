/**
 * parseVisitFrederickDetail: the JSON-LD enrichment boundary for Visit
 * Frederick. The RSS gives only a town centroid and no venue; each detail page
 * embeds a schema.org Event with the real venue, address, and coordinates. This
 * asserts we pull those, select the Event among several JSON-LD blocks, vouch
 * for the coordinate (in-county only), and never throw on malformed input —
 * plus that a precise coord lifts the card to a real, distance-bearing geo
 * confidence via the placement thread.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseVisitFrederickDetail } from "@/lib/integrations/visitfrederick";
import { liveToCardEvent } from "@/lib/loaders/liveEvents";
import type { LiveEvent } from "@/lib/integrations/ical-live";

const detailHtml = readFileSync(
  fileURLToPath(new URL("./fixtures/visitfrederick-detail.html", import.meta.url)),
  "utf8",
);

describe("parseVisitFrederickDetail", () => {
  it("extracts venue, address, in-county geo, and description from the Event JSON-LD", () => {
    const d = parseVisitFrederickDetail(detailHtml);
    expect(d).not.toBeNull();
    expect(d!.venue_name).toBe("Frederick City Hall");
    expect(d!.address).toBe("101 N. Court St., Frederick, MD 21701");
    expect(d!.geom).toEqual({ lng: -77.4127749, lat: 39.4157432 });
    expect(d!.description).toContain("250th anniversary");
  });

  it("skips non-Event JSON-LD blocks (the decoy BreadcrumbList)", () => {
    // The fixture's first ld+json block is a BreadcrumbList; the parser must
    // walk past it to the Event block rather than returning on the first JSON.
    const d = parseVisitFrederickDetail(detailHtml);
    expect(d?.venue_name).toBe("Frederick City Hall");
  });

  it("drops an out-of-county coordinate rather than vouch for it", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Event",
      name: "Somewhere far",
      location: { "@type": "Place", name: "Baltimore Thing", geo: { latitude: 39.29, longitude: -76.61 } },
    })}</script>`;
    const d = parseVisitFrederickDetail(html);
    expect(d).not.toBeNull();
    expect(d!.venue_name).toBe("Baltimore Thing");
    expect(d!.geom).toBeNull(); // out of bbox -> no precise coord
  });

  it("finds the Event inside an @graph wrapper", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "http://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "site" },
        { "@type": "Event", name: "Graph Event", location: { "@type": "Place", name: "Sky Stage", geo: { latitude: 39.414, longitude: -77.411 } } },
      ],
    })}</script>`;
    const d = parseVisitFrederickDetail(html);
    expect(d?.venue_name).toBe("Sky Stage");
    expect(d?.geom).toEqual({ lng: -77.411, lat: 39.414 });
  });

  it("returns null for no JSON-LD, and never throws on malformed JSON", () => {
    expect(parseVisitFrederickDetail("<html>nothing here</html>")).toBeNull();
    expect(parseVisitFrederickDetail("")).toBeNull();
    expect(
      parseVisitFrederickDetail('<script type="application/ld+json">{ not valid json,,, }</script>'),
    ).toBeNull();
  });
});

describe("placement thread -> geo confidence", () => {
  function liveRow(over: Partial<LiveEvent> = {}): LiveEvent {
    return {
      id: "vf-1",
      title: "A Thing",
      description: "",
      starts_at: "2026-07-01T16:00:00.000Z",
      ends_at: "2026-07-02T03:59:59.000Z",
      venue_name: "",
      address: "",
      geom: { lng: -77.4127749, lat: 39.4157432 }, // a precise, non-centroid coord
      municipality: "frederick",
      category: "community",
      organizer: "Visit Frederick",
      source: "visit-frederick",
      source_label: "Visit Frederick",
      url: "https://www.visitfrederick.org/event/x/1/",
      is_free: false,
      status: "scheduled",
      last_verified_at: "2026-06-29T12:00:00.000Z",
      ...over,
    };
  }

  it("a precise coord WITHOUT placement stays 'unknown' (lists, no distance)", () => {
    expect(liveToCardEvent(liveRow()).geo_confidence).toBe("unknown");
  });

  it("a precise coord WITH placement:'geocoded' becomes 'exact_address' (real distance)", () => {
    expect(liveToCardEvent(liveRow({ placement: "geocoded" })).geo_confidence).toBe("exact_address");
  });

  it("a town-centroid coord stays 'area' regardless", () => {
    const centroid = liveRow({ geom: { lng: -77.4105, lat: 39.4143 }, placement: undefined });
    expect(liveToCardEvent(centroid).geo_confidence).toBe("area");
  });
});
