import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifySourceWatchHash,
  hashSourceWatchContent,
  normalizeSourceWatchContent,
  parseSourceWatchCliArgs,
  runSourceWatch,
  sanitizeSourceWatchLinks,
  selectSourceWatchSources,
  sourceWatchReportHasSuccessfulRetrieval,
  SourceWatchError,
  validateSourceWatchConfig,
  type SourceWatchConfig,
} from "../scripts/source-watch";
import {
  FirecrawlRestError,
  type FirecrawlPageSnapshot,
} from "../scripts/lib/firecrawl-rest";

afterEach(() => {
  vi.restoreAllMocks();
});

function testConfig(maxCreditsPerMonth = 20): SourceWatchConfig {
  return {
    version: 1,
    mode: "candidate-only",
    limits: {
      maxSources: 10,
      maxCreditsPerRun: 10,
      maxCreditsPerMonth,
      timeoutMs: 1_000,
    },
    sources: Array.from({ length: 10 }, (_, index) => ({
      id: `official-source-${index + 1}`,
      name: `Official source ${index + 1}`,
      url: `https://source-${index + 1}.example.test/events`,
      category: index === 9 ? "food-trucks" : "events",
      provenance: index > 7 ? "government" : "first-party",
      purpose: "Focused test source.",
      rightsPosture: "Candidate-only observation.",
    })),
  };
}

function snapshot(url: string, markdown: string): FirecrawlPageSnapshot {
  return {
    requestedUrl: url,
    finalUrl: url,
    text: markdown,
    markdown,
    links: [`${url}/detail`],
    metadata: { title: "Official page", statusCode: 200 },
  };
}

describe("Source Watch content identity", () => {
  it("normalizes presentation-only whitespace before hashing", () => {
    const first = "  # Events\r\n\r\nAlive\u00a0at   Five  ";
    const second = "# Events\nAlive at Five";

    expect(normalizeSourceWatchContent(first)).toBe(second);
    expect(hashSourceWatchContent(first)).toBe(hashSourceWatchContent(second));
    expect(classifySourceWatchHash(undefined, "a")).toBe("new");
    expect(classifySourceWatchHash("a", "a")).toBe("same");
    expect(classifySourceWatchHash("a", "b")).toBe("changed");
  });

  it("keeps the tracked allowlist inside the enforced source and credit caps", async () => {
    const configPath = fileURLToPath(
      new URL("../config/source-watch.json", import.meta.url),
    );
    const config = JSON.parse(
      await readFile(configPath, "utf8"),
    ) as SourceWatchConfig;
    const validated = validateSourceWatchConfig(config);

    expect(validated.sources).toHaveLength(14);
    expect(validated.limits).toMatchObject({
      maxSources: 15,
      maxCreditsPerRun: 14,
      maxCreditsPerMonth: 450,
    });
    expect(new Set(validated.sources.map(({ url }) => url)).size).toBe(14);
  });

  it("rejects private targets and requires a reviewed exception for HTTP", () => {
    const privateConfig = testConfig();
    privateConfig.sources[0]!.url = "https://127.0.0.1/events";
    expect(() => validateSourceWatchConfig(privateConfig)).toThrowError(
      SourceWatchError,
    );

    const httpConfig = testConfig();
    httpConfig.sources[0]!.url = "http://source-1.example.test/events";
    expect(() => validateSourceWatchConfig(httpConfig)).toThrowError(
      SourceWatchError,
    );
    httpConfig.sources[0]!.httpException = {
      reviewedBy: "Radius data steward",
      reason: "The reviewed publisher has no HTTPS endpoint.",
    };
    expect(validateSourceWatchConfig(httpConfig)).toBe(httpConfig);
  });

  it("accepts only exact reviewed source ids for a focused pilot", () => {
    const config = testConfig();
    const selected = selectSourceWatchSources(config, [
      "official-source-3",
      "official-source-1",
      "official-source-3",
    ]);

    expect(selected.sources.map(({ id }) => id)).toEqual([
      "official-source-3",
      "official-source-1",
    ]);
    expect(() =>
      selectSourceWatchSources(config, ["not-reviewed"]),
    ).toThrowError(/unknown selected source id/i);
  });

  it("parses explicit plan and confirmed live CLI selections", () => {
    expect(parseSourceWatchCliArgs(["--source=official-source-1"])).toEqual({
      live: false,
      confirmed: false,
      sourceIds: ["official-source-1"],
    });
    expect(
      parseSourceWatchCliArgs([
        "--live",
        "--confirm",
        "--source",
        "official-source-2",
      ]),
    ).toEqual({
      live: true,
      confirmed: true,
      sourceIds: ["official-source-2"],
    });
    expect(() => parseSourceWatchCliArgs(["--unknown"])).toThrowError(
      /unknown source watch argument/i,
    );
  });

  it("retains only same-host links without query strings or fragments", () => {
    expect(
      sanitizeSourceWatchLinks(
        [
          "/events/123?token=secret#details",
          "https://source-1.example.test/events/123?utm_source=test",
          "https://tickets.example.test/private",
          "http://127.0.0.1/private",
        ],
        "https://source-1.example.test/events",
      ),
    ).toEqual(["https://source-1.example.test/events/123"]);
  });
});

