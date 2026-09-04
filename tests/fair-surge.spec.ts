import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseFairSurgeArgs } from "../scripts/fair-surge";
import {
  FAIR_CANONICAL_PATH,
  FAIR_SURGE_HTTP_METHOD,
  FAIR_SURGE_REQUEST_HEADERS,
  FAIR_SURGE_STAGES,
  FAIR_SURGE_USER_REQUESTS,
  HARD_REQUEST_CAP,
  MAX_CRITICAL_RESOURCES,
  RequestBudget,
  applyFairScaleGate,
  createLoopbackRequester,
  extractCriticalResourcePaths,
  fairHtmlSignature,
  isLoopbackAddress,
  parseFairPointer,
  parseLoopbackTarget,
  resolveLoopbackTarget,
  safeRequestUrl,
  summarizeFairStage,
  validateFairRelease,
} from "../scripts/lib/fair-surge";

const openServers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
});

function sampleHtml({
  revision = "a".repeat(64),
  reviewedAt = "2026-09-01T12:00:00.000Z",
}: {
  revision?: string;
  reviewedAt?: string;
} = {}): string {
  return `<!doctype html>
    <html>
      <head>
        <title>Fair Day | The Great Frederick Fair 2026 · Frederick Radius</title>
        <link rel="stylesheet" href="/_next/static/css/fair.css">
        <script src="/_next/static/chunks/fair.js"></script>
      </head>
      <body data-fair-app="true">
        <h1>Ready before you leave.</h1>
        <div data-fair="great-frederick-fair-2026" data-reviewed="${reviewedAt}">
          sha256:${revision}
        </div>
        <img src="/images/fair/fairgrounds-night-mike-d-960.jpg" alt="Fair">
        <p>Official external EventHub guide</p>
        <a href="https://www.etix.com/ticket/v/11115">Buy</a>
        <a href="https://mobile.eventhub-floorplan.net/?Show_ID=18209">Map</a>
      </body>
    </html>`;
}

function samplePointer() {
  const digest = "a".repeat(64);
  return {
    version: 1,
    fairId: "great-frederick-fair-2026",
    revision: `sha256:${digest}`,
    assetPath: `/fair/2026/releases/${digest}.json`,
    byteLength: 1_024,
    dayCount: 2,
    itemCount: 3,
  };
}

describe("Fair surge fixed capacity envelope", () => {
  it("has immutable 100, 500, and 1000 user stages under one hard cap", () => {
    expect(FAIR_SURGE_STAGES.map((stage) => stage.users)).toEqual([
      100,
      500,
      1000,
    ]);
    expect(FAIR_SURGE_STAGES.every((stage) => Object.isFrozen(stage))).toBe(true);
    expect(Object.isFrozen(FAIR_SURGE_STAGES)).toBe(true);
    expect(FAIR_SURGE_USER_REQUESTS).toBe(1_600);
    expect(HARD_REQUEST_CAP).toBe(
      FAIR_SURGE_USER_REQUESTS + 1 + MAX_CRITICAL_RESOURCES,
    );
    expect(Math.max(...FAIR_SURGE_STAGES.map((stage) => stage.maxConcurrency)))
      .toBe(50);
    expect(FAIR_SURGE_STAGES.every((stage) => stage.p95BudgetMs === 250))
      .toBe(true);
    expect(FAIR_SURGE_STAGES.every((stage) => stage.p99BudgetMs === 500))
      .toBe(true);
  });

  it("does not expose knobs that raise users, concurrency, or request limits", () => {
    expect(() => parseFairSurgeArgs(["--users", "10000"])).toThrow(
      "Unknown Fair surge option",
    );
    expect(() => parseFairSurgeArgs(["--concurrency=500"])).toThrow(
      "Unknown Fair surge option",
    );
    expect(() => parseFairSurgeArgs(["--request-cap=99999"])).toThrow(
      "Unknown Fair surge option",
    );
    expect(parseFairSurgeArgs(["--through", "500"])).toMatchObject({
      through: 500,
      dryRun: false,
    });
    expect(() => parseFairSurgeArgs(["--through", "1600"])).toThrow(
      "exactly 100, 500, or 1000",
    );
  });

  it("stops before an attempt beyond the hard request budget", () => {
    const budget = new RequestBudget(2);
    budget.consume();
    budget.consume();
    expect(budget.used).toBe(2);
    expect(() => budget.consume()).toThrow("no request was sent");
    expect(budget.used).toBe(2);
  });
});

