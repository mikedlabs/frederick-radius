import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ApifySourceChangeRadarError,
  parseApifySourceChangeRadarCliArgs,
  runApifySourceChangeRadar,
  validateApifySourceChangeRadarConfig,
  type ApifySourceChangeRadarConfig,
  type CanonicalVenueEvent,
  type CanonicalVenueRegistry,
} from "../scripts/apify-source-change-radar";
import type { ApifyVenuePilotConfig } from "../scripts/apify-venue-pilot";
import {
  ApifyRestError,
  type ApifyPageSnapshot,
} from "../scripts/lib/apify-rest";

async function trackedConfig(): Promise<ApifySourceChangeRadarConfig> {
  return JSON.parse(
    await readFile(resolve("config/apify-source-change-radar.json"), "utf8"),
  ) as ApifySourceChangeRadarConfig;
}

async function trackedAllowlist(): Promise<ApifyVenuePilotConfig> {
  return JSON.parse(
    await readFile(resolve("config/apify-venue-pilot.json"), "utf8"),
  ) as ApifyVenuePilotConfig;
}

async function canonicalFixtures(): Promise<{
  venueRegistry: CanonicalVenueRegistry;
  canonicalEvents: CanonicalVenueEvent[];
}> {
  const allowlist = await trackedAllowlist();
  return {
    venueRegistry: {
      venues: allowlist.sources.map((source) => ({
        slug: source.venueSlug,
        urls: [source.url],
      })),
    },
    canonicalEvents: [
      {
        venue_slug: "weinberg-center",
        source: { url: "https://weinbergcenter.org/performances/" },
      },
      {
        venue_slug: "weinberg-center",
        source: { url: "https://official-feed.example/weinberg" },
      },
    ],
  };
}

function snapshot(
  requestedUrl: string,
  markdown = "# Events\n\nJuly 31 at 7 p.m. Private copied publisher content must never be retained.",
  finalUrl = requestedUrl,
): ApifyPageSnapshot {
  return {
    requestedUrl,
    finalUrl,
    text: markdown,
    markdown,
    links: [
      `${requestedUrl.replace(/\/$/, "")}/events/first-friday?tracking=private`,
    ],
    metadata: { rawHtml: "private publisher HTML" },
    runId: "runABC123",
    datasetId: "datasetABC123",
    usageTotalUsd: 0.011,
  };
}

async function runOptions(reportDirectory: string) {
  return {
    config: await trackedConfig(),
    allowlist: await trackedAllowlist(),
    ...(await canonicalFixtures()),
    reportDirectory,
  };
}

