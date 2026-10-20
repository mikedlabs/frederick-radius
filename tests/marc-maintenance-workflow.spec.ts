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
    expect(build.steps.some((step: { run?: string }) => step.run === "npm run validate:transit-data -- --marc")).toBe(true);
    expect(JSON.stringify(build)).not.toMatch(/secrets\.|DATABASE_URL|self-hosted/);
    expect(workflow.jobs.publish.uses).toBe("./.github/workflows/publish-automated-pr.yml");
    expect(workflow.jobs.publish.with.allowed_paths).toBe("src/data/marc-schedule.json");
    expect(workflow.jobs.publish.with.auto_merge).toBeUndefined();
    expect(workflow.jobs.checks.uses).toBe("./.github/workflows/automated-pr-checks.yml");
  });
});
