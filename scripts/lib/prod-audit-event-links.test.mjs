import assert from "node:assert/strict";
import test from "node:test";
import {
  eventLinkWaitBudget,
  MAX_EVENT_LINK_WAIT_MS,
  pageDeploymentId,
  waitForRenderedEventLinks,
} from "./prod-audit-event-links.mjs";

const BASE = "https://frederickradius.app";
const SHA = "f50a1e4b91bed617b3fd7cf4a14ae0a83c0008ab";
const DPL = "dpl_9TdTvVucT5rpCB3KBrMCXuXEDLP8";
function page(surface, { links = [], id = DPL, status = 200, mount = true } = {}) {
  return {
    status,
    url: `${BASE}${surface}`,
    headers: new Headers({
      "content-type": "text/html",
      date: "Mon, 12 Oct 2026 13:08:11 GMT",
      age: "375",
      "x-vercel-cache": "STALE",
      "cache-control": "public, max-age=0, must-revalidate",
    }),
    body: `<html${id ? ` data-dpl-id="${id}"` : ""}><body>Frederick Radius${
      mount && surface === "/today" ? '<div data-today-event-recovery="true"></div>' : ""
    }${links.map((path) => `<a href="${path}">Event</a>`).join("")}</body></html>`,
    hops: [{ status, url: `${BASE}${surface}`, ttfbMs: 100 }],
  };
}

function harness(overrides = {}, reader = (path) => page(path)) {
  let clock = 0;
  const reads = [];
  const sleeps = [];
  const receipts = [];
  const originalPages = new Map([[
    "/today", page("/today"),
  ], ["/events", page("/events")]]);
  const run = () => waitForRenderedEventLinks({
    baseUrl: BASE,
    pages: originalPages,
    expectedSha: SHA,
    deployedSha: SHA.slice(0, 12),
    earlierChecksHealthy: true,
    recovery: { status: 200, cacheControl: "no-store", payload: { events: [{ slug: "actual-event" }], partial: false } },
    waitMs: MAX_EVENT_LINK_WAIT_MS,
    requestTimeoutMs: 20_000,
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    request: async (path, options) => {
      reads.push({ path, options, startedAt: clock });
      return reader(path, options, reads.length, (ms) => { clock += ms; }, () => clock);
    },
    observe: (receipt) => receipts.push(receipt),
    ...overrides,
  });
  return { run, reads, sleeps, receipts, originalPages, time: () => clock };
}

test("wait budget is opt-in, integer, and capped at 340 seconds", () => {
  for (const value of [undefined, "", 0, -1, "bad", Infinity, 0.5]) {
    assert.equal(eventLinkWaitBudget(value), 0);
  }
  assert.equal(eventLinkWaitBudget("340000"), 340_000);
  assert.equal(eventLinkWaitBudget(900_000), 340_000);
});

test("deployment ID comes only from one actual html attribute", () => {
  assert.equal(pageDeploymentId(page("/today").body), DPL);
  assert.equal(pageDeploymentId(`<html><script>"data-dpl-id":"${DPL}"</script></html>`), null);
  assert.equal(pageDeploymentId(`<html data-dpl-id="${DPL}" data-dpl-id="dpl_wrong">`), null);
  assert.equal(pageDeploymentId('<html data-dpl-id="wrong">'), null);
});

test("existing real anchors do not change the general canary acceptance contract", async () => {
  const pages = new Map([["/today", page("/today", { links: ["/events/already-rendered"] })]]);
  const h = harness({ pages, expectedSha: null, deployedSha: null, recovery: null });
  const result = await h.run();
  assert.equal(result.category, "rendered");
  assert.deepEqual(result.paths, ["/events/already-rendered"]);
  assert.equal(h.reads.length, 0);
});

test("later actual anchors recover through ordinary canonical HTML reads only", async () => {
  const h = harness({}, (path, _options, _count, _advance, now) => {
    const result = page(path, { links: path === "/events" && now() >= 320_000 ? ["/events/later-event?in=county", "/events/another-event"] : [] });
    // Serialized paths must never count as rendered links.
    result.body += '<script>{"href":"/events/serialized-only"}</script>';
    return result;
  });
  const result = await h.run();
  assert.equal(result.category, "recovered");
  assert.equal(result.elapsedMs, 320_000);
  assert.deepEqual(result.paths, ["/events/another-event", "/events/later-event?in=county"]);
  assert.equal(result.attempts, 17);
  for (const { path, options } of h.reads) {
    assert.ok(path === "/today" || path === "/events");
    assert.deepEqual(options, { accept: "text/html", follow: false, ordinary: true, timeoutMs: 20_000 });
  }
  assert.equal(h.originalPages.get("/events").body.includes("later-event"), false);
  assert.equal(h.receipts[0].category, "initial-empty");
  assert.equal(h.receipts[0].cacheDate, "Mon, 12 Oct 2026 13:08:11 GMT");
  assert.equal(h.receipts[0].cacheAge, "375");
  assert.equal(h.receipts[0].cacheStatus, "STALE");
  assert.equal(h.receipts[0].status, 200);
  assert.equal(h.receipts[0].deploymentId, DPL);
});

