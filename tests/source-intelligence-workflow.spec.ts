import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const ROOT = process.cwd();
const WORKFLOW_PATH = resolve(
  ROOT,
  ".github/workflows/source-intelligence.yml",
);

type WorkflowInput = {
  type?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
};

type WorkflowStep = {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: {
    path?: string;
    key?: string;
    "restore-keys"?: string;
    "retention-days"?: number;
    "persist-credentials"?: boolean;
  };
};

type WorkflowJob = {
  environment?: string;
  "timeout-minutes"?: number;
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  steps?: WorkflowStep[];
};

type WorkflowDocument = {
  on?: {
    workflow_dispatch?: {
      inputs?: Record<string, WorkflowInput>;
    };
    [trigger: string]: unknown;
  };
  permissions?: Record<string, string>;
  concurrency?:
    | string
    | {
        group?: string;
        "cancel-in-progress"?: boolean;
      };
  env?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
};

type SourceScoutConfig = {
  limits: {
    maxRequestsPerRun: number;
    maxCreditsPerRun: number;
    maxAttemptedCreditsPerDay: number;
    maxAttemptedCreditsPerMonth: number;
  };
  profiles: Array<{ id: string; enabled: boolean }>;
};

type SourceWatchConfig = {
  mode: string;
  limits: {
    maxSources: number;
    maxCreditsPerRun: number;
    maxCreditsPerMonth: number;
  };
  sources: Array<{ id: string }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as T;
}

function loadWorkflow(): WorkflowDocument {
  return parse(readFileSync(WORKFLOW_PATH, "utf8")) as WorkflowDocument;
}

function onlyJob(workflow: WorkflowDocument): WorkflowJob {
  const jobs = Object.values(workflow.jobs ?? {});
  expect(jobs).toHaveLength(1);
  return jobs[0]!;
}

