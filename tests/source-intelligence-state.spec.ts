import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, symlinkSync, rmSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const state = require("../scripts/lib/source-intelligence-state.cjs");
const budget = require("../scripts/lib/source-intelligence-budget.cjs");
const NOW = new Date("2026-10-08T14:32:00.000Z");
const ROOTS: string[] = [];
const USAGE_PATH = "scripts/reports/source-scout-usage.json";
const CACHE_PATH = "scripts/reports/source-scout-cache.json";
const WATCH_PATH = "scripts/reports/source-watch/state.json";
const PROVENANCE = {
  repository: "mikedlabs/frederick-radius", repositoryId: 7, workflowId: 10,
  workflowPath: ".github/workflows/source-intelligence.yml", ref: "refs/heads/main",
  headSha: "a".repeat(40), runId: 100, runAttempt: 1,
  createdAt: "2026-10-08T14:00:00Z", event: "schedule", runTitle: "Source intelligence (tavily-live)",
};
function root() {
  const directory = mkdtempSync(resolve(tmpdir(), "radius-state-"));
  ROOTS.push(directory);
  return directory;
}
function write(directory: string, relative: string, value: unknown) {
  const target = resolve(directory, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}
function usage(credits = 36) {
  return {
    schemaVersion: 1, timezone: "UTC", updatedAt: NOW.toISOString(),
    days: { "2026-10-08": { attemptedRequests: 6, attemptedCredits: 12 } },
    months: { "2026-10": { attemptedRequests: 18, attemptedCredits: credits } },
  };
}
function cache() { return { schemaVersion: 1, reviewOnly: true, entries: {} }; }
function watch() {
  return { version: 1, budget: { months: { "2026-10": { attemptedCredits: 2, lastReservedAt: NOW.toISOString() } } }, observations: {
    "weinberg-performances": { url: "https://weinbergcenter.org/shows/", finalUrl: "https://weinbergcenter.org/shows/", contentHash: "b".repeat(64), textLength: 300, linkCount: 4, firstObservedAt: NOW.toISOString(), lastChangedAt: NOW.toISOString(), lastCheckedAt: NOW.toISOString(), status: "new" },
  } };
}
function bundle(tool = "tavily-scout") {
  const directory = root();
  write(directory, USAGE_PATH, usage()); write(directory, CACHE_PATH, cache());
  if (tool === "firecrawl-watch") write(directory, WATCH_PATH, watch());
  const manifest = state.prepareStateCheckpoint({ root: directory, destination: "bundle", provenance: PROVENANCE, now: NOW, tool });
  return { directory, manifest };
}
function expected(provenance = PROVENANCE) {
  return { artifactId: 50, artifactName: "source-intelligence-state-v1-100-1", digest: `sha256:${"c".repeat(64)}`, createdAt: NOW.toISOString(), provenance };
}
function stage(directory: string, target: string) {
  mkdirSync(resolve(target, "staging"));
  for (const filename of readdirSync(resolve(directory, "bundle"))) copyFileSync(resolve(directory, "bundle", filename), resolve(target, "staging", filename));
}
function restore(target: string, tool = "tavily-scout") {
  return state.restoreStateCheckpoint({ root: target, staging: "staging", expected: expected(), tool, now: NOW });
}
function api(artifacts: ReturnType<typeof artifact>[]) {
  const run = { id: 100, run_attempt: 1, workflow_id: 10, path: PROVENANCE.workflowPath, head_branch: "main", head_sha: PROVENANCE.headSha,
    repository: { id: 7, full_name: PROVENANCE.repository }, head_repository: { id: 7, full_name: PROVENANCE.repository },
    event: "schedule", display_title: PROVENANCE.runTitle, created_at: PROVENANCE.createdAt, updated_at: NOW.toISOString() };
  return { run, github: { rest: {
    repos: { get: vi.fn(async () => ({ data: { id: 7, full_name: PROVENANCE.repository } })) },
    actions: {
      getWorkflow: vi.fn(async () => ({ data: { id: 10, path: PROVENANCE.workflowPath } })),
      getWorkflowRun: vi.fn(async () => ({ data: run })),
      getWorkflowRunAttempt: vi.fn(async () => ({ data: { ...run, run_attempt: 1 } })),
      listArtifactsForRepo: vi.fn(async () => ({ data: { total_count: artifacts.length, artifacts } })),
    },
  } } };
}
function artifact(overrides = {}) {
  return { id: 50, name: "source-intelligence-state-v1-100-1", size_in_bytes: 500, expired: false,
    created_at: NOW.toISOString(), expires_at: "2027-01-06T14:32:00.000Z", digest: `sha256:${"c".repeat(64)}`,
    workflow_run: { id: 100, repository_id: 7, head_repository_id: 7, head_branch: "main", head_sha: PROVENANCE.headSha }, ...overrides };
}
const REPO = { owner: "mikedlabs", repo: "frederick-radius" };
afterEach(() => { for (const directory of ROOTS.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("durable Source Intelligence state", () => {
  it("writes explicit absence of Firecrawl and restores exact Tavily bytes/counters", () => {
    const { directory, manifest } = bundle();
    expect(manifest.files[WATCH_PATH]).toEqual({ present: false });
    const target = root(); stage(directory, target);
    expect(restore(target).ready).toBe(true);
    expect(readFileSync(resolve(target, USAGE_PATH))).toEqual(readFileSync(resolve(directory, USAGE_PATH)));
    expect(JSON.parse(readFileSync(resolve(target, USAGE_PATH), "utf8")).months["2026-10"].attemptedCredits).toBe(36);
    expect(state.inspectLocalState({ root: target, tool: "firecrawl-watch" }).ready).toBe(false);
  });
  it("preserves Firecrawl comparison fingerprints and reserved credits", () => {
    const { directory } = bundle("firecrawl-watch");
    const target = root(); stage(directory, target); restore(target, "firecrawl-watch");
    expect(JSON.parse(readFileSync(resolve(target, WATCH_PATH), "utf8"))).toEqual(watch());
  });
  it("allows absent first initialization but rejects partial or malformed cache state", () => {
    const target = root();
    expect(state.inspectLocalState({ root: target, tool: "tavily-scout", allowUninitialized: true }).ready).toBe(false);
    write(target, USAGE_PATH, usage());
    expect(() => state.inspectLocalState({ root: target, tool: "tavily-scout", allowUninitialized: true })).toThrow("partial");
    write(target, CACHE_PATH, { schemaVersion: 1, reviewOnly: true, entries: [] });
    expect(() => state.inspectLocalState({ root: target, tool: "tavily-scout", allowUninitialized: true })).toThrow();
  });
  it("does not initialize a missing Firecrawl baseline during normal restore", () => {
    const { directory } = bundle(); const target = root(); stage(directory, target);
    expect(() => restore(target, "firecrawl-watch")).toThrow("no initialized state");
    expect(state.inspectLocalState({ root: target, tool: "firecrawl-watch" }).ready).toBe(false);
  });
  it("permits explicit first Firecrawl initialization after restoring unrelated Tavily state", () => {
    const { directory } = bundle(); const target = root(); stage(directory, target);
    expect(state.restoreStateCheckpoint({ root: target, staging: "staging", expected: expected(), tool: "firecrawl-watch", allowUninitialized: true, now: NOW }).ready).toBe(false);
    expect(state.inspectLocalState({ root: target, tool: "tavily-scout" }).ready).toBe(true);
  });
  it.each(["hash", "size", "path", "provenance", "missing", "extra", "directory", "symlink", "schema", "absent-extra", "timestamp"])("rejects %s corruption before installing any state", (kind) => {
    const { directory, manifest } = bundle(); const target = root(); stage(directory, target);
    if (kind === "hash") manifest.files[USAGE_PATH].sha256 = "d".repeat(64);
    if (kind === "size") manifest.files[USAGE_PATH].bytes += 1;
    if (kind === "path") manifest.files[USAGE_PATH].filename = "../../state.json";
    if (kind === "provenance") manifest.provenance = { ...PROVENANCE, ref: "refs/heads/other" };
    if (kind === "timestamp") manifest.generatedAt = "2026-10-09T00:00:00Z";
    if (kind === "missing") rmSync(resolve(target, "staging/source-scout-usage.json"));
    if (kind === "extra") write(target, "staging/secret.json", { token: "must-never-install" });
    if (kind === "directory") mkdirSync(resolve(target, "staging/unexpected"));
    if (kind === "symlink") { rmSync(resolve(target, "staging/source-scout-usage.json")); symlinkSync(resolve(directory, USAGE_PATH), resolve(target, "staging/source-scout-usage.json")); }
    if (kind === "schema") {
      write(target, "staging/source-scout-usage.json", { ...usage(), months: { "2026-10": { attemptedRequests: 0, attemptedCredits: -1 } } });
      const bytes = readFileSync(resolve(target, "staging/source-scout-usage.json"));
      manifest.files[USAGE_PATH].bytes = bytes.length; manifest.files[USAGE_PATH].sha256 = createHash("sha256").update(bytes).digest("hex");
    }
    if (kind === "absent-extra") manifest.files[WATCH_PATH] = { present: false, filename: "source-watch-state.json" };
    write(target, "staging/manifest.json", manifest);
    expect(() => restore(target)).toThrow();
    expect(state.inspectLocalState({ root: target, tool: "tavily-scout" }).ready).toBe(false);
  });
  it("never overwrites an existing partial ledger with an older artifact", () => {
    const { directory } = bundle(); const target = root(); stage(directory, target); write(target, USAGE_PATH, usage(250));
    expect(() => restore(target)).toThrow("overwrite existing");
    expect(JSON.parse(readFileSync(resolve(target, USAGE_PATH), "utf8")).months["2026-10"].attemptedCredits).toBe(250);
  });
  it("rejects symbolic links in output parents", () => {
    const target = root(); const outside = root(); mkdirSync(resolve(target, "scripts")); symlinkSync(outside, resolve(target, "scripts/reports"));
    expect(() => state.installValidatedScoutState({ root: target, usage: usage(), cache: cache() })).toThrow("symbolic link");
    expect(readdirSync(outside)).toEqual([]);
  });
  it("augments usage without reserializing an existing valid query cache", () => {
    const target = root(); write(target, USAGE_PATH, usage()); write(target, CACHE_PATH, cache());
    const cacheBytes = '{ "schemaVersion":1,"reviewOnly":true,"entries":{} }\n'; writeFileSync(resolve(target, CACHE_PATH), cacheBytes);
    state.installValidatedScoutState({ root: target, usage: usage(48), cache: cache(), usageChanged: true, cacheChanged: false });
    expect(readFileSync(resolve(target, CACHE_PATH), "utf8")).toBe(cacheBytes);
    expect(JSON.parse(readFileSync(resolve(target, USAGE_PATH), "utf8")).months["2026-10"].attemptedCredits).toBe(48);
    expect(state.inspectLocalState({ root: target, tool: "firecrawl-watch" }).ready).toBe(false);
  });
  it("records lost/rebuilt query cache without claiming a recovered comparison baseline", () => {
    const target = root(); state.installValidatedScoutState({ root: target, usage: usage(), cache: cache() });
    const recovery = { kind: "tavily-history-recovery", generatedAt: NOW.toISOString(), queryCache: "lost-rebuilt", dailyReservedCredits: 12, monthlyReservedCredits: 36 };
    const manifest = state.prepareStateCheckpoint({ root: target, destination: "bundle", provenance: { ...PROVENANCE, runTitle: "Source intelligence (plan)", event: "workflow_dispatch" }, recovery, now: NOW, tool: "tavily-recover" });
    expect(manifest.recovery).toEqual(recovery); expect(manifest.files[WATCH_PATH]).toEqual({ present: false });
  });
  it.each([7, 8, 0, "invalid", undefined])("rejects retention %s that cannot cover the longest scheduled gap", (cap) => {
    expect(() => state.checkpointRetentionDays(cap)).toThrow("eight-day");
  });
  it.each(["2026-02-30T14:32:00Z", "2026-10-08T14:32:00+00:00", "2026-10-08 14:32:00"])("rejects noncanonical Firecrawl date %s", (date) => {
    const value = watch(); value.observations["weinberg-performances"].lastCheckedAt = date;
    expect(() => state.validateFirecrawlState(value)).toThrow("date");
  });
  it("rejects future-dated usage and cache fetch evidence before a paid run", () => {
    const target = root(); const future = "2026-10-09T14:32:00.000Z";
    write(target, USAGE_PATH, { ...usage(), updatedAt: future }); write(target, CACHE_PATH, cache());
    expect(() => state.inspectLocalState({ root: target, tool: "tavily-scout", now: NOW })).toThrow("future");
    write(target, USAGE_PATH, usage());
    const key = "a".repeat(64);
    write(target, CACHE_PATH, { ...cache(), entries: { [key]: { cacheKey: key, fetchedAt: future, expiresAt: "2026-10-10T00:00:00Z", result: { query: "Frederick official sources", candidates: [], requestId: null, responseTime: null, credits: null } } } });
    expect(() => state.inspectLocalState({ root: target, tool: "tavily-scout", now: NOW })).toThrow("future");
  });
  it("bounds retention to repository limits and the requested ninety days", () => {
    expect(state.checkpointRetentionDays("30")).toBe(30); expect(state.checkpointRetentionDays("365")).toBe(90); expect(state.checkpointRetentionDays("9")).toBe(9);
  });
});

describe("trusted checkpoint metadata selection", () => {
  it("uses exact main/repo/workflow API identities and download digest", async () => {
    const { github } = api([artifact()]);
    const selected = await state.selectStateCheckpoint({ github, repo: REPO, now: NOW });
    expect(selected).toMatchObject(expected());
    expect(github.rest.actions.getWorkflow).toHaveBeenCalledWith({ ...REPO, workflow_id: "source-intelligence.yml" });
    expect(github.rest.actions.getWorkflowRun).toHaveBeenCalledWith({ ...REPO, run_id: 100 });
  });
  it("returns absence rather than inventing state when no checkpoint exists", async () => {
    expect(await state.selectStateCheckpoint({ github: api([]).github, repo: REPO, now: NOW })).toBeUndefined();
  });
  it.each([
    { name: "source-intelligence-state-v1-not-a-run" }, { size_in_bytes: 9_000_000 }, { digest: "" }, { expires_at: "2026-10-16T14:32:00.000Z" },
    { workflow_run: { id: 100, repository_id: 7, head_repository_id: 8, head_branch: "main", head_sha: PROVENANCE.headSha } },
  ])("blocks invalid newest evidence instead of falling back to an older ledger: %j", async (overrides) => {
    const older = artifact({ id: 49, created_at: "2026-10-07T14:32:00.000Z" });
    const { github } = api([older, artifact(overrides)]);
    await expect(state.selectStateCheckpoint({ github, repo: REPO, now: NOW })).rejects.toThrow();
  });
  it("treats authentic expired newest evidence as unavailable without restoring an older lower ledger", async () => {
    const older = artifact({ id: 49, created_at: "2026-10-07T14:32:00.000Z" });
    const expired = artifact({ id: 51, expired: true, created_at: "2026-06-01T14:32:00Z", expires_at: "2026-08-30T14:32:00Z" });
    // API metadata creation ordering must make the expired checkpoint newest;
    // a later-created valid artifact would instead be the current checkpoint.
    older.created_at = "2026-05-01T14:32:00Z";
    const { github, run } = api([older, expired]); run.created_at = "2026-05-01T14:00:00Z";
    expect(await state.selectStateCheckpoint({ github, repo: REPO, now: NOW })).toBeUndefined();
    expect(github.rest.actions.getWorkflowRun).toHaveBeenCalledTimes(1);
    const target = root();
    expect(state.inspectLocalState({ root: target, tool: "tavily-scout" }).ready).toBe(false);
    const history = {
      complete: true, repository: PROVENANCE.repository, workflowId: 10, currentRunId: 200, currentAttempt: 1,
      checkedAt: NOW.toISOString(), totalCount: 4,
      runs: [200, 199, 198, 197].map((id) => ({
        id, run_attempt: 1, workflow_id: 10, path: PROVENANCE.workflowPath,
        repository: { full_name: PROVENANCE.repository }, head_repository: { full_name: PROVENANCE.repository },
        head_branch: "main", event: "workflow_dispatch", display_title: id === 200 ? "Source intelligence (plan)" : PROVENANCE.runTitle,
        created_at: id === 200 ? "2026-10-08T14:00:00Z" : `2026-10-0${id - 196}T14:00:00Z`,
        updated_at: NOW.toISOString(), status: "completed", conclusion: "failure",
      })),
    };
    const recovered = budget.recoverTavilyState({ history, now: NOW });
    state.installValidatedScoutState({ root: target, ...recovered });
    expect(recovered.recovery.queryCache).toBe("lost-rebuilt");
    expect(recovered.recovery.monthlyReservedCredits).toBe(36);
    expect(state.inspectLocalState({ root: target, tool: "tavily-scout", now: NOW }).ready).toBe(true);
    expect(state.inspectLocalState({ root: target, tool: "firecrawl-watch", now: NOW }).ready).toBe(false);
  });
  it.each(["fork", "branch", "workflow", "path", "event", "title"])("rejects %s run provenance", async (kind) => {
    const { github, run } = api([artifact()]);
    if (kind === "fork") run.head_repository = { id: 8, full_name: "other/repo" };
    if (kind === "branch") run.head_branch = "feature";
    if (kind === "workflow") run.workflow_id = 11;
    if (kind === "path") run.path = ".github/workflows/other.yml";
    if (kind === "event") run.event = "pull_request";
    if (kind === "title") run.display_title = "unknown";
    await expect(state.selectStateCheckpoint({ github, repo: REPO, now: NOW })).rejects.toThrow("trusted workflow");
  });
  it("uses the exact prior attempt when a later attempt exists", async () => {
    const { github, run } = api([artifact()]); run.run_attempt = 2;
    const selected = await state.selectStateCheckpoint({ github, repo: REPO, now: NOW });
    expect(selected.provenance.runAttempt).toBe(1);
    expect(github.rest.actions.getWorkflowRunAttempt).toHaveBeenCalledWith({ ...REPO, run_id: 100, attempt_number: 1 });
  });
  it("rejects incomplete or changing artifact pagination", async () => {
    const { github } = api([artifact()]);
    github.rest.actions.listArtifactsForRepo.mockResolvedValue({ data: { total_count: 2, artifacts: [artifact()] } });
    await expect(state.selectStateCheckpoint({ github, repo: REPO, now: NOW })).rejects.toThrow("pagination");
  });
});