const refusalCases = [
  ["missing expected SHA", { expectedSha: null }, "expected-sha-required"],
  ["short expected SHA", { expectedSha: SHA.slice(0, 12) }, "expected-sha-required"],
  ["wrong observed SHA", { deployedSha: "a".repeat(12) }, "deployment-mismatch"],
  ["missing observed SHA", { deployedSha: null }, "deployment-mismatch"],
  ["ambiguous short observed SHA", { deployedSha: SHA.slice(0, 6) }, "deployment-mismatch"],
  ["earlier failure", { earlierChecksHealthy: false }, "earlier-check-failed"],
  ["missing recovery", { recovery: null }, "runtime-recovery-invalid"],
  ["HTTP recovery error", { recovery: { status: 500, cacheControl: "no-store", payload: { events: [1], partial: false } } }, "runtime-recovery-invalid"],
  ["undocumented recovery", { recovery: { status: 200, cacheControl: "no-store", payload: { events: [1] } } }, "runtime-recovery-invalid"],
  ["cacheable recovery", { recovery: { status: 200, cacheControl: "public", payload: { events: [1], partial: false } } }, "runtime-recovery-invalid"],
  ["empty current runtime", { recovery: { status: 200, cacheControl: "no-store", payload: { events: [], partial: false } } }, "runtime-recovery-empty"],
  ["zero retry budget", { waitMs: 0 }, "wait-disabled"],
];
for (const [label, overrides, category] of refusalCases) {
  test(`${label} never defers the empty verdict`, async () => {
    const h = harness(overrides);
    const result = await h.run();
    assert.equal(result.category, category);
    assert.deepEqual(result.paths, []);
    assert.equal(h.reads.length, 0);
    assert.equal(h.sleeps.length, 0);
  });
}

test("positive runtime without the explicit Today mount is not eligible", async () => {
  const pages = new Map([["/today", page("/today", { mount: false })], ["/events", page("/events")]]);
  const h = harness({ pages });
  assert.equal((await h.run()).category, "runtime-recovery-not-mounted");
  assert.equal(h.reads.length, 0);
});

test("initial missing or inconsistent canonical deployment markers fail closed", async () => {
  for (const [id, category] of [[null, "deployment-marker-missing"], ["dpl_wrong", "deployment-drift"]]) {
    const pages = new Map([["/today", page("/today")], ["/events", page("/events", { id })]]);
    const h = harness({ pages });
    assert.equal((await h.run()).category, category);
    assert.equal(h.reads.length, 0);
  }
});

test("changed or missing deployment markers cannot recover even with real anchors", async () => {
  for (const surface of ["/today", "/events"]) {
    for (const id of [null, "dpl_wrong"]) {
      const h = harness({}, (path) => page(path, { id: path === surface ? id : DPL, links: ["/events/new-release-event"] }));
      const result = await h.run();
      assert.equal(result.category, "deployment-drift");
      assert.deepEqual(result.paths, []);
      assert.equal(h.reads.length, surface === "/today" ? 1 : 2);
      assert.equal(h.sleeps.length, 0);
    }
  }
});

test("every HTTP error, including a redirect, terminates without a retry", async () => {
  for (const status of [302, 404, 429, 500, 503]) {
    const h = harness({}, (path) => page(path, { status, links: ["/events/branded-error"] }));
    const result = await h.run();
    assert.equal(result.category, "http-error");
    assert.deepEqual(result.paths, []);
    assert.equal(result.observations.at(-1).status, status);
    assert.equal(h.reads.length, 1);
    assert.equal(h.sleeps.length, 0);
  }
});

test("existing HTML acceptance failure stays fatal", async () => {
  const h = harness({ validatePage: () => false }, (path) => page(path, { links: ["/events/broken-page"] }));
  assert.equal((await h.run()).category, "page-contract-failed");
  assert.equal(h.reads.length, 1);
});

test("request timeout is recorded and is never retried", async () => {
  const h = harness({}, (_path, options, _count, advance) => {
    advance(options.timeoutMs);
    const error = new Error("deadline exceeded");
    error.name = "TimeoutError";
    throw error;
  });
  const result = await h.run();
  assert.equal(result.category, "request-timeout");
  assert.equal(result.elapsedMs, 20_000);
  assert.equal(h.reads.length, 1);
});

test("the 340-second bound includes all request and sleep time", async () => {
  const h = harness({ waitMs: 900_000 }, (path, options, _count, advance) => {
    advance(Math.min(17_000, options.timeoutMs));
    return page(path);
  });
  const result = await h.run();
  assert.equal(result.category, "deadline-expired");
  assert.equal(result.elapsedMs, 340_000);
  assert.deepEqual(result.paths, []);
  assert.ok(h.reads.some(({ options }) => options.timeoutMs < 20_000));
  for (const { startedAt, options } of h.reads) {
    assert.ok(startedAt + options.timeoutMs <= 340_000);
    assert.ok(options.timeoutMs > 0);
  }
});

test("late anchors cannot turn an exceeded deadline green", async () => {
  const h = harness({}, (path, _options, _count, advance) => {
    advance(340_001);
    return page(path, { links: ["/events/too-late"] });
  });
  const result = await h.run();
  assert.equal(result.category, "deadline-expired");
  assert.deepEqual(result.paths, []);
  assert.equal(h.reads.length, 1);
});
