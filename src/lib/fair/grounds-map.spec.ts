import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026MapAdditions,
  greatFrederickFair2026MapPatches,
} from "@/data/fair/great-frederick-fair-2026-map-overlays";

import {
  enrichFairGroundsMap,
  fairGroundsFeatureMatchesFilter,
  fairGroundsFeatureMatchesPlace,
  parseFairGroundsMap,
} from "./grounds-map";

const baseMap = parseFairGroundsMap(
  JSON.parse(
    readFileSync(
      resolve("public/data/fair/great-frederick-fair-2026-map.geojson"),
      "utf8",
    ),
  ),
);

const map = enrichFairGroundsMap(
  baseMap,
  greatFrederickFair2026MapPatches,
  greatFrederickFair2026MapAdditions,
);

describe("Fair grounds map", () => {
  it("ships a source-transparent reviewed OpenStreetMap base", () => {
    expect(baseMap.reviewedOn).toBe("2026-09-02");
    expect(baseMap.source.publisher).toBe("OpenStreetMap contributors");
    expect(baseMap.features).toHaveLength(44);
    expect(
      new Set(baseMap.features.map((feature) => feature.properties.id)).size,
    ).toBe(baseMap.features.length);
    expect(
      baseMap.features.every(
        (feature) =>
          feature.properties.id.startsWith("osm-") &&
          feature.properties.sourceUrl.startsWith(
            "https://www.openstreetmap.org/",
          ),
      ),
    ).toBe(true);
  });

  it("contains the visitor essentials without pretending every lot is mapped", () => {
    const byKind = (kind: string) =>
      baseMap.features.filter((feature) => feature.properties.kind === kind);

    expect(byKind("fairgrounds")).toHaveLength(1);
    expect(byKind("gate")).toHaveLength(8);
    expect(byKind("restroom").length).toBeGreaterThanOrEqual(7);
    expect(byKind("ticket").map((feature) => feature.properties.name)).toEqual([
      "Ticket booth",
      "Ticket booth",
    ]);
    expect(byKind("parking").map((feature) => feature.properties.name)).toEqual([
      "Great Frederick Fair Lot A",
    ]);
  });

  it("applies reviewed patches and additions without duplicate feature ids", () => {
    expect(greatFrederickFair2026MapPatches).toHaveLength(22);
    expect(greatFrederickFair2026MapAdditions).toHaveLength(9);
    expect(map.features).toHaveLength(53);
    expect(new Set(map.features.map((feature) => feature.properties.id)).size).toBe(
      map.features.length,
    );

    const baseIds = new Set(
      baseMap.features.map((feature) => feature.properties.id),
    );
    const patchTargets = greatFrederickFair2026MapPatches.map(
      (patch) => patch.targetId,
    );
    const additionIds = greatFrederickFair2026MapAdditions.map(
      (feature) => feature.properties.id,
    );

    expect(new Set(patchTargets).size).toBe(patchTargets.length);
    expect(patchTargets.every((targetId) => baseIds.has(targetId))).toBe(true);
    expect(new Set(additionIds).size).toBe(additionIds.length);
    expect(additionIds.every((id) => !baseIds.has(id))).toBe(true);
  });

  it("rejects duplicate or missing overlay targets and duplicate additions", () => {
    const patch = greatFrederickFair2026MapPatches[0];
    const addition = greatFrederickFair2026MapAdditions[0];

    expect(() => enrichFairGroundsMap(baseMap, [patch, patch], [])).toThrow(
      "Fair map feature patches must target unique ids",
    );
    expect(() =>
      enrichFairGroundsMap(
        baseMap,
        [{ targetId: "osm-way-0", properties: {} }],
        [],
      ),
    ).toThrow("Fair map feature patch targets missing id: osm-way-0");
    expect(() =>
      enrichFairGroundsMap(baseMap, [], [addition, addition]),
    ).toThrow(/Fair map feature ids must be unique/);
  });

  it("rejects non-HTTPS feature and information-source links", () => {
    const unsafeFeatureLink = structuredClone(map);
    const ownedFeature = unsafeFeatureLink.features.find(
      (feature) => !feature.properties.id.startsWith("osm-"),
    );
    if (!ownedFeature) throw new Error("Expected an owned Fair map feature");
    ownedFeature.properties.sourceUrl = "javascript:alert(1)";
    expect(() => parseFairGroundsMap(unsafeFeatureLink)).toThrow();

    const unsafeInformationLink = structuredClone(map);
    const sourcedFeature = unsafeInformationLink.features.find(
      (feature) => feature.properties.informationSource,
    );
    if (!sourcedFeature?.properties.informationSource) {
      throw new Error("Expected a sourced Fair map feature");
    }
    sourcedFeature.properties.informationSource.url = "http://example.com";
    expect(() => parseFairGroundsMap(unsafeInformationLink)).toThrow();
  });

  it("keeps official metadata on every owned annotation", () => {
    const annotatedFeatures = map.features.filter(
      (feature) => feature.properties.informationSource,
    );

    expect(annotatedFeatures).toHaveLength(
      greatFrederickFair2026MapPatches.length +
        greatFrederickFair2026MapAdditions.length,
    );
    expect(
      annotatedFeatures.every((feature) => {
        const source = feature.properties.informationSource;
        return (
          source !== undefined &&
          source.publisher.length > 1 &&
          source.title.length > 1 &&
          source.url.startsWith("https://") &&
          Number.isFinite(Date.parse(source.checkedAt))
        );
      }),
    ).toBe(true);
    expect(
      greatFrederickFair2026MapAdditions.every(
        (feature) =>
          !feature.properties.id.startsWith("osm-") &&
          feature.properties.informationSource !== undefined,
      ),
    ).toBe(true);

    expect(
      map.features.find(
        (feature) => feature.properties.id === "fair-arrival-lot-b",
      )?.properties.informationSource,
    ).toMatchObject({
      publisher: "The Great Frederick Fair",
      title: "Plan Your Visit",
    });
    const transitSource = map.features.find(
      (feature) => feature.properties.kind === "transit",
    )?.properties.informationSource;
    expect(transitSource).toMatchObject({
      publisher: "Transit Services of Frederick County",
      url: "https://www.frederickcountymd.gov/105/Transit-Services",
    });
    expect(transitSource?.title).toContain("GTFS");
  });

  it("keeps the arrival layer limited to arrival-relevant features", () => {
    const arrival = map.features.filter((feature) =>
      fairGroundsFeatureMatchesFilter(feature, "arrival"),
    );

    expect(arrival).toHaveLength(14);
    expect(
      arrival.filter((feature) => feature.properties.kind === "parking"),
    ).toHaveLength(5);
    expect(
      arrival.filter((feature) => feature.properties.kind === "transit"),
    ).toHaveLength(5);
    expect(
      arrival
        .filter((feature) => feature.properties.kind === "gate")
        .map((feature) => feature.properties.name),
    ).toEqual(["Gate 1", "Gate 3", "Gate 4A"]);
    expect(
      arrival.every(
        (feature) =>
          feature.properties.kind === "fairgrounds" ||
          feature.properties.kind === "parking" ||
          feature.properties.kind === "transit" ||
          feature.properties.filterIds?.includes("arrival"),
      ),
    ).toBe(true);
  });

  it("defaults to a calm essentials layer", () => {
    const essentials = map.features.filter((feature) =>
      fairGroundsFeatureMatchesFilter(feature, "essentials"),
    );
    expect(
      essentials.some((feature) => feature.properties.kind === "restroom"),
    ).toBe(true);
    expect(
      essentials.some((feature) => feature.properties.kind === "animal"),
    ).toBe(false);
  });

  it.each([
    ["Published place: Grandstand.", "osm-way-103615596"],
    [
      "Published place: Bldg. 28 - Farmer's Cooperative Small Livestock Arena.",
      "osm-way-1548624421",
    ],
    ["Published place: Bldg. 14A.", "osm-way-307321832"],
    [
      "Published place: Bldg. 18 - South Side Tire & Auto Beef Show Arena.",
      "osm-way-307321842",
    ],
    ["Published place: Horse Barns, Bldg. 23.", "osm-way-307321845"],
    [
      "Published place: City Streets Country Roads - Bldg. 44.",
      "osm-way-307321846",
    ],
    ["Published place: Bldg. 25.", "osm-way-307321847"],
    ["Published place: Bldg. 14.", "osm-way-307321848"],
    ["Published place: Bldg. 32.", "osm-way-307321849"],
    ["Published place: Bldg. 13.", "osm-way-307321854"],
  ])("maps the reviewed schedule venue %s to %s", (placeLabel, featureId) => {
    const matches = baseMap.features.filter((feature) =>
      fairGroundsFeatureMatchesPlace(feature, placeLabel),
    );

    expect(matches.map((feature) => feature.properties.id)).toEqual([featureId]);
  });

  it("does not confuse numbered buildings or invent Kid Zone geometry", () => {
    const buildingTwelve = baseMap.features.find(
      (feature) => feature.properties.name === "4-H Building",
    );
    const poultryAndRabbits = baseMap.features.find(
      (feature) => feature.properties.id === "osm-way-307321848",
    );

    expect(buildingTwelve).toBeDefined();
    expect(poultryAndRabbits).toBeDefined();
    expect(
      fairGroundsFeatureMatchesPlace(
        buildingTwelve!,
        "Published place: Bldg. 12.",
      ),
    ).toBe(true);
    expect(
      fairGroundsFeatureMatchesPlace(
        buildingTwelve!,
        "Published place: Kid Zone.",
      ),
    ).toBe(false);
    expect(
      fairGroundsFeatureMatchesPlace(
        poultryAndRabbits!,
        "Published place: Bldg. 14A.",
      ),
    ).toBe(false);
  });
});
