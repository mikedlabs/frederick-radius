import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("MARC feed upkeep without a missing private runner", () => {
  it("retains one monthly keyless source owner and protected publication on a bounded hosted runner", () => {
    const workflow = parse(readFileSync(".github/workflows/build-marc-schedule.yml", "utf8"));
    expect(workflow.on.schedule).toEqual([{ cron: "0 8 1 * *" }]);
    const build = workflow.jobs.build;
    expect(build["runs-on"]).toBe("ubuntu-latest");
    expect(build["timeout-minutes"]).toBe(15);
    expect(build.permissions).toEqual({ contents: "read" });
    expect(build.if).toBe("${{ github.ref == 'refs/heads/main' }}");
    expect(workflow.concurrency).toEqual({ group: "build-marc-schedule", "cancel-in-progress": false });
    const source = build.steps.find((step: { name?: string }) => step.name === "Rebuild MARC schedule from GTFS");
    expect(source.run).toBe("npm run build:marc-schedule");
    expect(source.env).toEqual({
      MARC_REVIEW_EVIDENCE_DIR: "${{ runner.temp }}/marc-source-evidence-${{ github.run_id }}-${{ github.run_attempt }}",
    });
    expect(source["continue-on-error"]).toBeUndefined();
    const evidence = build.steps.find((step: { name?: string }) => step.name === "Preserve original MARC source evidence");
    expect(evidence.if).toBe("always()");
    expect(evidence.with).toEqual({
      name: "marc-source-evidence-${{ github.run_id }}-${{ github.run_attempt }}",
      path: "${{ runner.temp }}/marc-source-evidence-${{ github.run_id }}-${{ github.run_attempt }}",
      "if-no-files-found": "warn",
      "retention-days": 7,
    });
    expect(build.steps.indexOf(evidence)).toBe(build.steps.indexOf(source) + 1);
    expect(build.steps.filter((step: { run?: string }) => step.run === "npm run build:marc-schedule")).toHaveLength(1);
    expect(build.steps.some((step: { run?: string }) => step.run === "npm run validate:transit-data -- --marc")).toBe(true);
    expect(JSON.stringify(build)).not.toMatch(/secrets\.|DATABASE_URL|self-hosted/);
    expect(workflow.jobs.publish.uses).toBe("./.github/workflows/publish-automated-pr.yml");
    expect(workflow.jobs.publish.needs).toBe("build");
    expect(workflow.jobs.publish.with.base_sha).toBe("${{ github.sha }}");
    expect(workflow.jobs.publish.with.allowed_paths).toBe("src/data/marc-schedule.json");
    expect(workflow.jobs.publish.with.auto_merge).toBeUndefined();
    expect(workflow.jobs.checks.uses).toBe("./.github/workflows/automated-pr-checks.yml");
    expect(workflow.jobs.checks.with.head_sha).toBe("${{ needs.publish.outputs.pr_head_sha }}");
  });
});
