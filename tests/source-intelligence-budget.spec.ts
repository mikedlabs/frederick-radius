import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
type Run = {
  id: number;
  workflow_id: number;
  path: string;
  run_attempt: number;
  head_branch: string;
  display_title: string;
  event: string;
  created_at: string;
  updated_at: string;
  repository: { full_name: string };
  head_repository: { full_name: string };
  conclusion?: string | null;
};
type History = {
  complete: boolean;
  repository: string;
  workflowId: number;
  currentRunId: number;
  currentAttempt: number;
  checkedAt: string;
  totalCount: number;
  runs: Run[];
};
type Bucket = { attemptedRequests: number; attemptedCredits: number };
type Usage = {
  schemaVersion: 1;
  timezone: "UTC";
  updatedAt: string;
  days: Record<string, Bucket>;
  months: Record<string, Bucket>;
};
type Cache = { schemaVersion: 1; reviewOnly: true; entries: Record<string, unknown> };
type Floor = {
  provider: string;
  day: string;
  month: string;
  dailyReservedCredits: number;
  monthlyReservedCredits: number;
  dailyCeiling: number;
  monthlyCeiling: number;
};
type GitHub = {
  rest: { actions: {
    getWorkflow: (args: Record<string, unknown>) => Promise<{ data: { id: number; path: string } }>;
    listWorkflowRuns: (args: Record<string, unknown>) => Promise<{ data: { total_count: number; workflow_runs: Run[] } }>;
  } };
};
const {
  assertFirstProviderInitialization,
  calculateReservationFloor,
  readSourceIntelligenceHistory,
  recoverTavilyState,
  validateTavilyCache,
  validateTavilyUsage,
} = require("../scripts/lib/source-intelligence-budget.cjs") as {
  assertFirstProviderInitialization: (history: History, options: { tool: string; now: Date }) => boolean;
  calculateReservationFloor: (history: History, options: {
    tool: string; now: Date; currentRunId?: number; currentAttempt?: number; requireCurrentLive?: boolean;
  }) => Floor;
  readSourceIntelligenceHistory: (options: {
    github: GitHub; repo: { owner: string; repo: string }; now: Date; currentRunId: number; currentAttempt: number;
  }) => Promise<History>;
  recoverTavilyState: (options: {
    history: History; now: Date; existingUsage?: unknown; existingCache?: unknown;
  }) => {
    usage: Usage;
    cache: Cache;
    usageChanged: boolean;
    cacheChanged: boolean;
    skipped: boolean;
    recovery: { kind: string; generatedAt: string; queryCache: string; dailyReservedCredits: number; monthlyReservedCredits: number };
  };
  validateTavilyCache: (value: unknown) => Cache;
  validateTavilyUsage: (value: unknown) => Usage;
};

const NOW = new Date("2026-10-08T16:00:00.000Z");
const REPO = { owner: "mikedlabs", repo: "frederick-radius" };
const WORKFLOW_ID = 324129061;
const WORKFLOW_PATH = ".github/workflows/source-intelligence.yml";

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 100,
    workflow_id: WORKFLOW_ID,
    path: WORKFLOW_PATH,
    run_attempt: 1,
    head_branch: "main",
    display_title: "Source intelligence (plan)",
    event: "workflow_dispatch",
    created_at: "2026-10-08T15:58:00Z",
    updated_at: "2026-10-08T15:59:00Z",
    repository: { full_name: "mikedlabs/frederick-radius" },
    head_repository: { full_name: "mikedlabs/frederick-radius" },
    ...overrides,
  };
}

function live(id: number, day: string, overrides: Partial<Run> = {}): Run {
  return run({
    id,
    created_at: `${day}T14:44:00Z`,
    updated_at: `${day}T14:46:00Z`,
    display_title: "Source intelligence (tavily-live)",
    event: "schedule",
    conclusion: "failure",
    ...overrides,
  });
}

