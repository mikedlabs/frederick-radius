import {
  classifyEventDetailResult,
  eventDetailGateSummary,
  eventDetailPathsFromHtml,
  mapWithConcurrency,
} from "./lib/prod-audit-events.mjs";
import { publicReadinessGate } from "./lib/prod-audit-readiness.mjs";

/**
 * Production acceptance canary — tests the apex URL after promotion.
 *
 * A green Vercel build is not proof that the public alias moved or that the
 * installed-app contract still points at the current product. This script
 * checks the real front door, primary routes, manifest, stable deep links,
 * every rendered event deep link, and the deploy SHA embedded in /sw.js.
 *
 * Manual:
 *   BASE_URL=https://frederickradius.app \
 *   EXPECTED_SHA=$(git rev-parse HEAD) \
 *   REQUIRE_EXPECTED_SHA=1 \
 *   node scripts/prod-audit.mjs
 *
 * EXPECTED_SHA is optional for an exploratory local run. The post-deploy
 * workflow sets REQUIRE_EXPECTED_SHA=1, making an alias that still serves an
 * older commit a hard failure.
 */
const BASE = new URL(
  (process.env.BASE_URL || "https://frederickradius.app").replace(/\/?$/, "/"),
);
const EXPECTED_SHA = process.env.EXPECTED_SHA?.trim().toLowerCase() || null;
const REQUIRE_EXPECTED_SHA = process.env.REQUIRE_EXPECTED_SHA === "1";
const REQUEST_TIMEOUT_MS = Number(process.env.CANARY_TIMEOUT_MS) || 20_000;
const CORE_TTFB_BUDGET_MS = Number(process.env.CORE_TTFB_BUDGET_MS) || 5_000;
const ASK_TTFB_BUDGET_MS = Number(process.env.ASK_TTFB_BUDGET_MS) || 3_500;
const USER_AGENT = "frederick-radius-production-canary/2";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Ask is a primary product surface, not an optional utility. A release where
// its workspace shell errors or redirects has failed even if the brochure-like
// pages still answer.
const CORE_ROUTES = ["/today", "/events", "/map", "/ask"];
const STABLE_PLACE_PATH = "/places/brewers-alley-frederick";
const EVENT_LINK_CONCURRENCY = 4;

let failures = 0;
const checkedPages = new Map();

const ok = (message) => console.log(`  ✓ ${message}`);
const note = (message) => console.log(`  · ${message}`);
const bad = (message) => {
  failures += 1;
  console.log(`  ✗ ${message}`);
};
const check = (pass, good, fail) => {
  if (pass) ok(good);
  else bad(fail);
};

function pathOf(value) {
  const url = new URL(value, BASE);
  return `${url.pathname}${url.search}`;
}

function isBetaDestination(value) {
  try {
    return new URL(value, BASE).pathname.startsWith("/beta");
  } catch {
    return true;
  }
}

async function request(path, { follow = true, accept = "*/*" } = {}) {
  const hops = [];
  let url = new URL(path, BASE);

  for (let index = 0; index < 6; index += 1) {
    const requestStartedAt = Date.now();
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: accept,
        "Cache-Control": "no-cache",
        "User-Agent": USER_AGENT,
      },
    });
    const ttfbMs = Date.now() - requestStartedAt;
    const location = response.headers.get("location");
    hops.push({ status: response.status, url: url.href, location, ttfbMs });

    if (!follow || !REDIRECT_STATUSES.has(response.status) || !location) {
      return {
        status: response.status,
        url: url.href,
        headers: response.headers,
        body: await response.text(),
        hops,
      };
    }

    const next = new URL(location, url);
    if (next.origin !== BASE.origin) {
      return {
        status: response.status,
        url: url.href,
        headers: response.headers,
        body: "",
        hops,
        externalRedirect: next.href,
      };
    }
    url = next;
  }

  throw new Error(`${path} exceeded five redirects`);
}

function assertNoBetaRedirect(label, result) {
  const badHop = result.hops.find(
    (hop) =>
      isBetaDestination(hop.url) ||
      (hop.location && isBetaDestination(hop.location)),
  );
  check(
    !badHop,
    `${label} never enters the beta wall`,
    `${label} redirected through beta (${badHop?.location || badHop?.url})`,
  );
}

