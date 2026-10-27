import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const { AUTOMATED_PR_ALLOWED_PATHS, classifyNativeAutomatedPr, approveNativeAutomatedPrRuns } = require("./native-automated-pr-gates.cjs");
const MAIN = "a".repeat(40), HEAD = "b".repeat(40), MERGE = "c".repeat(40), TREE = "d".repeat(40), OTHER = "e".repeat(40);
const branch = "bot/official-library-hours", repo = { owner: "owner", repo: "radius" }, fullName = "owner/radius";

function harness() {
  const state = { main: MAIN, head: HEAD, base: MAIN, merge: MERGE, tree: TREE, mergeTree: TREE,
    parents: [MAIN, HEAD], behind: 0, compareStatus: "ahead", pullState: "open", draft: false,
    headRepo: fullName, baseRepo: fullName, headBranch: branch, baseBranch: "main", mergeable: true,
    files: [{ filename: "src/data/places-merchant-hours.json", status: "modified" }], changedFiles: 1,
    totalOverride: null, calls: [], approvals: [], waits: [], onRead: null, onApprove: null, approveStatus: 201,
    approveError: null, transition: true, workflows: {}, runs: [], attemptOverride: null, listProjection: null, detailProjection: null,
    autoMerge: null, omitAutoMerge: false };
  const clone = (value) => structuredClone(value);
  const pull = () => ({ number: 7, state: state.pullState, draft: state.draft, mergeable: state.mergeable,
    mergeable_state: state.mergeable ? "clean" : "dirty", changed_files: state.changedFiles, merge_commit_sha: state.merge,
    ...(!state.omitAutoMerge ? { auto_merge: state.autoMerge } : {}),
    head: { ref: state.headBranch, sha: state.head, repo: { full_name: state.headRepo } },
    base: { ref: state.baseBranch, sha: state.base, repo: { full_name: state.baseRepo } } });
  const api = (name, fn) => async (args) => {
    state.calls.push({ name, args: clone(args) }); state.onRead?.(name, args);
    return { data: clone(await fn(args)) };
  };
  const github = { rest: { git: {}, repos: {}, pulls: {}, actions: {} } };
  github.rest.git.getRef = api("getRef", ({ ref }) => ({ object: { sha: ref === "heads/main" ? state.main : state.head } }));
  github.rest.git.getCommit = api("getCommit", ({ commit_sha }) => ({ tree: { sha: commit_sha === HEAD ? state.tree : state.mergeTree },
    parents: (commit_sha === HEAD ? [MAIN] : state.parents).map((sha) => ({ sha })) }));
  github.rest.pulls.list = api("listPulls", () => [pull()]);
  github.rest.pulls.get = api("getPull", pull);
  github.rest.repos.compareCommitsWithBasehead = api("compare", () => ({ status: state.compareStatus, ahead_by: 1,
    behind_by: state.behind, total_commits: 1, files: state.files }));
  github.rest.actions.getWorkflow = api("getWorkflow", ({ workflow_id }) => state.workflows[workflow_id]);
  github.rest.actions.listWorkflowRuns = api("listRuns", ({ workflow_id }) => {
    const runs = state.runs.filter((run) => run.workflow_id === workflow_id).map((run) => {
      const listed = clone(run);
      return state.listProjection?.(listed) ?? listed;
    });
    return { total_count: state.totalOverride ?? runs.length, workflow_runs: runs };
  });
  github.rest.actions.getWorkflowRun = api("getRun", ({ run_id }) => {
    const run = state.runs.find((candidate) => candidate.id === run_id);
    const detail = state.attemptOverride == null ? clone(run) : { ...clone(run), run_attempt: state.attemptOverride };
    return state.detailProjection?.(detail) ?? detail;
  });
  github.rest.actions.approveWorkflowRun = async (args) => {
    state.calls.push({ name: "approve", args: clone(args) });
    if (state.approveError) throw state.approveError;
    state.approvals.push(args.run_id);
    const run = state.runs.find((candidate) => candidate.id === args.run_id);
    if (state.transition) { run.status = "queued"; run.conclusion = null; }
    state.onApprove?.(args);
    return { status: state.approveStatus, data: {} };
  };
  for (const [file, workflowId, runId] of [["ci.yml", 11, 101], ["style.yml", 22, 202]]) {
    state.workflows[file] = { id: workflowId, path: `.github/workflows/${file}`, state: "active" };
    state.runs.push({ id: runId, workflow_id: workflowId, path: `.github/workflows/${file}`, event: "pull_request",
      head_sha: HEAD, head_branch: branch, head_repository: { full_name: fullName }, repository: { full_name: fullName },
      run_attempt: 1, status: "completed", conclusion: "action_required", check_suite_id: runId + 1000,
      pull_requests: [{ number: 7, head: { ref: branch, sha: HEAD, repo: { name: "radius", id: 1, url: "https://api.github.com/repos/owner/radius" } },
        base: { ref: "main", sha: MAIN, repo: { name: "radius", id: 1, url: "https://api.github.com/repos/owner/radius" } } }],
      html_url: `https://github.com/owner/radius/actions/runs/${runId}` });
  }
  const nativeContext = { repo, eventName: "pull_request", ref: "refs/pull/7/merge", sha: MERGE, payload: { pull_request: pull() } };
  const mainContext = { repo, eventName: "schedule", ref: "refs/heads/main", sha: MAIN };
  const options = { github, context: nativeContext, trustedMainSha: MAIN, pullNumber: 7, branch, headSha: HEAD,
    now: () => Date.parse("2026-10-23T13:00:00Z"), sleep: async (ms) => { state.waits.push(ms); } };
  return { state, options, approvalOptions: { ...options, context: mainContext } };
}

