import { describe, expect, it } from "vitest";
import type { CivicSignal } from "./contracts";
import { analyzeSeeClickFixSnapshot } from "./seeclickfix";
import {
  serializePublicCivicSignal,
  serializePublicCivicSignals,
  serializePublicCivicSignalsPayload,
} from "./serialize";

const NOW = new Date("2026-07-04T12:00:00.000Z");

function input(): Record<string, unknown> {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: 11 }, (_, index) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-77.4105, 39.4143] },
      properties: {
        external_id: String(index + 1),
        summary: "A raw summary",
        description: "Private narrative",
        address: "123 Market St",
        status: "acknowledged",
        category: "Water Issue",
        reported_at: "2026-07-02T12:00:00.000Z",
        url: `https://seeclickfix.com/issues/${index + 1}`,
        source: "seeclickfix",
      },
    })),
  };
}

function signal(): CivicSignal {
  const analysis = analyzeSeeClickFixSnapshot(input(), { now: NOW });
  expect(analysis.signals).toHaveLength(1);
  return structuredClone(analysis.signals[0]);
}

describe("public Civic Signals serialization", () => {
  it("uses a field whitelist instead of forwarding the internal object", () => {
    const internal = signal() as CivicSignal & {
      address?: string;
      geometry?: unknown;
      description?: string;
    };
    internal.address = "123 Market St";
    internal.description = "Raw report narrative";
    internal.geometry = { coordinates: [-77.4105, 39.4143] };
    (
      internal.evidence[0] as CivicSignal["evidence"][number] & {
        external_id?: string;
        coordinates?: number[];
      }
    ).external_id = "22310692";
    (
      internal.evidence[0] as CivicSignal["evidence"][number] & {
        coordinates?: number[];
      }
    ).coordinates = [-77.4105, 39.4143];

    const publicSignal = serializePublicCivicSignal(internal, { now: NOW });
    const output = JSON.stringify(publicSignal);

    expect(publicSignal).not.toBeNull();
    expect(output).not.toContain("123 Market St");
    expect(output).not.toContain("Raw report narrative");
    expect(output).not.toContain("22310692");
    expect(output).not.toContain("-77.4105");
    expect(output).not.toContain("external_id");
    expect(output).not.toContain("coordinates");
    expect(output).not.toContain("geometry");
    expect(output).not.toContain("description");
    expect(output).not.toContain("address");
  });

  it.each([
    ["street address", "The issue is at 123 Market St"],
    ["coordinate pair", "The point is -77.4105, 39.4143"],
    ["email", "Contact resident@example.com"],
    ["phone", "Call 301-555-0100"],
  ])("suppresses a signal whose public prose contains a %s", (_label, text) => {
    const internal = signal();
    internal.statement = text;
    expect(serializePublicCivicSignal(internal, { now: NOW })).toBeNull();
  });

  it("suppresses sensitive, unpublished, and expired findings", () => {
    const sensitive = signal();
    sensitive.sensitivity = "sensitive";
    const draft = signal();
    draft.publicationStatus = "draft";
    const expired = signal();
    expired.expiresAt = "2026-07-03T00:00:00.000Z";

    expect(
      serializePublicCivicSignals([sensitive, draft, expired], { now: NOW }),
    ).toEqual([]);
  });

  it("suppresses record-level or location-bearing source URLs", () => {
    const issueLink = signal();
    issueLink.evidence[0].source.url =
      "https://seeclickfix.com/issues/22310692";
    const coordinateQuery = signal();
    coordinateQuery.actions[0].href =
      "https://example.com/data?lat=39.4143&lng=-77.4105";

    expect(
      serializePublicCivicSignals([issueLink, coordinateQuery], { now: NOW }),
    ).toEqual([]);
  });

  it("omits internal facts and raw rows from the complete API payload", () => {
    const analysis = analyzeSeeClickFixSnapshot(input(), { now: NOW });
    const payload = serializePublicCivicSignalsPayload(analysis, { now: NOW });
    const output = JSON.stringify(payload);

    expect(payload.signals).toHaveLength(1);
    expect(payload).not.toHaveProperty("facts");
    expect(output).not.toContain("A raw summary");
    expect(output).not.toContain("Private narrative");
    expect(output).not.toContain("123 Market St");
    expect(output).not.toContain("seeclickfix.com/issues/");
    expect(output).not.toContain("external_id");
  });
});
