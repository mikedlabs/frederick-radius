import { describe, expect, it } from "vitest";
import type { FeedHealthEndpoint } from "./feed-health";
import {
  runtimeSourceProbeEndpoints,
  selectActiveRuntimeProbeEndpoints,
} from "./runtime-source-health";

const endpoint = (sourceId: string, url = `https://example.test/${sourceId}`) =>
  ({
    group: sourceId,
    sourceId,
    url,
    critical: false,
    method: "GET",
  }) satisfies FeedHealthEndpoint;

describe("runtime source health registry", () => {
  it("selects only canonical active runtime sources and deduplicates endpoints", () => {
    const selected = selectActiveRuntimeProbeEndpoints(
      [
        endpoint("runtime"),
        endpoint("runtime"),
        endpoint("pipeline"),
        endpoint("workflow"),
        endpoint("pending"),
        { ...endpoint("runtime"), sourceId: undefined },
      ],
      [
        { id: "runtime", status: "active", collection: "runtime" },
        { id: "pipeline", status: "active", collection: "pipeline" },
        { id: "workflow", status: "active", collection: "workflow" },
        { id: "pending", status: "pending_review", collection: null },
      ],
    );

    expect(selected).toEqual([endpoint("runtime")]);
  });

  it("never includes pipeline, workflow, or pending high-value probes", () => {
    const endpoints = runtimeSourceProbeEndpoints();
    const sourceIds = new Set(endpoints.map((row) => row.sourceId));

    expect(sourceIds).toContain("mta_marc_rt");
    expect(sourceIds).toContain("md_wzdx");
    expect(sourceIds).toContain("md_sha_road_closures");
    expect(sourceIds).toContain("cof_sidewalks");
    expect(sourceIds).toContain("cof_path_plan");
    expect(sourceIds).toContain("cof_capital_improvement");
    expect(sourceIds).toContain("cof_development_review");
    expect(sourceIds).toContain("fc_planning_projects");
    expect(sourceIds).not.toContain("fcpl_libraries");
    expect(sourceIds).not.toContain("visit_frederick");
    expect(endpoints.every((row) => Boolean(row.sourceId))).toBe(true);
  });
});