function healthyHtml(path, result) {
  const contentType = result.headers.get("content-type") || "";
  const lower = result.body.toLowerCase();
  const expectedPath = new URL(path, BASE).pathname;
  const finalPath = new URL(result.url).pathname;
  const healthy =
    result.status === 200 &&
    contentType.includes("text/html") &&
    result.body.includes("Frederick Radius") &&
    result.body.length > 4_000 &&
    !lower.includes("internal server error") &&
    !lower.includes("application error");

  check(
    healthy,
    `${path} is a healthy branded 200`,
    `${path} is unhealthy (${result.status}, ${contentType || "no content type"}, ${result.body.length} bytes)`,
  );
  check(
    finalPath === expectedPath,
    `${path} stays on its public route`,
    `${path} ended at ${finalPath}`,
  );
  check(
    !result.externalRedirect,
    `${path} stays on the production origin`,
    `${path} redirected off the apex to ${result.externalRedirect}`,
  );
  assertNoBetaRedirect(path, result);
  const finalHop = result.hops.at(-1);
  const budget = path === "/ask" ? ASK_TTFB_BUDGET_MS : CORE_TTFB_BUDGET_MS;
  check(
    Boolean(finalHop) && finalHop.ttfbMs <= budget,
    `${path} begins responding in ${finalHop?.ttfbMs ?? "?"} ms`,
    `${path} exceeded its ${budget} ms response budget (${finalHop?.ttfbMs ?? "unknown"} ms)`,
  );
}

function manifestHref(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\brel=(?:"[^"]*\bmanifest\b[^"]*"|'[^']*\bmanifest\b[^']*')/i.test(tag)) {
      continue;
    }
    const match = tag.match(/\bhref=(?:"([^"]+)"|'([^']+)')/i);
    if (match) return match[1] || match[2];
  }
  return "/manifest.webmanifest";
}

// Photo policy: curated, attributed place media is allowed. Raw Wikimedia
// sources on decision cards are not; those bypass the app's media review.
const uncontrolledImgs = (html) =>
  (
    html.match(
      /<img\b[^>]*\bsrc="[^"]*(?:wikimedia|upload\.wikimedia)[^"]*"/gi,
    ) || []
  ).length;

