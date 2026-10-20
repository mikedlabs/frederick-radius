"use strict";

// Checkpoints are evidence from this exact workflow on main, never provider data
// promoted into the application. The cache is an optimization, not the ledger.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require("node:crypto");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateTavilyUsage, validateTavilyCache } = require("./source-intelligence-budget.cjs");

const WORKFLOW_PATH = ".github/workflows/source-intelligence.yml";
const CHECKPOINT_PREFIX = "source-intelligence-state-v1-";
const STATE_FILES = Object.freeze({
  "scripts/reports/source-scout-cache.json": "source-scout-cache.json",
  "scripts/reports/source-scout-usage.json": "source-scout-usage.json",
  "scripts/reports/source-watch/state.json": "source-watch-state.json",
});
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 3 * MAX_FILE_BYTES + 64 * 1024;
const LIVE_TITLES = new Set([
  "Source intelligence (tavily-live)",
  "Source intelligence (firecrawl-live)",
  "Source intelligence (plan)",
]);

function assert(value, message) {
  if (!value) throw new Error(`Source state: ${message}; no provider request is allowed.`);
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value, keys, label) {
  assert(object(value) && Object.keys(value).every((key) => keys.includes(key)), `${label} has an invalid schema`);
}
function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function counter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}
function month(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
function hash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function publicUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      !["localhost", "localhost.localdomain"].includes(url.hostname) &&
      !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) && !url.hostname.includes(":") &&
      url.hostname.includes(".");
  } catch { return false; }
}

function checkpointRetentionDays(configured) {
  const cap = Number(configured);
  assert(Number.isSafeInteger(cap) && cap >= 9, "artifact retention must cover the longest eight-day scheduled gap (at least nine days)");
  return Math.min(90, cap);
}

function validateFirecrawlState(state) {
  exactKeys(state, ["version", "budget", "observations"], "Firecrawl state");
  assert(state.version === 1 && object(state.observations), "Firecrawl version or observations are invalid");
  exactKeys(state.budget, ["months"], "Firecrawl budget");
  assert(object(state.budget.months), "Firecrawl monthly ledger is invalid");
  for (const [key, entry] of Object.entries(state.budget.months)) {
    exactKeys(entry, ["attemptedCredits", "lastReservedAt"], "Firecrawl budget bucket");
    assert(month(key) && counter(entry.attemptedCredits) &&
      (entry.lastReservedAt === undefined || timestamp(entry.lastReservedAt)), "Firecrawl monthly reservation is invalid");
  }
  for (const [id, observation] of Object.entries(state.observations)) {
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), "Firecrawl source ID is invalid");
    exactKeys(observation, ["url", "finalUrl", "contentHash", "textLength", "linkCount", "firstObservedAt", "lastChangedAt", "lastCheckedAt", "status", "errorCode", "httpStatus", "identityResetAt"], "Firecrawl observation");
    assert(publicUrl(observation.url) && (observation.finalUrl === undefined || publicUrl(observation.finalUrl)), "Firecrawl source URL is invalid");
    assert(["new", "same", "changed", "removed", "error"].includes(observation.status) && timestamp(observation.lastCheckedAt), "Firecrawl observation status or date is invalid");
    for (const field of ["firstObservedAt", "lastChangedAt", "identityResetAt"]) {
      assert(observation[field] === undefined || timestamp(observation[field]), `Firecrawl ${field} is invalid`);
    }
    for (const field of ["textLength", "linkCount"]) {
      assert(observation[field] === undefined || counter(observation[field]), `Firecrawl ${field} is invalid`);
    }
    assert(observation.contentHash === undefined || /^[a-f0-9]{64}$/.test(observation.contentHash), "Firecrawl content hash is invalid");
    assert(!["new", "same", "changed"].includes(observation.status) || observation.contentHash !== undefined, "Firecrawl successful observation has no comparison hash");
    assert(observation.errorCode === undefined || (typeof observation.errorCode === "string" && observation.errorCode.length <= 100), "Firecrawl error code is invalid");
    assert(observation.httpStatus === undefined || (Number.isInteger(observation.httpStatus) && observation.httpStatus >= 100 && observation.httpStatus <= 599), "Firecrawl HTTP status is invalid");
  }
  return state;
}

