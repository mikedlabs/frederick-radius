import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  greatFrederickFair2026MapAdditions,
  greatFrederickFair2026MapPatches,
} from "@/data/fair/great-frederick-fair-2026-map-overlays";
import {
  greatFrederickFair2026Pack,
  greatFrederickFair2026PackPointer,
} from "@/data/fair/great-frederick-fair-2026-pack";
import { buildFairDayWorkspaceData } from "@/components/fair/buildFairDayWorkspaceData";

import {
  enrichFairGroundsMap,
  fairGroundsFeatureMatchesFilter,
  fairGroundsFeatureMatchesPlace,
  parseFairGroundsMap,
  resolveFairGroundsFeatureId,
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
    expect(baseMap.reviewedOn).toBe("2026-09-04");
    expect(baseMap.source.snapshotSha256).toBe(
      "eb5f3bbb245b6aa8ba357f032df718c07af2e559e91c2c5b963b633e10c23c5a",
    );
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

  it("keeps every published program map action resolvable to one reviewed place", () => {
    const workspace = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-04T16:00:00Z"),
    );
    const mappedProgramItems = workspace.scheduleItems.filter((item) =>
      item.placeLabel.startsWith("Published place:"),
    );

    expect(mappedProgramItems).toHaveLength(193);
    expect(
      mappedProgramItems.every(
        (item) =>
          resolveFairGroundsFeatureId(map.features, [item.placeLabel]) !== null,
      ),
    ).toBe(true);
  });

  it("maps the printed music and Bluey additions to their reviewed places without guessing a character meeting point", () => {
    const workspace = buildFairDayWorkspaceData(
      greatFrederickFair2026Pack,
      greatFrederickFair2026PackPointer,
      new Date("2026-09-21T16:00:00Z"),
    );
    const music = workspace.scheduleItems.filter((item) =>
      item.id.includes("-pdf-funky-"),
    );
    const bluey = workspace.scheduleItems.filter((item) =>
      item.id.endsWith("-pdf-bluey"),
    );
    const characters = workspace.scheduleItems.filter((item) =>
      item.id.endsWith("-pdf-character"),
    );

    expect(music).toHaveLength(43);
    expect(bluey).toHaveLength(3);
    expect(characters).toHaveLength(9);
    for (const item of music) {
      expect(
        map.features
          .filter((feature) => fairGroundsFeatureMatchesPlace(feature, item.placeLabel))
          .map((feature) => feature.properties.id),
        item.title,
      ).toEqual(["fair-service-funky-joes-free-stage"]);
    }
    for (const item of bluey) {
      expect(
        map.features
          .filter((feature) => fairGroundsFeatureMatchesPlace(feature, item.placeLabel))
          .map((feature) => feature.properties.id),
        item.title,
      ).toEqual(["osm-way-103615601"]);
    }
    for (const item of characters) {
      expect(item.placeLabel).not.toMatch(/^Published place:/);
      expect(resolveFairGroundsFeatureId(map.features, [item.placeLabel])).toBeNull();
    }
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
    expect(greatFrederickFair2026MapPatches).toHaveLength(32);
    expect(greatFrederickFair2026MapAdditions).toHaveLength(13);
    expect(map.features).toHaveLength(57);
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

    expect(arrival).toHaveLength(18);
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
    ).toEqual([
      "Gate 1 · Pedestrians only", "Gate 2 · Pedestrians only", "Gate 3",
      "Gate 4 · Exit only", "Gate 4A · Pedestrians only",
      "Gate 5 · Exhibitors only", "Gate 6 · Closed",
    ]);
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
    expect(essentials).toHaveLength(26);
    expect(
      essentials.some((feature) => feature.properties.kind === "restroom"),
    ).toBe(true);
    expect(
      essentials.some((feature) => feature.properties.kind === "animal"),
    ).toBe(false);
    expect(
      essentials.map((feature) => feature.properties.name),
    ).toEqual(
      expect.arrayContaining([
        "Administration (Building 3)",
        "Youth Indoor Exhibits (Building 12)",
        "First Aid near Building 15",
        "Information booth near Gate 4A",
      ]),
    );
  });

  it("keeps unlicensed food and vendor placement out of the geographic map", () => {
    expect(
      map.features.filter((feature) =>
        fairGroundsFeatureMatchesFilter(feature, "food"),
      ),
    ).toEqual([]);
  });

  it("makes non-public gates explicit without routing visitors to them", () => {
    const restrictions = new Map(
      ["Gate 4 · Exit only", "Gate 5 · Exhibitors only", "Gate 6 · Closed"].map((name) => {
        const feature = map.features.find(
          (candidate) => candidate.properties.name === name,
        );
        if (!feature) throw new Error(`Expected ${name}`);
        return [name, feature] as const;
      }),
    );

    expect(restrictions.get("Gate 4 · Exit only")?.properties.detail).toContain("Exit only");
    expect(restrictions.get("Gate 5 · Exhibitors only")?.properties.detail).toContain(
      "Exhibitors only",
    );
    expect(restrictions.get("Gate 6 · Closed")?.properties.detail).toContain("Closed");
    expect(
      [...restrictions.values()].every(
        (feature) =>
          feature.properties.directionsEnabled === false &&
          feature.properties.filterIds?.includes("arrival") &&
          feature.properties.informationSource?.title ===
            "2026 Schedule of Events grounds map",
      ),
    ).toBe(true);
  });

  it("keeps schematic service locations useful without inventing routing precision", () => {
    const services = map.features.filter(
      (feature) => feature.properties.kind === "service",
    );
    const buildingFifteen = map.features.find(
      (feature) => feature.properties.name === "Restroom (Building 15)",
    );
    const administration = map.features.find(
      (feature) => feature.properties.name === "Administration (Building 3)",
    );
    const gateFourA = map.features.find(
      (feature) => feature.properties.id === "osm-node-14099608940",
    );

    expect(services).toHaveLength(3);
    expect(
      services.every(
        (feature) =>
          feature.properties.locationPrecision === "published-area" &&
          feature.properties.directionsEnabled === false &&
          feature.properties.filterIds?.includes("essentials"),
      ),
    ).toBe(true);
    expect(
      services.find(
        (feature) => feature.properties.id === "fair-service-first-aid-building-15",
      )?.properties.anchor,
    ).toEqual(buildingFifteen?.properties.anchor);
    expect(
      services.find(
        (feature) => feature.properties.id === "fair-service-information-gate-4a",
      )?.properties.anchor,
    ).toEqual(gateFourA?.properties.anchor);
    expect(
      services.find(
        (feature) =>
          feature.properties.id === "fair-service-information-administration",
      )?.properties.anchor,
    ).toEqual(administration?.properties.anchor);
  });

  it("uses the current published Fair-week transit times", () => {
    const monroeAcross = map.features.find(
      (feature) => feature.properties.id === "transit-stop-163112",
    );
    const transit = map.features.filter(
      (feature) => feature.properties.kind === "transit",
    );

    expect(transit).toHaveLength(5);
    expect(monroeAcross?.properties.detail).toContain(
      "seven explicit published departures from 9:05 AM through 5:05 PM",
    );
    expect(monroeAcross?.properties.detail).not.toContain("6:05 PM");
    expect(monroeAcross?.properties.informationSource?.checkedAt).toBe(
      "2026-09-04T06:04:00Z",
    );
  });

  it("labels pedestrian gates without changing their reviewed anchors or drop-off facts", () => {
    for (const id of ["osm-node-14099608925", "osm-node-14099608931", "osm-node-14099608940"]) {
      const gate = map.features.find((feature) => feature.properties.id === id);
      const original = baseMap.features.find((feature) => feature.properties.id === id);
      expect(gate?.properties.name).toContain("Pedestrians only");
      expect(gate?.properties.anchor).toEqual(original?.properties.anchor);
      expect(gate?.geometry).toEqual(original?.geometry);
      expect(gate?.properties.filterIds).toContain("arrival");
    }
    const gateFourA = map.features.find((feature) => feature.properties.id === "osm-node-14099608940");
    expect(gateFourA?.properties.detail).toContain("taxi, rideshare, or friend drop-off");
    expect(gateFourA?.properties.detail).toContain("free ADA-compliant shuttle");
  });

  it("puts Funky Joe's in its published area instead of the Grandstand stage polygon", () => {
    const freeStage = map.features.find((feature) => feature.properties.id === "fair-service-funky-joes-free-stage");
    const buildingNine = baseMap.features.find((feature) => feature.properties.id === "osm-way-103615601");
    const grandstandStage = map.features.find((feature) => feature.properties.id === "osm-way-307321838");
    const originalStage = baseMap.features.find((feature) => feature.properties.id === "osm-way-307321838");

    expect(freeStage?.geometry.type).toBe("Point");
    expect(freeStage?.properties.anchor).toEqual(buildingNine?.properties.anchor);
    expect(freeStage?.properties).toMatchObject({
      kind: "stage",
      locationPrecision: "published-area",
      directionsEnabled: false,
    });
    expect(freeStage?.properties.detail).toContain("between Home Arts & Crafts (Building 9) and Youth Indoor Exhibits (Building 12)");
    expect(grandstandStage?.properties.name).toBe("Grandstand stage");
    expect(grandstandStage?.properties.scheduleAliases).toEqual([]);
    expect(grandstandStage?.geometry).toEqual(originalStage?.geometry);
    expect(grandstandStage?.properties.anchor).not.toEqual(freeStage?.properties.anchor);
    expect(resolveFairGroundsFeatureId(map.features, ["Funky Joe’s Bandwagon Stage in the Resthaven Rest Area"])).toBe("fair-service-funky-joes-free-stage");
    expect(resolveFairGroundsFeatureId(map.features, ["Grandstand"])).toBe("osm-way-103615596");
  });

  it.each([33, 34, 35, 36, 37, 38, 39])("finds dairy building %s within the shared mapped barn area", (number) => {
    const barns = map.features.find((feature) => feature.properties.id === "osm-way-307321855");
    const original = baseMap.features.find((feature) => feature.properties.id === "osm-way-307321855");
    expect(resolveFairGroundsFeatureId(map.features, [`Building ${number}`])).toBe("osm-way-307321855");
    expect(barns?.properties.name).toBe("Dairy Barns (Buildings 33–39)");
    expect(barns?.properties.detail).toContain("shared mapped area");
    expect(barns?.properties.directionsEnabled).toBe(false);
    expect(barns?.geometry).toEqual(original?.geometry);
  });

  it("refreshes only the reviewed PDF source timestamp", () => {
    const pdfSources = map.features.flatMap((feature) => feature.properties.informationSource?.url.endsWith("2026-GFF-SoE_website.pdf") ? [feature.properties.informationSource] : []);
    expect(pdfSources.length).toBeGreaterThan(0);
    expect(pdfSources.every((source) => source.checkedAt === "2026-09-21T15:59:02Z")).toBe(true);
    expect(map.features.find((feature) => feature.properties.id === "fair-arrival-lot-b")?.properties.informationSource?.checkedAt).toBe("2026-09-04T06:04:00Z");
    expect(map.features.find((feature) => feature.properties.id === "osm-node-14099608940")?.properties.informationSource?.checkedAt).toBe("2026-09-04T06:04:00Z");
    expect(baseMap.reviewedOn).toBe("2026-09-04");
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
    const matches = map.features.filter((feature) =>
      fairGroundsFeatureMatchesPlace(feature, placeLabel),
    );

    expect(matches.map((feature) => feature.properties.id)).toEqual([featureId]);
  });

  it.each([
    ["Published place: Bldg. 3 Administration office.", "osm-way-305093779"],
    ["Published place: The Null Bldg. (9).", "osm-way-103615601"],
    ["Published place: Youth Building, Bldg. 12.", "osm-way-307321839"],
    ["Published place: Homegrown Frederick, Bldg. 13.", "osm-way-307321854"],
    ["Published place: Bathroom Building 15.", "osm-way-307321850"],
    ["Published place: Free Stage.", "fair-service-funky-joes-free-stage"],
    ["Published place: Funky Joe's Bandwagon Stage in the Resthaven Rest Area.", "fair-service-funky-joes-free-stage"],
    ["Published place: Dairy Office, Bldg. 31.", "osm-way-307321843"],
    ["Published place: Milking Parlor, Bldg. 43.", "osm-way-307321840"],
  ])("maps the official 2026 label %s to %s", (placeLabel, featureId) => {
    const matches = map.features.filter((feature) =>
      fairGroundsFeatureMatchesPlace(feature, placeLabel),
    );

    expect(matches.map((feature) => feature.properties.id)).toEqual([featureId]);
  });

  it("resolves raw official program wording without guessing across matches", () => {
    expect(
      resolveFairGroundsFeatureId(map.features, [
        "Household Building Demonstrations in The Null Bldg.",
      ]),
    ).toBe("osm-way-103615601");
    expect(
      resolveFairGroundsFeatureId(map.features, [
        "Neal McCoy with special guest at the Grandstand",
      ]),
    ).toBe("osm-way-103615596");

    const grandstand = map.features.find(
      (feature) => feature.properties.id === "osm-way-103615596",
    );
    if (!grandstand) throw new Error("Expected Grandstand map feature");
    const duplicated = [grandstand, grandstand];
    expect(
      resolveFairGroundsFeatureId(duplicated, [
        "Published place: Grandstand.",
      ]),
    ).toBeNull();
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