function history(runs = [run(), live(99, "2026-10-08"), live(98, "2026-10-05"), live(97, "2026-10-02")]): History {
  return {
    complete: true,
    repository: "mikedlabs/frederick-radius",
    workflowId: WORKFLOW_ID,
    currentRunId: 100,
    currentAttempt: 1,
    checkedAt: NOW.toISOString(),
    totalCount: runs.length,
    runs,
  };
}

function usage(): Usage {
  return {
    schemaVersion: 1,
    timezone: "UTC",
    updatedAt: "2026-10-08T14:46:00Z",
    days: {},
    months: {},
  };
}

function cache(): Cache {
  const key = "a".repeat(64);
  return {
    schemaVersion: 1,
    reviewOnly: true,
    entries: {
      [key]: {
        cacheKey: key,
        fetchedAt: "2026-10-08T14:46:00Z",
        expiresAt: "2026-10-09T14:46:00Z",
        result: {
          query: "Frederick official event schedule",
          candidates: [{ url: "https://weinbergcenter.org/shows/example", title: "Example", score: 0.9 }],
          requestId: "example-request",
          responseTime: 1.5,
          credits: 1,
        },
      },
    },
  };
}

function github(pages: Run[][], totals?: number[]): GitHub {
  return {
    rest: { actions: {
      getWorkflow: vi.fn(async () => ({ data: { id: WORKFLOW_ID, path: WORKFLOW_PATH } })),
      listWorkflowRuns: vi.fn(async ({ page }) => ({
        data: {
          total_count: totals?.[Number(page) - 1] ?? pages.flat().length,
          workflow_runs: pages[Number(page) - 1] ?? [],
        },
      })),
    } },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Source Intelligence authenticated reservation history", () => {
  it("reads every page from the canonical workflow and keeps the recovery run classified as zero spend", async () => {
    const firstPage = [run(), ...Array.from({ length: 99 }, (_, i) => live(1000 + i, "2026-09-25"))];
    const secondPage = [live(99, "2026-10-08")];
    const api = github([firstPage, secondPage]);
    const result = await readSourceIntelligenceHistory({ github: api, repo: REPO, now: NOW, currentRunId: 100, currentAttempt: 1 });
    expect(api.rest.actions.getWorkflow).toHaveBeenCalledWith({ ...REPO, workflow_id: "source-intelligence.yml" });
    expect(api.rest.actions.listWorkflowRuns).toHaveBeenNthCalledWith(2, { ...REPO, workflow_id: WORKFLOW_ID, per_page: 100, page: 2 });
    expect(result.runs).toHaveLength(101);
    expect(calculateReservationFloor(result, { tool: "tavily-scout", now: NOW, requireCurrentLive: false })).toMatchObject({ dailyReservedCredits: 12, monthlyReservedCredits: 12 });
  });

  it.each([
    { label: "empty missing page", pages: [[run()], []], totals: [2, 2] },
    { label: "changing total", pages: [[run()], [live(99, "2026-10-08")]], totals: [2, 3] },
    { label: "duplicate run", pages: [[run()], [run()]], totals: [2, 2] },
    { label: "more records than total", pages: [[run(), live(99, "2026-10-08")]], totals: [1] },
  ])("rejects $label rather than guessing a budget", async ({ pages, totals }) => {
    await expect(readSourceIntelligenceHistory({ github: github(pages, totals), repo: REPO, now: NOW, currentRunId: 100, currentAttempt: 1 })).rejects.toThrow(/history|pagination|duplicate/i);
  });

  it("fails when canonical workflow lookup or authenticated history is unavailable", async () => {
    const api = github([[run()]]);
    vi.mocked(api.rest.actions.getWorkflow).mockResolvedValue({ data: { id: WORKFLOW_ID, path: ".github/workflows/other.yml" } });
    await expect(readSourceIntelligenceHistory({ github: api, repo: REPO, now: NOW, currentRunId: 100, currentAttempt: 1 })).rejects.toThrow(/exact/i);
    vi.mocked(api.rest.actions.getWorkflow).mockRejectedValue(new Error("authenticated history unavailable"));
    await expect(readSourceIntelligenceHistory({ github: api, repo: REPO, now: NOW, currentRunId: 100, currentAttempt: 1 })).rejects.toThrow("authenticated history unavailable");
  });

  it.each([
    { workflow_id: WORKFLOW_ID + 1 },
    { repository: { full_name: "other/project" } },
    { head_repository: { full_name: "fork/project" } },
    { path: ".github/workflows/other.yml" },
    { event: "pull_request" },
    { run_attempt: 0 },
    { run_attempt: 1.5 },
    { updated_at: "2026-02-31T14:46:00Z" },
    { updated_at: "2026-10-09T14:46:00Z" },
    { updated_at: "not-a-timestamp" },
  ])("blocks corrupt or foreign history metadata %j", (overrides) => {
    expect(() => recoverTavilyState({ history: history([run(), live(99, "2026-10-08", overrides)]), now: NOW })).toThrow(/history|timestamp|provenance/i);
  });

  it("requires exact current main run, attempt, mode and fresh complete history", () => {
    for (const bad of [
      { ...history(), complete: false },
      { ...history(), totalCount: 99 },
      { ...history(), currentRunId: 500 },
      { ...history(), currentAttempt: 2 },
      { ...history(), checkedAt: "2026-10-08T14:00:00Z" },
      history([run({ head_branch: "feature" })]),
      history([run({ display_title: "Source intelligence (tavily-live)" })]),
    ]) expect(() => recoverTavilyState({ history: bad, now: NOW })).toThrow();
  });
});

