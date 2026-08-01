import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import GENERATED from "@/data/source-registry.generated.json" with { type: "json" };
import {
  KEYED_FEEDS,
  KEYLESS_FEEDS,
} from "@/lib/integrations/feed-registry";
import { buildSourceRegistryArtifact } from "@/../scripts/build-source-registry";

describe("generated source registry", () => {
  it("is an exact projection of data/sources.yaml", () => {
    const manifest = readFileSync(resolve("data/sources.yaml"), "utf8");
    expect(GENERATED).toEqual(buildSourceRegistryArtifact(manifest));
  });

  it("only joins feed configuration to manifest source ids", () => {
    const ids = new Set(GENERATED.map((source) => source.id));
    const configuredIds = [...KEYED_FEEDS, ...KEYLESS_FEEDS].flatMap(
      (feed) => feed.sourceIds ?? [],
    );
    expect(
      configuredIds.filter((sourceId) => !ids.has(sourceId)),
    ).toEqual([]);
    expect(new Set(configuredIds).size).toBe(configuredIds.length);
  });

  it("requires rows only from invariant baseline datasets", () => {
    expect(
      GENERATED.filter((source) => source.rowsRequired)
        .map((source) => source.id)
        .sort(),
    ).toEqual([
      "nws_forecast",
      "open_brewery_db",
      "transit_gtfs",
    ]);
  });

  it("maps cron-ingest run slugs to their manifest sources", () => {
    const byId = new Map(GENERATED.map((source) => [source.id, source]));

    expect(byId.get("fcpl_libraries")?.evidenceAliases).toContain(
      "frederick.librarycalendar.com",
    );
    expect(byId.get("fcvfra_events")?.evidenceAliases).toContain(
      "fcvfra.com",
    );
  });

  it("fails closed on health fields that could silently suppress a source", () => {
    const base = `
sources:
  - id: county
    name: County calendar
    owner: Frederick County
    status: active
    collection: runtime
    refresh_cadence: hourly
`;
    expect(() =>
      buildSourceRegistryArtifact(base.replace("status: active", "status: actve")),
    ).toThrow('county: unsupported source status "actve".');
    expect(() =>
      buildSourceRegistryArtifact(`${base}    rows_required: "true"\n`),
    ).toThrow("county: rows_required must be true or false.");
    expect(() =>
      buildSourceRegistryArtifact(`${base}    evidence_aliases: county\n`),
    ).toThrow("county: evidence_aliases must contain non-empty strings.");
    expect(() =>
      buildSourceRegistryArtifact(
        base.replace("refresh_cadence: hourly", "refresh_cadence: houryl"),
      ),
    ).toThrow('county: unsupported refresh_cadence "houryl".');
    expect(() =>
      buildSourceRegistryArtifact(`${base}    snapshot_cadence: dayly\n`),
    ).toThrow('county: unsupported snapshot_cadence "dayly".');
    expect(() =>
      buildSourceRegistryArtifact(`${base}    change_cadence: houryl\n`),
    ).toThrow('county: unsupported change_cadence "houryl".');
    expect(() =>
      buildSourceRegistryArtifact(
        `${base}    snapshot_cadence: "daily (best effort)"\n`,
      ),
    ).toThrow(
      'county: unsupported snapshot_cadence "daily (best effort)".',
    );
  });
});
