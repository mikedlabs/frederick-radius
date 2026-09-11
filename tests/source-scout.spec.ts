import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadSourceScoutConfig,
  parseSourceScoutCliArgs,
  runSourceScout,
  sourceScoutReportHasSuccessfulRetrieval,
  type SourceScoutConfig,
} from "../scripts/source-scout";

const require = createRequire(import.meta.url);
const { validateSignal: validateScoutIssueSignal } =
  require("../scripts/lib/source-scout-issue.cjs") as {
    validateSignal: (signal: unknown) => boolean;
  };

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "radius-source-scout-"));
  temporaryDirectories.push(path);
  return path;
}

async function writeConfig(
  directory: string,
  config: SourceScoutConfig,
): Promise<string> {
  const path = join(directory, "source-scout.json");
  await writeFile(path, JSON.stringify(config), "utf8");
  return path;
}

function testConfig(
  queries: SourceScoutConfig["profiles"][number]["queries"],
  limits: Partial<SourceScoutConfig["limits"]> = {},
): SourceScoutConfig {
  return {
    version: 1,
    limits: {
      maxRequestsPerRun: 2,
      maxCreditsPerRun: 2,
      maxAttemptedCreditsPerDay: 4,
      maxAttemptedCreditsPerMonth: 8,
      lockStaleMinutes: 30,
      requestTimeoutMs: 1000,
      maxResultsPerQuery: 3,
      defaultCacheTtlHours: 24,
      ...limits,
    },
    blockedDomains: ["facebook.com", "yelp.com"],
    profiles: [
      {
        id: "test-profile",
        label: "Test profile",
        purpose: "Verify the review-only source scout.",
        enabled: true,
        searchDepth: "basic",
        maxQueriesPerRun: queries.length,
        cacheTtlHours: 24,
        queries,
      },
    ],
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Radius Source Scout", () => {
  it("ships the required, capped Frederick query profiles", async () => {
    const config = await loadSourceScoutConfig(
      join(process.cwd(), "config/source-scout.json"),
    );

    expect(config.limits).toMatchObject({
      maxRequestsPerRun: 12,
      maxCreditsPerRun: 12,
      maxAttemptedCreditsPerDay: 24,
      maxAttemptedCreditsPerMonth: 300,
      maxResultsPerQuery: 5,
    });
    expect(config.profiles.map((profile) => profile.id)).toEqual([
      "provider-smoke",
      "official-civic-mdot",
      "official-new-events",
      "menus-reservations-accessibility",
      "food-truck-schedules",
      "unresolved-source-recovery",
    ]);
    expect(
      config.profiles.find((profile) => profile.id === "provider-smoke"),
    ).toMatchObject({
      searchDepth: "basic",
      maxQueriesPerRun: 1,
      queries: [
        {
          allowedDomains: ["cityoffrederickmd.gov"],
        },
      ],
    });
    const openQueries = config.profiles
      .flatMap((profile) => profile.queries)
      .filter((query) => query.allowedDomains.length === 0);
    expect(openQueries).toHaveLength(2);
    expect(openQueries.every((query) => query.openDiscovery === true)).toBe(
      true,
    );
  });

  it("defaults to a zero-cost plan and writes no files", async () => {
    const directory = await temporaryDirectory();
    const configPath = await writeConfig(
      directory,
      testConfig([
        {
          id: "official",
          text: "official query {month} {year}",
          allowedDomains: ["example.gov"],
          reviewFor: ["official notice"],
        },
      ]),
    );
    const reportsDir = join(directory, "reports");
    const search = vi.fn();

    const result = await runSourceScout(
      { configPath, reportsDir },
      {
        search,
        now: () => new Date("2026-07-29T16:00:00.000Z"),
      },
    );

    expect(result.wroteFiles).toBe(false);
    expect(result.report.mode).toBe("plan");
    expect(result.report.provider).toEqual({ name: "tavily" });
    expect(result.report.queries[0]?.queryText).toContain("July 2026");
    expect(result.report.budget.requestsMade).toBe(0);
    expect(search).not.toHaveBeenCalled();
    await expect(readFile(result.reportPath, "utf8")).rejects.toThrow();
    await expect(readFile(result.cachePath, "utf8")).rejects.toThrow();
    await expect(readFile(result.usagePath, "utf8")).rejects.toThrow();
    await expect(readFile(result.lockPath, "utf8")).rejects.toThrow();
    await expect(readFile(result.issueSignalPath, "utf8")).rejects.toThrow();
    expect(result.issueSignal).toBeNull();
  });

  it("enforces request and credit caps before calls and writes provenance only to review artifacts", async () => {
    const directory = await temporaryDirectory();
    const configPath = await writeConfig(
      directory,
      testConfig([
        {
          id: "one",
          text: "first source",
          allowedDomains: ["example.gov"],
          reviewFor: ["notice"],
        },
        {
          id: "two",
          text: "second source",
          allowedDomains: ["example.gov"],
          reviewFor: ["event"],
        },
        {
          id: "three",
          text: "third source",
          allowedDomains: ["example.gov"],
          reviewFor: ["menu"],
        },
      ]),
    );
    const reportsDir = join(directory, "reports");
    const search = vi.fn(async (query: string) => ({
      query,
      candidates: [
        {
          url: `https://example.gov/${query.replaceAll(" ", "-")}`,
          title: `Title for ${query}`,
          content: `Content for ${query}`,
          score: 0.9,
        },
        {
          url: "https://facebook.com/untrusted",
          title: "Blocked",
          content: "Blocked social content",
          score: 0.99,
        },
        {
          url: "http://service.internal/admin",
          title: "Private control panel",
          content: "Private raw content",
          score: 1,
        },
      ],
      requestId: `request-${query}`,
      responseTime: "0.5",
      credits: 1,
    }));

    const result = await runSourceScout(
      { configPath, reportsDir, live: true, confirmed: true },
      {
        search,
        now: () => new Date("2026-07-29T16:00:00.000Z"),
      },
    );

    expect(search).toHaveBeenCalledTimes(2);
    expect(result.report.budget).toMatchObject({
      maxRequests: 2,
      maxCredits: 2,
      requestsMade: 2,
      creditsCommitted: 2,
    });
    expect(result.report.queries.map((query) => query.status)).toEqual([
      "fetched",
      "fetched",
      "skipped-budget",
    ]);
    const candidate = result.report.queries[0]?.candidates[0];
    expect(candidate).toMatchObject({
      reviewState: "candidate",
      originalSourceUrl: "https://example.gov/first-source",
      sourceDomain: "example.gov",
      profileId: "test-profile",
      queryId: "one",
    });
    expect(
      result.report.queries.flatMap((query) => query.candidates),
    ).toHaveLength(2);
    expect(result.report).toMatchObject({
      reviewOnly: true,
      noPublicWrites: true,
      outputPolicy:
        "Candidate URLs for human review only. No result changes src/data or a public route.",
    });

    const persistedReport = JSON.parse(
      await readFile(result.reportPath, "utf8"),
    );
    const persistedCache = JSON.parse(await readFile(result.cachePath, "utf8"));
    const issueSignalText = await readFile(result.issueSignalPath, "utf8");
    const issueSignal = JSON.parse(issueSignalText);
    expect(persistedReport.reviewOnly).toBe(true);
    expect(persistedReport.provider).toEqual({ name: "tavily" });
    expect(persistedCache.reviewOnly).toBe(true);
    expect(JSON.stringify(persistedReport)).not.toContain(
      "Content for first source",
    );
    expect(JSON.stringify(persistedCache)).not.toContain(
      "Content for first source",
    );
    expect(persistedReport.queries[0].candidates[0]).not.toHaveProperty(
      "content",
    );
    expect(Object.values(persistedCache.entries)[0]).not.toHaveProperty(
      "result.candidates.0.content",
    );
    expect(result.issueSignal).toEqual(issueSignal);
    expect(validateScoutIssueSignal(issueSignal)).toBe(true);
    expect(issueSignal).toMatchObject({
      schemaVersion: 1,
      generatedAt: "2026-07-29T16:00:00.000Z",
    });
    expect(issueSignal.items[0]).toMatchObject({
      profileId: "test-profile",
      queryId: "one",
      observedAt: "2026-07-29T16:00:00.000Z",
      expiresAt: "2026-08-28T16:00:00.000Z",
      status: "fetched",
      candidateCount: 1,
      candidates: [
        {
          url: "https://example.gov/first-source",
          domain: "example.gov",
          score: 0.9,
        },
      ],
      estimatedCredits: 1,
      requestId: null,
      apiReportedCredits: 1,
      errorCode: null,
      errorStatus: null,
    });
    expect(issueSignal.items[0].candidateFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(issueSignalText).not.toContain("Title for first source");
    expect(issueSignalText).not.toContain("Content for first source");
    expect(issueSignalText).not.toContain("first source");
    expect(issueSignalText).not.toContain("Private control panel");
    expect(issueSignalText).not.toContain("reviewFor");
    expect(issueSignalText).not.toContain("queryText");
    const usage = JSON.parse(await readFile(result.usagePath, "utf8"));
    expect(usage).toMatchObject({
      schemaVersion: 1,
      timezone: "UTC",
      days: {
        "2026-07-29": {
          attemptedRequests: 2,
          attemptedCredits: 2,
        },
      },
      months: {
        "2026-07": {
          attemptedRequests: 2,
          attemptedCredits: 2,
        },
      },
    });
    await expect(readFile(result.lockPath, "utf8")).rejects.toThrow();
  });

  it("uses an unexpired cache without spending a request or credit", async () => {
    const directory = await temporaryDirectory();
    const configPath = await writeConfig(
      directory,
      testConfig([
        {
          id: "cached",
          text: "cache this source",
          allowedDomains: ["example.gov"],
          reviewFor: ["notice"],
        },
      ]),
    );
    const reportsDir = join(directory, "reports");
    const firstSearch = vi.fn(async (query: string) => ({
      query,
      candidates: [
        {
          url: "https://example.gov/notices/1",
          title: "Notice",
          content: "Notice content",
          score: 0.95,
        },
      ],
      requestId: "request-1",
      responseTime: "0.4",
      credits: 1,
    }));
    await runSourceScout(
      { configPath, reportsDir, live: true, confirmed: true },
      {
        search: firstSearch,
        now: () => new Date("2026-07-29T16:00:00.000Z"),
      },
    );

    const secondSearch = vi.fn();
    const second = await runSourceScout(
      { configPath, reportsDir, live: true, confirmed: true },
      {
        search: secondSearch,
        now: () => new Date("2026-07-29T17:00:00.000Z"),
      },
    );

    expect(secondSearch).not.toHaveBeenCalled();
    expect(second.report.queries[0]?.status).toBe("cache");
    expect(second.report.budget).toMatchObject({
      requestsMade: 0,
      creditsCommitted: 0,
      cacheHits: 1,
    });
    expect(second.report.queries[0]?.candidates[0]?.observedAt).toBe(
      "2026-07-29T16:00:00.000Z",
    );
    expect(second.issueSignal?.items[0]).toMatchObject({
      status: "cache",
      observedAt: "2026-07-29T16:00:00.000Z",
      candidateCount: 1,
    });
    expect(validateScoutIssueSignal(second.issueSignal)).toBe(true);
  });

  it("rejects an unbounded query unless open discovery is explicit", async () => {
    const directory = await temporaryDirectory();
    const invalid = testConfig([
      {
        id: "unsafe",
        text: "unbounded query",
        allowedDomains: [],
        reviewFor: ["source"],
      },
    ]);
    const configPath = await writeConfig(directory, invalid);
    const search = vi.fn();

    await expect(
      runSourceScout(
        {
          configPath,
          reportsDir: join(directory, "reports"),
          live: true,
          confirmed: true,
        },
        { search },
      ),
    ).rejects.toThrow(
      "must have allowedDomains or explicitly set openDiscovery=true",
    );
    expect(search).not.toHaveBeenCalled();
  });

  it("rejects profile and query IDs that cannot form stable issue identities", async () => {
    const directory = await temporaryDirectory();
    const invalid = testConfig([
      {
        id: "query_with_prose",
        text: "bounded query",
        allowedDomains: ["example.gov"],
        reviewFor: ["source"],
      },
    ]);
    const configPath = await writeConfig(directory, invalid);
    const search = vi.fn();

    await expect(
      runSourceScout(
        {
          configPath,
          reportsDir: join(directory, "reports"),
          live: true,
          confirmed: true,
        },
        { search },
      ),
    ).rejects.toThrow("lowercase kebab-case ID");
    expect(search).not.toHaveBeenCalled();
  });

  it("stops after a terminal Tavily error instead of burning the remaining budget", async () => {
    const directory = await temporaryDirectory();
    const configPath = await writeConfig(
      directory,
      testConfig([
        {
          id: "one",
          text: "first query",
          allowedDomains: ["example.gov"],
          reviewFor: ["notice"],
        },
        {
          id: "two",
          text: "second query",
          allowedDomains: ["example.gov"],
          reviewFor: ["notice"],
        },
      ]),
    );
    const search = vi.fn(async () => {
      throw new (
        await import("../scripts/lib/tavily-search")
      ).TavilySearchError("Plan usage limit reached.", {
        code: "plan_limit_exceeded",
        status: 432,
      });
    });

    const result = await runSourceScout(
      {
        configPath,
        reportsDir: join(directory, "reports"),
        live: true,
        confirmed: true,
      },
      { search },
    );

    expect(search).toHaveBeenCalledOnce();
    expect(result.report.queries.map((query) => query.status)).toEqual([
      "error",
      "skipped-terminal-error",
    ]);
    expect(result.report.budget).toMatchObject({
      requestsMade: 1,
      creditsCommitted: 1,
    });
    expect(sourceScoutReportHasSuccessfulRetrieval(result.report)).toBe(false);
    const issueSignalText = await readFile(result.issueSignalPath, "utf8");
    expect(validateScoutIssueSignal(result.issueSignal)).toBe(true);
    expect(result.issueSignal?.items).toMatchObject([
      {
        profileId: "test-profile",
        queryId: "one",
        status: "error",
        candidateCount: 0,
        errorCode: "plan_limit_exceeded",
        errorStatus: 432,
      },
      {
        profileId: "test-profile",
        queryId: "two",
        status: "skipped-terminal-error",
        candidateCount: 0,
        errorCode: null,
        errorStatus: null,
      },
    ]);
    expect(issueSignalText).not.toContain("Plan usage limit reached");
    expect(issueSignalText).not.toContain("first query");
    expect(issueSignalText).not.toContain("second query");
  });

  it("rejects a missing profile value before doing any work", () => {
    expect(() =>
      parseSourceScoutCliArgs(["--profile", "--live", "--confirm"]),
    ).toThrow("--profile requires a profile id");
    expect(() => parseSourceScoutCliArgs(["--profile"])).toThrow(
      "--profile requires a profile id",
    );
    expect(parseSourceScoutCliArgs(["--profile=test-profile"])).toMatchObject({
      profileId: "test-profile",
      live: false,
      confirmed: false,
    });
  });

  it("persists failed attempts and blocks a later run at the daily ceiling", async () => {
    const directory = await temporaryDirectory();
    const configPath = await writeConfig(
      directory,
      testConfig(
        [
          {
            id: "one",
            text: "daily capped query",
            allowedDomains: ["example.gov"],
            reviewFor: ["notice"],
          },
        ],
        {
          maxAttemptedCreditsPerDay: 1,
          maxAttemptedCreditsPerMonth: 2,
        },
      ),
    );
    const reportsDir = join(directory, "reports");
    const failedSearch = vi.fn(async () => {
      throw new Error("provider network failure");
    });

    const first = await runSourceScout(
      { configPath, reportsDir, live: true, confirmed: true },
      {
        search: failedSearch,
        now: () => new Date("2026-07-29T16:00:00.000Z"),
      },
    );
    expect(failedSearch).toHaveBeenCalledOnce();
    expect(first.report.queries[0]?.status).toBe("error");

    const laterSearch = vi.fn();
    const second = await runSourceScout(
      { configPath, reportsDir, live: true, confirmed: true },
      {
        search: laterSearch,
        now: () => new Date("2026-07-29T18:00:00.000Z"),
      },
    );

    expect(laterSearch).not.toHaveBeenCalled();
    expect(second.report.queries[0]?.status).toBe("skipped-budget");
    expect(second.report.budget).toMatchObject({
      dailyAttemptedCreditsBefore: 1,
      dailyAttemptedCreditsAfter: 1,
      monthlyAttemptedCreditsBefore: 1,
      monthlyAttemptedCreditsAfter: 1,
    });
  });

  it("blocks overlapping live runs and recovers an expired lock", async () => {
    const directory = await temporaryDirectory();
    const configPath = await writeConfig(
      directory,
      testConfig([
        {
          id: "one",
          text: "lock query",
          allowedDomains: ["example.gov"],
          reviewFor: ["notice"],
        },
      ]),
    );
    const reportsDir = join(directory, "reports");
    const lockPath = join(reportsDir, "source-scout.lock");
    await mkdir(reportsDir, { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify({
        schemaVersion: 1,
        pid: 999,
        createdAt: "2026-07-29T15:00:00.000Z",
        expiresAt: "2026-07-29T17:00:00.000Z",
      }),
      "utf8",
    );
    const search = vi.fn();

    await expect(
      runSourceScout(
        { configPath, reportsDir, live: true, confirmed: true },
        {
          search,
          now: () => new Date("2026-07-29T16:00:00.000Z"),
        },
      ),
    ).rejects.toThrow("Another Source Scout live run holds");
    expect(search).not.toHaveBeenCalled();

    const successfulSearch = vi.fn(async (query: string) => ({
      query,
      candidates: [],
      requestId: "request-after-stale-lock",
      responseTime: "0.2",
      credits: 1,
    }));
    const recovered = await runSourceScout(
      { configPath, reportsDir, live: true, confirmed: true },
      {
        search: successfulSearch,
        now: () => new Date("2026-07-29T18:00:00.000Z"),
      },
    );

    expect(successfulSearch).toHaveBeenCalledOnce();
    expect(recovered.report.queries[0]?.status).toBe("fetched");
    expect(sourceScoutReportHasSuccessfulRetrieval(recovered.report)).toBe(
      true,
    );
    await expect(readFile(lockPath, "utf8")).rejects.toThrow();
  });
});
