import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import SOURCE_REGISTRY_RAW from "@/data/source-registry.generated.json" with { type: "json" };
import { bundledSourceArtifactEvidence } from "./source-artifact-evidence";
import { SOURCE_ARTIFACT_CONSUMERS } from "./source-consumers";

describe("source consumer contracts", () => {
  it("points only to cataloged sources and existing consumer files", () => {
    const sourceIds = new Set(
      SOURCE_REGISTRY_RAW.map((source) => source.id),
    );
    const declaredIds = SOURCE_ARTIFACT_CONSUMERS.flatMap(
      (contract) => contract.sourceIds,
    );

    expect(new Set(declaredIds).size).toBe(declaredIds.length);
    expect(declaredIds.filter((sourceId) => !sourceIds.has(sourceId))).toEqual(
      [],
    );
    for (const contract of SOURCE_ARTIFACT_CONSUMERS) {
      expect(contract.powers.trim()).not.toBe("");
      expect(contract.consumerPaths.length).toBeGreaterThan(0);
      for (const consumerPath of contract.consumerPaths) {
        expect(existsSync(resolve(consumerPath)), consumerPath).toBe(true);
      }
      expect(contract.artifactPath).toBeTruthy();
      expect(
        existsSync(resolve(contract.artifactPath)),
        contract.artifactPath,
      ).toBe(true);
    }
  });

  it("declares public artifact use without fabricating publication timestamps", () => {
    const publishedEvidenceIds = new Set(
      bundledSourceArtifactEvidence().map((item) => item.sourceKey),
    );
    const boundary = SOURCE_ARTIFACT_CONSUMERS.find((contract) =>
      (contract.sourceIds as readonly string[]).includes(
        "census_tiger_county_boundary",
      ),
    );
    const unusedBrewery = SOURCE_ARTIFACT_CONSUMERS.find((contract) =>
      (contract.sourceIds as readonly string[]).includes("open_brewery_db"),
    );

    expect(boundary).toMatchObject({
      artifactPath: "public/overlays/county-boundary.geojson",
    });
    expect(publishedEvidenceIds.has("census_tiger_county_boundary")).toBe(
      false,
    );
    expect(unusedBrewery).toBeUndefined();
  });
});
