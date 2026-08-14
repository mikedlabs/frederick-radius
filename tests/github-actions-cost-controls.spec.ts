import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKFLOW_DIR = resolve(process.cwd(), ".github/workflows");

function workflowText(name: string): string {
  return readFileSync(resolve(WORKFLOW_DIR, name), "utf8");
}

type WorkflowStep = {
  name?: string;
  run?: string;
  uses?: string;
};

type WorkflowJob = {
  name?: string;
  needs?: string | string[];
  strategy?: unknown;
  steps?: WorkflowStep[];
};

type WorkflowDocument = {
  on?: Record<string, unknown>;
  concurrency?: { group?: string };
  jobs?: Record<string, WorkflowJob>;
};

describe("GitHub Actions cost controls", () => {
  it.each(["ci.yml", "style.yml"])(
    "%s runs before merge without rebuilding the same protected tree afterward",
    (name) => {
      const workflow = parse(workflowText(name)) as WorkflowDocument;

      expect(workflow.on?.pull_request).toEqual({});
      expect(workflow.on?.workflow_dispatch).toEqual({});
      expect(workflow.on?.push).toBeUndefined();
    },
  );

  it("cancels superseded voice checks on the same pull request", () => {
    const workflow = parse(workflowText("style.yml")) as WorkflowDocument;

    expect(workflow.concurrency).toEqual({
      group: "style-${{ github.ref }}",
      "cancel-in-progress": true,
    });
  });

  it("runs the real browser chaos suite in the one verified production build", () => {
    const workflow = parse(workflowText("ci.yml")) as WorkflowDocument;
    const verifySteps = workflow.jobs?.verify?.steps ?? [];
    const mirror = workflow.jobs?.["browser-chaos"];
    const mirrorText = JSON.stringify(mirror);

    expect(
      verifySteps.filter((step) => step.run === "npm run build"),
    ).toHaveLength(1);
    expect(
      verifySteps.some(
        (step) =>
          step.name === "Required browser chaos" &&
          step.run?.includes("e2e/critical-dependency-chaos.spec.ts") &&
          step.run.includes("e2e/service-worker-upgrade-contract.spec.ts"),
      ),
    ).toBe(true);

    expect(mirror?.name).toBe("Required browser chaos");
    expect(mirror?.needs).toBe("verify");
    expect(mirrorText).toContain("needs.verify.result");
    expect(mirrorText).not.toContain("actions/checkout");
    expect(mirrorText).not.toContain("npm ci");
    expect(mirrorText).not.toContain("npm run build");
    expect(mirrorText).not.toContain("playwright install");
  });

  it("runs the complete nightly UX inventory against one build", () => {
    const workflow = parse(workflowText("ux-audit.yml")) as WorkflowDocument;
    const jobs = Object.values(workflow.jobs ?? {});
    const steps = jobs[0]?.steps ?? [];
    const runText = steps.map((step) => step.run ?? "").join("\n");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.strategy).toBeUndefined();
    expect(steps.filter((step) => step.run === "npm run build")).toHaveLength(
      1,
    );
    expect(runText).toContain("e2e/ux-audit.spec.ts");
    expect(runText).toContain("e2e/safe-interaction-crawler.spec.ts");
    expect(runText).not.toContain("--shard");
  });

  it("prevents preview deployment events from cancelling production canaries", () => {
    const workflow = parse(
      workflowText("production-canary.yml"),
    ) as WorkflowDocument;

    expect(workflow.concurrency?.group).toContain(
      "github.event.deployment.id",
    );
  });
});