test("classifies the exact current native data PR without changing its checks or merge state", async () => {
  const { state, options } = harness();
  const result = await classifyNativeAutomatedPr(options);
  assert.equal(result.verified, true); assert.equal(result.mode, "data-only");
  assert.equal(result.identity.mainSha, MAIN); assert.equal(result.identity.headSha, HEAD);
  assert.equal(result.identity.mergeSha, MERGE); assert.equal(result.identity.treeSha, TREE);
  assert.equal(state.approvals.length, 0);
});

test("approves only the two existing exact held native runs and records their attempt/response", async () => {
  const { state, approvalOptions } = harness();
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.verified, true); assert.equal(result.state, "approved");
  assert.deepEqual(state.approvals, [101, 202]); assert.equal(result.approvalWrites.length, 2);
  assert.ok(result.approvalWrites.every((write) => write.responseStatus === 201 && write.attempt === 1 && write.suiteId === write.id + 1000));
  assert.equal(result.semanticAcceptance, false); assert.equal(result.changesAutoMerge, false);
  assert.ok(result.runs.every((run) => run.event === "pull_request" && run.action === "approved"));
});

test("empty discovery metadata may settle into the same exact association before any approval", async () => {
  const { state, approvalOptions } = harness();
  const exact = structuredClone(state.runs[0].pull_requests); let reads = 0;
  state.onRead = (name, args) => {
    if (name === "listRuns" && args.workflow_id === 11) {
      state.runs[0].pull_requests = ++reads < 3 ? [] : exact;
    }
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "approved"); assert.equal(result.verified, true);
  assert.deepEqual(state.approvals, [101, 202]); assert.deepEqual(state.waits, [4000, 4000]);
  const discovery = result.associationReads.filter((row) => row.workflow === "ci.yml" && row.phase === "discovery");
  assert.deepEqual(discovery.map((row) => row.runs[0].associationState), ["empty-array", "empty-array", "exact"]);
  assert.ok(result.approvalWrites.every((row) => row.transitionVerified));
});

test("permanent empty discovery stays held after four reads without an approval write", async () => {
  const { state, approvalOptions } = harness(); state.runs[0].pull_requests = [];
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.verified, false);
  assert.deepEqual(state.approvals, []); assert.deepEqual(result.approvalWrites, []);
  assert.deepEqual(state.waits, [4000, 4000, 4000]);
  assert.equal(state.calls.filter((row) => row.name === "listRuns").length, 4);
  assert.deepEqual(result.associationReads.filter((row) => row.phase === "discovery").map((row) => row.runs[0].associationState), Array(4).fill("empty-array"));
  assert.match(result.failure, /metadata remains empty/);
});

for (const [name, mutate] of Object.entries({
  "missing field": (run) => { delete run.pull_requests; },
  "non-array": (run) => { run.pull_requests = null; },
  "wrong populated association": (run) => { run.pull_requests[0].number = 8; },
})) test(`discovery ${name} is not retried`, async () => {
  const { state, approvalOptions } = harness(); mutate(state.runs[0]);
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(state.waits, []);
  assert.equal(state.calls.filter((row) => row.name === "listRuns").length, 1);
  assert.notEqual(result.associationReads[0].runs[0].associationState, "empty-array");
});

