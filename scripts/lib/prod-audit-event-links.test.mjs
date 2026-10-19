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

const emptyToday = {
  status: 200, cacheControl: "no-store", payload: { events: [], partial: false },
};
function browseResponse({ status = 200, events = [{ slug: "api-future-event", starts_at: "2026-10-20T22:00:00.000Z" }], degraded = false, body, contentType = "application/json", url = `${BASE}/api/events/browse` } = {}) {
  return {
    status, url,
    headers: new Headers({ "content-type": contentType, date: "Sun, 18 Oct 2026 23:59:00 GMT", age: "30", "x-vercel-cache": "HIT", "cache-control": "public, s-maxage=300, stale-while-revalidate=900" }),
    body: body ?? JSON.stringify({ events, liveSlugs: [], generatedAt: "2026-10-19T03:59:00.000Z", sourceHealth: { degraded, unavailable: [], issues: [] } }),
    hops: [{ status, url, ttfbMs: 100 }],
  };
}

test("an honestly empty late-night Today qualifies one broad read, then waits for actual canonical anchors", async () => {
  const h = harness({ recovery: emptyToday }, (path, _options, _count, advance, now) => {
    if (path === "/api/events/browse") { advance(1_000); return browseResponse(); }
    return page(path, { links: path === "/events" && now() >= 321_000 ? ["/events/rendered-upcoming-event", "/events/another-rendered-event"] : [] });
  });
  const result = await h.run();
  assert.equal(result.category, "recovered");
  assert.equal(result.elapsedMs, 321_000);
  assert.deepEqual(result.paths, ["/events/another-rendered-event", "/events/rendered-upcoming-event"]);
  assert.equal(h.reads.filter(read => read.path === "/api/events/browse").length, 1);
  assert.deepEqual(h.reads[0].options, { accept: "application/json", follow: false, ordinary: true, timeoutMs: 20_000 });
  assert.ok(h.reads.slice(1).every(read => read.path === "/today" || read.path === "/events"));
  assert.equal(h.receipts[0].category, "initial-empty");
  assert.equal(h.receipts[0].deploymentId, DPL);
  const broad = h.receipts.find(item => item.surface === "/api/events/browse");
  assert.equal(broad.category, "runtime-browse-eligible");
  assert.equal(broad.apiEventCount, 1);
  assert.equal(broad.cacheStatus, "HIT");
  assert.equal(broad.cacheAge, "30");
  assert.equal(broad.sourceDegraded, false);
  assert.ok(!JSON.stringify(h.receipts).includes("api-future-event"), "receipts log bounded counts, not the event corpus");
});

test("healthy broader API records never substitute for rendered event links", async () => {
  const h = harness({ recovery: emptyToday }, path => path === "/api/events/browse" ? browseResponse() : page(path));
  const result = await h.run();
  assert.equal(result.category, "deadline-expired");
  assert.equal(result.elapsedMs, MAX_EVENT_LINK_WAIT_MS);
  assert.deepEqual(result.paths, []);
  assert.equal(h.reads.filter(read => read.path === "/api/events/browse").length, 1);
  assert.ok(result.observations.some(item => item.category === "waiting-for-isr"));
});

for (const [label, reader, category] of [
  ["genuine empty calendar", () => browseResponse({ events: [] }), "runtime-browse-empty"],
  ["degraded calendar", () => browseResponse({ degraded: true }), "runtime-browse-degraded"],
  ["server failure", () => browseResponse({ status: 500 }), "runtime-browse-invalid"],
  ["redirect", () => browseResponse({ status: 302 }), "runtime-browse-invalid"],
  ["invalid JSON", () => browseResponse({ body: "not JSON" }), "runtime-browse-invalid"],
  ["unverified source health", () => browseResponse({ body: JSON.stringify({ events: [{}] }) }), "runtime-browse-invalid"],
  ["malformed event rows", () => browseResponse({ events: [null] }), "runtime-browse-invalid"],
  ["undated event rows", () => browseResponse({ events: [{ slug: "api-only-event" }] }), "runtime-browse-invalid"],
  ["HTML response", () => browseResponse({ contentType: "text/html" }), "runtime-browse-invalid"],
  ["foreign response", () => browseResponse({ url: "https://example.test/api/events/browse" }), "runtime-browse-invalid"],
  ["read failure", () => { throw new Error("read failed"); }, "runtime-browse-failed"],
  ["read timeout", () => { const error = new Error("timed out"); error.name = "TimeoutError"; throw error; }, "runtime-browse-timeout"],
]) {
  test(`empty Today plus ${label} remains red without HTML polling or API retries`, async () => {
    const h = harness({ recovery: emptyToday }, reader);
    const result = await h.run();
    assert.equal(result.category, category);
    assert.deepEqual(result.paths, []);
    assert.equal(h.reads.length, 1);
    assert.equal(h.reads[0].path, "/api/events/browse");
    assert.equal(h.sleeps.length, 0);
    assert.equal(result.observations.at(-1).category, category);
  });
}