describe("shared paid ceilings and zero-spend Tavily recovery", () => {
  it("reconstructs Oct 8’s 12-credit daily and 36-credit monthly reservation floors without a provider call", () => {
    const network = vi.fn(() => { throw new Error("Provider network is forbidden"); });
    vi.stubGlobal("fetch", network);
    const result = recoverTavilyState({ history: history(), now: NOW });
    expect(result.usage.days["2026-10-08"]).toEqual({ attemptedRequests: 12, attemptedCredits: 12 });
    expect(result.usage.months["2026-10"]).toEqual({ attemptedRequests: 36, attemptedCredits: 36 });
    expect(result.recovery).toEqual({ kind: "tavily-history-recovery", generatedAt: NOW.toISOString(), queryCache: "lost-rebuilt", dailyReservedCredits: 12, monthlyReservedCredits: 36 });
    expect(result.cache).toEqual({ schemaVersion: 1, reviewOnly: true, entries: {} });
    expect(result).not.toHaveProperty("firecrawl");
    expect(network).not.toHaveBeenCalled();
    expect(validateTavilyUsage(result.usage)).toBe(result.usage);
  });

  it("recovers the observed October failed runs and August legacy history with separate provider reservations", () => {
    const observed = history([
      run(),
      live(37794950787, "2026-10-08", { created_at: "2026-10-08T14:44:35Z", updated_at: "2026-10-08T14:46:36Z" }),
      live(37326172461, "2026-10-05", { created_at: "2026-10-05T14:37:17Z", updated_at: "2026-10-05T14:38:51Z" }),
      live(37053049814, "2026-10-02", { created_at: "2026-10-02T19:16:37Z", updated_at: "2026-10-02T19:17:26Z" }),
      live(30734535883, "2026-08-02", { event: "workflow_dispatch", conclusion: "success" }),
      live(30734393491, "2026-08-02", { event: "workflow_dispatch", display_title: "Source intelligence (firecrawl-live)", run_attempt: 2, conclusion: "success" }),
      ...[30680789998, 30678210044, 30678207312].map((id) => live(id, "2026-08-01", { event: "workflow_dispatch", display_title: "Source intelligence", conclusion: "success" })),
    ]);
    const result = recoverTavilyState({ history: observed, now: NOW });
    expect(result.recovery).toMatchObject({ dailyReservedCredits: 12, monthlyReservedCredits: 36 });
    expect(result.usage.months["2026-08"]?.attemptedCredits).toBe(48);
    expect(result.usage.days["2026-08-02"]?.attemptedCredits).toBe(12);
  });

  it("counts reruns, failures, cancellations and legacy names conservatively while keeping providers independent", () => {
    const evidence = history([
      run({ run_attempt: 50 }),
      live(99, "2026-10-08", { run_attempt: 2, conclusion: "cancelled" }),
      live(98, "2026-10-05", { display_title: "Source intelligence", run_attempt: 2 }),
      live(97, "2026-10-02", { display_title: "Source intelligence pilot" }),
      live(96, "2026-10-08", { display_title: "Source intelligence (firecrawl-live)", run_attempt: 20 }),
      live(95, "2026-10-08", { head_branch: "feature", display_title: "unknown feature plan" }),
      live(94, "2026-09-25"),
    ]);
    evidence.currentAttempt = 50;
    const result = recoverTavilyState({ history: evidence, now: NOW });
    expect(result.recovery).toMatchObject({ dailyReservedCredits: 24, monthlyReservedCredits: 60 });
    expect(result.usage.months["2026-09"]?.attemptedCredits).toBe(12);
    expect(() => recoverTavilyState({ history: history([run(), live(99, "2026-10-08", { display_title: "unknown main spend" })]), now: NOW })).toThrow(/unrecognized spend/i);
  });

  it("still enforces the exact live run and daily ceilings for both paid providers", () => {
    for (const [tool, title, credits] of [["tavily-scout", "Source intelligence (tavily-live)", 12], ["firecrawl-watch", "Source intelligence (firecrawl-live)", 1]] as const) {
      const current = run({ display_title: title, run_attempt: 2 });
      const allowed = history([current]);
      allowed.currentAttempt = 2;
      expect(calculateReservationFloor(allowed, { tool, now: NOW }).dailyReservedCredits).toBe(credits * 2);
      const blocked = history([current, live(99, "2026-10-08", { display_title: title })]);
      blocked.currentAttempt = 2;
      expect(() => calculateReservationFloor(blocked, { tool, now: NOW })).toThrow(/ceiling reached/i);
      expect(() => calculateReservationFloor(allowed, { tool, now: NOW, currentAttempt: 1 })).toThrow(/context/i);
    }
  });

  it("allows genuine first initialization with prior plans and independent provider activity", () => {
    const evidence = history([
      run({ display_title: "Source intelligence (tavily-live)" }),
      run({ id: 98, display_title: "Source intelligence (plan)" }),
      live(99, "2026-09-25", { display_title: "Source intelligence (firecrawl-live)" }),
    ]);
    expect(assertFirstProviderInitialization(evidence, { tool: "tavily-scout", now: NOW })).toBe(true);
  });

  it.each([
    "Source intelligence (tavily-live)",
    "Source intelligence",
    "Source intelligence pilot",
  ])("rejects reinitialization after an older reservation classified %s", (display_title) => {
    const evidence = history([
      run({ display_title: "Source intelligence (tavily-live)" }),
      live(99, "2026-08-02", { display_title }),
    ]);
    expect(() => assertFirstProviderInitialization(evidence, { tool: "tavily-scout", now: NOW })).toThrow(/first intentional|tavily-recover/i);
  });

  it("blocks initialization on reruns or established Firecrawl history even when the previous attempt failed", () => {
    const rerun = history([run({ display_title: "Source intelligence (tavily-live)", run_attempt: 2 })]);
    rerun.currentAttempt = 2;
    expect(() => assertFirstProviderInitialization(rerun, { tool: "tavily-scout", now: NOW })).toThrow(/first intentional/i);
    const existingWatch = history([
      run({ display_title: "Source intelligence (firecrawl-live)" }),
      live(99, "2026-08-02", { display_title: "Source intelligence (firecrawl-live)", conclusion: "failure" }),
    ]);
    expect(() => assertFirstProviderInitialization(existingWatch, { tool: "firecrawl-watch", now: NOW })).toThrow(/authentic Firecrawl state/i);
  });

  it("does not reset an over-limit month during recovery, and subsequent live preflight remains blocked", () => {
    const paid = Array.from({ length: 26 }, (_, i) => live(1000 + i, "2026-10-05"));
    const result = recoverTavilyState({ history: history([run(), ...paid]), now: NOW });
    expect(result.usage.months["2026-10"]?.attemptedCredits).toBe(312);
    expect(() => calculateReservationFloor(history([run({ display_title: "Source intelligence (tavily-live)" }), ...paid]), { tool: "tavily-scout", now: NOW })).toThrow(/monthly|month/i);
  });

  it("max-merges counters and preserves valid query-cache entries and historical buckets without mutating inputs", () => {
    const existing = usage();
    existing.days["2026-10-08"] = { attemptedRequests: 20, attemptedCredits: 20 };
    existing.months["2026-10"] = { attemptedRequests: 80, attemptedCredits: 80 };
    existing.months["2026-08"] = { attemptedRequests: 150, attemptedCredits: 150 };
    const storedCache = cache();
    const before = JSON.stringify({ existing, storedCache });
    const result = recoverTavilyState({ history: history(), now: NOW, existingUsage: existing, existingCache: storedCache });
    expect(result.usage.days["2026-10-08"]?.attemptedCredits).toBe(20);
    expect(result.usage.days["2026-10-05"]?.attemptedCredits).toBe(12);
    expect(result.usage.months["2026-10"]?.attemptedCredits).toBe(80);
    expect(result.usage.months["2026-08"]?.attemptedCredits).toBe(150);
    expect(result.cache).toBe(storedCache);
    expect(result.cacheChanged).toBe(false);
    expect(result.recovery.queryCache).toBe("preserved");
    expect(JSON.stringify({ existing, storedCache })).toBe(before);
  });

  it("keeps higher preserved daily counters in the monthly protection too", () => {
    const existing = usage();
    existing.days["2026-10-05"] = { attemptedRequests: 50, attemptedCredits: 50 };
    existing.months["2026-10"] = { attemptedRequests: 50, attemptedCredits: 50 };
    const result = recoverTavilyState({ history: history(), now: NOW, existingUsage: existing });
    expect(result.usage.months["2026-10"]?.attemptedCredits).toBe(74);
    expect(existing.months["2026-10"]?.attemptedCredits).toBe(50);
  });

  it("does not use recovery to create an empty initial ledger without spending evidence", () => {
    expect(() => recoverTavilyState({ history: history([run()]), now: NOW })).toThrow(/historical reservations|initialize/i);
  });

  it("skips both writes when valid existing counters already cover every reservation", () => {
    const initial = recoverTavilyState({ history: history(), now: NOW });
    const storedCache = cache();
    const result = recoverTavilyState({ history: history(), now: NOW, existingUsage: initial.usage, existingCache: storedCache });
    expect(result).toMatchObject({ skipped: true, usageChanged: false, cacheChanged: false });
    expect(result.usage).toBe(initial.usage);
    expect(result.cache).toBe(storedCache);
  });

  it.each([null, {}, { ...usage(), timezone: "America/New_York" }, { ...usage(), days: { "2026-10-08": { attemptedRequests: 0, attemptedCredits: -1 } } }, { ...usage(), months: { "2026-13": { attemptedRequests: 1, attemptedCredits: 1 } } }])("rejects corrupt usage instead of silently rebuilding it: %j", (existingUsage) => {
    expect(() => recoverTavilyState({ history: history(), now: NOW, existingUsage })).toThrow(/ledger|bucket|schema/i);
  });

  it("rejects corrupt cache, cached content or credentials rather than marking them absent", () => {
    for (const invalid of [null, {}, { ...cache(), reviewOnly: false }]) {
      expect(() => recoverTavilyState({ history: history(), now: NOW, existingCache: invalid })).toThrow(/cache|schema/i);
    }
    const content = cache();
    const entry = content.entries["a".repeat(64)] as { result: { candidates: Record<string, unknown>[] } };
    entry.result.candidates[0]!.content = "Provider content must never enter the checkpoint";
    expect(() => validateTavilyCache(content)).toThrow(/schema/i);
    delete entry.result.candidates[0]!.content;
    entry.result.candidates[0]!.url = "https://secret@example.org/events";
    expect(() => validateTavilyCache(content)).toThrow(/metadata/i);
  });
});
