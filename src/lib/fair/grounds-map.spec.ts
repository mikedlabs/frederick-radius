import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  fairGroundsFeatureMatchesFilter,
  fairGroundsFeatureMatchesPlace,
  parseFairGroundsMap,
} from "./grounds-map";

const map = parseFairGroundsMap(
  JSON.parse(
    readFileSync(
      resolve("public/data/fair/great-frederick-fair-2026-map.geojson"),
      "utf8",
    ),
  ),
);

describe("Fair grounds map", () => {
  it("ships a small, source-transparent reviewed snapshot", () => {
    expect(map.reviewedOn).toBe("2026-09-02");
    expect(map.source.publisher).toBe("OpenStreetMap contributors");
    expect(map.features).toHaveLength(38);
    expect(new Set(map.features.map((feature) => feature.properties.id)).size).toBe(
      map.features.length,
    );
    expect(
      map.features.every((feature) =>
        feature.properties.sourceUrl.startsWith(
          "https://www.openstreetmap.org/",
        ),
      ),
    ).toBe(true);
  });

  it("contains the visitor essentials without pretending every lot is mapped", () => {
    const byKind = (kind: string) =>
      map.features.filter((feature) => feature.properties.kind === kind);

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

  it("defaults to a calm essentials layer and maps only reviewed schedule aliases", () => {
    const essentials = map.features.filter((feature) =>
      fairGroundsFeatureMatchesFilter(feature, "essentials"),
    );
    expect(
      essentials.some((feature) => feature.properties.kind === "restroom"),
    ).toBe(true);
    expect(
      essentials.some((feature) => feature.properties.kind === "animal"),
    ).toBe(false);

    const buildingTwelve = map.features.find(
      (feature) => feature.properties.name === "4-H Building",
    );
    expect(buildingTwelve).toBeDefined();
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
  });
});
