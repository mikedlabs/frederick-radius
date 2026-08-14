import { publicReadinessGate } from "./lib/prod-audit-readiness.mjs";
import {
  publicEventReadGate,
  publicFoodTruckBeaconGate,
  publicFoodTruckScheduleGate,
} from "./lib/prod-audit-data.mjs";
import {
  classifyEventDetailResult,
  eventDetailGateSummary,
  eventDetailPathsFromHtml,
  mapWithConcurrency,
} from "./lib/prod-audit-events.mjs";

/**
 * Public-data acceptance canary.
 *
 * This intentionally runs outside the rollback-capable deployment job. A red
 * result opens a visible data-health issue, but an upstream feed outage cannot
 * roll back otherwise healthy application code.
 */
const BASE = new URL(
  (process.env.BASE_URL || "https://frederickradius.app").replace(/\/?$/, "/"),
);
const REQUEST_TIMEOUT_MS = Number(process.env.CANARY_TIMEOUT_MS) || 20_000;
const MIN_PUBLIC_EVENT_COUNT = Number(process.env.MIN_PUBLIC_EVENT_COUNT) || 20;
const MIN_PUBLIC_EVENT_SOURCE_COUNT =
  Number(process.env.MIN_PUBLIC_EVENT_SOURCE_COUNT) || 8;
const MIN_FOOD_TRUCK_SOURCE_COUNT =
  Number(process.env.MIN_FOOD_TRUCK_SOURCE_COUNT) || 5;
const USER_AGENT = "frederick-radius-data-canary/1";
const EVENT_LINK_CONCURRENCY = 4;
let failures = 0;

const ok = (message) => console.log(`  ✓ ${message}`);
const note = (message) => console.log(`  · ${message}`);
const bad = (message) => {
  failures += 1;
  console.log(`  ✗ ${message}`);
};
const uncontrolledImgs = (body) =>
  (
    body.match(
      /<img\b[^>]*\bsrc="[^"]*(?:wikimedia|upload\.wikimedia)[^"]*"/gi,
    ) || []
  ).length;

async function json(path) {
  const response = await fetch(new URL(path, BASE), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      "User-Agent": USER_AGENT,
    },
  });
  if (response.status !== 200) {
    throw new Error(`${path} returned ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${path} returned ${contentType || "no content type"}`);
  }
  return response.json();
}

async function html(path) {
  const response = await fetch(new URL(path, BASE), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "text/html",
      "Cache-Control": "no-cache",
      "User-Agent": USER_AGENT,
    },
  });
  const body = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body,
    url: response.url,
    externalRedirect: false,
  };
}

async function runGate(label, loader, evaluate, describe) {
  try {
    const payload = await loader();
    const gate = evaluate(payload);
    if (gate.passes) ok(describe(gate));
    else for (const failure of gate.failures) bad(`${label}: ${failure}`);
    for (const warning of gate.warnings || []) note(`${label}: ${warning}`);
  } catch (error) {
    bad(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`\nProduction data canary → ${BASE.origin}\n`);

await runGate(
  "/api/health",
  () => json("/api/health"),
  publicReadinessGate,
  () => "public readiness contract is current",
);
await runGate(
  "/api/events/browse",
  () => json("/api/events/browse"),
  (payload) =>
    publicEventReadGate(payload, {
      minimumEvents: MIN_PUBLIC_EVENT_COUNT,
      minimumSources: MIN_PUBLIC_EVENT_SOURCE_COUNT,
    }),
  (gate) => `public event read exposes ${gate.count} upcoming occurrence(s)`,
);
await runGate(
  "/api/food-trucks/status",
  () => json("/api/food-trucks/status"),
  (payload) =>
    publicFoodTruckScheduleGate(payload, {
      minimumSources: MIN_FOOD_TRUCK_SOURCE_COUNT,
    }),
  (gate) =>
    `public food-truck schedule exposes ${gate.stopCount} stop(s) from ${gate.sourceCount} source(s)`,
);
await runGate(
  "/api/food-trucks/live",
  () => json("/api/food-trucks/live"),
  publicFoodTruckBeaconGate,
  (gate) => `public food-truck beacon read contains ${gate.count} active check-in(s)`,
);

// Follow the event links a person can actually see. This belongs here rather
// than in the rollback-capable canary because empty or recovering event data
// is an operational failure, not evidence that the deployed code is broken.
const surfaceHtml = new Map();
const eventPaths = new Set();
for (const surface of ["/today", "/events", "/map", "/ask"]) {
  try {
    const result = await html(surface);
    if (
      result.status !== 200 ||
      !(result.headers.get("content-type") || "").includes("text/html")
    ) {
      bad(`${surface}: rendered surface returned ${result.status}`);
      continue;
    }
    surfaceHtml.set(surface, result.body);
    if (surface === "/today" || surface === "/events") {
      for (const path of eventDetailPathsFromHtml(result.body, BASE)) {
        eventPaths.add(path);
      }
    }
  } catch (error) {
    bad(`${surface}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const eventsHtml = surfaceHtml.get("/events") || "";
for (const term of ["Private Corp", "CANCELLED"]) {
  const count = (
    eventsHtml.match(new RegExp(term.replace(/ /g, "\\s+"), "gi")) || []
  ).length;
  if (count > 0) bad(`/events still shows ${JSON.stringify(term)} (${count}x)`);
}

const mapText = (surfaceHtml.get("/map") || "")
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
if (vague > 0) bad(`/map shows ${vague} vague municipality-distance claim(s)`);

for (const [surface, body] of surfaceHtml) {
  const count = uncontrolledImgs(body);
  if (count > 0) bad(`${surface} renders ${count} uncontrolled image(s)`);
}

if (eventPaths.size === 0) {
  bad("rendered event inventory exposes no event deep links");
} else {
  const results = await mapWithConcurrency(
    [...eventPaths],
    EVENT_LINK_CONCURRENCY,
    async (path) => {
      try {
        return { path, result: await html(path), error: null };
      } catch (error) {
        return { path, result: null, error };
      }
    },
  );
  const states = [];
  for (const { path, result, error } of results) {
    if (error || !result) {
      bad(`${path}: ${error instanceof Error ? error.message : "request failed"}`);
      continue;
    }
    const state = classifyEventDetailResult(result, BASE);
    states.push(state);
    if (state.kind === "failure") bad(`${path}: ${state.reason}`);
  }
  const gate = eventDetailGateSummary(states);
  if (gate.healthy === 0) {
    bad("all rendered event links fell back to recovery or failure");
  }
  if (gate.recovery > gate.allowedRecoveries) {
    bad(
      `event recovery exceeded budget (${gate.recovery}/${gate.total}; allowed ${gate.allowedRecoveries})`,
    );
  } else {
    ok(
      `${gate.healthy} healthy event detail(s); recovery ${gate.recovery}/${gate.total}`,
    );
  }
}

if (failures > 0) {
  console.error(`\nProduction data canary failed with ${failures} issue(s).\n`);
  process.exitCode = 1;
} else {
  console.log("\nProduction data canary passed.\n");
}