test("foreign association appearing during the discovery wait stays held immediately", async () => {
  const { state, approvalOptions } = harness();
  const foreign = structuredClone(state.runs[0].pull_requests); foreign[0].head.repo.url = "https://api.github.com/repos/fork/radius";
  let reads = 0;
  state.onRead = (name, args) => {
    if (name === "listRuns" && args.workflow_id === 11) state.runs[0].pull_requests = ++reads === 1 ? [] : foreign;
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(state.waits, [4000]);
  assert.equal(reads, 2); assert.equal(result.associationReads.at(-1).runs[0].associationState, "mismatched-association");
});

for (const field of ["main", "head", "merge"]) test(`${field} movement during an empty-association wait stays held`, async () => {
  const { state, approvalOptions } = harness(); state.runs[0].pull_requests = [];
  approvalOptions.sleep = async (ms) => { state.waits.push(ms); state[field] = OTHER; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(state.waits, [4000]);
  assert.equal(state.calls.filter((row) => row.name === "listRuns").length, 1);
});

test("an attempt change while discovery metadata settles cannot inherit the selected identity", async () => {
  const { state, approvalOptions } = harness(); const exact = structuredClone(state.runs[0].pull_requests);
  state.runs[0].pull_requests = [];
  approvalOptions.sleep = async (ms) => {
    state.waits.push(ms); state.runs[0].run_attempt = 2; state.runs[0].pull_requests = exact;
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(state.waits, [4000]);
  assert.match(result.failure, /IDs, attempts or check suites changed/);
});

for (const [field, value] of [["id", 303], ["check_suite_id", 9999]]) test(`a discovery ${field} replacement stays held`, async () => {
  const { state, approvalOptions } = harness(); const exact = structuredClone(state.runs[0].pull_requests);
  state.runs[0].pull_requests = [];
  approvalOptions.sleep = async (ms) => {
    state.waits.push(ms); state.runs[0][field] = value; state.runs[0].pull_requests = exact;
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(state.waits, [4000]);
  assert.match(result.failure, /IDs, attempts or check suites changed/);
});

test("settled discovery never retries a denied approval", async () => {
  const { state, approvalOptions } = harness(); const exact = structuredClone(state.runs[0].pull_requests); let reads = 0;
  state.approveStatus = 403;
  state.onRead = (name, args) => {
    if (name === "listRuns" && args.workflow_id === 11) state.runs[0].pull_requests = ++reads === 1 ? [] : exact;
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.manualApprovalRequired, true);
  assert.deepEqual(state.waits, [4000]); assert.deepEqual(state.approvals, [101]);
  assert.equal(state.calls.filter((row) => row.name === "approve").length, 1);
  assert.equal(result.approvalWrites.length, 1); assert.equal(result.approvalWrites[0].responseStatus, 403);
});

for (const status of ["queued", "in_progress", "success"]) test(`observes existing ${status} native runs without approving, dispatching or rerunning them`, async () => {
  const { state, approvalOptions } = harness();
  for (const run of state.runs) { run.status = status === "success" ? "completed" : status; run.conclusion = status === "success" ? "success" : null; }
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.verified, true); assert.equal(result.state, "observed"); assert.deepEqual(state.approvals, []);
  assert.ok(result.runs.every((run) => run.action === "observed"));
});

test("ordinary code PRs cannot enter the cheap native gate", async () => {
  const { state, options } = harness(); options.branch = "codex/app-change"; options.context.payload.pull_request.head.ref = options.branch;
  const result = await classifyNativeAutomatedPr(options);
  assert.equal(result.mode, "full"); assert.equal(result.verified, false); assert.equal(state.approvals.length, 0);
});

const invalidContent = {
  "main moved": (state) => { state.main = OTHER; }, "old head": (state) => { state.head = OTHER; },
  "wrong base": (state) => { state.base = OTHER; }, "foreign head repository": (state) => { state.headRepo = "fork/radius"; },
  "foreign base repository": (state) => { state.baseRepo = "fork/radius"; }, "wrong branch": (state) => { state.headBranch = "bot/data-steward"; },
  "wrong base branch": (state) => { state.baseBranch = "other"; }, "closed PR": (state) => { state.pullState = "closed"; },
  "draft PR": (state) => { state.draft = true; }, "conflict": (state) => { state.mergeable = false; },
  "behind main": (state) => { state.behind = 1; }, "different merge tree": (state) => { state.mergeTree = OTHER; },
  "wrong merge parents": (state) => { state.parents = [HEAD, MAIN]; }, "missing merge": (state) => { state.merge = null; },
  "code path": (state) => { state.files[0].filename = "src/app/page.tsx"; },
  "removed path": (state) => { state.files[0].status = "removed"; }, "renamed path": (state) => { state.files[0].status = "renamed"; state.files[0].previous_filename = "src/app/page.tsx"; },
  "unreported rename": (state) => { state.files[0].previous_filename = "src/app/page.tsx"; },
  "missing file status": (state) => { delete state.files[0].status; }, "incomplete changed list": (state) => { state.changedFiles = 2; },
  "duplicate changed path": (state) => { state.files.push({ ...state.files[0] }); state.changedFiles = 2; },
  "no changes": (state) => { state.files = []; state.changedFiles = 0; }, "unknown comparison": (state) => { state.compareStatus = "diverged"; },
};
for (const [name, mutate] of Object.entries(invalidContent)) test(`${name} cannot approve runs or select data-only`, async () => {
  const first = harness(); mutate(first.state);
  const classification = await classifyNativeAutomatedPr(first.options);
  assert.equal(classification.mode, "held"); assert.equal(classification.verified, false);
  const second = harness(); mutate(second.state);
  const approval = await approveNativeAutomatedPrRuns(second.approvalOptions);
  assert.equal(approval.state, "held"); assert.equal(approval.verified, false); assert.deepEqual(second.state.approvals, []);
});

for (const field of ["event", "ref", "sha"]) test(`native classification requires the exact event ${field}`, async () => {
  const { options } = harness();
  if (field === "event") options.context.eventName = "workflow_dispatch";
  if (field === "ref") options.context.ref = "refs/heads/bot/official-library-hours";
  if (field === "sha") options.context.sha = OTHER;
  const result = await classifyNativeAutomatedPr(options);
  assert.equal(result.mode, "held"); assert.equal(result.verified, false);
});

for (const field of ["ref", "sha"]) test(`approval must execute from exact trusted main ${field}`, async () => {
  const { state, approvalOptions } = harness(); approvalOptions.context[field] = OTHER;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

const invalidRun = {
  "non-native event": (run) => { run.event = "workflow_dispatch"; }, "wrong workflow path": (run) => { run.path = ".github/workflows/other.yml"; },
  "old source head": (run) => { run.head_sha = OTHER; }, "fork source": (run) => { run.head_repository.full_name = "fork/radius"; },
  "foreign repository": (run) => { run.repository.full_name = "fork/radius"; }, "wrong source branch": (run) => { run.head_branch = "bot/data-steward"; },
  "missing PR association": (run) => { run.pull_requests = []; }, "different PR": (run) => { run.pull_requests[0].number = 8; },
  "ambiguous PR": (run) => { run.pull_requests.push({ ...run.pull_requests[0], number: 8 }); },
  "wrong PR head": (run) => { run.pull_requests[0].head.sha = OTHER; }, "wrong PR base": (run) => { run.pull_requests[0].base.sha = OTHER; },
  "fork PR association": (run) => { run.pull_requests[0].head.repo.url = "https://api.github.com/repos/fork/radius"; },
  "foreign base association": (run) => { run.pull_requests[0].base.repo.url = "https://api.github.com/repos/fork/radius"; },
  "invalid attempt": (run) => { run.run_attempt = 0; }, "missing suite": (run) => { run.check_suite_id = null; },
};
for (const [name, mutate] of Object.entries(invalidRun)) test(`holds ${name} without an approval`, async () => {
  const { state, approvalOptions } = harness(); mutate(state.runs[0]);
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

for (const conclusion of ["cancelled", "failure", "neutral", "skipped", "timed_out"]) test(`a native ${conclusion} requires owner attention, never a replacement run`, async () => {
  const { state, approvalOptions } = harness(); state.runs[0].conclusion = conclusion;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.equal(result.manualApprovalRequired, true);
  assert.ok(result.runs.some((run) => run.id === 101));
});

test("missing native run leaves the entire pair held without dispatching the other gate", async () => {
  const { state, approvalOptions } = harness(); state.runs.pop();
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

test("ambiguous duplicate native IDs and truncated discovery fail closed", async () => {
  for (const mutate of [(state) => state.runs.push({ ...state.runs[0] }), (state) => { state.totalOverride = 2; }]) {
    const { state, approvalOptions } = harness(); mutate(state);
    const result = await approveNativeAutomatedPrRuns(approvalOptions);
    assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
  }
});

test("observes the latest native run instead of approving its superseded held predecessor", async () => {
  const { state, approvalOptions } = harness();
  state.runs.push({ ...structuredClone(state.runs[0]), id: 303, status: "in_progress", conclusion: null });
  state.runs[1].status = "completed"; state.runs[1].conclusion = "success";
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "observed"); assert.deepEqual(state.approvals, []);
  assert.equal(result.runs.find((run) => run.workflow === "ci.yml").id, 303);
});

test("latest run replacement immediately before approval cannot inherit the prior held permission", async () => {
  const { state, approvalOptions } = harness(); let reads = 0;
  state.onRead = (name) => {
    if (name === "listRuns" && ++reads === 3) state.runs.push({ ...structuredClone(state.runs[0]), id: 303 });
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

test("a run attempt change at its independent pre-approval read stays held", async () => {
  const { state, approvalOptions } = harness(); state.attemptOverride = 2;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

test("a valid check suite replacement between discovery and pre-approval stays held", async () => {
  const { state, approvalOptions } = harness(); let reads = 0;
  state.onRead = (name) => {
    if (name === "listRuns" && ++reads === 3) state.runs[0].check_suite_id = 9999;
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(result.approvalWrites, []);
  assert.match(result.failure, /native gate changed identity|latest native run ID, attempt or check suite changed/);
});

test("an independent run read cannot replace the originally selected check suite", async () => {
  const { state, approvalOptions } = harness();
  state.onRead = (name) => { if (name === "getRun") state.runs[0].check_suite_id = 9999; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(result.approvalWrites, []);
  assert.match(result.failure, /Independent native run ID, attempt or check suite changed/);
});

test("a post-approval suite replacement preserves the one original write and remains held", async () => {
  const { state, approvalOptions } = harness();
  state.onApprove = () => { state.runs[0].check_suite_id = 9999; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.manualApprovalRequired, true);
  assert.deepEqual(state.approvals, [101]); assert.equal(result.approvalWrites.length, 1);
  assert.equal(result.approvalWrites[0].suiteId, 1101); assert.equal(result.approvalWrites[0].transitionVerified, false);
  assert.equal(state.calls.filter((row) => row.name === "approve").length, 1);
  assert.match(result.failure, /exact native run ID, attempt or check suite changed/);
});

test("a current-main race after discovery stops before the first approval", async () => {
  const { state, approvalOptions } = harness();
  state.onRead = (name) => { if (name === "listRuns") state.main = OTHER; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

test("main movement after one approval preserves its receipt and never approves the second", async () => {
  const { state, approvalOptions } = harness(); state.onApprove = () => { state.main = OTHER; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]); assert.equal(result.approvalWrites.length, 1);
});

for (const response of [403, 404, 204, null]) test(`uncertain approval response ${response} is held with existing IDs, without retry`, async () => {
  const { state, approvalOptions } = harness(); state.approveStatus = response;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]); assert.equal(result.approvalWrites.length, 1);
  assert.ok(result.runs.some((run) => run.id === 101));
});

test("a denied endpoint retains exact manual-approval IDs and never retries or falls back", async () => {
  const { state, approvalOptions } = harness(); state.approveError = Object.assign(new Error("Resource not accessible by integration"), { status: 403 });
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.manualApprovalRequired, true);
  assert.deepEqual(result.runs.map((run) => run.id), [101, 202]); assert.equal(state.calls.filter((call) => call.name === "approve").length, 1);
  assert.equal(result.approvalWrites[0].responseStatus, 403);
});

test("an accepted approval with no independently visible transition is uncertain and held", async () => {
  const { state, approvalOptions } = harness(); state.transition = false;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]);
});

test("the exact existing eleven branch policies are immutable and source calls are absent", () => {
  assert.equal(Object.keys(AUTOMATED_PR_ALLOWED_PATHS).length, 11);
  assert.ok(Object.isFrozen(AUTOMATED_PR_ALLOWED_PATHS));
  for (const paths of Object.values(AUTOMATED_PR_ALLOWED_PATHS)) assert.ok(Object.isFrozen(paths));
});

for (const [publisher, paths] of Object.entries(AUTOMATED_PR_ALLOWED_PATHS)) test(`retains the existing publisher policy for ${publisher}`, async () => {
  const { state, options } = harness();
  options.branch = publisher; options.context.payload.pull_request.head.ref = publisher; state.headBranch = publisher;
  state.files[0].filename = paths[0];
  const result = await classifyNativeAutomatedPr(options);
  assert.equal(result.mode, "data-only"); assert.equal(result.verified, true);
});

test("the canonical eleven-branch policy matches the reviewed pre-existing allowlist exactly", () => {
  const canonical = Object.entries(AUTOMATED_PR_ALLOWED_PATHS).sort(([a], [b]) => a.localeCompare(b)).map(([name, paths]) => [name, [...paths].sort()]);
  assert.equal(createHash("sha256").update(JSON.stringify(canonical)).digest("hex"), "a8db475729f76fede35b267b83374df5ba494cad45bfc2ff5eb19798f9010c64");
});

test("an unknown bot branch is held instead of falling through to full verification", async () => {
  const { options } = harness(); options.branch = "bot/unregistered"; options.context.payload.pull_request.head.ref = options.branch;
  const result = await classifyNativeAutomatedPr(options);
  assert.equal(result.mode, "held"); assert.equal(result.verified, false);
});

test("a previously running run cannot regress to an approval request and receive a new approval", async () => {
  const { state, approvalOptions } = harness(); state.runs[0].status = "queued"; state.runs[0].conclusion = null;
  state.onRead = (name) => {
    if (name === "getRun") { state.runs[0].status = "completed"; state.runs[0].conclusion = "action_required"; }
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

test("API read failures preserve a recognized publisher hold", async () => {
  const first = harness(); first.options.github.rest.pulls.get = async () => { throw new Error("Fixture API unavailable"); };
  const result = await classifyNativeAutomatedPr(first.options);
  assert.equal(result.mode, "held"); assert.equal(result.verified, false); assert.match(result.reason, /API unavailable/);
});

for (const mutate of [
  (state) => { state.workflows["ci.yml"].state = "disabled_manually"; },
  (state) => { state.workflows["ci.yml"].path = ".github/workflows/other.yml"; },
  (state) => { state.workflows["ci.yml"].id = null; },
  (state) => { state.workflows["style.yml"].id = 11; },
]) test("unavailable, replaced or overlapping source workflow cannot receive an approval", async () => {
  const { state, approvalOptions } = harness(); mutate(state);
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

test("a publisher head movement after one approval stops before the second native gate", async () => {
  const { state, approvalOptions } = harness(); state.onApprove = () => { state.head = OTHER; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]); assert.equal(result.approvalWrites.length, 1);
});

test("a changed run attempt in the approval response observation stays held with its original reservation", async () => {
  const { state, approvalOptions } = harness(); state.onApprove = () => { state.runs[0].run_attempt = 2; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]);
  assert.equal(result.approvalWrites[0].attempt, 1); assert.equal(result.approvalWrites[0].transitionVerified, false);
});

test("an API failure after accepting approval preserves the one exact write without retry", async () => {
  const { state, approvalOptions } = harness();
  state.onApprove = () => { approvalOptions.github.rest.actions.getWorkflowRun = async () => { throw Error("Fixture read unavailable"); }; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]);
  assert.equal(result.approvalWrites[0].responseStatus, 201); assert.equal(result.approvalWrites[0].transitionVerified, false);
});

test("the publisher cannot select data-only after main moves during immutable content proof", async () => {
  const { state, options } = harness(); state.onRead = (name) => { if (name === "getCommit") state.main = OTHER; };
  const result = await classifyNativeAutomatedPr(options);
  assert.equal(result.mode, "held"); assert.equal(result.verified, false);
});


test("one approval waits for the same native ID/attempt to leave action_required without another write", async () => {
  const { state, approvalOptions } = harness(); state.transition = false;
  const observed = new Map();
  state.onRead = (name, args) => {
    if (name !== "getRun" || !state.approvals.includes(args.run_id)) return;
    observed.set(args.run_id, (observed.get(args.run_id) || 0) + 1);
    if (observed.get(args.run_id) === 2) {
      const run = state.runs.find((row) => row.id === args.run_id); run.status = "queued"; run.conclusion = null;
    }
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "approved"); assert.equal(result.verified, true);
  assert.deepEqual(state.approvals, [101, 202]); assert.deepEqual(state.waits, [750, 750]);
  assert.ok([...observed].every(([, count]) => count >= 2));
  assert.ok(result.approvalWrites.every((row) => row.transitionVerified && row.observationReads === 2));
});

test("persistent action_required gets only four same-ID observations and one approval before being held", async () => {
  const { state, approvalOptions } = harness(); state.transition = false;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]);
  assert.deepEqual(state.waits, [750, 750, 750]);
  assert.equal(result.approvalWrites[0].observationReads, 4);
  assert.equal(result.approvalWrites[0].transitionVerified, false);
  assert.equal(state.calls.filter((row) => row.name === "getRun" && row.args.run_id === 101).length, 8);
});

test("a changed attempt during delayed approval observation holds immediately without another approval", async () => {
  const { state, approvalOptions } = harness(); state.transition = false;
  let observed = 0;
  state.onRead = (name, args) => {
    if (name === "getRun" && state.approvals.includes(args.run_id) && ++observed === 2) state.runs[0].run_attempt = 2;
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]); assert.deepEqual(state.waits, [750]);
  assert.equal(result.approvalWrites[0].attempt, 1); assert.equal(result.approvalWrites[0].transitionVerified, false);
});

test("source movement during the short approval observation stops further reads and approvals", async () => {
  const { state, approvalOptions } = harness(); state.transition = false;
  approvalOptions.sleep = async (ms) => { state.waits.push(ms); state.main = OTHER; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]); assert.deepEqual(state.waits, [750]);
  assert.equal(result.approvalWrites[0].observationReads, 1);
});

test("terminal failure during delayed approval observation is held without exhausting the wait", async () => {
  const { state, approvalOptions } = harness(); state.transition = false;
  approvalOptions.sleep = async (ms) => { state.waits.push(ms); state.runs[0].conclusion = "failure"; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, [101]); assert.deepEqual(state.waits, [750]);
  assert.equal(result.approvalWrites[0].observationReads, 2);
});

// The list and per-run detail are independently projected to model GitHub's
// observed shape: list pull_requests stays empty while the individual native
// run reports the exact current PR. No empty array is approval evidence.
test("empty list association uses the exact independent native run detail for both workflows", async () => {
  const { state, approvalOptions } = harness();
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "approved"); assert.equal(result.verified, true);
  assert.deepEqual(state.approvals, [101, 202]); assert.deepEqual(state.waits, []);
  for (const workflow of ["ci.yml", "style.yml"]) {
    const list = result.associationReads.find((row) => row.workflow === workflow && row.phase === "discovery");
    const detail = result.associationReads.find((row) => row.workflow === workflow && row.phase === "discovery-detail");
    assert.equal(list.runs[0].associationState, "empty-array");
    assert.equal(detail.runs[0].associationState, "exact");
    assert.equal(list.runs[0].id, detail.runs[0].id);
    assert.equal(list.runs[0].attempt, detail.runs[0].attempt);
    assert.equal(list.runs[0].suiteId, detail.runs[0].suiteId);
    assert.ok(result.associationReads.some((row) => row.workflow === workflow && row.phase === "independent-pre-approval" && row.runs[0].associationState === "exact"));
  }
});

test("both native workflow details must prove their PR before either receives approval", async () => {
  const { state, approvalOptions } = harness();
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.detailProjection = (run) => run.id === 202 ? { ...run, pull_requests: [] } : run;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.verified, false);
  assert.deepEqual(state.approvals, []); assert.deepEqual(result.approvalWrites, []);
  assert.deepEqual(state.waits, [4000, 4000, 4000]);
  const detail = result.associationReads.filter((row) => row.workflow === "style.yml" && row.phase === "discovery-detail");
  assert.equal(detail.length, 4); assert.ok(detail.every((row) => row.runs[0].associationState === "empty-array"));
});

for (const [label, mutate] of Object.entries({
  "missing list PR field": (run) => { delete run.pull_requests; },
  "non-array list PR field": (run) => { run.pull_requests = null; },
  "wrong populated list PR": (run) => { run.pull_requests[0].number = 8; },
  "ambiguous populated list PRs": (run) => { run.pull_requests.push({ ...run.pull_requests[0], number: 8 }); },
  "foreign populated list head": (run) => { run.pull_requests[0].head.repo.url = "https://api.github.com/repos/fork/radius"; },
})) test(`${label} stays held even if the independent detail is exact`, async () => {
  const { state, approvalOptions } = harness();
  state.listProjection = (run) => { if (run.id === 101) mutate(run); return run; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(state.waits, []);
  assert.equal(state.calls.filter((call) => call.name === "getRun").length, 0);
});

for (const [label, mutate] of Object.entries({
  "missing detail PR field": (run) => { delete run.pull_requests; },
  "non-array detail PR field": (run) => { run.pull_requests = null; },
  "different detail PR": (run) => { run.pull_requests[0].number = 8; },
  "ambiguous detail PRs": (run) => { run.pull_requests.push({ ...run.pull_requests[0], number: 8 }); },
  "wrong detail head": (run) => { run.pull_requests[0].head.sha = OTHER; },
  "wrong detail base": (run) => { run.pull_requests[0].base.sha = OTHER; },
  "foreign detail repository": (run) => { run.pull_requests[0].head.repo.url = "https://api.github.com/repos/fork/radius"; },
  "wrong detail event": (run) => { run.event = "workflow_dispatch"; },
  "wrong detail workflow": (run) => { run.workflow_id = 22; },
  "wrong detail workflow path": (run) => { run.path = ".github/workflows/other.yml"; },
  "wrong detail branch": (run) => { run.head_branch = "bot/data-steward"; },
  "wrong detail source head": (run) => { run.head_sha = OTHER; },
  "wrong detail source repository": (run) => { run.head_repository.full_name = "fork/radius"; },
  "replacement detail run id": (run) => { run.id = 303; },
  "replacement detail attempt": (run) => { run.run_attempt = 2; },
  "replacement detail suite": (run) => { run.check_suite_id = 9999; },
})) test(`${label} cannot borrow an empty list association`, async () => {
  const { state, approvalOptions } = harness();
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.detailProjection = (run) => { if (run.id === 101) mutate(run); return run; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.verified, false); assert.deepEqual(state.approvals, []);
  assert.deepEqual(result.approvalWrites, []); assert.deepEqual(state.waits, []);
});

test("a failed detail endpoint remains held without a retry or substitute", async () => {
  const { state, approvalOptions } = harness();
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.detailProjection = () => { throw Object.assign(new Error("detail unavailable"), { status: 403 }); };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.errorStatus, 403); assert.deepEqual(state.approvals, []);
  assert.equal(state.calls.filter((call) => call.name === "getRun").length, 1); assert.deepEqual(state.waits, []);
});

for (const [label, field, value] of [["run", "id", 303], ["attempt", "run_attempt", 2], ["suite", "check_suite_id", 9999]]) {
  test(`a ${label} change between discovery and pre-approval stays held even when list association remains empty`, async () => {
    const { state, approvalOptions } = harness(); let reads = 0;
    state.listProjection = (run) => ({ ...run, pull_requests: [] });
    state.detailProjection = (run) => { if (run.id === 101 && ++reads === 2) run[field] = value; return run; };
    const result = await approveNativeAutomatedPrRuns(approvalOptions);
    assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(result.approvalWrites, []);
  });
}

test("a previously running list observation cannot regress into a new approval in the detail", async () => {
  const { state, approvalOptions } = harness();
  state.runs[0].status = "in_progress"; state.runs[0].conclusion = null;
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.detailProjection = (run) => run.id === 101 ? { ...run, status: "completed", conclusion: "action_required" } : run;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
  assert.match(result.failure, /cannot regress/);
});

test("a failed list observation cannot be hidden by a running independent detail", async () => {
  const { state, approvalOptions } = harness();
  state.runs[0].conclusion = "failure";
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.detailProjection = (run) => run.id === 101 ? { ...run, status: "in_progress", conclusion: null } : run;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
  assert.equal(result.runs.find((run) => run.id === 101).conclusion, "failure");
});

test("an exact detail that turns foreign on pre-approval is held before the first write", async () => {
  const { state, approvalOptions } = harness(); let reads = 0;
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.detailProjection = (run) => { if (run.id === 101 && ++reads === 2) run.pull_requests[0].number = 8; return run; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(result.approvalWrites, []);
});

test("a rejected approval after exact detail proof retains the one write and never retries", async () => {
  const { state, approvalOptions } = harness();
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.approveError = Object.assign(new Error("Resource not accessible by integration"), { status: 403 });
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.manualApprovalRequired, true);
  assert.deepEqual(state.approvals, []); assert.equal(result.approvalWrites.length, 1);
  assert.equal(result.approvalWrites[0].responseStatus, 403);
  assert.equal(state.calls.filter((call) => call.name === "approve").length, 1);
});


for (const [label, mutate] of Object.entries({
  "enabled": (state) => { state.autoMerge = { enabled_by: { login: "owner" } }; },
  "missing": (state) => { state.omitAutoMerge = true; },
  "false instead of explicit null": (state) => { state.autoMerge = false; },
  "uncertain object": (state) => { state.autoMerge = {}; },
})) test(`an ${label} auto-merge state cannot use the empty-list fallback`, async () => {
  const { state, approvalOptions } = harness(); mutate(state);
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.verified, false);
  assert.equal(result.semanticAcceptance, false); assert.equal(result.changesAutoMerge, false);
  assert.match(result.failure, /auto-merge.*disabled/);
  assert.deepEqual(state.approvals, []); assert.deepEqual(result.approvalWrites, []);
});

test("auto-merge armed after discovery is detected before the first approval", async () => {
  const { state, approvalOptions } = harness(); let detailReads = 0;
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.onRead = (name) => { if (name === "getRun" && ++detailReads === 3) state.autoMerge = { enabled_by: { login: "owner" } }; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []); assert.deepEqual(result.approvalWrites, []);
  assert.match(result.failure, /auto-merge.*disabled/);
});

test("auto-merge armed after one approval holds immediately and never approves the other gate", async () => {
  const { state, approvalOptions } = harness();
  state.listProjection = (run) => ({ ...run, pull_requests: [] });
  state.onApprove = () => { state.autoMerge = { enabled_by: { login: "owner" } }; };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.equal(result.manualApprovalRequired, true);
  assert.deepEqual(state.approvals, [101]); assert.equal(result.approvalWrites.length, 1);
  assert.equal(result.approvalWrites[0].transitionVerified, false);
  assert.match(result.failure, /auto-merge.*disabled/);
});

test("an existing auto-merge queue retains the original exact-list approval path", async () => {
  const { state, approvalOptions } = harness(); state.autoMerge = { enabled_by: { login: "owner" } };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "approved"); assert.deepEqual(state.approvals, [101, 202]);
});

test("an armed queue cannot switch from exact-list approval to the empty-list fallback", async () => {
  const { state, approvalOptions } = harness(); state.autoMerge = { enabled_by: { login: "owner" } }; let reads = 0;
  state.listProjection = (run) => run.id === 101 && ++reads >= 2 ? { ...run, pull_requests: [] } : run;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
  assert.match(result.failure, /auto-merge.*disabled/);
});

test("superseded exact-list runs do not need a fresh detail association", async () => {
  const { state, approvalOptions } = harness(); state.autoMerge = { enabled_by: { login: "owner" } };
  const old = structuredClone(state.runs[0]); old.id = 99; old.check_suite_id = 1099; state.runs.unshift(old);
  state.detailProjection = (run) => run.id === 99 ? { ...run, pull_requests: [] } : run;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "approved"); assert.deepEqual(state.approvals, [101, 202]);
  assert.equal(state.calls.filter((call) => call.name === "getRun" && call.args.run_id === 99).length, 0);
});

test("an exact superseded run cannot replace the latest run's missing association", async () => {
  const { state, approvalOptions } = harness();
  const old = structuredClone(state.runs[0]); old.id = 99; old.check_suite_id = 1099; state.runs.unshift(old);
  state.detailProjection = (run) => run.id === 101 ? { ...run, pull_requests: [] } : run;
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
});

test("a run that starts before the final snapshot is observed, not approved again", async () => {
  const { state, approvalOptions } = harness(); let reads = 0;
  state.onRead = (name, args) => {
    if (name === "getRun" && args.run_id === 101 && ++reads === 4) {
      state.runs[0].status = "queued"; state.runs[0].conclusion = null;
    }
  };
  const result = await approveNativeAutomatedPrRuns(approvalOptions);
  assert.equal(result.state, "approved"); assert.deepEqual(state.approvals, [202]);
  assert.equal(result.runs.find((run) => run.id === 101).action, "observed");
});

for (const field of ["autoMerge", "main", "head"]) {
  test(`batch catches ${field} movement during the second workflow detail`, async () => {
    const { state, approvalOptions } = harness(); let reads = 0;
    state.listProjection = (run) => ({ ...run, pull_requests: [] });
    state.onRead = (name, args) => {
      if (name === "getRun" && args.run_id === 202 && ++reads === 2) {
        if (field === "autoMerge") state.autoMerge = { enabled_by: { login: "owner" } };
        else state[field] = OTHER;
      }
    };
    const result = await approveNativeAutomatedPrRuns(approvalOptions);
    assert.equal(result.state, "held"); assert.deepEqual(state.approvals, []);
  });
}

test("native classification remains independent from the owner auto-merge queue", async () => {
  const { state, options } = harness(); state.autoMerge = { enabled_by: { login: "owner" } };
  const result = await classifyNativeAutomatedPr(options);
  assert.equal(result.verified, true); assert.equal(result.mode, "data-only");
  assert.deepEqual(state.approvals, []);
});

test('independent probe: a preapproval list failure cannot be concealed by independent running detail', async () => {
 const { state, approvalOptions } = harness(); let lists=0;
 state.runs[0].status='in_progress'; state.runs[0].conclusion=null;
 state.listProjection = (run) => { if(run.id===101 && ++lists >= 2) return {...run,status:'completed',conclusion:'failure'}; return run; };
 const result=await approveNativeAutomatedPrRuns(approvalOptions);
 assert.equal(result.state,'held'); assert.deepEqual(state.approvals,[]);
});
test('independent probe: second gate fails after discovery before first approval', async () => {
 const { state, approvalOptions } = harness(); let reads=0;
 state.onRead = (name,args) => { if(name==='getRun' && args.run_id===101 && ++reads===2) state.runs[1].conclusion='failure'; };
 const result=await approveNativeAutomatedPrRuns(approvalOptions);
 assert.equal(result.state,'held'); assert.deepEqual(state.approvals,[]);
});

test('independent probe: first gate fails after first approval before second gate approval', async () => {
 const { state, approvalOptions } = harness();
 state.onRead = (name,args) => { if (name==='listRuns' && args.workflow_id===22 && state.approvals.length===1) { state.runs[0].status='completed'; state.runs[0].conclusion='failure'; } };
 const result = await approveNativeAutomatedPrRuns(approvalOptions);
 assert.equal(result.state,'held'); assert.deepEqual(state.approvals,[101]);
});

test('independent probe: approved gate reverts to held after verified transition', async () => {
 const { state, approvalOptions } = harness();
 state.onRead = (name,args) => { if(name==='listRuns' && args.workflow_id===22 && state.approvals.length===1) { state.runs[0].status='completed'; state.runs[0].conclusion='action_required'; } };
 const result = await approveNativeAutomatedPrRuns(approvalOptions);
 assert.equal(result.state,'held'); assert.deepEqual(state.approvals,[101]);
});