function assertSafeParents(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  assert(resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`), "state path escapes the workspace");
  const relative = path.relative(resolvedRoot, resolvedTarget);
  let current = resolvedRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      assert(!stat.isSymbolicLink(), "state path contains a symbolic link");
      assert(current === resolvedTarget || stat.isDirectory(), "state parent is not a directory");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
function readJsonFile(root, relative, maximum = MAX_FILE_BYTES) {
  const target = path.resolve(root, relative);
  assertSafeParents(root, target);
  let stat;
  try { stat = fs.lstatSync(target); } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
  assert(stat.isFile() && stat.size <= maximum && stat.size > 0, `${relative} is not a bounded regular file`);
  const bytes = fs.readFileSync(target);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch {
    throw new Error(`Source state: ${relative} contains malformed JSON; no provider request is allowed.`);
  }
  return { bytes, value };
}
function validateState(relative, value, now = new Date()) {
  const ceiling = new Date(now).getTime() + 300000;
  const notFuture = (date) => assert(Date.parse(date) <= ceiling, "state evidence is dated in the future");
  if (relative.endsWith("source-scout-cache.json")) {
    validateTavilyCache(value);
    for (const entry of Object.values(value.entries)) notFuture(entry.fetchedAt);
  } else if (relative.endsWith("source-scout-usage.json")) {
    validateTavilyUsage(value);
    notFuture(value.updatedAt);
  } else {
    validateFirecrawlState(value);
    for (const entry of Object.values(value.budget.months)) if (entry.lastReservedAt) notFuture(entry.lastReservedAt);
    for (const entry of Object.values(value.observations)) {
      for (const field of ["firstObservedAt", "lastChangedAt", "lastCheckedAt", "identityResetAt"]) {
        if (entry[field]) notFuture(entry[field]);
      }
    }
  }
}
function requiresState(tool, files) {
  assert(["tavily-scout", "tavily-recover", "firecrawl-watch"].includes(tool), "selected state tool is invalid");
  return tool === "firecrawl-watch"
    ? Boolean(files["scripts/reports/source-watch/state.json"])
    : Boolean(files["scripts/reports/source-scout-cache.json"] && files["scripts/reports/source-scout-usage.json"]);
}
function inspectLocalState({ root, tool, allowUninitialized = false, now = new Date() }) {
  const files = {};
  for (const relative of Object.keys(STATE_FILES)) {
    const file = readJsonFile(root, relative);
    if (file) validateState(relative, file.value, now);
    files[relative] = file;
  }
  const ready = requiresState(tool, files);
  // Initialization applies only to genuinely absent state, never malformed or
  // half-present ledgers that would silently lose comparison/budget evidence.
  if (!ready && allowUninitialized) {
    const selected = tool === "firecrawl-watch"
      ? ["scripts/reports/source-watch/state.json"]
      : ["scripts/reports/source-scout-cache.json", "scripts/reports/source-scout-usage.json"];
    assert(selected.every((relative) => !files[relative]), "partial state cannot be initialized");
  }
  return { files, ready, initialized: ready };
}

async function readCheckpointProvenance({ github, repo, runId, attempt, now = new Date() }) {
  assert(positiveInteger(runId) && positiveInteger(attempt), "run ID or attempt is invalid");
  const repository = (await github.rest.repos.get(repo)).data;
  const workflow = (await github.rest.actions.getWorkflow({ ...repo, workflow_id: "source-intelligence.yml" })).data;
  assert(positiveInteger(repository.id) && repository.full_name === `${repo.owner}/${repo.repo}`, "repository identity is uncertain");
  assert(positiveInteger(workflow.id) && workflow.path === WORKFLOW_PATH, "workflow identity is uncertain");
  let run = (await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId })).data;
  if (run.run_attempt !== attempt) {
    assert(run.run_attempt > attempt, "requested attempt is absent from GitHub");
    run = (await github.rest.actions.getWorkflowRunAttempt({ ...repo, run_id: runId, attempt_number: attempt })).data;
  }
  assert(run.id === runId && run.run_attempt === attempt && run.workflow_id === workflow.id &&
    run.path === WORKFLOW_PATH && run.head_branch === "main" &&
    run.repository?.id === repository.id && run.head_repository?.id === repository.id &&
    run.repository?.full_name === repository.full_name && run.head_repository?.full_name === repository.full_name &&
    ["schedule", "workflow_dispatch"].includes(run.event) && LIVE_TITLES.has(run.display_title) &&
    /^[a-f0-9]{40}$/.test(run.head_sha), "run is not this trusted workflow on main");
  assert(timestamp(run.created_at) && timestamp(run.updated_at) &&
    Date.parse(run.updated_at) <= new Date(now).getTime() + 300000, "run dates are uncertain");
  return {
    repository: repository.full_name,
    repositoryId: repository.id,
    workflowId: workflow.id,
    workflowPath: WORKFLOW_PATH,
    ref: "refs/heads/main",
    headSha: run.head_sha,
    runId,
    runAttempt: attempt,
    createdAt: run.created_at,
    event: run.event,
    runTitle: run.display_title,
  };
}

async function selectStateCheckpoint({ github, repo, now = new Date() }) {
  const artifacts = [];
  let expectedTotal;
  for (let page = 1; page <= 100; page += 1) {
    const { data } = await github.rest.actions.listArtifactsForRepo({ ...repo, per_page: 100, page });
    assert(object(data) && counter(data.total_count) && Array.isArray(data.artifacts), "artifact listing is malformed");
    expectedTotal ??= data.total_count;
    assert(data.total_count === expectedTotal && expectedTotal <= 10000, "artifact listing changed or is incomplete");
    artifacts.push(...data.artifacts);
    assert(artifacts.length <= expectedTotal, "artifact pagination exceeded its total");
    if (artifacts.length === expectedTotal) break;
    assert(data.artifacts.length === 100, "artifact pagination ended before its total");
  }
  assert(artifacts.length === expectedTotal && new Set(artifacts.map((item) => item.id)).size === artifacts.length, "artifact history is incomplete or duplicated");
  const candidates = artifacts.filter((item) => typeof item.name === "string" && item.name.startsWith(CHECKPOINT_PREFIX));
  for (const candidate of candidates) {
    assert(positiveInteger(candidate.id) && timestamp(candidate.created_at), "checkpoint metadata is malformed");
  }
  candidates.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const artifact = candidates[0];
  if (!artifact) return undefined;
  // The newest checkpoint may contain the greatest reservations. A malformed
  // newest record must stop recovery; choosing an older one can lower budgets.
  const match = /^source-intelligence-state-v1-([1-9]\d*)-([1-9]\d*)$/.exec(artifact.name);
  const nowMs = new Date(now).getTime();
  assert(match && typeof artifact.expired === "boolean" && timestamp(artifact.expires_at) &&
    Date.parse(artifact.expires_at) - Date.parse(artifact.created_at) >= 9 * 86400000 &&
    Date.parse(artifact.created_at) <= nowMs + 300000 &&
    positiveInteger(artifact.size_in_bytes) && artifact.size_in_bytes <= MAX_ARTIFACT_BYTES &&
    /^sha256:[a-f0-9]{64}$/.test(artifact.digest), "newest checkpoint is expired, oversized, or invalid");
  const provenance = await readCheckpointProvenance({ github, repo, runId: Number(match[1]), attempt: Number(match[2]), now });
  assert(artifact.workflow_run?.id === provenance.runId &&
    artifact.workflow_run?.repository_id === provenance.repositoryId &&
    artifact.workflow_run?.head_repository_id === provenance.repositoryId &&
    artifact.workflow_run?.head_branch === "main" &&
    artifact.workflow_run?.head_sha === provenance.headSha, "artifact run provenance is invalid");
  // An authentic expired checkpoint is unavailable, not corrupt evidence. Do
  // not try an older ledger. Only explicit zero-spend history recovery can
  // proceed without a usable snapshot; the paid missing-state guard still stops.
  if (artifact.expired || Date.parse(artifact.expires_at) <= nowMs) return undefined;
  return { artifactId: artifact.id, artifactName: artifact.name, digest: artifact.digest, createdAt: artifact.created_at, provenance };
}

function validateProvenance(provenance) {
  exactKeys(provenance, ["repository", "repositoryId", "workflowId", "workflowPath", "ref", "headSha", "runId", "runAttempt", "createdAt", "event", "runTitle"], "checkpoint provenance");
  assert(typeof provenance.repository === "string" && /^[\w.-]+\/[\w.-]+$/.test(provenance.repository) &&
    positiveInteger(provenance.repositoryId) && positiveInteger(provenance.workflowId) &&
    provenance.workflowPath === WORKFLOW_PATH && provenance.ref === "refs/heads/main" &&
    /^[a-f0-9]{40}$/.test(provenance.headSha) && positiveInteger(provenance.runId) &&
    positiveInteger(provenance.runAttempt) && timestamp(provenance.createdAt) &&
    ["schedule", "workflow_dispatch"].includes(provenance.event) && LIVE_TITLES.has(provenance.runTitle), "checkpoint provenance is invalid");
}
function validateRecovery(recovery) {
  if (recovery === undefined) return;
  exactKeys(recovery, ["kind", "generatedAt", "queryCache", "dailyReservedCredits", "monthlyReservedCredits"], "recovery evidence");
  assert(recovery.kind === "tavily-history-recovery" && timestamp(recovery.generatedAt) &&
    ["preserved", "lost-rebuilt"].includes(recovery.queryCache) && counter(recovery.dailyReservedCredits) &&
    counter(recovery.monthlyReservedCredits) && recovery.monthlyReservedCredits >= recovery.dailyReservedCredits, "recovery evidence is invalid");
}
function atomicWrite(root, relative, bytes) {
  const target = path.resolve(root, relative);
  assertSafeParents(root, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${crypto.randomUUID()}`;
  try { fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 }); fs.renameSync(temporary, target); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function installValidatedScoutState({ root, usage, cache, usageChanged = true, cacheChanged = true }) {
  validateTavilyUsage(usage);
  validateTavilyCache(cache);
  // Validate all existing evidence before either write. Valid cache bytes are
  // preserved when only the conservative usage floor needs augmentation.
  inspectLocalState({ root, tool: "tavily-recover" });
  const usageBytes = `${JSON.stringify(usage, null, 2)}\n`;
  const cacheBytes = `${JSON.stringify(cache, null, 2)}\n`;
  assert(Buffer.byteLength(usageBytes) <= MAX_FILE_BYTES && Buffer.byteLength(cacheBytes) <= MAX_FILE_BYTES, "recovered state exceeds the bounded checkpoint size");
  if (usageChanged) atomicWrite(root, "scripts/reports/source-scout-usage.json", usageBytes);
  if (cacheChanged) atomicWrite(root, "scripts/reports/source-scout-cache.json", cacheBytes);
}
function prepareStateCheckpoint({ root, destination, provenance, recovery, now = new Date(), tool }) {
  validateProvenance(provenance);
  validateRecovery(recovery);
  const { files, ready } = inspectLocalState({ root, tool, now });
  assert(ready, "selected provider state is missing; no checkpoint can be created");
  const manifest = { schemaVersion: 1, generatedAt: new Date(now).toISOString(), provenance, files: {} };
  if (recovery) manifest.recovery = recovery;
  for (const [relative, filename] of Object.entries(STATE_FILES)) {
    const file = files[relative];
    manifest.files[relative] = file ? { present: true, filename, bytes: file.bytes.length, sha256: hash(file.bytes) } : { present: false };
  }
  const directory = path.resolve(root, destination);
  assertSafeParents(root, directory);
  // Never mingle a checkpoint with stale files from another operation.
  if (fs.existsSync(directory)) assert(fs.readdirSync(directory).length === 0, "checkpoint destination is not empty");
  else fs.mkdirSync(directory, { recursive: true });
  for (const [relative, filename] of Object.entries(STATE_FILES)) {
    if (files[relative]) atomicWrite(root, path.join(destination, filename), files[relative].bytes);
  }
  atomicWrite(root, path.join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
function restoreStateCheckpoint({ root, staging, expected, tool, allowUninitialized = false, now = new Date() }) {
  assert(object(expected) && positiveInteger(expected.artifactId) && /^sha256:[a-f0-9]{64}$/.test(expected.digest), "expected artifact identity is invalid");
  validateProvenance(expected.provenance);
  const directory = path.resolve(root, staging);
  assertSafeParents(root, directory);
  assert(fs.lstatSync(directory).isDirectory(), "checkpoint staging directory is invalid");
  const actual = fs.readdirSync(directory);
  const manifestFile = readJsonFile(root, path.join(staging, "manifest.json"), 64 * 1024);
  assert(manifestFile, "checkpoint manifest is absent");
  const manifest = manifestFile.value;
  exactKeys(manifest, ["schemaVersion", "generatedAt", "provenance", "files", "recovery"], "checkpoint manifest");
  assert(manifest.schemaVersion === 1 && timestamp(manifest.generatedAt) &&
    Date.parse(manifest.generatedAt) >= Date.parse(expected.provenance.createdAt) &&
    Date.parse(manifest.generatedAt) <= new Date(now).getTime() + 300000, "checkpoint generation date is invalid");
  validateProvenance(manifest.provenance);
  assert(Object.keys(expected.provenance).every((key) => expected.provenance[key] === manifest.provenance[key]), "checkpoint manifest does not match GitHub provenance");
  validateRecovery(manifest.recovery);
  exactKeys(manifest.files, Object.keys(STATE_FILES), "checkpoint file map");
  assert(Object.keys(manifest.files).length === Object.keys(STATE_FILES).length, "checkpoint must explicitly declare every state file");
  const files = {};
  const allowlist = ["manifest.json"];
  for (const [relative, filename] of Object.entries(STATE_FILES)) {
    const entry = manifest.files[relative];
    assert(object(entry) && typeof entry.present === "boolean", "checkpoint presence is invalid");
    if (!entry.present) {
      exactKeys(entry, ["present"], "absent checkpoint file");
      files[relative] = undefined;
      continue;
    }
    exactKeys(entry, ["present", "filename", "bytes", "sha256"], "checkpoint file");
    assert(entry.filename === filename && positiveInteger(entry.bytes) && entry.bytes <= MAX_FILE_BYTES && /^[a-f0-9]{64}$/.test(entry.sha256), "checkpoint filename, size, or hash is invalid");
    const file = readJsonFile(root, path.join(staging, filename));
    assert(file && file.bytes.length === entry.bytes && hash(file.bytes) === entry.sha256, "checkpoint file hash does not match");
    validateState(relative, file.value, now);
    files[relative] = file;
    allowlist.push(filename);
  }
  assert(actual.length === allowlist.length && actual.every((filename) => allowlist.includes(filename)), "checkpoint contains unexpected paths or files");
  assert(requiresState(tool, files) || tool === "tavily-recover" || allowUninitialized, "checkpoint has no initialized state for the selected provider");
  if (!requiresState(tool, files) && allowUninitialized) {
    const selected = tool === "firecrawl-watch" ? ["scripts/reports/source-watch/state.json"] : ["scripts/reports/source-scout-cache.json", "scripts/reports/source-scout-usage.json"];
    assert(selected.every((relative) => !files[relative]), "partial checkpoint state cannot be initialized");
  }
  // Cache-miss restore must not overwrite a partial ledger or later local
  // evidence. That ambiguity requires recovery, not an older snapshot.
  const existing = inspectLocalState({ root, tool, now });
  assert(Object.values(existing.files).every((file) => file === undefined), "artifact restore would overwrite existing state");
  for (const [relative, file] of Object.entries(files)) {
    if (file) atomicWrite(root, relative, file.bytes);
  }
  return { manifest, ready: requiresState(tool, files) };
}

module.exports = {
  CHECKPOINT_PREFIX, STATE_FILES, checkpointRetentionDays, validateFirecrawlState, inspectLocalState,
  readCheckpointProvenance, selectStateCheckpoint, restoreStateCheckpoint,
  prepareStateCheckpoint, installValidatedScoutState,
};
