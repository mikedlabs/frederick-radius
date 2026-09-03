import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  DSM_FALLBACK_EXIT_CODE,
  REMINDER_INTERVAL_MS,
  decideNasProductionMonitor,
  initialNasProductionMonitorState,
  isApprovedSlackWebhook,
  observeHealthPayload,
  runNasProductionMonitor,
  type HealthObservation,
} from "../scripts/nas-production-monitor";

const degradedPayload = {
  status: "degraded",
  deployment: { revision: "abc123" },
  database: { status: "reachable" },
  data: { current: 23, tracked: 75 },
  products: { hours: { current: 0, expected: 1570 } },
};

const CHECKED_AT = "2026-09-02T12:00:00.000Z";

function healthyPayload(generatedAt = CHECKED_AT) {
  return {
    service: "frederick-radius",
    status: "operational",
    generatedAt,
    deployment: { environment: "production", revision: "abc123def456" },
    database: { status: "reachable", latencyMs: 12 },
    data: {
      status: "current",
      tracked: 75,
      current: 75,
      stale: 0,
      attention: 0,
      unknown: 0,
    },
    readiness: {
      status: "ready",
      migrations: {
        status: "ready",
        hours: "ready",
        search: "ready",
        eventArchive: "ready",
        sourceHealth: "ready",
        dataTruth: "ready",
      },
      heartbeats: {
        status: "current",
        feeds: "current",
        eventArchive: "current",
      },
      searchIndex: { status: "current" },
      surfaces: {
        today: { status: "ready", reasons: [] },
        ask: { status: "ready", reasons: [] },
        map: { status: "ready", reasons: [] },
        events: { status: "ready", reasons: [] },
      },
    },
    products: {
      hours: {
        status: "current",
        mode: "active_refresh",
        current: 1_570,
        expected: 1_570,
        coveragePct: 100,
        target: 942,
        targetPct: 60,
        checkedAt: generatedAt,
        operatorMessage: null,
      },
    },
  };
}

function policyHoldPayload(generatedAt = CHECKED_AT) {
  const payload = healthyPayload(generatedAt);
  return {
    ...payload,
    readiness: {
      ...payload.readiness,
      status: "partial",
      capabilities: {
        currentHours: {
          status: "policy_hold",
          affectedSurfaces: ["today", "ask", "map"],
        },
      },
      surfaces: {
        today: {
          status: "partial",
          reasons: ["current_hours_policy_hold"],
        },
        ask: {
          status: "partial",
          reasons: ["current_hours_policy_hold"],
        },
        map: {
          status: "partial",
          reasons: ["current_hours_policy_hold"],
        },
        events: { status: "ready", reasons: [] },
      },
    },
    products: {
      hours: {
        status: "policy_hold",
        mode: "policy_hold",
        current: 0,
        expected: 1_570,
        coveragePct: 0,
        target: 942,
        targetPct: 60,
        checkedAt: generatedAt,
        operatorMessage:
          "Paid Google hours refresh is intentionally disabled.",
      },
    },
  };
}

function observation(healthy: boolean, checkedAt: string): HealthObservation {
  return {
    healthy,
    status: healthy ? "operational" : "degraded",
    reason: healthy ? "operational" : "status-degraded",
    summary: healthy ? "operational" : "degraded",
    checkedAt,
    httpStatus: 200,
    revision: "abc123",
  };
}

