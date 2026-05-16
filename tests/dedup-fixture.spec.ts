import { describe, it, expect } from "vitest";
import { buildDedup, type DedupPlace } from "@/lib/dedup";

/**
 * P0-3 acceptance: a fixture of the audit's known duplicates must fold
 * to one canonical each, with the curated (seed) record winning.
 */
const GEO = { lat: 39.4145, lng: -77.4106 };

const fixture: DedupPlace[] = [
  // Isabella's Taverna: three spellings, one real place.
  { slug: "isabellas-taverna-tapas-bar-frederick", name: "Isabella's Taverna & Tapas Bar", address: "44 N Market St", geom: GEO, source: "seed" },
  { slug: "isabellas-taverna-and-tapas-bar", name: "Isabellas Taverna and Tapas Bar", address: "44 N Market St", geom: GEO, source: "osm" },
  { slug: "isabellas-taverna-tapas-bar", name: "Isabellas Taverna Tapas Bar", address: "44 N Market St", geom: GEO, source: "osm" },
  // Brewer's Alley: curated plus OSM.
  { slug: "brewers-alley-frederick", name: "Brewer's Alley", address: "124 N Market St", geom: { lat: 39.415, lng: -77.4107 }, source: "seed" },
  { slug: "brewers-alley", name: "Brewers Alley", address: "124 N Market St", geom: { lat: 39.415, lng: -77.4107 }, source: "osm" },
  // A genuinely different place nearby must NOT fold in.
  { slug: "the-tasting-room-frederick", name: "The Tasting Room", address: "101 N Market St", geom: { lat: 39.4148, lng: -77.4104 }, source: "seed" },
];

describe("buildDedup on known duplicates (P0-3)", () => {
  const out = buildDedup(fixture);

  it("folds all three Isabella's spellings to the curated record", () => {
    const canon = "isabellas-taverna-tapas-bar-frederick";
    expect(out["isabellas-taverna-tapas-bar-frederick"]?.canonical).toBe(canon);
    expect(out["isabellas-taverna-and-tapas-bar"]?.canonical).toBe(canon);
    expect(out["isabellas-taverna-tapas-bar"]?.canonical).toBe(canon);
  });

  it("folds Brewer's Alley OSM into the curated record", () => {
    expect(out["brewers-alley"]?.canonical).toBe("brewers-alley-frederick");
  });

  it("does not fold a genuinely different neighbor", () => {
    // No dedup entry, or it is its own canonical: never folded away.
    const e = out["the-tasting-room-frederick"];
    expect(!e || e.canonical === "the-tasting-room-frederick").toBe(true);
  });
});