describe("Fair surge loopback boundary", () => {
  it.each([
    "127.0.0.1",
    "127.99.0.4",
    "::1",
    "::ffff:127.0.0.1",
  ])("recognizes %s as loopback", (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "192.168.0.118",
    "10.0.0.2",
    "8.8.8.8",
    "::",
    "fe80::1",
  ])("rejects %s as a loopback address", (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });

  it.each([
    "https://frederickradius.app",
    "https://preview.frederickradius.app",
    "https://radius.vercel.app",
    "https://vercel.com",
    "https://www.etix.com",
    "https://mobile.eventhub-floorplan.net",
    "http://192.168.0.118:3000",
    "http://0.0.0.0:3000",
    "http://example.com:3000",
  ])("refuses public, vendor, LAN, wildcard, or arbitrary target %s", (target) => {
    expect(() => parseLoopbackTarget(target)).toThrow(/refuses|only localhost/);
  });

  it("accepts only clean loopback origins", () => {
    expect(parseLoopbackTarget("http://127.0.0.1:3000").origin).toBe(
      "http://127.0.0.1:3000",
    );
    expect(parseLoopbackTarget("http://localhost:3000").origin).toBe(
      "http://localhost:3000",
    );
    expect(parseLoopbackTarget("http://[::1]:3000").origin).toBe(
      "http://[::1]:3000",
    );
    expect(() => parseLoopbackTarget("http://user:pass@127.0.0.1:3000"))
      .toThrow("credentials");
    expect(() => parseLoopbackTarget("http://127.0.0.1:3000/fair"))
      .toThrow("origin only");
    expect(() => parseLoopbackTarget("http://127.0.0.1:3000/?bust=1"))
      .toThrow("origin only");
  });

  it("fails closed when localhost has any non-loopback resolution", async () => {
    await expect(resolveLoopbackTarget("http://localhost:3000", async () => [
      { address: "127.0.0.1", family: 4 },
      { address: "192.168.0.118", family: 4 },
    ])).rejects.toThrow("resolved to non-loopback 192.168.0.118");

    await expect(resolveLoopbackTarget("http://localhost:3000", async () => [
      { address: "::1", family: 6 },
    ])).resolves.toMatchObject({ address: "::1", family: 6 });
  });
});

describe("Fair surge request boundary", () => {
  const target = { origin: "http://127.0.0.1:3000" };

  it("allows only reviewed Fair GET resources without queries", () => {
    expect(safeRequestUrl(target, FAIR_CANONICAL_PATH).pathname).toBe(
      FAIR_CANONICAL_PATH,
    );
    expect(safeRequestUrl(
      target,
      `/fair/2026/releases/${"a".repeat(64)}.json`,
    ).pathname).toContain("/fair/2026/releases/");
    expect(safeRequestUrl(target, "/_next/static/chunks/fair.js").pathname)
      .toBe("/_next/static/chunks/fair.js");
    expect(() => safeRequestUrl(target, "/api/health")).toThrow(
      "non-Fair resource",
    );
    expect(() => safeRequestUrl(target, `${FAIR_CANONICAL_PATH}?bust=1`))
      .toThrow("query");
    expect(() => safeRequestUrl(target, "https://www.etix.com/ticket/1"))
      .toThrow("cross-origin");
  });

  it("uses GET-only headers with no cookie or authorization channel", () => {
    expect(FAIR_SURGE_HTTP_METHOD).toBe("GET");
    expect(FAIR_SURGE_REQUEST_HEADERS).not.toHaveProperty("authorization");
    expect(FAIR_SURGE_REQUEST_HEADERS).not.toHaveProperty("cookie");
  });

  it("pins a real request to loopback and sends no auth, cookies, query, or write", async () => {
    let resolveObserved: (request: IncomingMessage) => void = () => undefined;
    const observedRequest = new Promise<IncomingMessage>((resolveRequest) => {
      resolveObserved = resolveRequest;
    });
    const server = createServer((request, response) => {
      resolveObserved(request);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("ok");
    });
    openServers.push(server);
    await new Promise<void>((resolveListen) => {
      server.listen(0, "127.0.0.1", () => resolveListen());
    });
    const port = (server.address() as AddressInfo).port;
    const resolved = await resolveLoopbackTarget(`http://127.0.0.1:${port}`);
    const budget = new RequestBudget(1);
    const requester = createLoopbackRequester(resolved, budget);
    try {
      const response = await requester.get(FAIR_CANONICAL_PATH, "text/html");
      expect(response.status).toBe(200);
    } finally {
      requester.close();
    }

    const observed = await observedRequest;
    expect(observed.method).toBe("GET");
    expect(observed.url).toBe(FAIR_CANONICAL_PATH);
    expect(observed.headers.authorization).toBeUndefined();
    expect(observed.headers.cookie).toBeUndefined();
    expect(budget.used).toBe(1);
  });
});

