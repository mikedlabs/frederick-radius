import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifySourceWatchHash,
  hashSourceWatchContent,
  normalizeSourceWatchContent,
  runSourceWatch,
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
    const config = JSON.parse(await readFile(configPath, "utf8")) as SourceWatchConfig;
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
});

describe("Source Watch candidate runs", () => {
  it("recovers a stale lock that records its PID and timestamp", async () => {
    const reportDirectory = await mkdtemp(join(tmpdir(), "radius-source-watch-"));
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
    const reportDirectory = await mkdtemp(join(tmpdir(), "radius-source-watch-"));
    const config = testConfig();
    let round = 1;
    const fetchPage = vi.fn(async (url: string) => {
      const index = Number(url.match(/source-(\d+)/)?.[1] ?? 0);
      if (round === 2 && index === 3) {
        return snapshot(url, "A materially changed official page");
      }
      if (round === 2 && index === 4) {
        throw new FirecrawlRestError(
          "HTTP_ERROR",
          "Firecrawl request failed with HTTP 404.",
          { status: 404 },
        );
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
    expect(second.report.candidates.map(({ status }) => status).sort()).toEqual([
      "changed",
      "error",
      "removed",
    ]);
    expect(second.report.kind).toBe("candidate-only");
    expect(JSON.stringify(second.report)).not.toContain(
      "A materially changed official page",
    );

    const files = await readdir(reportDirectory);
    expect(files.filter((file) => file.startsWith("source-watch-"))).toHaveLength(
      2,
    );
    expect(files).toContain("state.json");
    expect(files).not.toContain(".run.lock");

    const state = JSON.parse(
      await readFile(join(reportDirectory, "state.json"), "utf8"),
    ) as {
      budget: { months: Record<string, { attemptedCredits: number }> };
    };
    expect(state.budget.months["2026-07"].attemptedCredits).toBe(20);
  });

  it("reserves the hard monthly cap before making any further request", async () => {
    const reportDirectory = await mkdtemp(join(tmpdir(), "radius-source-watch-"));
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
    const reportDirectory = await mkdtemp(join(tmpdir(), "radius-source-watch-"));
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
    });
  });

  it("treats a successful Firecrawl envelope reporting 404 as removed", async () => {
    const reportDirectory = await mkdtemp(join(tmpdir(), "radius-source-watch-"));
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
      errorCode: "HTTP_ERROR",
      httpStatus: 404,
    });
  });
});