describe("Apify source change radar policy", () => {
  it("uses all three proven first-party pages under immutable provider caps", async () => {
    const config = validateApifySourceChangeRadarConfig(await trackedConfig());
    expect(config).toMatchObject({
      mode: "private-change-radar",
      limits: {
        maxSourcesPerRun: 3,
        maxRunsPerMonth: 6,
        maxChargeUsdPerSource: 0.05,
        maxReservedChargeUsdPerRun: 0.15,
        maxReservedChargeUsdPerMonth: 0.9,
        contentOnlyAlertAfterConsecutiveRuns: 2,
      },
      sourceIds: [
        "weinberg-performances",
        "sky-stage-calendar",
        "jojos-events",
      ],
    });
  });

  it("accepts reviewed ids only and rejects arbitrary URL or cost flags", () => {
    expect(
      parseApifySourceChangeRadarCliArgs([
        "--live",
        "--confirm",
        "--initialize-state",
        "--source=jojos-events",
      ]),
    ).toEqual({
      live: true,
      confirmed: true,
      initializeState: true,
      sourceIds: ["jojos-events"],
    });
    expect(() =>
      parseApifySourceChangeRadarCliArgs(["--url=https://evil.example"]),
    ).toThrow(/unknown apify source change radar argument/i);
    expect(() =>
      parseApifySourceChangeRadarCliArgs(["--max-charge=99"]),
    ).toThrow(/unknown apify source change radar argument/i);
  });

  it("fails closed on a missing state unless initialization is explicit", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-radar-"),
    );
    const fetchPage = vi.fn();
    await expect(
      runApifySourceChangeRadar({
        ...(await runOptions(reportDirectory)),
        fetchPage,
        now: () => new Date("2026-08-02T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "STATE_REQUIRED" });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("stores a private baseline, then skips an identical repeat without an issue signal", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-radar-"),
    );
    const fetchPage = vi.fn(async (url: string) => snapshot(url));
    const options = await runOptions(reportDirectory);
    const baseline = await runApifySourceChangeRadar({
      ...options,
      fetchPage,
      allowInitializeState: true,
      now: () => new Date("2026-08-02T12:00:00.000Z"),
    });
    const repeat = await runApifySourceChangeRadar({
      ...options,
      fetchPage,
      now: () => new Date("2026-08-02T12:03:00.000Z"),
    });

    expect(baseline.report.summary).toMatchObject({ baseline: 3 });
    expect(baseline.issueSignal.actionable).toBe(false);
    expect(repeat.report.summary).toMatchObject({ unchanged: 3 });
    expect(repeat.issueSignal).toMatchObject({ actionable: false, items: [] });
    expect(repeat.report.results[0]).toMatchObject({
      actor: "apify/website-content-crawler",
      town: "Frederick",
      confidence: "high",
      collectedAt: "2026-08-02T12:03:00.000Z",
      canonicalCheck: {
        venueRegistryMatched: true,
        exactSourceUrlMatched: true,
        committedVenueEventCount: 2,
        committedExactSourceEventCount: 1,
        disposition: "review-required-no-event-candidate",
      },
    });
    expect(fetchPage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTotalChargeUsd: 0.05 }),
    );

    for (const path of [
      repeat.reportPath,
      repeat.statePath,
      repeat.summaryPath,
      repeat.issueSignalPath,
    ]) {
      const serialized = await readFile(path, "utf8");
      expect(serialized).not.toContain("Private copied publisher content");
      expect(serialized).not.toContain("private publisher HTML");
      expect(serialized).not.toContain("tracking=private");
    }
  });

  it("alerts on schedule-signal changes but holds one cosmetic change", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-radar-"),
    );
    const options = await runOptions(reportDirectory);
    let version = 0;
    const pages = [
      "Header A\nJuly 31 at 7 p.m.",
      "Header B\nJuly 31 at 7 p.m.",
      "Header C\nAugust 1 at 8 p.m.",
    ];
    const fetchPage = vi.fn(async (url: string) =>
      snapshot(url, pages[version]!),
    );

    await runApifySourceChangeRadar({
      ...options,
      sourceIds: ["jojos-events"],
      fetchPage,
      allowInitializeState: true,
      now: () => new Date("2026-08-02T13:00:00.000Z"),
    });
    version = 1;
    const cosmetic = await runApifySourceChangeRadar({
      ...options,
      sourceIds: ["jojos-events"],
      fetchPage,
      now: () => new Date("2026-08-03T13:00:00.000Z"),
    });
    expect(cosmetic.report.results[0]).toMatchObject({
      status: "cosmetic",
      confidence: "low",
      changedFields: ["content"],
    });
    expect(cosmetic.issueSignal.actionable).toBe(false);

    version = 2;
    const changed = await runApifySourceChangeRadar({
      ...options,
      sourceIds: ["jojos-events"],
      fetchPage,
      now: () => new Date("2026-08-04T13:00:00.000Z"),
    });
    expect(changed.report.results[0]).toMatchObject({
      status: "changed",
      confidence: "high",
      changedFields: ["content", "dates", "times"],
    });
    expect(changed.issueSignal.actionable).toBe(true);
  });

  it("escalates only after the configured consecutive content-only drift", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-radar-"),
    );
    const options = await runOptions(reportDirectory);
    let version = 0;
    const pages = [
      "Header A\nJuly 31 at 7 p.m.",
      "Header B\nJuly 31 at 7 p.m.",
      "Header C\nJuly 31 at 7 p.m.",
    ];
    const fetchPage = vi.fn(async (url: string) =>
      snapshot(url, pages[version]!),
    );
    await runApifySourceChangeRadar({
      ...options,
      sourceIds: ["sky-stage-calendar"],
      fetchPage,
      allowInitializeState: true,
      now: () => new Date("2026-08-02T14:00:00.000Z"),
    });
    version = 1;
    const first = await runApifySourceChangeRadar({
      ...options,
      sourceIds: ["sky-stage-calendar"],
      fetchPage,
      now: () => new Date("2026-08-03T14:00:00.000Z"),
    });
    version = 2;
    const second = await runApifySourceChangeRadar({
      ...options,
      sourceIds: ["sky-stage-calendar"],
      fetchPage,
      now: () => new Date("2026-08-04T14:00:00.000Z"),
    });

    expect(first.issueSignal.actionable).toBe(false);
    expect(second.report.results[0]?.parsingWarnings).toContain(
      "repeated-content-only-drift",
    );
    expect(second.issueSignal).toMatchObject({
      actionable: true,
      items: [{ status: "warning", confidence: "low" }],
    });
  });

  it("creates safe actionable evidence for failures and same-host redirects", async () => {
    const failureDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-radar-"),
    );
    const options = await runOptions(failureDirectory);
    const failure = await runApifySourceChangeRadar({
      ...options,
      sourceIds: ["weinberg-performances"],
      fetchPage: async () => {
        throw new ApifyRestError("HTTP_ERROR", "Provider failed.", {
          status: 429,
        });
      },
      allowInitializeState: true,
      now: () => new Date("2026-08-02T15:00:00.000Z"),
    });
    expect(failure.issueSignal).toMatchObject({
      actionable: true,
      items: [{ status: "error", errorCode: "HTTP_ERROR", httpStatus: 429 }],
    });

    const redirectDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-radar-"),
    );
    const redirectOptions = await runOptions(redirectDirectory);
    const redirect = await runApifySourceChangeRadar({
      ...redirectOptions,
      sourceIds: ["jojos-events"],
      fetchPage: async (url) => snapshot(url, undefined, `${url}?view=events`),
      allowInitializeState: true,
      now: () => new Date("2026-08-02T16:00:00.000Z"),
    });
    expect(redirect.report.results[0]?.parsingWarnings).toContain(
      "same-host-redirect",
    );
    expect(redirect.issueSignal).toMatchObject({
      actionable: true,
      items: [{ status: "warning", confidence: "medium" }],
    });
  });

  it("reserves failures and stops before a seventh monthly run", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-radar-"),
    );
    const options = await runOptions(reportDirectory);
    const fetchPage = vi.fn(async (url: string) => snapshot(url));
    for (let run = 0; run < 6; run += 1) {
      await runApifySourceChangeRadar({
        ...options,
        sourceIds: ["jojos-events"],
        fetchPage,
        allowInitializeState: run === 0,
        now: () => new Date(`2026-08-${10 + run}T12:00:00.000Z`),
      });
    }
    await expect(
      runApifySourceChangeRadar({
        ...options,
        sourceIds: ["jojos-events"],
        fetchPage,
        now: () => new Date("2026-08-20T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "MONTHLY_CAP_EXCEEDED" });
    expect(fetchPage).toHaveBeenCalledTimes(6);
  });

  it("rejects canonical drift before reserving budget or calling Apify", async () => {
    const reportDirectory = await mkdtemp(
      join(tmpdir(), "radius-apify-radar-"),
    );
    const fetchPage = vi.fn();
    const options = await runOptions(reportDirectory);
    await expect(
      runApifySourceChangeRadar({
        ...options,
        venueRegistry: { venues: [] },
        sourceIds: ["jojos-events"],
        fetchPage,
        allowInitializeState: true,
      }),
    ).rejects.toBeInstanceOf(ApifySourceChangeRadarError);
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