function allSteps(workflow: WorkflowDocument): WorkflowStep[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function runText(step: WorkflowStep): string {
  return step.run ?? "";
}

function includesAll(text: string, values: string[]): boolean {
  return values.every((value) => text.includes(value));
}

describe("manual Source Intelligence workflow", () => {
  it("is manual-only, read-only, production-scoped, and non-overlapping", () => {
    const workflow = loadWorkflow();
    const triggers = Object.keys(workflow.on ?? {});

    expect(triggers).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.env).toBeUndefined();
    expect(workflow.concurrency).toMatchObject({
      "cancel-in-progress": false,
    });

    const job = onlyJob(workflow);
    expect(job.environment).toBe("Production");
    expect(job.permissions).toBeUndefined();
    expect(job["timeout-minutes"]).toBeGreaterThan(0);
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(20);
    expect(job.env).toBeUndefined();
  });

  it("offers only reviewed tools, profiles, and exact Firecrawl sources", () => {
    const workflow = loadWorkflow();
    const inputs = workflow.on?.workflow_dispatch?.inputs ?? {};
    const scout = readJson<SourceScoutConfig>("config/source-scout.json");
    const watch = readJson<SourceWatchConfig>("config/source-watch.json");

    expect(inputs.tool).toMatchObject({
      type: "choice",
      required: true,
      options: ["tavily-plan", "tavily-scout", "firecrawl-watch"],
    });
    expect(inputs.profile).toMatchObject({
      type: "choice",
      required: true,
      options: scout.profiles
        .filter(({ enabled }) => enabled)
        .map(({ id }) => id),
    });
    expect(inputs.source).toMatchObject({
      type: "choice",
      required: true,
      options: watch.sources.map(({ id }) => id),
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

    expect(watch.mode).toBe("candidate-only");
    expect(watch.limits).toEqual({
      maxSources: 15,
      maxCreditsPerRun: 14,
      maxCreditsPerMonth: 450,
      timeoutMs: 30_000,
    });
    expect(scout.limits).toMatchObject({
      maxRequestsPerRun: 12,
      maxCreditsPerRun: 12,
      maxAttemptedCreditsPerDay: 24,
      maxAttemptedCreditsPerMonth: 300,
    });

    // Budget limits are reviewed code, not user-controlled workflow inputs.
    for (const forbiddenInput of [
      "credits",
      "max_credits",
      "max_requests",
      "monthly_cap",
    ]) {
      expect(inputs).not.toHaveProperty(forbiddenInput);
    }
  });

  it("installs first, performs a zero-cost preflight, and gates every live call", () => {
    const workflow = loadWorkflow();
    const steps = allSteps(workflow);
    const installIndex = steps.findIndex((step) =>
      runText(step).includes("npm ci"),
    );
    const preflightIndex = steps.findIndex((step) =>
      /plan|preflight/i.test(`${step.name ?? ""}\n${runText(step)}`),
    );
    const liveSteps = steps.filter((step) => {
      const text = runText(step);
      return (
        (text.includes("source:watch") && text.includes("--live")) ||
        (text.includes("source:scout") && text.includes("--live"))
      );
    });

    expect(installIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeGreaterThan(installIndex);
    expect(liveSteps).toHaveLength(2);

    const tavilyPlan = steps.find(
      (step) =>
        runText(step).includes("source:scout") &&
        !runText(step).includes("--live"),
    );
    expect(tavilyPlan).toBeDefined();
    expect(tavilyPlan?.env?.TAVILY_API_KEY).toBeUndefined();
    expect(runText(tavilyPlan!)).toContain('--profile="$SCOUT_PROFILE"');

    const firecrawlPlan = steps.find(
      (step) =>
        runText(step).includes("source:watch") &&
        !runText(step).includes("--live"),
    );
    expect(firecrawlPlan).toBeDefined();
    expect(firecrawlPlan?.env?.FIRECRAWL_API_KEY).toBeUndefined();
    expect(runText(firecrawlPlan!)).toContain('--source="$WATCH_SOURCE"');

    const tavilyLive = liveSteps.find((step) =>
      runText(step).includes("source:scout"),
    );
    expect(tavilyLive).toBeDefined();
    expect(runText(tavilyLive!)).toContain('--profile="$SCOUT_PROFILE"');
    expect(runText(tavilyLive!)).toContain("--live");
    expect(runText(tavilyLive!)).toContain("--confirm");
    expect(tavilyLive?.if).toContain("tavily-scout");
    expect(tavilyLive?.if).toContain("confirm_live");

    const firecrawlLive = liveSteps.find((step) =>
      runText(step).includes("source:watch"),
    );
    expect(firecrawlLive).toBeDefined();
    expect(runText(firecrawlLive!)).toContain('--source="$WATCH_SOURCE"');
    expect(runText(firecrawlLive!)).toContain("--live");
    expect(runText(firecrawlLive!)).toContain("--confirm");
    expect(firecrawlLive?.if).toContain("firecrawl-watch");
    expect(firecrawlLive?.if).toContain("confirm_live");

    for (const step of liveSteps) {
      expect(step.if).toBeTruthy();
      expect(step.if).toContain("confirm_live");
    }
  });

  it("passes choices through step env and scopes each provider secret narrowly", () => {
    const workflow = loadWorkflow();
    const steps = allSteps(workflow);
    const serialized = JSON.stringify(workflow);

    const tavilyStep = steps.find((step) =>
      includesAll(runText(step), ["source:scout", "--live"]),
    );
    const firecrawlStep = steps.find((step) =>
      includesAll(runText(step), ["source:watch", "--live"]),
    );

    expect(tavilyStep?.env).toMatchObject({
      SCOUT_PROFILE: "${{ inputs.profile }}",
      TAVILY_API_KEY: "${{ secrets.TAVILY_API_KEY }}",
    });
    expect(firecrawlStep?.env).toMatchObject({
      WATCH_SOURCE: "${{ inputs.source }}",
      FIRECRAWL_API_KEY: "${{ secrets.FIRECRAWL_API_KEY }}",
    });
    expect(tavilyStep?.env?.FIRECRAWL_API_KEY).toBeUndefined();
    expect(firecrawlStep?.env?.TAVILY_API_KEY).toBeUndefined();

    for (const step of steps) {
      const command = runText(step);
      expect(command).not.toMatch(
        /\$\{\{\s*(?:github\.event\.)?inputs\.(?:profile|source)\s*\}\}/,
      );
    }

    expect((serialized.match(/secrets\.TAVILY_API_KEY/g) ?? []).length).toBe(1);
    expect((serialized.match(/secrets\.FIRECRAWL_API_KEY/g) ?? []).length).toBe(
      1,
    );
  });

  it("uploads review evidence briefly and has no publishing path", () => {
    const workflow = loadWorkflow();
    const steps = allSteps(workflow);
    const artifact = steps.find(
      (step) => step.uses === "actions/upload-artifact@v4",
    );

    expect(artifact).toBeDefined();
    expect(artifact?.if).toBe("always()");
    expect(artifact?.with?.path).toContain("scripts/reports");
    expect(artifact?.with?.["retention-days"]).toBeGreaterThanOrEqual(1);
    expect(artifact?.with?.["retention-days"]).toBeLessThanOrEqual(14);

    const checkout = steps.find((step) => step.uses === "actions/checkout@v4");
    expect(checkout?.with?.["persist-credentials"]).toBe(false);

    const serialized = JSON.stringify(workflow).toLowerCase();
    for (const forbidden of [
      "peter-evans/create-pull-request",
      "git commit",
      "git push",
      "gh pr create",
      "npm publish",
      "vercel deploy",
      "src/data",
      "supabase",
      "database_url",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("persists the review cache and usage ledgers across ephemeral runners", () => {
    const workflow = loadWorkflow();
    const steps = allSteps(workflow);
    const restore = steps.find(
      (step) => step.uses === "actions/cache/restore@v4",
    );
    const save = steps.find((step) => step.uses === "actions/cache/save@v4");

    expect(restore).toBeDefined();
    expect(restore?.id).toBe("source-state");
    expect(restore?.with?.path).toContain("scripts/reports");
    expect(restore?.with?.["restore-keys"]).toContain("source-intelligence-");

    expect(save).toBeDefined();
    expect(save?.if).toContain("always()");
    expect(save?.with?.path).toContain("scripts/reports");
    expect(save?.with?.key).toContain("source-intelligence-");
    expect(save?.with?.key).toContain("github.run_id");

    const initializeGuard = steps.find((step) => {
      const text = JSON.stringify(step);
      return (
        text.includes("steps.source-state.outputs.cache-matched-key") &&
        text.includes("initialize_state") &&
        runText(step).includes("exit 1")
      );
    });
    expect(initializeGuard).toBeDefined();
  });

  it("keeps live provider ledgers on the main branch", () => {
    const serialized = JSON.stringify(loadWorkflow());

    expect(serialized).toContain("github.ref");
    expect(serialized).toContain("refs/heads/main");
    expect(serialized).toContain("inputs.confirm_live");
  });
});
