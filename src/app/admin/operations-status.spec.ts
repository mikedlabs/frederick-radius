import { describe, expect, it } from "vitest";
import type { PublicHoursProductHealth } from "@/lib/public-data-snapshot";
import type { PublicHealthSnapshot } from "@/lib/public-health";
import {
  operationsHealthLevel,
  ownerPushReadiness,
  sentryReadiness,
} from "./operations-status";

const HEALTHY: PublicHealthSnapshot = {
  service: "frederick-radius",
  status: "operational",
  generatedAt: "2026-09-02T14:00:00.000Z",
  deployment: { environment: "production", revision: "abcdef012345" },
  database: { status: "reachable", latencyMs: 18 },
  data: {
    status: "current",
    tracked: 75,
    current: 75,
    stale: 0,
    attention: 0,
    unknown: 0,
    diagnostics: null,
    lastPublishedAt: "2026-09-02T13:58:00.000Z",
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
    searchIndex: {
      status: "current",
      expected: 1_570,
      indexed: 1_570,
      current: 1_570,
      missing: 0,
      stale: 0,
      retired: 0,
      embedded: 0,
      lastDocumentChangeAt: "2026-09-02T13:55:00.000Z",
      freshnessBasis: "catalog_content_hash",
    },
    surfaces: {
      today: { status: "ready", reasons: [] },
      ask: { status: "ready", reasons: [] },
      map: { status: "ready", reasons: [] },
      events: { status: "ready", reasons: [] },
    },
  },
};

const CURRENT_HOURS: PublicHoursProductHealth = {
  status: "current",
  mode: "active_refresh",
  current: 1_000,
  expected: 1_570,
  coveragePct: 63.7,
  target: 942,
  targetPct: 60,
  checkedAt: "2026-09-02T14:00:00.000Z",
  operatorMessage: null,
};

describe("admin operations status", () => {
  it("matches an operational public-health and hours snapshot", () => {
    expect(operationsHealthLevel(HEALTHY, CURRENT_HOURS)).toBe("operational");
  });

  it("cannot report operational when the deployed Open Now product is degraded", () => {
    expect(
      operationsHealthLevel(HEALTHY, {
        ...CURRENT_HOURS,
        status: "degraded",
        current: 0,
        coveragePct: 0,
      }),
    ).toBe("degraded");
  });

  it("names an intentional hours policy hold without raising a degradation", () => {
    expect(
      operationsHealthLevel(HEALTHY, {
        ...CURRENT_HOURS,
        status: "policy_hold",
        mode: "policy_hold",
        current: 0,
        coveragePct: 0,
        operatorMessage: "Paid refresh is intentionally disabled.",
      }),
    ).toBe("policy-hold");
  });

  it("does not let an hours policy hold hide another degraded dependency", () => {
    expect(
      operationsHealthLevel(
        {
          ...HEALTHY,
          status: "degraded",
          data: { ...HEALTHY.data, status: "degraded", stale: 1 },
        },
        {
          ...CURRENT_HOURS,
          status: "policy_hold",
          mode: "policy_hold",
          operatorMessage: "Paid refresh is intentionally disabled.",
        },
      ),
    ).toBe("degraded");
  });

  it("raises a blocked level when a public surface is on hold", () => {
    expect(
      operationsHealthLevel(
        {
          ...HEALTHY,
          status: "degraded",
          readiness: { ...HEALTHY.readiness, status: "hold" },
        },
        CURRENT_HOURS,
      ),
    ).toBe("blocked");
  });

  it("treats a missing health read as unknown rather than healthy", () => {
    expect(operationsHealthLevel(null, CURRENT_HOURS)).toBe("unknown");
  });
});

describe("admin alert readiness", () => {
  it("requires both complete VAPID configuration and an owner device", () => {
    expect(ownerPushReadiness(false, 1)).toBe("unconfigured");
    expect(ownerPushReadiness(true, null)).toBe("unknown");
    expect(ownerPushReadiness(true, 0)).toBe("no-device");
    expect(ownerPushReadiness(true, 1)).toBe("ready");
  });

  it("distinguishes partial Sentry coverage from full capture", () => {
    expect(sentryReadiness(true, true)).toBe("ready");
    expect(sentryReadiness(true, false)).toBe("server-only");
    expect(sentryReadiness(false, true)).toBe("browser-only");
    expect(sentryReadiness(false, false)).toBe("unconfigured");
  });
});
