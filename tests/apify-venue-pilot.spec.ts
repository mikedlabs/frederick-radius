import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ApifyVenuePilotError,
  parseApifyVenuePilotCliArgs,
  runApifyVenuePilot,
  validateApifyVenuePilotConfig,
  type ApifyVenuePilotConfig,
} from "../scripts/apify-venue-pilot";
import {
  ApifyRestError,
  type ApifyPageSnapshot,
} from "../scripts/lib/apify-rest";

async function trackedConfig(): Promise<ApifyVenuePilotConfig> {
  return JSON.parse(
    await readFile(resolve("config/apify-venue-pilot.json"), "utf8"),
  ) as ApifyVenuePilotConfig;
}

function snapshot(
  requestedUrl: string,
  finalUrl = requestedUrl,
): ApifyPageSnapshot {
  return {
    requestedUrl,
    finalUrl,
    text:
      "# Events\n\nJuly 31 at 7 p.m. Private copied provider content must not enter the report.",
    markdown:
      "# Events\n\nJuly 31 at 7 p.m. Private copied provider content must not enter the report.",
    links: [
      `${requestedUrl.replace(/\/$/, "")}/events/first-friday?tracking=secret`,
      "https://unrelated.example/private",
    ],
    metadata: {
      title: "Official events",
      crawl: { loadedUrl: finalUrl, httpStatusCode: 200 },
      rawHtml: "must not survive",
    },
    runId: "runABC123",
    datasetId: "datasetABC123",
    usageTotalUsd: 0.006,
  };
}

describe("Apify venue pilot policy", () => {
  it("tracks exactly three first-party venue pages under immutable caps", async () => {
    const config = validateApifyVenuePilotConfig(await trackedConfig());
    expect(config.mode).toBe("candidate-only");
    expect(config.limits).toEqual({
      maxSourcesPerRun: 1,
      maxRunsPerMonth: 4,
      maxChargeUsdPerRun: 0.25,
      maxReservedChargeUsdPerMonth: 1,
      timeoutMs: 240_000,
    });
    expect(config.sources.map(({ id }) => id)).toEqual([
      "weinberg-performances",
      "sky-stage-calendar",
      "jojos-events",
    ]);
    expect(config.sources.every(({ url }) => url.startsWith("https://"))).toBe(
      true,
    );
    expect(
      config.sources.some(({ url }) =>
        /facebook|instagram|reddit|twitter|x\.com/i.test(url),
      ),
    ).toBe(false);
  });

  it("keeps pilot sources aligned with the canonical venue registry", async () => {
    const pilot = validateApifyVenuePilotConfig(await trackedConfig());
    const venueRegistry = JSON.parse(
      await readFile(resolve("config/venue-sources.json"), "utf8"),
    ) as { venues: Array<{ slug: string; urls: string[] }> };
    const venues = new Map(
      venueRegistry.venues.map((venue) => [venue.slug, venue] as const),
    );
    for (const source of pilot.sources) {
      expect(venues.get(source.venueSlug)?.urls).toContain(source.url);
    }
  });

  it("rejects arbitrary URLs and attempts to raise tracked cost limits", async () => {
    const config = await trackedConfig();
    const unsafe = structuredClone(config);
    unsafe.sources[0]!.url = "https://127.0.0.1/private";
    expect(() => validateApifyVenuePilotConfig(unsafe)).toThrowError(
      ApifyVenuePilotError,
    );

    const expensive = structuredClone(config);
    expensive.limits.maxChargeUsdPerRun = 0.26;
    expect(() => validateApifyVenuePilotConfig(expensive)).toThrowError(
      /cannot exceed \$0\.25/i,
    );
  });

  it("parses only explicit plan/live flags and reviewed source ids", () => {
    expect(
      parseApifyVenuePilotCliArgs(["--source=sky-stage-calendar"]),
    ).toEqual({
      live: false,
      confirmed: false,
      sourceIds: ["sky-stage-calendar"],
    });
    expect(
      parseApifyVenuePilotCliArgs([
        "--live",
        "--confirm",
        "--source",
        "jojos-events",
      ]),
    ).toEqual({
      live: true,
      confirmed: true,
      sourceIds: ["jojos-events"],
    });
    expect(() => parseApifyVenuePilotCliArgs(["--url=https://evil.test"])).toThrow(
      /unknown apify venue pilot argument/i,
    );
  });
});

describe("Apify venue pilot runs", () => {
  it("writes compact review evidence without copied page content", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-venue-"),
    );
    const fetchPage = vi.fn(async (url: string) => snapshot(url));
    const result = await runApifyVenuePilot({
      config: await trackedConfig(),
      sourceId: "weinberg-performances",
      reportDirectory,
      fetchPage,
      now: () => new Date("2026-07-31T18:30:00.000Z"),
    });

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(fetchPage).toHaveBeenCalledWith(
      "https://weinbergcenter.org/performances/",
      expect.objectContaining({
        timeoutMs: 240_000,
        maxTotalChargeUsd: 0.25,
      }),
    );
    expect(result.report).toMatchObject({
      kind: "candidate-only",
      status: "succeeded",
      provider: {
        name: "apify",
        actor: "apify/website-content-crawler",
        runId: "runABC123",
        datasetId: "datasetABC123",
        usageTotalUsd: 0.006,
      },
      budget: {
        attemptedRunsThisMonth: 1,
        reservedMaxChargeUsdThisMonth: 0.25,
      },
      observation: {
        textLength: expect.any(Number),
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        signals: {
          dateMentions: 1,
          timeMentions: 1,
          eventLikeLinks: 1,
        },
      },
    });
    const serialized = await readFile(result.reportPath, "utf8");
    expect(serialized).not.toContain("Private copied provider content");
    expect(serialized).not.toContain("rawHtml");
    expect(serialized).not.toContain("tracking=secret");
    expect(serialized).not.toContain("unrelated.example");
    expect(await readdir(reportDirectory)).not.toContain(".run.lock");
  });

  it("reserves failures and stops before a fifth monthly provider request", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-venue-"),
    );
    const fetchPage = vi.fn(async () => {
      throw new ApifyRestError("HTTP_ERROR", "Provider HTTP 429.", {
        status: 429,
      });
    });
    for (let run = 0; run < 4; run += 1) {
      const result = await runApifyVenuePilot({
        config: await trackedConfig(),
        sourceId: "sky-stage-calendar",
        reportDirectory,
        fetchPage,
        now: () => new Date(`2026-07-${20 + run}T18:30:00.000Z`),
      });
      expect(result.report.status).toBe("error");
    }
    expect(fetchPage).toHaveBeenCalledTimes(4);

    await expect(
      runApifyVenuePilot({
        config: await trackedConfig(),
        sourceId: "sky-stage-calendar",
        reportDirectory,
        fetchPage,
        now: () => new Date("2026-07-31T19:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "MONTHLY_CAP_EXCEEDED" });
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it("rejects an unexpected cross-host result as private error evidence", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-venue-"),
    );
    const result = await runApifyVenuePilot({
      config: await trackedConfig(),
      sourceId: "jojos-events",
      reportDirectory,
      fetchPage: async (url) =>
        snapshot(url, "https://unrelated.example/copied-events"),
      now: () => new Date("2026-07-31T20:00:00.000Z"),
    });

    expect(result.report).toMatchObject({
      status: "error",
      error: { code: "INVALID_RESPONSE" },
    });
    expect(result.report.observation).toBeUndefined();
  });
});