test("an honestly partial empty Today can qualify broader healthy inventory without changing its reported health", async () => {
  const h = harness({ recovery: { ...emptyToday, payload: { events: [], partial: true } } }, path =>
    path === "/api/events/browse" ? browseResponse() : page(path, { links: path === "/events" ? ["/events/real-rendered-upcoming-event"] : [] }));
  const result = await h.run();
  assert.equal(result.category, "recovered");
  assert.deepEqual(result.paths, ["/events/real-rendered-upcoming-event"]);
  assert.equal(h.reads.filter(read => read.path === "/api/events/browse").length, 1);
  assert.equal(result.observations.find(item => item.surface === "/api/events/browse").todayPartial, true);
  assert.equal(result.observations.find(item => item.surface === "/api/events/browse").sourceDegraded, false);
});

test("an empty Today cannot qualify broader reads before all identity and earlier checks pass", async () => {
  for (const [overrides, category] of [
    [{ expectedSha: null }, "expected-sha-required"],
    [{ deployedSha: "a".repeat(12) }, "deployment-mismatch"],
    [{ earlierChecksHealthy: false }, "earlier-check-failed"],
    [{ pages: new Map([["/today", page("/today")], ["/events", page("/events", { id: "dpl_wrong" })]]) }, "deployment-drift"],
    [{ pages: new Map([["/today", page("/today")], ["/events", page("/events", { id: null })]]) }, "deployment-marker-missing"],
  ]) {
    const h = harness({ recovery: emptyToday, ...overrides });
    assert.equal((await h.run()).category, category);
    assert.equal(h.reads.length, 0);
  }
});

test("healthy broader data cannot excuse a later document deployment mismatch", async () => {
  const h = harness({ recovery: emptyToday }, path => path === "/api/events/browse" ? browseResponse() : page(path, { id: "dpl_wrong", links: ["/events/wrong-release-event"] }));
  const result = await h.run();
  assert.equal(result.category, "deployment-drift");
  assert.deepEqual(result.paths, []);
  assert.equal(h.reads.length, 2);
});

test("the broad qualification read consumes the same overall ISR wait budget", async () => {
  const h = harness({ recovery: emptyToday, waitMs: 5_000 }, (_path, options, _count, advance) => {
    assert.equal(options.timeoutMs, 5_000);
    advance(5_001);
    return browseResponse();
  });
  const result = await h.run();
  assert.equal(result.category, "deadline-expired");
  assert.deepEqual(result.paths, []);
  assert.equal(h.reads.length, 1);
  assert.equal(h.sleeps.length, 0);
});

test("a partial empty Today plus a degraded broader collection remains red", async () => {
  const h = harness({ recovery: { ...emptyToday, payload: { events: [], partial: true } } }, () => browseResponse({ degraded: true }));
  const result = await h.run();
  assert.equal(result.category, "runtime-browse-degraded");
  assert.deepEqual(result.paths, []);
  assert.equal(h.reads.length, 1);
  assert.equal(result.observations.at(-1).todayPartial, true);
});


test("a nonempty Today keeps its existing qualification without any broader API read, even when partial", async () => {
  const h = harness({ recovery: { status: 200, cacheControl: "no-store", payload: { events: [{ slug: "today-event" }], partial: true } } }, path =>
    page(path, { links: path === "/events" ? ["/events/real-rendered-event"] : [] }));
  const result = await h.run();
  assert.equal(result.category, "recovered");
  assert.deepEqual(result.paths, ["/events/real-rendered-event"]);
  assert.equal(h.reads.length, 2);
  assert.ok(h.reads.every(read => read.path === "/today" || read.path === "/events"));
});
