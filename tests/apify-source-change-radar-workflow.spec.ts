import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKFLOW_PATH = resolve(
  process.cwd(),
  ".github/workflows/apify-source-change-radar.yml",
);
const ISSUE_LIFECYCLE_PATH = resolve(
  process.cwd(),
  "scripts/lib/apify-source-change-radar-issue.cjs",
);

type WorkflowStep = {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};

type Workflow = {
  on?: Record<string, unknown> & {
    schedule?: Array<{ cron?: string }>;
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
  it("runs three times monthly with rerun headroom and least privilege", () => {
    const parsed = workflow();
    expect(Object.keys(parsed.on ?? {})).toEqual([
      "schedule",
      "workflow_dispatch",
    ]);
    expect(parsed.on?.schedule).toEqual([{ cron: "17 15 5,15,25 * *" }]);
    expect(parsed.permissions).toEqual({
      actions: "read",
      contents: "read",
      issues: "write",
    });
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
    expect(workflowText()).toContain("github.event_name == 'schedule'");
    expect(workflowText()).toContain("Apify source radar (live)");
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

  it("retires only the legacy workflow and retains the radar's source registry", () => {
    expect(
      existsSync(
        resolve(process.cwd(), ".github/workflows/apify-venue-pilot.yml"),
      ),
    ).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), "config/apify-venue-pilot.json")),
    ).toBe(true);
    expect(
      existsSync(resolve(process.cwd(), "scripts/apify-venue-pilot.ts")),
    ).toBe(true);
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

    const summary = allSteps.find(
      (step) => step.name === "Add safe result to job summary",
    );
    expect(summary?.env?.RADAR_LIVE).toContain("confirm_live");
    expect(summary?.run).toContain("Plan-only run completed");
    expect(summary?.run).toContain("No provider request was made");
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
    expect(restore?.with?.key).toContain("github.run_attempt");
    expect(restore?.with?.["restore-keys"]).toBe(
      "apify-source-change-radar-state-\n",
    );
    expect(guard?.if).toContain("!inputs.initialize_state");
    action(save, "actions/cache/save");
    expect(save?.if).toContain("hashFiles");
    expect(save?.if).toContain("steps.review-queue.outcome == 'success'");
    expect(save?.with?.path).toBe(
      "scripts/reports/apify-source-change-radar/state.json",
    );
    expect(save?.with?.key).toContain("github.run_attempt");
    action(artifact, "actions/upload-artifact");
    expect(artifact?.with?.["retention-days"]).toBe(14);
    expect(String(artifact?.with?.path)).not.toContain("state.json");
  });

  it("derives a fail-closed monthly reservation floor from durable live-run history", () => {
    const budget = steps().find(
      (step) => step.name === "Enforce durable monthly live-run ceiling",
    );
    action(budget, "actions/github-script");
    expect(budget?.if).toContain("confirm_live");
    expect(budget?.if).toContain("github.event_name == 'schedule'");
    const script = String(budget?.with?.script);
    expect(script).toContain("listWorkflowRuns");
    expect(script).toContain("github.paginate");
    expect(script).toContain("run.display_title !== liveRunName");
    expect(script).toContain("run.run_attempt");
    expect(script).toContain("currentSeen");
    expect(script).toContain("if (!currentSeen)");
    expect(script).toContain(
      "The current live run is absent from durable GitHub history",
    );
    expect(script).not.toContain("attemptedRuns += currentAttempt");
    expect(script).toContain("!Number.isFinite(updatedAtMs)");
    expect(script).toContain("runAttempt !== currentAttempt");
    expect(script).toContain("attemptedRuns > 6");
    expect(script).toContain("reservedCents > 90");
    expect(script).toContain('core.setOutput("attempted-runs"');

    const live = steps().find((step) => step.run?.includes("--live --confirm"));
    expect(live?.env).toMatchObject({
      RADAR_DURABLE_MONTH: "${{ steps.monthly-budget.outputs.month }}",
      RADAR_DURABLE_ATTEMPTED_RUNS:
        "${{ steps.monthly-budget.outputs.attempted-runs }}",
      RADAR_INITIALIZE_STATE:
        "${{ github.event_name == 'schedule' && 'false' || inputs.initialize_state && 'true' || 'false' }}",
    });
  });

  it("uses one bounded issue queue and never injects publisher text", () => {
    const issue = steps().find(
      (step) => step.name === "Open or update the review queue issue",
    );
    action(issue, "actions/github-script");
    expect(issue?.id).toBe("review-queue");
    expect(issue?.if).toContain("github-issue.json");
    const script = String(issue?.with?.script);
    expect(script).toContain("updateApifySourceChangeRadarIssue");
    const lifecycle = readFileSync(ISSUE_LIFECYCLE_PATH, "utf8");
    expect(lifecycle).toContain("signal.items.length <= 3");
    expect(lifecycle).toContain("apify/website-content-crawler");
    expect(lifecycle).toContain("cannot publish an event");
    expect(lifecycle).toContain(
      "This quiet snapshot does not resolve the earlier actionable signal",
    );
    expect(lifecycle).toContain('state: "closed"');
    expect(lifecycle).toContain('state_reason: "not_planned"');
    expect(lifecycle).toContain("Date.parse(signal.generatedAt) >=");
    expect(lifecycle).not.toContain("item.error.message");
    expect(lifecycle).not.toContain("markdown");
    expect(lifecycle).not.toContain("rawHtml");
  });
});