describe("Fair surge content contract", () => {
  it("extracts only same-origin query-free static and Fair image resources", () => {
    const html = `${sampleHtml()}
      <script src="https://frederickradius.app/_next/static/chunks/no.js"></script>
      <script src="/_next/static/chunks/query.js?v=1"></script>
      <img src="/images/other/not-fair.jpg">`;
    expect(extractCriticalResourcePaths(
      html,
      "http://127.0.0.1:3000",
    )).toEqual([
      "/_next/static/chunks/fair.js",
      "/_next/static/css/fair.css",
      "/images/fair/fairgrounds-night-mike-d-960.jpg",
    ]);
  });

  it("keeps the semantic marker hash stable across volatile timestamps", () => {
    const one = fairHtmlSignature(
      sampleHtml({ reviewedAt: "2026-09-01T12:00:00.000Z" }),
      "http://127.0.0.1:3000",
    );
    const two = fairHtmlSignature(
      sampleHtml({ reviewedAt: "2026-09-01T12:01:00.000Z" }),
      "http://127.0.0.1:3000",
    );
    expect(one.hash).toBe(two.hash);
    expect(one.revision).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("fails closed on missing markers, missing assets, or changing revisions", () => {
    expect(() => fairHtmlSignature(
      sampleHtml().replace('data-fair-app="true"', 'data-fair-app="false"'),
      "http://127.0.0.1:3000",
    )).toThrow("missing stable marker");
    expect(() => fairHtmlSignature(
      sampleHtml().replace("/images/fair/fairgrounds-night-mike-d-960.jpg", "/other.jpg"),
      "http://127.0.0.1:3000",
    )).toThrow("Fair image");
    expect(() => fairHtmlSignature(
      `${sampleHtml()} sha256:${"b".repeat(64)}`,
      "http://127.0.0.1:3000",
    )).toThrow("exactly one stable pack revision");
  });

  it("validates pointer identity and reviewed release counts", () => {
    const pointer = parseFairPointer(samplePointer());
    expect(() => validateFairRelease({
      fairId: pointer.fairId,
      revision: pointer.revision,
      manifest: { id: pointer.fairId },
      schedule: {
        days: [
          { items: [{ id: 1 }, { id: 2 }] },
          { items: [{ id: 3 }] },
        ],
      },
    }, pointer)).not.toThrow();
    expect(() => validateFairRelease({
      fairId: pointer.fairId,
      revision: pointer.revision,
      manifest: { id: pointer.fairId },
      schedule: { days: [{ items: [] }, { items: [] }] },
    }, pointer)).toThrow("counts do not match");
    expect(() => parseFairPointer({
      ...samplePointer(),
      assetPath: `/fair/2026/releases/${"b".repeat(64)}.json`,
    })).toThrow("does not match its revision");
  });

  it("blocks the next stage on errors, incomplete users, or p95 regression", () => {
    const stage = FAIR_SURGE_STAGES[0];
    const passed = summarizeFairStage(stage, {
      completed: 100,
      requestErrors: 0,
      durationMs: 10_000,
      bytes: 100_000,
      latenciesMs: Array.from({ length: 100 }, () => 100),
    });
    expect(passed).toMatchObject({ passed: true, requestsPerSecond: 10 });

    const failed = summarizeFairStage(stage, {
      completed: 99,
      requestErrors: 1,
      durationMs: 30_000,
      bytes: 99_000,
      latenciesMs: [...Array.from({ length: 94 }, () => 100), ...Array(5).fill(600)],
      fatalError: "HTML marker changed.",
    });
    expect(failed.passed).toBe(false);
    expect(failed.gateFailures.join(" ")).toContain("Only 99 of 100");
    expect(failed.gateFailures.join(" ")).toContain("p95 600ms exceeded");
    expect(failed.gateFailures.join(" ")).toContain("p99 600ms exceeded");
    expect(failed.gateFailures.join(" ")).toContain("HTML marker changed");
  });

  it("rejects a 1,000-user p95 above twice the 100-user baseline", () => {
    const baseline = summarizeFairStage(FAIR_SURGE_STAGES[0], {
      completed: 100,
      requestErrors: 0,
      durationMs: 5_000,
      bytes: 100_000,
      latenciesMs: Array.from({ length: 100 }, () => 100),
    });
    const thousand = summarizeFairStage(FAIR_SURGE_STAGES[2], {
      completed: 1000,
      requestErrors: 0,
      durationMs: 30_000,
      bytes: 1_000_000,
      latenciesMs: Array.from({ length: 1000 }, () => 220),
    });

    expect(thousand.passed).toBe(true);
    expect(applyFairScaleGate(thousand, baseline)).toMatchObject({
      passed: false,
      gateFailures: [expect.stringContaining("twice the 100-user baseline")],
    });
  });
});
