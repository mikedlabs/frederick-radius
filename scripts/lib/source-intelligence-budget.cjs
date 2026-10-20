"use strict";

const WORKFLOW_PATH = ".github/workflows/source-intelligence.yml";
const PLAN_RUN_NAME = "Source intelligence (plan)";
const LEGACY_RUN_NAMES = new Set([
  "Source intelligence pilot",
  "Source intelligence",
]);
const SPEND_POLICIES = Object.freeze({
  "tavily-scout": Object.freeze({
    provider: "tavily",
    liveRunName: "Source intelligence (tavily-live)",
    reservation: 12,
    dailyCeiling: 24,
    monthlyCeiling: 300,
  }),
  "firecrawl-watch": Object.freeze({
    provider: "firecrawl",
    liveRunName: "Source intelligence (firecrawl-live)",
    reservation: 1,
    dailyCeiling: 2,
    monthlyCeiling: 30,
  }),
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function timestamp(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  ) {
    throw new Error(`${label} is not a valid UTC timestamp.`);
  }
  const parsed = Date.parse(value);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)
  ) {
    throw new Error(`${label} is not a valid UTC timestamp.`);
  }
  return parsed;
}

function clock(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("The UTC budget window could not be determined.");
  }
  return date;
}

function exactKeys(value, keys, label) {
  if (
    !isObject(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  ) {
    throw new Error(`${label} has an invalid schema.`);
  }
}

function validateRun(run, repository, workflowId, now) {
  if (
    !isObject(run) ||
    !positiveInteger(run.id) ||
    !positiveInteger(run.run_attempt) ||
    run.workflow_id !== workflowId ||
    run.path !== WORKFLOW_PATH ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    typeof run.head_branch !== "string" ||
    !run.head_branch ||
    typeof run.display_title !== "string" ||
    !["schedule", "workflow_dispatch"].includes(run.event)
  ) {
    throw new Error("GitHub returned uncertain workflow-run history or provenance.");
  }
  const created = timestamp(run.created_at, "Workflow creation time");
  const updated = timestamp(run.updated_at, "Workflow update time");
  if (created > updated || updated > now.getTime() + 300_000) {
    throw new Error("GitHub returned uncertain workflow-run history dates.");
  }
}

function validateHistory(history, now) {
  if (
    !isObject(history) ||
    history.complete !== true ||
    typeof history.repository !== "string" ||
    !/^[\w.-]+\/[\w.-]+$/.test(history.repository) ||
    !positiveInteger(history.workflowId) ||
    !positiveInteger(history.currentRunId) ||
    !positiveInteger(history.currentAttempt) ||
    !Array.isArray(history.runs) ||
    history.totalCount !== history.runs.length ||
    history.runs.length === 0
  ) {
    throw new Error("Complete authenticated Source Intelligence history is required.");
  }
  const checked = timestamp(history.checkedAt, "History check time");
  if (Math.abs(checked - now.getTime()) > 300_000) {
    throw new Error("Source Intelligence history is stale; no recovery is allowed.");
  }
  const seen = new Set();
  for (const run of history.runs) {
    validateRun(run, history.repository, history.workflowId, now);
    if (seen.has(run.id)) {
      throw new Error("GitHub returned duplicate workflow runs; history is incomplete.");
    }
    seen.add(run.id);
  }
  const current = history.runs.find((run) => run.id === history.currentRunId);
  if (!current || current.head_branch !== "main") {
    throw new Error("The current main run is absent from durable GitHub history.");
  }
  if (current.run_attempt !== history.currentAttempt) {
    throw new Error("GitHub history has not indexed the exact current attempt.");
  }
  return current;
}

/** Read every page through the authenticated, exact-workflow GitHub API. */
async function readSourceIntelligenceHistory({
  github,
  repo,
  now = new Date(),
  currentRunId,
  currentAttempt,
}) {
  const date = clock(now);
  if (
    !repo ||
    !/^[\w.-]+$/.test(repo.owner ?? "") ||
    !/^[\w.-]+$/.test(repo.repo ?? "") ||
    !positiveInteger(currentRunId) ||
    !positiveInteger(currentAttempt)
  ) {
    throw new Error("GitHub did not provide a valid repository, run ID and attempt.");
  }
  const repository = `${repo.owner}/${repo.repo}`;
  const workflow = await github.rest.actions.getWorkflow({
    ...repo,
    workflow_id: "source-intelligence.yml",
  });
  if (!positiveInteger(workflow.data?.id) || workflow.data.path !== WORKFLOW_PATH) {
    throw new Error("GitHub did not resolve the exact Source Intelligence workflow.");
  }
  const runs = [];
  let totalCount;
  for (let page = 1; page <= 1000; page += 1) {
    const response = await github.rest.actions.listWorkflowRuns({
      ...repo,
      workflow_id: workflow.data.id,
      per_page: 100,
      page,
    });
    const data = response.data;
    if (
      !isObject(data) ||
      !nonnegativeInteger(data.total_count) ||
      !Array.isArray(data.workflow_runs) ||
      data.workflow_runs.length > 100 ||
      (totalCount !== undefined && data.total_count !== totalCount)
    ) {
      throw new Error("GitHub returned malformed or changing workflow history.");
    }
    totalCount = data.total_count;
    runs.push(...data.workflow_runs);
    if (runs.length === totalCount) break;
    if (runs.length > totalCount || data.workflow_runs.length === 0) {
      throw new Error("GitHub workflow history pagination is incomplete.");
    }
  }
  const history = {
    complete: true,
    repository,
    workflowId: workflow.data.id,
    currentRunId,
    currentAttempt,
    checkedAt: date.toISOString(),
    totalCount,
    runs,
  };
  validateHistory(history, date);
  return history;
}

function reservesProvider(run, policy) {
  if (run.head_branch !== "main" || run.display_title === PLAN_RUN_NAME) return false;
  if (LEGACY_RUN_NAMES.has(run.display_title)) return true;
  const known = Object.values(SPEND_POLICIES).find(
    (candidate) => candidate.liveRunName === run.display_title,
  );
  if (!known) {
    throw new Error("A main-branch run has an unrecognized spend classification.");
  }
  return known.provider === policy.provider;
}

function reservationBuckets(history, policy, now) {
  const days = {};
  const months = {};
  for (const run of history.runs) {
    if (!reservesProvider(run, policy)) continue;
    // Reruns conservatively reserve all attempts in the latest update window,
    // matching the existing paid guard. Never infer spend from a conclusion.
    const day = new Date(Math.min(Date.parse(run.updated_at), now.getTime()))
      .toISOString().slice(0, 10);
    const credits = run.run_attempt * policy.reservation;
    if (!nonnegativeInteger(credits)) {
      throw new Error("Workflow reservation counters overflowed; no recovery is allowed.");
    }
    for (const [buckets, key] of [[days, day], [months, day.slice(0, 7)]]) {
      const bucket = buckets[key] ?? { attemptedRequests: 0, attemptedCredits: 0 };
      // Each reserved credit is also a conservative upper bound on requests.
      bucket.attemptedRequests += credits;
      bucket.attemptedCredits += credits;
      if (!nonnegativeInteger(bucket.attemptedCredits)) {
        throw new Error("Workflow reservation counters overflowed; no recovery is allowed.");
      }
      buckets[key] = bucket;
    }
  }
  return { days, months };
}

/** Same reservation policy for paid preflight and zero-spend recovery. */
function calculateReservationFloor(history, {
  tool,
  now = new Date(),
  currentRunId = history.currentRunId,
  currentAttempt = history.currentAttempt,
  requireCurrentLive = true,
}) {
  const date = clock(now);
  const policy = SPEND_POLICIES[tool];
  if (!policy) throw new Error("The selected provider has no durable budget policy.");
  const current = validateHistory(history, date);
  if (currentRunId !== history.currentRunId || currentAttempt !== history.currentAttempt) {
    throw new Error("Current run context does not match authenticated GitHub history.");
  }
  const expectedTitle = requireCurrentLive ? policy.liveRunName : PLAN_RUN_NAME;
  if (
    typeof requireCurrentLive !== "boolean" ||
    current.display_title !== expectedTitle ||
    (!requireCurrentLive && current.event !== "workflow_dispatch")
  ) {
    throw new Error("GitHub history does not classify the exact current provider mode.");
  }
  const day = date.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const buckets = reservationBuckets(history, policy, date);
  const dailyReservedCredits = buckets.days[day]?.attemptedCredits ?? 0;
  const monthlyReservedCredits = buckets.months[month]?.attemptedCredits ?? 0;
  if (
    requireCurrentLive &&
    (dailyReservedCredits > policy.dailyCeiling || monthlyReservedCredits > policy.monthlyCeiling)
  ) {
    throw new Error(
      `${policy.provider} durable reservation ceiling reached: ${dailyReservedCredits}/${policy.dailyCeiling} credits today and ${monthlyReservedCredits}/${policy.monthlyCeiling} this UTC month. No provider request is allowed.`,
    );
  }
  return {
    provider: policy.provider,
    day,
    month,
    dailyReservedCredits,
    monthlyReservedCredits,
    dailyCeiling: policy.dailyCeiling,
    monthlyCeiling: policy.monthlyCeiling,
  };
}

function assertFirstProviderInitialization(history, options) {
  calculateReservationFloor(history, { ...options, requireCurrentLive: true });
  const policy = SPEND_POLICIES[options.tool];
  if (
    history.currentAttempt > 1 ||
    history.runs.some((run) =>
      run.id !== history.currentRunId && reservesProvider(run, policy),
    )
  ) {
    const remedy = policy.provider === "tavily"
      ? "Use the zero-spend tavily-recover mode."
      : "Restore authentic Firecrawl state before another request.";
    throw new Error(
      `initialize_state is only allowed for the first intentional ${policy.provider} live attempt. Prior reservations exist. ${remedy}`,
    );
  }
  return true;
}

function validBucketKey(key, kind) {
  if (kind === "months") return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  try { timestamp(`${key}T00:00:00Z`, "Ledger day"); return true; } catch { return false; }
}

function validateTavilyUsage(usage) {
  exactKeys(usage, ["schemaVersion", "timezone", "updatedAt", "days", "months"], "Tavily usage ledger");
  if (usage.schemaVersion !== 1 || usage.timezone !== "UTC") {
    throw new Error("Tavily usage ledger has an invalid schema.");
  }
  timestamp(usage.updatedAt, "Tavily ledger update time");
  for (const kind of ["days", "months"]) {
    if (!isObject(usage[kind])) throw new Error("Tavily usage ledger has invalid buckets.");
    for (const [key, bucket] of Object.entries(usage[kind])) {
      exactKeys(bucket, ["attemptedRequests", "attemptedCredits"], "Tavily usage bucket");
      if (!validBucketKey(key, kind) || !nonnegativeInteger(bucket.attemptedRequests) || !nonnegativeInteger(bucket.attemptedCredits)) {
        throw new Error("Tavily usage ledger has invalid counters or dates.");
      }
    }
  }
  return usage;
}

function validateTavilyCache(cache) {
  exactKeys(cache, ["schemaVersion", "reviewOnly", "entries"], "Tavily query cache");
  if (cache.schemaVersion !== 1 || cache.reviewOnly !== true || !isObject(cache.entries)) {
    throw new Error("Tavily query cache has an invalid schema.");
  }
  for (const [key, entry] of Object.entries(cache.entries)) {
    exactKeys(entry, ["cacheKey", "fetchedAt", "expiresAt", "result"], "Tavily cache entry");
    if (entry.cacheKey !== key || !/^[a-f0-9]{64}$/.test(key)) {
      throw new Error("Tavily cache entry has an invalid identity.");
    }
    if (timestamp(entry.fetchedAt, "Cache fetch time") > timestamp(entry.expiresAt, "Cache expiry time")) {
      throw new Error("Tavily cache entry has invalid dates.");
    }
    const result = entry.result;
    exactKeys(result, ["query", "candidates", "requestId", "responseTime", "credits"], "Tavily cached result");
    if (
      typeof result.query !== "string" || !result.query ||
      !Array.isArray(result.candidates) ||
      !(result.requestId === null || typeof result.requestId === "string") ||
      !(result.responseTime === null || typeof result.responseTime === "string" || (typeof result.responseTime === "number" && Number.isFinite(result.responseTime))) ||
      !(result.credits === null || (typeof result.credits === "number" && Number.isFinite(result.credits) && result.credits >= 0))
    ) throw new Error("Tavily cached result has invalid metadata.");
    for (const candidate of result.candidates) {
      exactKeys(candidate, ["url", "title", "score"], "Tavily cached candidate");
      let url;
      try { url = new URL(candidate.url); } catch { throw new Error("Tavily cached candidate has an invalid URL."); }
      if (
        !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        typeof candidate.url !== "string" || typeof candidate.title !== "string" ||
        typeof candidate.score !== "number" || !Number.isFinite(candidate.score)
      ) throw new Error("Tavily cached candidate has invalid metadata.");
    }
  }
  return cache;
}

function mergeBuckets(existing, floor) {
  const result = Object.fromEntries(Object.entries(existing).map(([key, bucket]) => [key, { ...bucket }]));
  let changed = false;
  for (const [key, reserved] of Object.entries(floor)) {
    const before = result[key];
    const after = {
      attemptedRequests: Math.max(before?.attemptedRequests ?? 0, reserved.attemptedRequests),
      attemptedCredits: Math.max(before?.attemptedCredits ?? 0, reserved.attemptedCredits),
    };
    if (!before || before.attemptedRequests !== after.attemptedRequests || before.attemptedCredits !== after.attemptedCredits) changed = true;
    result[key] = after;
  }
  return { buckets: result, changed };
}

/** Produce only compatible Scout state; perform no I/O or provider calls. */
function recoverTavilyState({ history, now = new Date(), existingUsage, existingCache }) {
  const date = clock(now);
  const floor = calculateReservationFloor(history, { tool: "tavily-scout", now: date, requireCurrentLive: false });
  if (existingUsage !== undefined) validateTavilyUsage(existingUsage);
  if (existingCache !== undefined) validateTavilyCache(existingCache);
  const reserved = reservationBuckets(history, SPEND_POLICIES["tavily-scout"], date);
  if (existingUsage === undefined && Object.keys(reserved.months).length === 0) {
    throw new Error("Tavily recovery has no historical reservations; do not initialize an empty ledger through recovery.");
  }
  const days = mergeBuckets(existingUsage?.days ?? {}, reserved.days);
  // A preserved daily counter may exceed the reconstructed history. Carry that
  // conservative value into the month too, rather than reducing its protection.
  const dayTotals = {};
  for (const [day, bucket] of Object.entries(days.buckets)) {
    const month = day.slice(0, 7);
    const total = dayTotals[month] ?? { attemptedRequests: 0, attemptedCredits: 0 };
    total.attemptedRequests += bucket.attemptedRequests;
    total.attemptedCredits += bucket.attemptedCredits;
    if (!nonnegativeInteger(total.attemptedRequests) || !nonnegativeInteger(total.attemptedCredits)) {
      throw new Error("Tavily usage counters overflowed; no recovery is allowed.");
    }
    dayTotals[month] = total;
  }
  const monthFloor = mergeBuckets(reserved.months, dayTotals);
  const months = mergeBuckets(existingUsage?.months ?? {}, monthFloor.buckets);
  const usageChanged = existingUsage === undefined || days.changed || months.changed;
  const cacheChanged = existingCache === undefined;
  const usage = usageChanged ? {
    schemaVersion: 1,
    timezone: "UTC",
    updatedAt: date.toISOString(),
    days: days.buckets,
    months: months.buckets,
  } : existingUsage;
  const cache = cacheChanged ? { schemaVersion: 1, reviewOnly: true, entries: {} } : existingCache;
  validateTavilyUsage(usage);
  return {
    usage,
    cache,
    usageChanged,
    cacheChanged,
    skipped: !usageChanged && !cacheChanged,
    recovery: {
      kind: "tavily-history-recovery",
      generatedAt: date.toISOString(),
      queryCache: cacheChanged ? "lost-rebuilt" : "preserved",
      dailyReservedCredits: floor.dailyReservedCredits,
      monthlyReservedCredits: floor.monthlyReservedCredits,
    },
  };
}

module.exports = {
  SPEND_POLICIES,
  assertFirstProviderInitialization,
  calculateReservationFloor,
  readSourceIntelligenceHistory,
  recoverTavilyState,
  validateTavilyCache,
  validateTavilyUsage,
};
