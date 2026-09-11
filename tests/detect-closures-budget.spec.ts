import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canReserveClosureSearchAttempt,
  closureBudgetDecision,
  isTerminalClosureSearchError,
  MAX_CLOSURE_ATTEMPTED_CREDITS_PER_DAY,
  MAX_CLOSURE_ATTEMPTED_CREDITS_PER_MONTH,
  MAX_CLOSURE_CREDITS_PER_RUN,
  MAX_CLOSURE_REQUESTS_PER_RUN,
  parseClosureDetectorArgs,
  runClosureDetector,
  type RunClosureDetectorOptions,
} from "../scripts/detect-closures";
import { TavilySearchError } from "../scripts/lib/tavily-search";

const directories: string[] = [];
const env = { TAVILY_API_KEY: "test-key" };
const noSleep = async () => undefined;

function reportsDir(): string {
  const path = mkdtempSync(join(tmpdir(), "closure-detector-"));
  directories.push(path);
  return path;
}

function liveOptions(path: string, limit = 1): RunClosureDetectorOptions {
  return {
    ...parseClosureDetectorArgs([
      "--live",
      "--confirm",
      "--limit",
      String(limit),
    ]),
    reportsDir: path,
  };
}

afterEach(() => {
  directories.splice(0).forEach((path) =>
    rmSync(path, { force: true, recursive: true }),
  );
  vi.restoreAllMocks();
});