async function run() {
  console.log(`\nProduction canary → ${BASE.origin}\n`);

  // The root must resolve directly to Today. A beta detour, marketing cover,
  // or generic 200 at / is a front-door regression even if /today itself works.
  try {
    const root = await request("/", { follow: false, accept: "text/html" });
    const location = root.headers.get("location");
    const destination = location ? new URL(location, BASE) : null;
    check(
      REDIRECT_STATUSES.has(root.status) &&
        destination?.origin === BASE.origin &&
        destination.pathname === "/today",
      "/ redirects directly to /today",
      `/ should redirect to /today (got ${root.status}${location ? ` → ${location}` : ""})`,
    );
    assertNoBetaRedirect("/", root);
  } catch (error) {
    bad(`/ front-door check failed: ${error.message}`);
  }

  for (const path of CORE_ROUTES) {
    try {
      const result = await request(path, { accept: "text/html" });
      checkedPages.set(path, result);
      healthyHtml(path, result);
    } catch (error) {
      bad(`${path} fetch failed: ${error.message}`);
    }
  }

  // `/api/health` is a liveness endpoint and deliberately stays HTTP 200 when
  // optional data sources degrade. Promotion safety therefore lives in its
  // JSON contract: every critical schema group and worker heartbeat must be
  // observed as current, and no primary decision surface may be on hold.
  try {
    const health = await request("/api/health", {
      accept: "application/json",
    });
    assertNoBetaRedirect("/api/health", health);
    check(
      health.status === 200,
      "/api/health preserves its liveness contract",
      `/api/health returned ${health.status}`,
    );
    let payload = null;
    try {
      payload = JSON.parse(health.body);
    } catch {
      bad("/api/health did not return valid JSON");
    }
    if (payload) {
      const gate = publicReadinessGate(payload);
      if (gate.passes) {
        ok("critical surface, migration, and heartbeat readiness is current");
      } else {
        for (const failure of gate.failures) {
          bad(`/api/health readiness: ${failure}`);
        }
      }
      if (gate.partialSurfaces.length > 0) {
        note(
          `honest fallback remains active on: ${gate.partialSurfaces.join(", ")}`,
        );
      }
    }
  } catch (error) {
    bad(`/api/health readiness check failed: ${error.message}`);
  }

  // Today and Events read the same durable archive, but Today has a tighter
  // presentation budget and a promoted-build fallback. A production incident
  // left the Events API healthy while /today silently rendered no event
  // section at all. The compact runtime endpoint is the independent canary:
  // it must be healthy, populated, and either represented in the server HTML
  // or backed by the explicit client recovery component.
  try {
    const result = await request("/api/today/events", {
      accept: "application/json",
    });
    assertNoBetaRedirect("/api/today/events", result);
    check(
      result.status === 200,
      "/api/today/events is available",
      `/api/today/events returned ${result.status}`,
    );
    let payload = null;
    try {
      payload = JSON.parse(result.body);
    } catch {
      bad("/api/today/events did not return valid JSON");
    }
    if (payload) {
      const events = Array.isArray(payload.events) ? payload.events : [];
      check(
        payload.partial === false,
        "Today reads the healthy event archive",
        `Today event coverage is partial (${JSON.stringify(payload.unavailable ?? [])})`,
      );
      check(
        events.length > 0,
        `Today has ${events.length} current event listing(s)`,
        "Today has no current event listings while the production archive is expected",
      );

      const todayHtml = checkedPages.get("/today")?.body || "";
      const rendered = new Set(eventDetailPathsFromHtml(todayHtml, BASE));
      const apiPaths = events
        .filter((event) => typeof event?.slug === "string")
        .map((event) => `/events/${event.slug}`);
      const shared = apiPaths.some((path) => rendered.has(path));
      const hasRecovery = todayHtml.includes(
        'data-today-event-recovery="true"',
      );
      check(
        events.length === 0 || shared || hasRecovery,
        shared
          ? "Today server-renders a current event"
          : "Today mounts its runtime event recovery",
        "Today dropped every current event and has no runtime recovery",
      );
    }
  } catch (error) {
    bad(`/api/today/events contract check failed: ${error.message}`);
  }

  // Installed-app contract: discover the linked manifest, verify its launch
  // target, then prove that target is the same healthy public Today route.
  try {
    const today = checkedPages.get("/today");
    const href = manifestHref(today?.body || "");
    const manifest = await request(href, {
      accept: "application/manifest+json, application/json",
    });
    assertNoBetaRedirect("manifest", manifest);
    check(
      manifest.status === 200,
      `${pathOf(href)} is available`,
      `${pathOf(href)} returned ${manifest.status}`,
    );
    let parsed = null;
    try {
      parsed = JSON.parse(manifest.body);
    } catch {
      bad(`${pathOf(href)} is not valid JSON`);
    }
    check(
      parsed?.start_url === "/today",
      "manifest start_url is /today",
      `manifest start_url is ${JSON.stringify(parsed?.start_url)}`,
    );
  } catch (error) {
    bad(`manifest contract failed: ${error.message}`);
  }

  // A stable place catches dynamic-route/build regressions.
  for (const path of [STABLE_PLACE_PATH]) {
    try {
      const result = await request(path, { accept: "text/html" });
      healthyHtml(path, result);
    } catch (error) {
      bad(`${path} deep-link fetch failed: ${error.message}`);
    }
  }

  // Follow every actual event anchor published by Today and Events. Extracting
  // href attributes (rather than searching the full Next document for slug-like
  // text) avoids crawling the serialized client payload or tucked inventory.
  // A source outage may render the event-specific Radius recovery screen only
  // if the route still fulfills its successful HTML response contract. Every
  // 5xx is a deployment failure, even when its body contains branded recovery
  // copy. Stale 404s and foreign responses fail as well.
  const eventPaths = new Set();
  for (const surface of ["/today", "/events"]) {
    const html = checkedPages.get(surface)?.body || "";
    for (const path of eventDetailPathsFromHtml(html, BASE)) {
      eventPaths.add(path);
    }
  }
  check(
    eventPaths.size > 0,
    `found ${eventPaths.size} rendered event deep link(s)`,
    "Today and Events did not expose a rendered event deep link",
  );
  const eventResults = await mapWithConcurrency(
    [...eventPaths],
    EVENT_LINK_CONCURRENCY,
    async (path) => {
      try {
        return {
          path,
          result: await request(path, { accept: "text/html" }),
          error: null,
        };
      } catch (error) {
        return { path, result: null, error };
      }
    },
  );
  const eventStates = [];
  for (const { path, result, error } of eventResults) {
    if (error || !result) {
      bad(`${path} event deep-link fetch failed: ${error?.message || "unknown error"}`);
      continue;
    }
    assertNoBetaRedirect(path, result);
    const state = classifyEventDetailResult(result, BASE);
    eventStates.push(state);
    if (state.kind === "healthy") {
      ok(`${path} is a healthy event detail`);
    } else if (state.kind === "recovery") {
      note(`${path} returned the Radius event recovery state`);
    } else {
      bad(`${path} event detail failed: ${state.reason}`);
    }
  }
  if (eventStates.length > 0) {
    const gate = eventDetailGateSummary(eventStates);
    check(
      gate.healthy > 0,
      `${gate.healthy} event detail(s) rendered real event content`,
      "all rendered event links fell back to recovery or failure",
    );
    check(
      gate.recovery <= gate.allowedRecoveries,
      `event recovery stayed within budget (${gate.recovery}/${gate.total})`,
      `event recovery exceeded budget (${gate.recovery}/${gate.total}; allowed ${gate.allowedRecoveries})`,
    );
  }

  // /sw.js is intentionally versioned by VERCEL_GIT_COMMIT_SHA. Cache-bust
  // the read so this checks the apex alias now, not a previously cached worker.
  try {
    const sw = await request(`/sw.js?canary=${Date.now()}`, {
      accept: "text/javascript, application/javascript",
    });
    assertNoBetaRedirect("/sw.js", sw);
    const match = sw.body.match(
      /CACHE_VERSION\s*=\s*["']fr-([a-f0-9]{6,40})/i,
    );
    const deployed = match?.[1]?.toLowerCase() || null;
    check(
      sw.status === 200 && Boolean(deployed),
      `deployed commit is ${deployed}`,
      `/sw.js did not expose a deployed commit (${sw.status})`,
    );
    if (!EXPECTED_SHA) {
      if (REQUIRE_EXPECTED_SHA) {
        bad("EXPECTED_SHA is required for the post-deploy alias gate");
      } else {
        note("EXPECTED_SHA not supplied; deploy identity was observed but not compared");
      }
    } else if (deployed) {
      check(
        deployed.startsWith(EXPECTED_SHA) ||
          EXPECTED_SHA.startsWith(deployed),
        `apex serves expected commit ${EXPECTED_SHA.slice(0, 12)}`,
        `ALIAS MISMATCH: apex serves ${deployed}, expected ${EXPECTED_SHA.slice(0, 12)}`,
      );
    }
  } catch (error) {
    bad(`/sw.js deploy-identity check failed: ${error.message}`);
  }

  // Preserve the focused trust checks from the original audit.
  const eventsHtml = checkedPages.get("/events")?.body || "";
  for (const term of ["Private Corp", "CANCELLED"]) {
    const count = (
      eventsHtml.match(new RegExp(term.replace(/ /g, "\\s+"), "gi")) || []
    ).length;
    check(
      count === 0,
      `/events has no "${term}" listing`,
      `/events still shows "${term}" (${count}×)`,
    );
  }

  const mapHtml = checkedPages.get("/map")?.body || "";
  const mapText = mapHtml
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const municipality =
    "Frederick|Brunswick|Thurmont|Middletown|Walkersville|Urbana|Emmitsburg|Mount Airy|New Market|Myersville|Woodsboro|Burkittsville|Rosemont";
  const vague = (
    mapText.match(
      new RegExp(`\\b(?:${municipality})\\s*·\\s*\\d{1,4}\\s?ft\\b`, "g"),
    ) || []
  ).length;
  check(
    vague === 0,
    "/map has no vague municipality-distance claims",
    `/map shows ${vague} vague municipality-distance claim(s)`,
  );

  for (const [path, result] of checkedPages) {
    const count = uncontrolledImgs(result.body);
    check(
      count === 0,
      `${path} renders no uncontrolled images`,
      `${path} renders ${count} uncontrolled image(s)`,
    );
  }

  console.log(
    `\n${
      failures === 0
        ? "PASS — apex, routes, install contract, deep links, and deploy identity agree."
        : `FAIL — ${failures} production canary check(s) failed.`
    }\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