describe("NAS production monitor decisions", () => {
  it("treats degraded JSON as unhealthy even when HTTP is 200", () => {
    const result = observeHealthPayload(
      degradedPayload,
      200,
      "2026-09-02T12:00:00.000Z",
    );

    expect(result).toMatchObject({
      healthy: false,
      status: "degraded",
      reason: "status-degraded",
      httpStatus: 200,
      revision: "abc123",
    });
    expect(result.summary).toBe(
      "degraded; database reachable; 23/75 sources current; 0/1570 hours current",
    );
  });

  it("accepts only an explicit operational payload that satisfies the public contract", () => {
    const healthy = observeHealthPayload(
      healthyPayload(),
      200,
      CHECKED_AT,
    );
    const shallowOperational = observeHealthPayload(
      { ...degradedPayload, status: "operational" },
      200,
      CHECKED_AT,
    );
    const missing = observeHealthPayload(
      { database: { status: "reachable" } },
      200,
      CHECKED_AT,
    );

    expect(healthy.healthy).toBe(true);
    expect(shallowOperational).toMatchObject({
      healthy: false,
      reason: "service-mismatch",
    });
    expect(missing).toMatchObject({
      healthy: false,
      status: "invalid",
      reason: "missing-status",
    });
  });

  it("accepts the intentional Google-hours policy hold as operational", () => {
    const result = observeHealthPayload(policyHoldPayload(), 200, CHECKED_AT);

    expect(result).toMatchObject({
      healthy: true,
      status: "operational",
      reason: "operational",
    });
    expect(result.summary).toContain("hours refresh on policy hold");
  });

  it.each([
    [
      "stale-generated-at",
      healthyPayload("2026-09-02T11:49:59.999Z"),
    ],
    ["not-production", {
      ...healthyPayload(),
      deployment: { environment: "preview", revision: "abc123def456" },
    }],
    ["database-unavailable", {
      ...healthyPayload(),
      database: { status: "unavailable", latencyMs: null },
    }],
    ["data-not-current", {
      ...healthyPayload(),
      data: { ...healthyPayload().data, current: 74 },
    }],
    ["migrations-not-ready", {
      ...healthyPayload(),
      readiness: {
        ...healthyPayload().readiness,
        migrations: {
          ...healthyPayload().readiness.migrations,
          search: "missing",
        },
      },
    }],
    ["heartbeats-not-current", {
      ...healthyPayload(),
      readiness: {
        ...healthyPayload().readiness,
        heartbeats: {
          ...healthyPayload().readiness.heartbeats,
          feeds: "stale",
        },
      },
    }],
    ["search-index-not-current", {
      ...healthyPayload(),
      readiness: {
        ...healthyPayload().readiness,
        searchIndex: { status: "degraded" },
      },
    }],
    ["invalid-hours-counts", {
      ...healthyPayload(),
      products: {
        hours: {
          ...healthyPayload().products.hours,
          expected: 0,
        },
      },
    }],
    ["surfaces-not-ready", {
      ...healthyPayload(),
      readiness: {
        ...healthyPayload().readiness,
        status: "partial",
        surfaces: {
          ...healthyPayload().readiness.surfaces,
          today: { status: "partial", reasons: ["feed_heartbeat_stale"] },
        },
      },
    }],
  ])("rejects operational payloads with %s", (reason, payload) => {
    expect(observeHealthPayload(payload, 200, CHECKED_AT)).toMatchObject({
      healthy: false,
      reason,
    });
  });

  it("rejects a policy hold that hides another readiness failure", () => {
    const payload = policyHoldPayload();
    payload.readiness.surfaces.today.reasons.push("feed_heartbeat_stale");

    expect(observeHealthPayload(payload, 200, CHECKED_AT)).toMatchObject({
      healthy: false,
      reason: "invalid-policy-hold",
    });
  });

  it("requires two consecutive unhealthy checks before alerting", () => {
    const firstAt = "2026-09-02T12:00:00.000Z";
    const secondAt = "2026-09-02T12:05:00.000Z";
    const first = decideNasProductionMonitor(
      initialNasProductionMonitorState(),
      observation(false, firstAt),
      Date.parse(firstAt),
    );
    const second = decideNasProductionMonitor(
      first.state,
      observation(false, secondAt),
      Date.parse(secondAt),
    );

    expect(first.alert).toBeNull();
    expect(first.state.mode).toBe("unknown");
    expect(first.state.consecutiveUnhealthy).toBe(1);
    expect(second.alert).toBe("outage");
    expect(second.state.mode).toBe("unhealthy");
    expect(second.state.consecutiveUnhealthy).toBe(2);
  });

  it("sends one bounded reminder and one recovery transition", () => {
    const outageAt = "2026-09-02T12:05:00.000Z";
    const base = {
      ...initialNasProductionMonitorState(),
      mode: "unhealthy" as const,
      consecutiveUnhealthy: 2,
      incidentStartedAt: outageAt,
      lastCheckAt: outageAt,
      lastAlertAt: outageAt,
      lastAlertKind: "outage" as const,
      lastObservation: observation(false, outageAt),
    };
    const earlyAt = "2026-09-02T18:04:59.999Z";
    const dueAt = "2026-09-02T18:05:00.000Z";
    const early = decideNasProductionMonitor(
      base,
      observation(false, earlyAt),
      Date.parse(earlyAt),
    );
    const due = decideNasProductionMonitor(
      base,
      observation(false, dueAt),
      Date.parse(dueAt),
    );
    const recoveredAt = "2026-09-02T18:10:00.000Z";
    const recovered = decideNasProductionMonitor(
      due.state,
      observation(true, recoveredAt),
      Date.parse(recoveredAt),
    );

    expect(Date.parse(dueAt) - Date.parse(outageAt)).toBe(REMINDER_INTERVAL_MS);
    expect(early.alert).toBeNull();
    expect(due.alert).toBe("reminder");
    expect(recovered.alert).toBe("recovery");
    expect(recovered.state.mode).toBe("healthy");
    expect(recovered.state.consecutiveUnhealthy).toBe(0);
  });
});

