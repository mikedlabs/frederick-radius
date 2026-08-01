import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const ROOT = process.cwd();
const WORKFLOW_PATH = resolve(
  ROOT,
  ".github/workflows/apify-venue-pilot.yml",
);

type WorkflowStep = {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

type WorkflowDocument = {
  on?: {
    workflow_dispatch?: {
      inputs?: Record<
        string,
        {
          type?: string;
          required?: boolean;
          default?: unknown;
          options?: string[];
        }
      >;
    };
    [trigger: string]: unknown;
  };
  permissions?: Record<string, string>;
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean;
  };
  jobs?: Record<
    string,
    {
      environment?: string;
      "timeout-minutes"?: number;
      steps?: WorkflowStep[];
    }
  >;
};

function workflowText(): string {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

function workflow(): WorkflowDocument {
  return parse(workflowText()) as WorkflowDocument;
}

function steps(): WorkflowStep[] {
  return Object.values(workflow().jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function usesAction(step: WorkflowStep, action: string): boolean {
  return step.uses?.startsWith(`${action}@`) ?? false;
}

function expectImmutableAction(step: WorkflowStep | undefined, action: string) {
  expect(step?.uses).toMatch(
    new RegExp(`^${action.replace("/", "\\/")}@[0-9a-f]{40}$`),
  );
}

describe("manual Apify venue pilot workflow", () => {
  it("is manual-only, read-only, non-overlapping, and separately protected", () => {
    const parsed = workflow();
    expect(Object.keys(parsed.on ?? {})).toEqual(["workflow_dispatch"]);
    expect(parsed.permissions).toEqual({ contents: "read" });
    expect(parsed.concurrency).toEqual({
      group: "apify-venue-retrieval-pilot",
      "cancel-in-progress": false,
    });
    const jobs = Object.values(parsed.jobs ?? {});
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      environment: "APIFY_TOKEN",
      "timeout-minutes": 10,
    });
    expect(workflowText()).not.toContain("schedule:");
    expect(workflowText()).not.toContain("create-pull-request");
    expect(workflowText()).not.toContain("contents: write");
  });

  it("offers exactly the tracked reviewed sources and no cost input", () => {
    const parsed = workflow();
    const inputs = parsed.on?.workflow_dispatch?.inputs ?? {};
    const config = JSON.parse(
      readFileSync(resolve(ROOT, "config/apify-venue-pilot.json"), "utf8"),
    ) as { sources: Array<{ id: string }> };

    expect(inputs.source).toMatchObject({
      type: "choice",
      required: true,
      options: config.sources.map(({ id }) => id),
    });
    expect(inputs.confirm_live).toMatchObject({
      type: "boolean",
      required: true,
      default: false,
    });
    expect(inputs.initialize_state).toMatchObject({
      type: "boolean",
      required: true,
      default: false,
    });
    for (const forbidden of [
      "url",
      "actor",
      "max_charge",
      "max_results",
      "timeout",
    ]) {
      expect(inputs).not.toHaveProperty(forbidden);
    }
  });

  it("plans without credentials and gates the only paid call", () => {
    const allSteps = steps();
    const plan = allSteps.find((step) =>
      step.run?.includes("pilot:apify-venues -- --source"),
    );
    const live = allSteps.find((step) =>
      step.run?.includes("--live --confirm"),
    );

    expect(plan).toBeDefined();
    expect(plan?.env).toEqual({ PILOT_SOURCE: "${{ inputs.source }}" });
    expect(plan?.env?.APIFY_TOKEN).toBeUndefined();
    expect(plan?.run).not.toContain("--live");
    expect(live).toBeDefined();
    expect(live?.if).toContain("confirm_live");
    expect(live?.env).toMatchObject({
      PILOT_SOURCE: "${{ inputs.source }}",
      APIFY_TOKEN: "${{ secrets.APIFY_TOKEN }}",
    });
    expect(live?.run).toContain('--source="$PILOT_SOURCE"');
    expect(live?.run).not.toContain("--source=${{");
    expect((workflowText().match(/secrets\.APIFY_TOKEN/g) ?? [])).toHaveLength(
      1,
    );
  });

  it("restores a persistent ledger, protects first initialization, and retains evidence briefly", () => {
    const allSteps = steps();
    const restore = allSteps.find((step) =>
      usesAction(step, "actions/cache/restore"),
    );
    const guard = allSteps.find((step) =>
      step.run?.includes("budget state was not restored"),
    );
    const save = allSteps.find((step) =>
      usesAction(step, "actions/cache/save"),
    );
    const artifact = allSteps.find((step) =>
      usesAction(step, "actions/upload-artifact"),
    );

    expectImmutableAction(restore, "actions/cache/restore");
    expect(restore?.with?.path).toBe(
      "scripts/reports/apify-venue-pilot/state.json",
    );
    expect(guard?.if).toContain("confirm_live");
    expect(guard?.if).toContain("!inputs.initialize_state");
    expect(workflowText()).toContain("GitHub caches are evictable");
    expect(workflowText()).toContain(
      "Apify account spending limit is authoritative across runs",
    );
    expect(save?.if).toContain("confirm_live");
    expectImmutableAction(save, "actions/cache/save");
    expect(save?.with?.path).toBe(
      "scripts/reports/apify-venue-pilot/state.json",
    );
    expect(artifact?.if).toBe("always()");
    expectImmutableAction(artifact, "actions/upload-artifact");
    expect(artifact?.with?.["retention-days"]).toBe(7);
    expect(String(artifact?.with?.path)).toContain(
      "scripts/reports/apify-venue-pilot",
    );
  });
});