describe("closure detector budget controls", () => {
  it("requires explicit and valid live, long-tail, and refresh flags", async () => {
    expect(parseClosureDetectorArgs([])).toMatchObject({
      live: false,
      confirmed: false,
      refreshCache: false,
    });
    expect(parseClosureDetectorArgs(["--limit", "5"]).limit).toBe(5);
    for (const args of [
      ["--limit"],
      ["--limit", "5abc"],
      ["--limit", "0"],
      ["--limit", String(MAX_CLOSURE_REQUESTS_PER_RUN + 1)],
      ["--live"],
      ["--confirm"],
      ["--all"],
      ["--confirm-all"],
      ["--rescore", "--live", "--confirm"],
      ["--rescore", "--refresh"],
    ]) {
      expect(() => parseClosureDetectorArgs(args)).toThrow();
    }
    expect(
      parseClosureDetectorArgs(["--live", "--confirm"]),
    ).toMatchObject({ live: true, confirmed: true });
    expect(
      parseClosureDetectorArgs(["--all", "--confirm-all"]),
    ).toMatchObject({ includeLongTail: true, confirmedLongTail: true });
    await expect(
      runClosureDetector({
        ...parseClosureDetectorArgs([]),
        includeLongTail: true,
        confirmedLongTail: false,
        reportsDir: reportsDir(),
      }),
    ).rejects.toThrow("requires --confirm-all");
  });

  it("enforces run, daily, and monthly ceilings and terminal failures", () => {
    expect(
      canReserveClosureSearchAttempt(
        MAX_CLOSURE_REQUESTS_PER_RUN - 1,
        MAX_CLOSURE_CREDITS_PER_RUN - 1,
      ),
    ).toBe(true);
    expect(
      canReserveClosureSearchAttempt(MAX_CLOSURE_REQUESTS_PER_RUN, 0),
    ).toBe(false);
    expect(
      closureBudgetDecision({
        runRequests: 0,
        runCredits: 0,
        dailyCredits: MAX_CLOSURE_ATTEMPTED_CREDITS_PER_DAY,
        monthlyCredits: 0,
      }),
    ).toEqual({ allowed: false, reason: "daily-credits" });
    expect(
      closureBudgetDecision({
        runRequests: 0,
        runCredits: 0,
        dailyCredits: 0,
        monthlyCredits: MAX_CLOSURE_ATTEMPTED_CREDITS_PER_MONTH,
      }),
    ).toEqual({ allowed: false, reason: "monthly-credits" });

    for (const code of [
      "configuration",
      "unauthorized",
      "rate_limited",
      "plan_limit_exceeded",
      "payg_limit_exceeded",
    ] as const) {
      expect(
        isTerminalClosureSearchError(new TavilySearchError("stop", { code })),
      ).toBe(true);
    }
    for (const status of [402, 403]) {
      expect(
        isTerminalClosureSearchError(
          new TavilySearchError("API error", { code: "api_error", status }),
        ),
      ).toBe(true);
    }
    expect(
      isTerminalClosureSearchError(
        new TavilySearchError("Billing limit reached", {
          code: "api_error",
          status: 500,
        }),
      ),
    ).toBe(true);
    expect(
      isTerminalClosureSearchError(
        new TavilySearchError("temporary", { code: "network_error" }),
      ),
    ).toBe(false);
  });

  it("keeps the ordinary command zero-cost and zero-write even with a key", async () => {
    const path = reportsDir();
    const search = vi.fn(async () => "must not run");
    const result = await runClosureDetector(
      { ...parseClosureDetectorArgs([]), reportsDir: path },
      { env, search },
    );

    expect(result).toMatchObject({
      mode: "plan",
      wroteFiles: false,
      attemptedRequests: 0,
    });
    expect(search).not.toHaveBeenCalled();
    expect(existsSync(join(path, "closure-usage.json"))).toBe(false);
    expect(existsSync(join(path, "closure-candidates.json"))).toBe(false);
  });

  it("persists failed attempts and stops at the daily ceiling", async () => {
    const path = reportsDir();
    const search = vi.fn(async () => {
      throw new Error("temporary provider failure");
    });
    const options = liveOptions(path, 10);
    const dependencies = {
      env,
      now: () => new Date("2026-07-31T18:00:00.000Z"),
      search,
      sleep: noSleep,
    };

    expect((await runClosureDetector(options, dependencies)).attemptedRequests).toBe(10);
    expect((await runClosureDetector(options, dependencies)).attemptedRequests).toBe(10);
    expect((await runClosureDetector(options, dependencies)).attemptedRequests).toBe(0);
    expect(search).toHaveBeenCalledTimes(20);
    const ledger = JSON.parse(
      readFileSync(join(path, "closure-usage.json"), "utf8"),
    ) as {
      days: Record<string, { attemptedCredits: number }>;
      months: Record<string, { attemptedCredits: number }>;
    };
    expect(ledger.days["2026-07-31"]?.attemptedCredits).toBe(20);
    expect(ledger.months["2026-07"]?.attemptedCredits).toBe(20);
  });

  it.each([
    ["closure-usage.json", "not json\n", "usage ledger is invalid"],
    ["closure-raw.json", "[]\n", "raw cache is invalid"],
  ])("fails closed on invalid %s", async (file, contents, message) => {
    const path = reportsDir();
    writeFileSync(join(path, file), contents);
    const search = vi.fn(async () => "must not run");
    await expect(
      runClosureDetector(liveOptions(path), { env, search }),
    ).rejects.toThrow(message);
    expect(search).not.toHaveBeenCalled();
    expect(existsSync(join(path, "closure-detector.lock"))).toBe(false);
  });

  it("reuses cache while advancing limited runs to the next uncached target", async () => {
    const path = reportsDir();
    const options = liveOptions(path);
    const firstSearch = vi.fn(async (query: string) => {
      void query;
      return "No closure evidence found.";
    });
    await runClosureDetector(options, { env, search: firstSearch, sleep: noSleep });
    const secondSearch = vi.fn(async (query: string) => {
      void query;
      return "No closure evidence found.";
    });
    const second = await runClosureDetector(options, {
      env,
      search: secondSearch,
      sleep: noSleep,
    });
    const plan = await runClosureDetector({
      ...parseClosureDetectorArgs(["--limit", "1"]),
      reportsDir: path,
    });
    const refreshSearch = vi.fn(async (query: string) => {
      void query;
      return "Fresh result.";
    });
    const refresh = await runClosureDetector(
      { ...options, refreshCache: true },
      { env, search: refreshSearch, sleep: noSleep },
    );

    expect(second).toMatchObject({ attemptedRequests: 1, cacheHits: 1 });
    expect(plan).toMatchObject({ attemptedRequests: 0, cacheHits: 2 });
    expect(refresh).toMatchObject({ attemptedRequests: 1, cacheHits: 0 });
    expect(secondSearch).toHaveBeenCalledOnce();
    expect(secondSearch.mock.calls[0]?.[0]).not.toBe(
      firstSearch.mock.calls[0]?.[0],
    );
    expect(refreshSearch).toHaveBeenCalledOnce();
  });

  it("uses the request's UTC period and refuses an active lock", async () => {
    const path = reportsDir();
    writeFileSync(
      join(path, "closure-usage.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        timezone: "UTC",
        updatedAt: "2026-07-31T23:59:59.000Z",
        days: { "2026-07-31": { attemptedRequests: 20, attemptedCredits: 20 } },
        months: { "2026-07": { attemptedRequests: 100, attemptedCredits: 100 } },
      })}\n`,
    );
    const clock = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date("2026-07-31T23:59:59.000Z"))
      .mockReturnValue(new Date("2026-08-01T00:00:01.000Z"));
    const search = vi.fn(async () => "No closure evidence found.");
    expect(
      (await runClosureDetector(liveOptions(path), {
        env,
        now: clock,
        search,
        sleep: noSleep,
      })).attemptedRequests,
    ).toBe(1);
    const ledger = JSON.parse(
      readFileSync(join(path, "closure-usage.json"), "utf8"),
    ) as {
      days: Record<string, { attemptedCredits: number }>;
      months: Record<string, { attemptedCredits: number }>;
    };
    expect(ledger.days["2026-08-01"]?.attemptedCredits).toBe(1);
    expect(ledger.months["2026-08"]?.attemptedCredits).toBe(1);

    writeFileSync(
      join(path, "closure-detector.lock"),
      `${JSON.stringify({ ownerToken: "another-run" })}\n`,
    );
    const blockedSearch = vi.fn(async () => "must not run");
    await expect(
      runClosureDetector(
        { ...liveOptions(path), refreshCache: true },
        { env, search: blockedSearch },
      ),
    ).rejects.toThrow("Another closure-detector live run");
    expect(blockedSearch).not.toHaveBeenCalled();
  });
});