describe("NAS production monitor delivery and persistence", () => {
  it("ignores a partial or corrupt state file instead of inventing a recovery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "radius-nas-monitor-"));
    const statePath = join(directory, "state.json");
    await writeFile(
      statePath,
      JSON.stringify({
        schemaVersion: 1,
        mode: "unhealthy",
        consecutiveUnhealthy: 2,
      }),
    );

    const result = await runNasProductionMonitor({
      statePath,
      healthFetch: vi.fn(async () =>
        new Response(JSON.stringify(healthyPayload()), { status: 200 }),
      ),
      slackWebhookUrl: null,
      now: () => new Date(CHECKED_AT),
    });

    expect(result).toMatchObject({ alert: null, exitCode: 0, delivery: null });
    expect(result.state).toMatchObject({
      mode: "healthy",
      consecutiveUnhealthy: 0,
      incidentStartedAt: null,
    });
  });

  it("ignores a structurally complete but inconsistent unhealthy state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "radius-nas-monitor-"));
    const statePath = join(directory, "state.json");
    await writeFile(
      statePath,
      JSON.stringify({
        ...initialNasProductionMonitorState(),
        mode: "unhealthy",
        consecutiveUnhealthy: 2,
        lastCheckAt: "2026-09-02T11:55:00.000Z",
        lastObservation: observation(false, "2026-09-02T11:55:00.000Z"),
      }),
    );

    const result = await runNasProductionMonitor({
      statePath,
      healthFetch: vi.fn(async () =>
        new Response(JSON.stringify(healthyPayload()), { status: 200 }),
      ),
      slackWebhookUrl: null,
      now: () => new Date(CHECKED_AT),
    });

    expect(result).toMatchObject({ alert: null, exitCode: 0, delivery: null });
    expect(result.state.mode).toBe("healthy");
  });

  it("uses a deliberate DSM fallback exit only on an alerting run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "radius-nas-monitor-"));
    const statePath = join(directory, "state.json");
    const healthFetch = vi.fn(async () =>
      new Response(JSON.stringify(degradedPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const first = await runNasProductionMonitor({
      statePath,
      healthFetch,
      slackWebhookUrl: null,
      now: () => new Date("2026-09-02T12:00:00.000Z"),
    });
    const second = await runNasProductionMonitor({
      statePath,
      healthFetch,
      slackWebhookUrl: null,
      now: () => new Date("2026-09-02T12:05:00.000Z"),
    });
    const third = await runNasProductionMonitor({
      statePath,
      healthFetch,
      slackWebhookUrl: null,
      now: () => new Date("2026-09-02T12:10:00.000Z"),
    });

    expect(first).toMatchObject({ alert: null, exitCode: 0, delivery: null });
    expect(second).toMatchObject({
      alert: "outage",
      exitCode: DSM_FALLBACK_EXIT_CODE,
      delivery: "dsm-fallback",
    });
    expect(third).toMatchObject({ alert: null, exitCode: 0, delivery: null });
    const persisted = await readFile(statePath, "utf8");
    expect(persisted).not.toContain("SLACK_WEBHOOK_URL");
    expect(JSON.parse(persisted)).toMatchObject({
      mode: "unhealthy",
      lastAlertKind: "outage",
      lastDelivery: "dsm-fallback",
    });
  });

  it("returns zero when an approved Slack webhook accepts the transition", async () => {
    const directory = await mkdtemp(join(tmpdir(), "radius-nas-monitor-"));
    const statePath = join(directory, "state.json");
    const healthFetch = vi.fn(async () =>
      new Response(JSON.stringify(degradedPayload), { status: 200 }),
    );
    const slackFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const options = {
      statePath,
      healthFetch,
      slackFetch,
      slackWebhookUrl: "https://hooks.slack.com/services/T/B/secret",
    };

    await runNasProductionMonitor({
      ...options,
      now: () => new Date("2026-09-02T12:00:00.000Z"),
    });
    const result = await runNasProductionMonitor({
      ...options,
      now: () => new Date("2026-09-02T12:05:00.000Z"),
    });

    expect(result).toMatchObject({
      alert: "outage",
      exitCode: 0,
      delivery: "slack",
    });
    expect(slackFetch).toHaveBeenCalledOnce();
    expect(await readFile(statePath, "utf8")).not.toContain("/T/B/secret");
  });

  it("falls back once when Slack rejects a transition, then honors the reminder bound", async () => {
    const directory = await mkdtemp(join(tmpdir(), "radius-nas-monitor-"));
    const statePath = join(directory, "state.json");
    const healthFetch = vi.fn(async () =>
      new Response(JSON.stringify(degradedPayload), { status: 200 }),
    );
    const slackFetch = vi.fn(async () => new Response("no", { status: 500 }));
    const options = {
      statePath,
      healthFetch,
      slackFetch,
      slackWebhookUrl: "https://hooks.slack.com/services/T/B/secret",
    };
    await runNasProductionMonitor({
      ...options,
      now: () => new Date("2026-09-02T12:00:00.000Z"),
    });
    const result = await runNasProductionMonitor({
      ...options,
      now: () => new Date("2026-09-02T12:05:00.000Z"),
    });
    const quiet = await runNasProductionMonitor({
      ...options,
      now: () => new Date("2026-09-02T12:10:00.000Z"),
    });

    expect(result).toMatchObject({
      alert: "outage",
      exitCode: DSM_FALLBACK_EXIT_CODE,
      delivery: "slack-failed",
    });
    expect(result.state.lastAlertAt).toBe("2026-09-02T12:05:00.000Z");
    expect(quiet).toMatchObject({ alert: null, exitCode: 0, delivery: null });
    expect(slackFetch).toHaveBeenCalledOnce();
  });

  it("treats invalid JSON as an unhealthy observation without throwing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "radius-nas-monitor-"));
    const result = await runNasProductionMonitor({
      statePath: join(directory, "state.json"),
      healthFetch: vi.fn(async () => new Response("not json", { status: 200 })),
      slackWebhookUrl: null,
      now: () => new Date("2026-09-02T12:00:00.000Z"),
    });

    expect(result.alert).toBeNull();
    expect(result.state.consecutiveUnhealthy).toBe(1);
    expect(result.state.lastObservation).toMatchObject({
      healthy: false,
      reason: "invalid-json",
    });
  });

  it("accepts only Slack's HTTPS incoming-webhook host", () => {
    expect(
      isApprovedSlackWebhook("https://hooks.slack.com/services/T/B/secret"),
    ).toBe(true);
    expect(isApprovedSlackWebhook("http://hooks.slack.com/services/T/B/secret")).toBe(false);
    expect(isApprovedSlackWebhook("https://example.com/services/T/B/secret")).toBe(false);
    expect(isApprovedSlackWebhook(undefined)).toBe(false);
  });
});