describe("Source Watch candidate runs", () => {
  it("checks and reserves exactly one credit for a selected source", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const fetchPage = vi.fn(async (url: string) =>
      snapshot(url, `Official page for ${url}`),
    );

    const result = await runSourceWatch({
      config: testConfig(),
      sourceIds: ["official-source-4"],
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(fetchPage).toHaveBeenCalledWith(
      "https://source-4.example.test/events",
      expect.objectContaining({
        timeoutMs: 1_000,
        requireReportedFinalUrl: true,
        maxAgeMs: 0,
        storeInCache: false,
        proxy: "basic",
      }),
    );
    expect(result.report.provider).toEqual({ name: "firecrawl" });
    expect(result.report.sourcesChecked).toEqual([
      {
        id: "official-source-4",
        url: "https://source-4.example.test/events",
      },
    ]);
    expect(result.report.budget.attemptedCreditsThisRun).toBe(1);
    expect(sourceWatchReportHasSuccessfulRetrieval(result.report)).toBe(true);
  });

  it("recovers a stale lock that records its PID and timestamp", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    await writeFile(
      join(reportDirectory, ".run.lock"),
      `${JSON.stringify({
        pid: process.pid,
        createdAt: "2026-07-29T10:00:00.000Z",
        token: "stale-owner",
      })}\n`,
      "utf8",
    );
    const fetchPage = vi.fn(async (url: string) =>
      snapshot(url, `Official page for ${url}`),
    );

    const result = await runSourceWatch({
      config: testConfig(),
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    expect(result.report.summary.new).toBe(10);
    expect(await readdir(reportDirectory)).not.toContain(".run.lock");
  });

  it("reports new, same, changed, removed, and error without publishing content", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const config = testConfig();
    let round = 1;
    const fetchPage = vi.fn(async (url: string) => {
      const index = Number(url.match(/source-(\d+)/)?.[1] ?? 0);
      if (round === 2 && index === 3) {
        return snapshot(url, "A materially changed official page");
      }
      if (round === 2 && index === 4) {
        return {
          ...snapshot(url, "Not found page"),
          metadata: { title: "Not found", statusCode: 404 },
        };
      }
      if (round === 2 && index === 5) {
        throw new FirecrawlRestError(
          "TIMEOUT",
          "Firecrawl request timed out after 1000ms.",
        );
      }
      return snapshot(url, `Stable official page ${index}`);
    });

    const first = await runSourceWatch({
      config,
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });
    expect(first.report.summary).toEqual({
      new: 10,
      same: 0,
      changed: 0,
      removed: 0,
      error: 0,
    });
    expect(first.report.candidates).toHaveLength(10);

    round = 2;
    const second = await runSourceWatch({
      config,
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T13:00:00.000Z"),
    });
    expect(second.report.summary).toEqual({
      new: 0,
      same: 7,
      changed: 1,
      removed: 1,
      error: 1,
    });
    expect(second.report.candidates.map(({ status }) => status).sort()).toEqual(
      ["changed", "error", "removed"],
    );
    expect(second.report.kind).toBe("candidate-only");
    expect(JSON.stringify(second.report)).not.toContain(
      "A materially changed official page",
    );

    const files = await readdir(reportDirectory);
    expect(
      files.filter((file) => file.startsWith("source-watch-")),
    ).toHaveLength(2);
    expect(files).toContain("state.json");
    expect(files).not.toContain(".run.lock");

    const state = JSON.parse(
      await readFile(join(reportDirectory, "state.json"), "utf8"),
    ) as {
      budget: { months: Record<string, { attemptedCredits: number }> };
    };
    expect(state.budget.months["2026-07"].attemptedCredits).toBe(20);
  });

  it("resets a source id moved to a different exact URL as an actionable fresh baseline", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const original = testConfig();
    const replacement = structuredClone(original);
    replacement.sources[0]!.url =
      "https://source-1.example.test/new-events-page";
    const fetchPage = vi.fn(async (url: string) =>
      snapshot(url, "Identical rendered content"),
    );

    const first = await runSourceWatch({
      config: original,
      sourceIds: ["official-source-1"],
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });
    const reset = await runSourceWatch({
      config: replacement,
      sourceIds: ["official-source-1"],
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T13:00:00.000Z"),
    });

    expect(first.issueSignal.items[0]).toMatchObject({ status: "baseline" });
    expect(reset.report.summary).toMatchObject({ new: 1, changed: 0 });
    expect(reset.issueSignal.items[0]).toEqual({
      sourceId: "official-source-1",
      sourceUrl: "https://source-1.example.test/new-events-page",
      finalUrl: "https://source-1.example.test/new-events-page",
      checkedAt: "2026-07-29T13:00:00.000Z",
      expiresAt: "2026-08-12T13:00:00.000Z",
      status: "url-baseline",
      currentHash: hashSourceWatchContent("Identical rendered content"),
      textLength: "Identical rendered content".length,
      linkCount: 1,
    });
    expect(reset.issueSignal.items[0]).not.toHaveProperty("previousHash");
    expect(JSON.stringify(reset.issueSignal)).not.toContain(
      replacement.sources[0]!.name,
    );
    expect(JSON.parse(await readFile(reset.issueSignalPath, "utf8"))).toEqual(
      reset.issueSignal,
    );
  });

  it("resets the baseline when a stable source starts redirecting to a different same-host page", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const config = testConfig();
    const sourceUrl = config.sources[0]!.url;
    const redirectedUrl = "https://source-1.example.test/calendar";

    await runSourceWatch({
      config,
      sourceIds: ["official-source-1"],
      reportDirectory,
      fetchPage: async () => snapshot(sourceUrl, "Identical rendered content"),
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });
    const redirected = await runSourceWatch({
      config,
      sourceIds: ["official-source-1"],
      reportDirectory,
      fetchPage: async () => ({
        ...snapshot(sourceUrl, "Identical rendered content"),
        finalUrl: redirectedUrl,
      }),
      now: () => new Date("2026-07-29T13:00:00.000Z"),
    });
    const stable = await runSourceWatch({
      config,
      sourceIds: ["official-source-1"],
      reportDirectory,
      fetchPage: async () => ({
        ...snapshot(sourceUrl, "Identical rendered content"),
        finalUrl: redirectedUrl,
      }),
      now: () => new Date("2026-07-29T14:00:00.000Z"),
    });

    expect(redirected.report.summary).toMatchObject({ new: 1, changed: 0 });
    expect(redirected.report.candidates[0]).toMatchObject({
      status: "new",
      finalUrl: redirectedUrl,
    });
    expect(redirected.report.candidates[0]).not.toHaveProperty("previousHash");
    expect(redirected.issueSignal.items[0]).toMatchObject({
      status: "url-baseline",
      finalUrl: redirectedUrl,
    });
    expect(redirected.issueSignal.items[0]).not.toHaveProperty("previousHash");
    expect(stable.report.summary).toMatchObject({ same: 1, changed: 0 });
    expect(stable.issueSignal.items[0]).toMatchObject({
      status: "same",
      finalUrl: redirectedUrl,
    });
  });

  it("keeps a changed-URL baseline pending across a failed first retrieval", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const original = testConfig();
    const replacement = structuredClone(original);
    replacement.sources[0]!.url =
      "https://source-1.example.test/replacement-events";

    await runSourceWatch({
      config: original,
      sourceIds: ["official-source-1"],
      reportDirectory,
      fetchPage: async (url) => snapshot(url, "Old exact page"),
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });
    const failed = await runSourceWatch({
      config: replacement,
      sourceIds: ["official-source-1"],
      reportDirectory,
      fetchPage: async () => {
        throw new FirecrawlRestError("TIMEOUT", "Provider timed out");
      },
      now: () => new Date("2026-07-29T13:00:00.000Z"),
    });
    const recovered = await runSourceWatch({
      config: replacement,
      sourceIds: ["official-source-1"],
      reportDirectory,
      fetchPage: async (url) => snapshot(url, "New exact page"),
      now: () => new Date("2026-07-29T14:00:00.000Z"),
    });

    expect(failed.issueSignal.items[0]).toMatchObject({
      status: "error",
      errorCode: "TIMEOUT",
    });
    expect(failed.issueSignal.items[0]).not.toHaveProperty("previousHash");
    expect(recovered.report.summary).toMatchObject({ new: 1, changed: 0 });
    expect(recovered.issueSignal.items[0]).toMatchObject({
      status: "url-baseline",
    });
    expect(recovered.issueSignal.items[0]).not.toHaveProperty("previousHash");
  });

  it("reserves the hard monthly cap before making any further request", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const config = testConfig(10);
    const fetchPage = vi.fn(async (url: string) =>
      snapshot(url, `Official page for ${url}`),
    );

    await runSourceWatch({
      config,
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });
    expect(fetchPage).toHaveBeenCalledTimes(10);

    await expect(
      runSourceWatch({
        config,
        reportDirectory,
        fetchPage,
        now: () => new Date("2026-07-29T13:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "MONTHLY_CAP_EXCEEDED",
    } satisfies Partial<SourceWatchError>);
    expect(fetchPage).toHaveBeenCalledTimes(10);
  });

  it("rejects a cross-host redirect as an error candidate", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const config = testConfig(10);
    const fetchPage = vi.fn(async (url: string) => ({
      ...snapshot(url, "Official page"),
      finalUrl: "https://unrelated.example.test/copied-page",
    }));

    const result = await runSourceWatch({
      config,
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    expect(result.report.summary.error).toBe(10);
    expect(result.report.candidates).toHaveLength(10);
    expect(result.report.candidates[0]).toMatchObject({
      status: "error",
      errorCode: "SOURCE_REJECTED",
      finalUrl: "https://unrelated.example.test/copied-page",
    });
    expect(sourceWatchReportHasSuccessfulRetrieval(result.report)).toBe(false);
  });

  it("classifies a cross-host 404 as rejected evidence, not a removal", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const fetchPage = vi.fn(async (url: string) => ({
      ...snapshot(url, "Unrelated not-found page"),
      finalUrl: "https://unrelated.example.test/not-found",
      metadata: { title: "Not found", statusCode: 404 },
    }));

    const result = await runSourceWatch({
      config: testConfig(10),
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    expect(result.report.summary).toMatchObject({ removed: 0, error: 10 });
    expect(result.report.candidates[0]).toMatchObject({
      status: "error",
      errorCode: "SOURCE_REJECTED",
      finalUrl: "https://unrelated.example.test/not-found",
    });
  });

  it.each([
    ["401", 401, "TARGET_HTTP_ERROR", 401],
    ["403", 403, "TARGET_HTTP_ERROR", 403],
    ["429", 429, "TARGET_HTTP_ERROR", 429],
    ["500", 500, "TARGET_HTTP_ERROR", 500],
    ["missing", undefined, "INVALID_RESPONSE", undefined],
    ["non-integer", "200", "INVALID_RESPONSE", undefined],
  ] as const)(
    "rejects a same-host %s target status instead of accepting content",
    async (_label, statusCode, expectedCode, expectedHttpStatus) => {
      const reportDirectory = await mkdtemp(
        join(tmpdir(), "radius-source-watch-"),
      );
      const fetchPage = vi.fn(async (url: string) => ({
        ...snapshot(url, "Provider error body"),
        metadata:
          statusCode === undefined
            ? { title: "No target status" }
            : { title: "Rejected target status", statusCode },
      }));

      const result = await runSourceWatch({
        config: testConfig(10),
        reportDirectory,
        fetchPage,
        now: () => new Date("2026-07-29T12:00:00.000Z"),
      });

      expect(result.report.summary).toMatchObject({ removed: 0, error: 10 });
      expect(result.report.candidates[0]).toMatchObject({
        status: "error",
        errorCode: expectedCode,
        httpStatus: expectedHttpStatus,
      });
      expect(sourceWatchReportHasSuccessfulRetrieval(result.report)).toBe(
        false,
      );
    },
  );

  it("does not mistake a provider-endpoint 404 for a removed source", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const fetchPage = vi.fn(async () => {
      throw new FirecrawlRestError(
        "HTTP_ERROR",
        "Firecrawl request failed with HTTP 404.",
        { status: 404 },
      );
    });

    const result = await runSourceWatch({
      config: testConfig(10),
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    expect(result.report.summary).toMatchObject({ removed: 0, error: 10 });
    expect(result.report.candidates[0]).toMatchObject({
      status: "error",
      errorCode: "HTTP_ERROR",
      httpStatus: 404,
    });
  });

  it("treats a successful Firecrawl envelope reporting 404 as removed", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-source-watch-"),
    );
    const config = testConfig(10);
    const fetchPage = vi.fn(async (url: string) => ({
      ...snapshot(url, "Not found page"),
      metadata: { title: "Not found", statusCode: 404 },
    }));

    const result = await runSourceWatch({
      config,
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    expect(result.report.summary).toEqual({
      new: 0,
      same: 0,
      changed: 0,
      removed: 10,
      error: 0,
    });
    expect(result.report.candidates[0]).toMatchObject({
      status: "removed",
      errorCode: "TARGET_HTTP_ERROR",
      httpStatus: 404,
    });
  });
});
