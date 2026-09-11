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
    script?: string;
    [key: string]: unknown;
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
  "run-name"?: string;
  on?: {
    schedule?: Array<{ cron?: string }>;
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

type HistoryRun = {
  id: number;
  run_attempt: number;
  updated_at: string;
  display_title: string;
  head_branch: string;
  status?: string;
  conclusion?: string | null;
};

type BudgetScriptResult = {
  failures: string[];
  outputs: Record<string, string>;
  paginateArguments?: Record<string, unknown>;
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

function usesAction(step: WorkflowStep, action: string): boolean {
  return step.uses?.startsWith(`${action}@`) ?? false;
}

function expectImmutableAction(step: WorkflowStep | undefined, action: string) {
  expect(step?.uses).toMatch(
    new RegExp(`^${action.replace("/", "\\/")}@[0-9a-f]{40}$`),
  );
}

function durableBudgetStep(): WorkflowStep {
  const step = allSteps(loadWorkflow()).find(
    (candidate) => candidate.name === "Enforce durable provider spend ceilings",
  );
  expect(step).toBeDefined();
  return step!;
}

async function runDurableBudgetScript(options: {
  tool: "tavily-scout" | "firecrawl-watch";
  currentRunId?: number;
  currentAttempt?: number;
  runs?: HistoryRun[];
  historyError?: Error;
}): Promise<BudgetScriptResult> {
  const currentRunId = options.currentRunId ?? 100;
  const currentAttempt = options.currentAttempt ?? 1;
  const failures: string[] = [];
  const outputs: Record<string, string> = {};
  let paginateArguments: Record<string, unknown> | undefined;
  const listWorkflowRuns = () => undefined;
  const github = {
    rest: { actions: { listWorkflowRuns } },
    paginate: async (
      route: unknown,
      args: Record<string, unknown>,
    ): Promise<HistoryRun[]> => {
      expect(route).toBe(listWorkflowRuns);
      paginateArguments = args;
      if (options.historyError) throw options.historyError;
      return options.runs ?? [];
    },
  };
  const core = {
    setFailed: (message: unknown) => failures.push(String(message)),
    setOutput: (name: string, value: unknown) => {
      outputs[name] = String(value);
    },
    info: () => undefined,
  };
  const fakeProcess = {
    env: {
      GITHUB_RUN_ID: String(currentRunId),
      GITHUB_RUN_ATTEMPT: String(currentAttempt),
      SELECTED_TOOL: options.tool,
    },
  };
  const AsyncFunction = Object.getPrototypeOf(async () => undefined)
    .constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<void>;
  const execute = new AsyncFunction(
    "github",
    "context",
    "core",
    "process",
    durableBudgetStep().with?.script ?? "",
  );
  await execute(
    github,
    {
      repo: { owner: "mikedlabs", repo: "frederick-radius" },
      runId: currentRunId,
    },
    core,
    fakeProcess,
  );
  return { failures, outputs, paginateArguments };
}

function historyRun(overrides: Partial<HistoryRun> = {}): HistoryRun {
  return {
    id: 100,
    run_attempt: 1,
    updated_at: new Date().toISOString(),
    display_title: "Source intelligence (tavily-live)",
    head_branch: "main",
    status: "in_progress",
    conclusion: null,
    ...overrides,
  };
}

describe("Source Intelligence workflow", () => {
  it("uses the audited schedule, least privilege, Production, and one concurrency lane", () => {
    const workflow = loadWorkflow();
    const triggers = Object.keys(workflow.on ?? {});

    expect(triggers).toEqual(["schedule", "workflow_dispatch"]);
    expect(workflow.on?.schedule?.map(({ cron }) => cron)).toEqual([
      "11 14 2,16 * *",
      "21 14 5,19 * *",
      "31 14 8,22 * *",
      "41 14 11 * *",
      "51 14 25 * *",
    ]);
    expect(workflow.permissions).toEqual({
      actions: "read",
      contents: "read",
      issues: "write",
    });
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

  it("uses immutable plan and provider-live run names", () => {
    const workflow = loadWorkflow();
    const runName = workflow["run-name"] ?? "";
    const scheduleCrons = (workflow.on?.schedule ?? []).map(
      ({ cron }) => cron!,
    );
    const providerClauses = [
      ...runName.matchAll(
        /github\.event_name == 'schedule' &&\s*\(([\s\S]*?)\) && '(firecrawl-live|tavily-live)'/g,
      ),
    ];
    const partition = Object.fromEntries(
      providerClauses.map((match) => [
        match[2],
        [...match[1]!.matchAll(/github\.event\.schedule == '([^']+)'/g)].map(
          (cronMatch) => cronMatch[1],
        ),
      ]),
    );

    expect(runName).toContain("Source intelligence (");
    expect(runName).toContain("'tavily-live'");
    expect(runName).toContain("'firecrawl-live'");
    expect(runName).toContain("'plan'");
    expect(runName).toContain("inputs.confirm_live");
    expect(runName).toContain("github.event.schedule");
    expect(providerClauses).toHaveLength(1);
    expect(partition["firecrawl-live"]).toBeUndefined();
    expect(partition["tavily-live"]).toEqual(scheduleCrons);
    expect(new Set(partition["tavily-live"] ?? [])).toEqual(
      new Set(scheduleCrons),
    );
    expect(runName).not.toContain("github.event.schedule == '13 13 * * 1'");
    expect(runName).not.toContain("inputs.profile");
    expect(runName).not.toContain("inputs.source");
    expect(runName).not.toContain("github.actor");
    expect(runName).not.toContain("github.run_attempt");
  });

  it("resolves every scheduled or manual target before setup and secrets", () => {
    const steps = allSteps(loadWorkflow());
    const checkoutIndex = steps.findIndex((step) =>
      usesAction(step, "actions/checkout"),
    );
    const selectionIndex = steps.findIndex(
      (step) => step.name === "Resolve exact provider target",
    );
    const setupIndex = steps.findIndex((step) =>
      usesAction(step, "actions/setup-node"),
    );
    const selection = steps[selectionIndex];

    expect(selectionIndex).toBeGreaterThan(checkoutIndex);
    expect(setupIndex).toBeGreaterThan(selectionIndex);
    expectImmutableAction(selection, "actions/github-script");
    expect(selection?.id).toBe("selection");
    expect(selection?.env).toMatchObject({
      EVENT_NAME: "${{ github.event_name }}",
      EVENT_SCHEDULE: "${{ github.event.schedule || '' }}",
      INPUT_TOOL: "${{ inputs.tool || '' }}",
      INPUT_PROFILE: "${{ inputs.profile || '' }}",
      INPUT_SOURCE: "${{ inputs.source || '' }}",
    });
    expect(selection?.with?.script).toContain(
      "scripts/lib/source-intelligence-schedule.cjs",
    );
    expect(selection?.with?.script).toContain(
      "resolveSourceIntelligenceSelection",
    );
    expect(selection?.with?.script).toContain(
      'core.setOutput("initialize_state"',
    );
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
    expect(tavilyLive?.if).toContain("steps.selection.outputs.live == 'true'");

    const firecrawlLive = liveSteps.find((step) =>
      runText(step).includes("source:watch"),
    );
    expect(firecrawlLive).toBeDefined();
    expect(runText(firecrawlLive!)).toContain('--source="$WATCH_SOURCE"');
    expect(runText(firecrawlLive!)).toContain("--live");
    expect(runText(firecrawlLive!)).toContain("--confirm");
    expect(firecrawlLive?.if).toContain("firecrawl-watch");
    expect(firecrawlLive?.if).toContain(
      "steps.selection.outputs.live == 'true'",
    );

    for (const step of liveSteps) {
      expect(step.if).toBeTruthy();
      expect(step.if).toContain("steps.selection.outputs.live == 'true'");
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
      SCOUT_PROFILE: "${{ steps.selection.outputs.profile }}",
      TAVILY_API_KEY: "${{ secrets.TAVILY_API_KEY }}",
    });
    expect(firecrawlStep?.env).toMatchObject({
      WATCH_SOURCE: "${{ steps.selection.outputs.source }}",
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

  it("derives separate daily and monthly reservations from exhaustive GitHub history before secrets", () => {
    const workflow = loadWorkflow();
    const steps = allSteps(workflow);
    const budget = durableBudgetStep();
    const script = budget.with?.script ?? "";
    const budgetIndex = steps.findIndex(
      (step) => step.name === "Enforce durable provider spend ceilings",
    );
    const firstSecretIndex = steps.findIndex((step) =>
      JSON.stringify(step.env ?? {}).includes("secrets."),
    );

    expectImmutableAction(budget, "actions/github-script");
    expect(budget.id).toBe("durable-budget");
    expect(budget.if).toContain("steps.selection.outputs.live == 'true'");
    expect(budget.env).toEqual({
      SELECTED_TOOL: "${{ steps.selection.outputs.tool }}",
    });
    expect(script).toContain("github.paginate");
    expect(script).toContain("listWorkflowRuns");
    expect(script).toContain('workflow_id: "source-intelligence.yml"');
    expect(script).toContain("GITHUB_RUN_ID");
    expect(script).toContain("GITHUB_RUN_ATTEMPT");
    expect(script).toContain("run.run_attempt");
    expect(script).toContain("providerTotals.dailyAttempts += runAttempt");
    expect(script).toContain("providerTotals.monthlyAttempts += runAttempt");
    expect(script).toContain("currentSeen");
    expect(script).toContain("if (!currentSeen)");
    expect(script).toContain("unrecognized spend classification");
    expect(script).toContain("const legacyRunNames = new Set");
    expect(script).toContain('"Source intelligence pilot"');
    expect(script).toContain('"Source intelligence"');
    expect(script).toContain('provider: "tavily"');
    expect(script).toContain("reservation: 12");
    expect(script).toContain("dailyCeiling: 24");
    expect(script).toContain("monthlyCeiling: 300");
    expect(script).toContain('provider: "firecrawl"');
    expect(script).toContain("reservation: 1");
    expect(script).toContain("dailyCeiling: 2");
    expect(script).toContain("monthlyCeiling: 30");
    expect(script).not.toContain("run.conclusion");
    expect(script).not.toContain("run.status");
    expect(budgetIndex).toBeGreaterThan(-1);
    expect(firstSecretIndex).toBeGreaterThan(budgetIndex);
  });

  it("counts exact rerun attempts while keeping provider reservations independent", async () => {
    const result = await runDurableBudgetScript({
      tool: "tavily-scout",
      currentAttempt: 2,
      runs: [
        historyRun({ run_attempt: 2 }),
        historyRun({
          id: 90,
          run_attempt: 9,
          display_title: "Source intelligence (firecrawl-live)",
          status: "completed",
          conclusion: "failure",
        }),
        historyRun({
          id: 80,
          run_attempt: 25,
          display_title: "Source intelligence (plan)",
          status: "completed",
          conclusion: "cancelled",
        }),
      ],
    });

    expect(result.failures).toEqual([]);
    expect(result.outputs).toMatchObject({
      provider: "tavily",
      "daily-reserved-credits": "24",
      "monthly-reserved-credits": "24",
    });
    expect(result.paginateArguments).toMatchObject({
      owner: "mikedlabs",
      repo: "frederick-radius",
      workflow_id: "source-intelligence.yml",
      per_page: 100,
    });
  });

  it("counts failed and canceled attempts and blocks a reservation over its ceiling", async () => {
    const result = await runDurableBudgetScript({
      tool: "tavily-scout",
      runs: [
        historyRun(),
        historyRun({
          id: 99,
          run_attempt: 2,
          status: "completed",
          conclusion: "cancelled",
        }),
      ],
    });

    expect(result.failures).toEqual([
      expect.stringContaining("tavily durable reservation ceiling reached"),
    ]);
    expect(result.outputs).toEqual({});
  });

  it("allows two exact-page Firecrawl proofs before the daily ceiling", async () => {
    const current = historyRun({
      display_title: "Source intelligence (firecrawl-live)",
    });
    const allowed = await runDurableBudgetScript({
      tool: "firecrawl-watch",
      runs: [current],
    });
    expect(allowed.failures).toEqual([]);
    expect(allowed.outputs).toMatchObject({
      provider: "firecrawl",
      "daily-reserved-credits": "1",
      "monthly-reserved-credits": "1",
    });

    const secondAllowed = await runDurableBudgetScript({
      tool: "firecrawl-watch",
      runs: [
        current,
        historyRun({
          id: 99,
          display_title: "Source intelligence (firecrawl-live)",
          status: "completed",
          conclusion: "failure",
        }),
      ],
    });
    expect(secondAllowed.failures).toEqual([]);
    expect(secondAllowed.outputs).toMatchObject({
      provider: "firecrawl",
      "daily-reserved-credits": "2",
      "monthly-reserved-credits": "2",
    });

    const blocked = await runDurableBudgetScript({
      tool: "firecrawl-watch",
      runs: [
        current,
        historyRun({
          id: 99,
          display_title: "Source intelligence (firecrawl-live)",
          status: "completed",
          conclusion: "failure",
        }),
        historyRun({
          id: 98,
          display_title: "Source intelligence (firecrawl-live)",
          status: "completed",
          conclusion: "cancelled",
        }),
      ],
    });
    expect(blocked.failures).toEqual([
      expect.stringContaining("firecrawl durable reservation ceiling reached"),
    ]);
    expect(blocked.outputs).toEqual({});
  });

  it.each(["Source intelligence pilot", "Source intelligence"])(
    "reserves legacy run name %s against both providers",
    async (displayTitle) => {
      const legacy = historyRun({
        id: 99,
        display_title: displayTitle,
        status: "completed",
        conclusion: "success",
      });
      const tavily = await runDurableBudgetScript({
        tool: "tavily-scout",
        runs: [historyRun(), legacy],
      });
      expect(tavily.failures).toEqual([]);
      expect(tavily.outputs["daily-reserved-credits"]).toBe("24");

      const firecrawl = await runDurableBudgetScript({
        tool: "firecrawl-watch",
        runs: [
          historyRun({
            display_title: "Source intelligence (firecrawl-live)",
          }),
          legacy,
        ],
      });
      expect(firecrawl.failures).toEqual([]);
      expect(firecrawl.outputs["daily-reserved-credits"]).toBe("2");
    },
  );

  it.each([
    {
      label: "missing current run",
      currentAttempt: 1,
      runs: [historyRun({ id: 99 })],
      failure: "absent from durable GitHub history",
    },
    {
      label: "mismatched current attempt",
      currentAttempt: 2,
      runs: [historyRun({ run_attempt: 1 })],
      failure: "exact current attempt",
    },
    {
      label: "malformed timestamp",
      currentAttempt: 1,
      runs: [historyRun({ updated_at: "not-a-timestamp" })],
      failure: "uncertain workflow-run history",
    },
    {
      label: "unknown recent classification",
      currentAttempt: 1,
      runs: [historyRun({ display_title: "unexpected run title" })],
      failure: "unrecognized spend classification",
    },
  ])("fails closed for $label", async ({ currentAttempt, runs, failure }) => {
    const result = await runDurableBudgetScript({
      tool: "tavily-scout",
      currentAttempt,
      runs,
    });

    expect(result.failures).toEqual([expect.stringContaining(failure)]);
    expect(result.outputs).toEqual({});
  });

  it("fails the step when paginated history cannot be loaded", async () => {
    await expect(
      runDurableBudgetScript({
        tool: "firecrawl-watch",
        historyError: new Error("history unavailable"),
      }),
    ).rejects.toThrow("history unavailable");
  });

  it("uploads review evidence briefly and has no publishing path", () => {
    const workflow = loadWorkflow();
    const steps = allSteps(workflow);
    const artifact = steps.find((step) =>
      usesAction(step, "actions/upload-artifact"),
    );

    expect(artifact).toBeDefined();
    expectImmutableAction(artifact, "actions/upload-artifact");
    expect(artifact?.if).toBe("always()");
    expect(artifact?.with?.path).toContain("scripts/reports");
    expect(artifact?.with?.path).toContain(
      "scripts/reports/source-watch/github-issue.json",
    );
    expect(artifact?.with?.path).toContain(
      "scripts/reports/source-scout-github-issue.json",
    );
    expect(artifact?.with?.["retention-days"]).toBeGreaterThanOrEqual(1);
    expect(artifact?.with?.["retention-days"]).toBeLessThanOrEqual(14);

    const checkout = steps.find((step) => usesAction(step, "actions/checkout"));
    expectImmutableAction(checkout, "actions/checkout");
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
    const restore = steps.find((step) =>
      usesAction(step, "actions/cache/restore"),
    );
    const save = steps.find((step) => usesAction(step, "actions/cache/save"));

    expect(restore).toBeDefined();
    expectImmutableAction(restore, "actions/cache/restore");
    expect(restore?.id).toBe("source-state");
    expect(restore?.with?.path).toContain("scripts/reports");
    expect(restore?.with?.["restore-keys"]).toContain("source-intelligence-");
    expect(restore?.with?.key).toContain("github.run_attempt");

    expect(save).toBeDefined();
    expectImmutableAction(save, "actions/cache/save");
    expect(save?.if).toContain("always()");
    expect(save?.if).toContain("steps.source-watch-review-queue.outcome");
    expect(save?.if).toContain("'success'");
    expect(save?.with?.path).toContain("scripts/reports");
    expect(save?.with?.key).toContain("source-intelligence-");
    expect(save?.with?.key).toContain("github.run_id");
    expect(save?.with?.key).toContain("github.run_attempt");

    const initializeGuard = steps.find((step) => {
      const text = JSON.stringify(step);
      return (
        text.includes("steps.source-state.outputs.cache-matched-key") &&
        text.includes("initialize_state") &&
        runText(step).includes("exit 1")
      );
    });
    expect(initializeGuard).toBeDefined();
    expect(initializeGuard?.env).toMatchObject({
      RESTORED_STATE_KEY: "${{ steps.source-state.outputs.cache-matched-key }}",
      SELECTED_TOOL: "${{ steps.selection.outputs.tool }}",
    });
    expect(runText(initializeGuard!)).not.toContain(
      "assertScheduledFirecrawlBaseline",
    );
  });

  it("updates a compact per-source issue before advancing Firecrawl fingerprints", () => {
    const workflow = loadWorkflow();
    const steps = allSteps(workflow);
    const liveIndex = steps.findIndex(
      (step) => step.name === "Run one-source Firecrawl Source Watch pilot",
    );
    const issueIndex = steps.findIndex(
      (step) => step.name === "Open or update the per-source review queue",
    );
    const saveIndex = steps.findIndex(
      (step) => step.name === "Save source intelligence state",
    );
    const issue = steps[issueIndex];

    expect(liveIndex).toBeGreaterThan(-1);
    expect(issueIndex).toBeGreaterThan(liveIndex);
    expect(saveIndex).toBeGreaterThan(issueIndex);
    expectImmutableAction(issue, "actions/github-script");
    expect(issue?.id).toBe("source-watch-review-queue");
    expect(issue?.if).toContain("always()");
    expect(issue?.if).toContain("firecrawl-watch");
    expect(issue?.if).toContain("steps.selection.outputs.live == 'true'");
    expect(issue?.if).toContain("steps.firecrawl-live.outcome");
    expect(issue?.if).toContain("'success'");
    expect(issue?.if).toContain("'failure'");
    expect(issue?.if).toContain("github-issue.json");
    expect(issue?.with?.script).toContain("scripts/lib/source-watch-issue.cjs");
    expect(issue?.with?.script).toContain("updateSourceWatchIssues");

    const save = steps[saveIndex];
    expect(save?.if).toContain("source-watch-review-queue.outcome");
    expect(save?.if).toContain("success");
    expect(save?.with?.path).toContain(
      "scripts/reports/source-watch/state.json",
    );

    const live = steps[liveIndex];
    expect(live?.id).toBe("firecrawl-live");
    expect(runText(live)).toContain(
      "rm -f scripts/reports/source-watch/github-issue.json",
    );
  });

  it("routes compact Tavily candidate evidence into a stable review queue", () => {
    const workflow = loadWorkflow();
    const steps = allSteps(workflow);
    const liveIndex = steps.findIndex(
      (step) => step.name === "Run capped Tavily Source Scout",
    );
    const issueIndex = steps.findIndex(
      (step) => step.name === "Open or update the Source Scout review queue",
    );
    const saveIndex = steps.findIndex(
      (step) => step.name === "Save source intelligence state",
    );
    const issue = steps[issueIndex];

    expect(liveIndex).toBeGreaterThan(-1);
    expect(issueIndex).toBeGreaterThan(liveIndex);
    expect(saveIndex).toBeGreaterThan(issueIndex);
    expectImmutableAction(issue, "actions/github-script");
    expect(issue?.id).toBe("source-scout-review-queue");
    expect(issue?.if).toContain("always()");
    expect(issue?.if).toContain("tavily-scout");
    expect(issue?.if).toContain("steps.selection.outputs.live == 'true'");
    expect(issue?.if).toContain("steps.tavily-live.outcome");
    expect(issue?.if).toContain("'success'");
    expect(issue?.if).toContain("'failure'");
    expect(issue?.if).toContain("source-scout-github-issue.json");
    expect(issue?.with?.script).toContain("scripts/lib/source-scout-issue.cjs");
    expect(issue?.with?.script).toContain("updateSourceScoutIssues");

    // Tavily's attempted-credit ledger must survive even when issue delivery
    // fails. The next run can replay the cached evidence without another call.
    const save = steps[saveIndex];
    expect(save?.if).not.toContain("source-scout-review-queue.outcome");
    expect(save?.with?.path).toContain(
      "scripts/reports/source-scout-usage.json",
    );
    expect(save?.with?.path).toContain(
      "scripts/reports/source-scout-cache.json",
    );

    const live = steps[liveIndex];
    expect(live?.id).toBe("tavily-live");
    expect(runText(live)).toContain(
      "rm -f scripts/reports/source-scout-github-issue.json",
    );
  });

  it("keeps live provider ledgers on the main branch", () => {
    const serialized = JSON.stringify(loadWorkflow());

    expect(serialized).toContain("github.ref");
    expect(serialized).toContain("refs/heads/main");
    expect(serialized).toContain("steps.selection.outputs.live");
  });
});
