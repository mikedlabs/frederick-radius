import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const budget = require("../scripts/lib/firecrawl-fallback-budget.cjs") as {
  DAILY_CEILING: number;
  MAX_LEGACY_RUN_IDS: number;
  MONTHLY_CEILING: number;
  WORKFLOWS: ReadonlyArray<{ file: string; title: string }>;
  enforceFirecrawlFallbackBudget: (
    options: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  runTitle: (
    policy: { file: string; title: string },
    enabled: "0" | "1",
    cap: number,
  ) => string;
};

const {
  DAILY_CEILING,
  MAX_LEGACY_RUN_IDS,
  MONTHLY_CEILING,
  WORKFLOWS,
  enforceFirecrawlFallbackBudget,
  runTitle,
} = budget;

const NOW = new Date("2026-08-15T16:00:00.000Z");
const CURRENT_RUN_ID = 9001;
const VENUES = WORKFLOWS.find(({ file }) => file === "ingest-venues.yml")!;
const BUSINESS = WORKFLOWS.find(
  ({ file }) => file === "ingest-business-info.yml",
)!;
const CIVIC = WORKFLOWS.find(({ file }) => file === "ingest-civic.yml")!;

type WorkflowRun = {
  id: number;
  run_attempt: number;
  display_title: string;
  head_branch: string;
  created_at: string;
  updated_at: string;
  conclusion?: string | null;
};

function workflowRun(
  policy: { file: string; title: string },
  overrides: Partial<WorkflowRun> & {
    enabled?: "0" | "1";
    cap?: 1 | 2;
  } = {},
): WorkflowRun {
  const { enabled = "0", cap = 1, ...runOverrides } = overrides;
  return {
    id: 100,
    run_attempt: 1,
    display_title: runTitle(policy, enabled, cap),
    head_branch: "main",
    created_at: "2026-08-15T15:00:00.000Z",
    updated_at: "2026-08-15T15:05:00.000Z",
    conclusion: "success",
    ...runOverrides,
  };
}

function harness({
  workflow = VENUES,
  enabled = "1",
  cap = "1",
  attempt = 1,
  histories,
}: {
  workflow?: { file: string; title: string };
  enabled?: "0" | "1";
  cap?: "1" | "2";
  attempt?: number;
  histories?: Record<string, unknown>;
} = {}) {
  const listWorkflowRuns = vi.fn();
  const current = workflowRun(workflow, {
    id: CURRENT_RUN_ID,
    run_attempt: attempt,
    enabled,
    cap: Number(cap) as 1 | 2,
  });
  const runsByWorkflow: Record<string, unknown> = Object.fromEntries(
    WORKFLOWS.map(({ file }) => [
      file,
      file === workflow.file ? [current] : [],
    ]),
  );
  Object.assign(runsByWorkflow, histories);

  const paginate = vi.fn(
    async (method: unknown, parameters: Record<string, unknown>) => {
      expect(method).toBe(listWorkflowRuns);
      return runsByWorkflow[String(parameters.workflow_id)];
    },
  );
  const setFailed = vi.fn();
  const setOutput = vi.fn();
  const info = vi.fn();
  return {
    github: {
      paginate,
      rest: { actions: { listWorkflowRuns } },
    },
    context: {
      ref: "refs/heads/main",
      repo: { owner: "mikedlabs", repo: "frederick-radius" },
      runId: CURRENT_RUN_ID,
      runAttempt: attempt,
    },
    core: { info, setFailed, setOutput },
    env: {
      CURRENT_WORKFLOW_FILE: workflow.file,
      FIRECRAWL_FETCH_FALLBACK: enabled,
      FIRECRAWL_FALLBACK_MAX_REQUESTS: cap,
      GITHUB_REF: "refs/heads/main",
      GITHUB_RUN_ID: String(CURRENT_RUN_ID),
      GITHUB_RUN_ATTEMPT: String(attempt),
      FIRECRAWL_LEGACY_DISABLED_RUN_IDS: "",
    },
    now: NOW,
    paginate,
    setFailed,
    setOutput,
  };
}

async function enforce(h: ReturnType<typeof harness>) {
  return enforceFirecrawlFallbackBudget({
    github: h.github,
    context: h.context,
    core: h.core,
    env: h.env,
    now: h.now,
  });
}

describe("shared operator Firecrawl fallback budget", () => {
  it("uses a two-request UTC daily ceiling and a 30-request monthly ceiling", () => {
    expect(DAILY_CEILING).toBe(2);
    expect(MONTHLY_CEILING).toBe(30);
    expect(MAX_LEGACY_RUN_IDS).toBe(100);
  });

  it("reserves zero and does not read workflow history when fallback is off", async () => {
    const h = harness({ enabled: "0" });

    await expect(enforce(h)).resolves.toMatchObject({
      allowed: true,
      enabled: false,
      dailyReserved: 0,
      monthlyReserved: 0,
    });
    expect(h.paginate).not.toHaveBeenCalled();
    expect(h.setOutput).toHaveBeenCalledWith("allowed", "true");
    expect(h.setOutput).toHaveBeenCalledWith("enabled", "false");
    expect(h.setOutput).toHaveBeenCalledWith("reservation", "0");
  });

  it("counts enabled failed runs across all workflows but not classified disabled runs", async () => {
    const current = workflowRun(VENUES, {
      id: CURRENT_RUN_ID,
      enabled: "1",
      cap: 1,
    });
    const failedBusiness = workflowRun(BUSINESS, {
      id: 8001,
      enabled: "1",
      cap: 1,
      conclusion: "failure",
    });
    const disabledCivic = workflowRun(CIVIC, {
      id: 8002,
      enabled: "0",
      cap: 2,
      conclusion: "cancelled",
    });
    const h = harness({
      histories: {
        [VENUES.file]: [current],
        [BUSINESS.file]: [failedBusiness],
        [CIVIC.file]: [disabledCivic],
      },
    });

    await expect(enforce(h)).resolves.toMatchObject({
      allowed: true,
      dailyReserved: 2,
      monthlyReserved: 2,
    });
    expect(h.paginate).toHaveBeenCalledTimes(3);
    expect(h.paginate.mock.calls.map(([, input]) => input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workflow_id: VENUES.file, branch: "main" }),
        expect.objectContaining({ workflow_id: BUSINESS.file, branch: "main" }),
        expect.objectContaining({ workflow_id: CIVIC.file, branch: "main" }),
      ]),
    );
  });

  it("counts every rerun attempt and blocks a shared reservation above the daily ceiling", async () => {
    const current = workflowRun(VENUES, {
      id: CURRENT_RUN_ID,
      run_attempt: 2,
      enabled: "1",
      cap: 1,
      conclusion: "failure",
    });
    const prior = workflowRun(BUSINESS, {
      id: 8003,
      enabled: "1",
      cap: 1,
    });
    const h = harness({
      attempt: 2,
      histories: {
        [VENUES.file]: [current],
        [BUSINESS.file]: [prior],
      },
    });

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("3/2 requests today"),
    );
    expect(h.setOutput).not.toHaveBeenCalledWith("allowed", "true");
    expect(h.setOutput).not.toHaveBeenCalledWith("enabled", "true");
  });

  it("lets one cap-two run fill the daily allowance", async () => {
    const h = harness({ cap: "2" });

    await expect(enforce(h)).resolves.toMatchObject({
      allowed: true,
      dailyReserved: 2,
      monthlyReserved: 2,
    });
  });

  it("blocks the combined monthly reservation even when the daily allowance is open", async () => {
    const priorMonthRuns = Array.from({ length: 30 }, (_, index) =>
      workflowRun(BUSINESS, {
        id: 8100 + index,
        enabled: "1",
        cap: 1,
        created_at: "2026-08-02T12:00:00.000Z",
        updated_at: "2026-08-02T12:05:00.000Z",
      }),
    );
    const h = harness({
      histories: { [BUSINESS.file]: priorMonthRuns },
    });

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("31/30 this UTC month"),
    );
  });

  it("ignores only exact audited first-attempt legacy run IDs", async () => {
    const legacy = WORKFLOWS.map((policy, index) =>
      workflowRun(policy, {
        id: 7000 + index,
        display_title: policy.title,
      }),
    );
    const h = harness({
      histories: {
        [VENUES.file]: [
          workflowRun(VENUES, {
            id: CURRENT_RUN_ID,
            enabled: "1",
            cap: 1,
          }),
          legacy[0],
        ],
        [BUSINESS.file]: [legacy[1]],
        [CIVIC.file]: [legacy[2]],
      },
    });
    h.env.FIRECRAWL_LEGACY_DISABLED_RUN_IDS = legacy
      .map(({ id }) => id)
      .join(",");

    await expect(enforce(h)).resolves.toMatchObject({
      allowed: true,
      dailyReserved: 1,
      monthlyReserved: 1,
    });
  });

  it("fails closed for a static title not in the audited legacy run IDs", async () => {
    const h = harness({
      histories: {
        [BUSINESS.file]: [
          workflowRun(BUSINESS, {
            id: 8004,
            display_title: BUSINESS.title,
          }),
        ],
      },
    });

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(
        "no trusted Firecrawl reservation classification",
      ),
    );
  });

  it("fails closed when an audited legacy run is rerun", async () => {
    const h = harness({
      histories: {
        [CIVIC.file]: [
          workflowRun(CIVIC, {
            id: 8006,
            run_attempt: 2,
            display_title: CIVIC.title,
          }),
        ],
      },
    });
    h.env.FIRECRAWL_LEGACY_DISABLED_RUN_IDS = "8006";

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(
        "no trusted Firecrawl reservation classification",
      ),
    );
  });

  it.each([
    "01",
    "8001,",
    "8001,8001",
    Array.from({ length: 101 }, (_, index) => String(9000 + index)).join(","),
  ])("fails closed for malformed legacy audit IDs: %s", async (value) => {
    const h = harness();
    h.env.FIRECRAWL_LEGACY_DISABLED_RUN_IDS = value;

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("legacy Firecrawl run IDs are malformed"),
    );
  });

  it("ignores the migration variable when fallback is disabled", async () => {
    const h = harness({ enabled: "0" });
    h.env.FIRECRAWL_LEGACY_DISABLED_RUN_IDS = "not-valid";

    await expect(enforce(h)).resolves.toMatchObject({
      allowed: true,
      enabled: false,
    });
    expect(h.paginate).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown title", { display_title: "Unexpected operator run" }],
    ["invalid attempt", { run_attempt: 0 }],
    [
      "unsafe reservation total",
      { run_attempt: Number.MAX_SAFE_INTEGER, enabled: "1", cap: 2 },
    ],
    ["invalid timestamp", { updated_at: "not-a-date" }],
    ["wrong branch", { head_branch: "preview" }],
  ] as const)(
    "fails closed for %s in current-month history",
    async (_label, bad) => {
      const h = harness({
        histories: {
          [BUSINESS.file]: [workflowRun(BUSINESS, { id: 8005, ...bad })],
        },
      });

      await expect(enforce(h)).resolves.toEqual({ allowed: false });
      expect(h.setFailed).toHaveBeenCalled();
    },
  );

  it("fails closed when the recorded title disagrees with the current configuration", async () => {
    const h = harness({
      histories: {
        [VENUES.file]: [
          workflowRun(VENUES, {
            id: CURRENT_RUN_ID,
            enabled: "0",
            cap: 1,
          }),
        ],
      },
    });

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(
        "does not match the current Firecrawl fallback configuration",
      ),
    );
  });

  it("fails closed when the exact current attempt is absent", async () => {
    const h = harness({
      histories: {
        [VENUES.file]: [
          workflowRun(VENUES, { id: CURRENT_RUN_ID + 1, enabled: "1" }),
        ],
      },
    });

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("absent from durable GitHub history"),
    );
  });

  it.each([
    ["missing runner attempt", { envAttempt: "", contextAttempt: 1 }],
    ["malformed runner attempt", { envAttempt: "01", contextAttempt: 1 }],
    ["mismatched context attempt", { envAttempt: "1", contextAttempt: 2 }],
  ])("fails closed for %s", async (_label, values) => {
    const h = harness();
    h.env.GITHUB_RUN_ATTEMPT = values.envAttempt;
    h.context.runAttempt = values.contextAttempt;

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("exact main-branch run ID and attempt"),
    );
    expect(h.setOutput).not.toHaveBeenCalled();
  });

  it("fails closed when any paginated workflow history cannot be read", async () => {
    const h = harness();
    h.paginate.mockRejectedValueOnce(new Error("GitHub unavailable"));

    await expect(enforce(h)).resolves.toEqual({ allowed: false });
    expect(h.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("could not be read"),
    );
  });
});
