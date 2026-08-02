import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKFLOW_PATH = resolve(
  process.cwd(),
  ".github/workflows/apify-source-change-radar.yml",
);

type WorkflowStep = {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

type Workflow = {
  on?: Record<string, unknown> & {
    workflow_dispatch?: { inputs?: Record<string, Record<string, unknown>> };
  };
  permissions?: Record<string, string>;
  concurrency?: Record<string, unknown>;
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

function workflow(): Workflow {
  return parse(workflowText()) as Workflow;
}

function steps(): WorkflowStep[] {
  return Object.values(workflow().jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function action(step: WorkflowStep | undefined, name: string): void {
  expect(step?.uses).toMatch(
    new RegExp(`^${name.replace("/", "\\/")}@[0-9a-f]{40}$`),
  );
}

describe("Apify source change radar workflow", () => {
  it("stays manual-only until main proves the review workflow", () => {
    const parsed = workflow();
    expect(Object.keys(parsed.on ?? {})).toEqual(["workflow_dispatch"]);
    expect(workflowText()).not.toContain("schedule:");
    expect(parsed.permissions).toEqual({ contents: "read", issues: "write" });
    expect(parsed.concurrency).toEqual({
      group: "apify-source-change-radar",
      "cancel-in-progress": false,
    });
    const jobs = Object.values(parsed.jobs ?? {});
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      environment: "APIFY_TOKEN",
      "timeout-minutes": 20,
    });
    expect(workflowText()).not.toContain("contents: write");
    expect(workflowText()).not.toContain("create-pull-request");
  });

  it("has no URL, Actor, cost, or publishing input", () => {
    const inputs = workflow().on?.workflow_dispatch?.inputs ?? {};
    expect(inputs).toEqual({
      confirm_live: expect.objectContaining({
        type: "boolean",
        required: true,
        default: false,
      }),
      initialize_state: expect.objectContaining({
        type: "boolean",
        required: true,
        default: false,
      }),
    });
    for (const forbidden of [
      "url",
      "actor",
      "source",
      "max_charge",
      "publish",
      "schedule",
    ]) {
      expect(inputs).not.toHaveProperty(forbidden);
    }
  });

  it("plans without a secret and exposes the token only to the gated live step", () => {
    const allSteps = steps();
    const plan = allSteps.find((step) =>
      step.run?.includes("npm run radar:apify-sources"),
    );
    const live = allSteps.find((step) =>
      step.run?.includes("--live --confirm"),
    );
    expect(plan).toBeDefined();
    expect(plan?.env?.APIFY_TOKEN).toBeUndefined();
    expect(live?.if).toContain("confirm_live");
    expect(live?.env).toMatchObject({
      APIFY_TOKEN: "${{ secrets.APIFY_TOKEN }}",
    });
    expect(workflowText().match(/secrets\.APIFY_TOKEN/g) ?? []).toHaveLength(1);
  });

  it("fails closed without restored state and persists only private fingerprints", () => {
    const allSteps = steps();
    const restore = allSteps.find((step) =>
      step.uses?.startsWith("actions/cache/restore@"),
    );
    const guard = allSteps.find((step) =>
      step.run?.includes("radar state was not restored"),
    );
    const save = allSteps.find((step) =>
      step.uses?.startsWith("actions/cache/save@"),
    );
    const artifact = allSteps.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );

    action(restore, "actions/cache/restore");
    expect(restore?.with?.path).toBe(
      "scripts/reports/apify-source-change-radar/state.json",
    );
    expect(guard?.if).toContain("!inputs.initialize_state");
    action(save, "actions/cache/save");
    expect(save?.if).toContain("hashFiles");
    expect(save?.with?.path).toBe(
      "scripts/reports/apify-source-change-radar/state.json",
    );
    action(artifact, "actions/upload-artifact");
    expect(artifact?.with?.["retention-days"]).toBe(14);
    expect(String(artifact?.with?.path)).not.toContain("state.json");
  });

  it("uses one bounded issue queue and never injects publisher text", () => {
    const issue = steps().find((step) =>
      step.uses?.startsWith("actions/github-script@"),
    );
    action(issue, "actions/github-script");
    expect(issue?.if).toContain("github-issue.json");
    const script = String(issue?.with?.script);
    expect(script).toContain("signal.items.length > 3");
    expect(script).toContain("apify/website-content-crawler");
    expect(script).toContain("cannot publish an event");
    expect(script).toContain("Source radar recovered or returned quiet");
    expect(script).toContain('state: "closed"');
    expect(script).toContain('state_reason: "completed"');
    expect(script.indexOf("listForRepo")).toBeLessThan(
      script.indexOf("if (!signal.actionable)"),
    );
    expect(script).not.toContain("item.error.message");
    expect(script).not.toContain("markdown");
    expect(script).not.toContain("rawHtml");
  });
});
