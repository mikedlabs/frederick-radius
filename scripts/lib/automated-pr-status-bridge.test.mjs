import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { attachAutomatedPrStatuses, reconcileStaleAutomatedPrStatuses } = require("./automated-pr-status-bridge.cjs");
const MAIN = "a".repeat(40), HEAD = "b".repeat(40), MERGE = "c".repeat(40), ROTATED = "d".repeat(40), TREE = "e".repeat(40), OTHER = "f".repeat(40);
const SQUASH = "9".repeat(40);
const branch = "bot/official-library-hours", token = "01234567-89ab-cdef-0123-456789abcdef";

function harness() {
  const state = { main: MAIN, bot: HEAD, head: HEAD, base: MAIN, merge: MERGE, mergeable: true, draft: false, pullState: "open",
    headRepo: "owner/radius", tree: TREE, mergeTrees: {}, parents: {}, files: [{ filename: "hours.json" }], behind: 0,
    attempts: { 11: 1, 22: 1 }, conclusions: { 11: "success", 22: "success" }, completed: { 11: true, 22: true },
    runStatus: { 11: "completed", 22: "completed" }, jobStatus: {}, runOverrides: {}, jobsMissing: false, merged: false,
    clock: Date.parse("2026-10-21T12:00:00Z"), statuses: [], writes: [], calls: [], onRead: null, onStatus: null };
  const clone = (value) => structuredClone(value);
  const pull = () => ({ number: 7, state: state.pullState, draft: state.draft, mergeable: state.mergeable,
    mergeable_state: state.mergeable === false ? "dirty" : "clean", merge_commit_sha: state.merge, merged: state.merged,
    merged_at: state.merged ? "2026-10-21T12:00:00Z" : null, html_url: "https://github.com/owner/radius/pull/7",
    head: { ref: branch, sha: state.head, repo: { full_name: state.headRepo } },
    base: { ref: "main", sha: state.base, repo: { full_name: "owner/radius" } } });
  const api = (name, fn) => async (args) => {
    state.calls.push({ name, args: clone(args) });
    state.onRead?.(name, args);
    return { data: clone(await fn(args)) };
  };
  const github = { rest: { git: {}, repos: {}, pulls: {}, actions: {} } };
  github.rest.git.getRef = api("getRef", ({ ref }) => ({ object: { sha: ref === "heads/main" ? state.main : state.bot } }));
  github.rest.git.getCommit = api("getCommit", ({ commit_sha }) => commit_sha === HEAD
    ? { tree: { sha: state.tree }, parents: [{ sha: MAIN }] }
    : { tree: { sha: state.mergeTrees[commit_sha] || state.tree }, parents: (state.parents[commit_sha] || [MAIN, HEAD]).map((sha) => ({ sha })) });
  github.rest.pulls.list = api("listPulls", () => [pull()]);
  github.rest.pulls.get = api("getPull", pull);
  github.rest.repos.compareCommitsWithBasehead = api("compare", () => ({ behind_by: state.behind, files: state.files }));
  github.rest.repos.getCommit = api("getHeadAge", () => ({ commit: { committer: { date: "2026-10-20T00:00:00Z" } } }));
  github.rest.actions.getWorkflowRun = api("getRun", ({ run_id: id }) => ({ id, path: `.github/workflows/${id === 11 ? "ci.yml" : "style.yml"}@main`,
    display_title: `${id === 11 ? "CI" : "style"} / automated ${token}`, event: "workflow_dispatch", head_sha: HEAD, head_branch: branch,
    head_repository: { full_name: "owner/radius" }, run_attempt: state.attempts[id], status: state.runStatus[id], ...state.runOverrides[id] }));
  github.rest.actions.listJobsForWorkflowRunAttempt = api("getJobs", ({ run_id: id, attempt_number }) => state.jobsMissing ? [] : [{
    id: id * 100 + attempt_number, name: id === 11 ? "verify" : "style-lint", completed_at: state.completed[id] ? "2026-10-21T11:59:00Z" : null,
    status: state.jobStatus[id] || (state.completed[id] ? "completed" : "in_progress"),
    conclusion: state.conclusions[id], html_url: `https://github.com/owner/radius/actions/runs/${id}/job/${id * 100 + attempt_number}`,
  }]);
  github.rest.repos.createCommitStatus = api("write", (args) => {
    const status = { ...args, id: state.statuses.length + 1 };
    state.statuses.unshift(status); state.writes.push(status); state.onStatus?.(status);
    return status;
  });
  github.rest.repos.listCommitStatusesForRef = api("getStatuses", ({ ref }) => state.statuses.filter((status) => status.sha === ref));
  github.paginate = async (method, args) => (await method(args)).data;
  const options = { github, context: { repo: { owner: "owner", repo: "radius" }, ref: "refs/heads/main" },
    allowedByBranch: { [branch]: ["hours.json"] }, branch, headSha: HEAD, ciRunId: 11, styleRunId: 22, dispatchToken: token,
    now: () => state.clock, sleep: async (ms) => { state.clock += ms; } };
  const latest = (sha, name) => state.statuses.find((status) => status.sha === sha && status.context === name);
  return { state, options, latest };
}

test("publishes only the current merge and returns independently verifiable status/run/tree receipts", async () => {
  const { state, options, latest } = harness();
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.verified, true);
  assert.deepEqual(receipt.currentTarget, { sha: MERGE, tree: TREE });
  assert.equal(state.writes.length, 4);
  assert.ok(state.writes.every((status) => status.sha === MERGE && status.sha !== HEAD));
  for (const name of ["verify", "style-lint"]) assert.equal(latest(MERGE, name).state, "success");
  assert.deepEqual(receipt.writes.at(-1).runs, [{ id: 11, attempt: 1 }, { id: 22, attempt: 1 }]);
  assert.equal(receipt.writes.at(-1).id, latest(MERGE, "style-lint").id);
  assert.ok(state.calls.filter((call) => call.name === "getJobs").every((call) => call.args.attempt_number === 1));
});

test("resolves a same-base/head rotation during content validation before writing", async () => {
  const { state, options } = harness();
  state.onRead = (name, args) => { if (name === "getCommit" && args.commit_sha === MERGE) state.merge = ROTATED; };
  const receipt = await attachAutomatedPrStatuses(options);
  assert.ok(state.writes.every((status) => status.sha === ROTATED));
  assert.equal(receipt.currentTarget.sha, ROTATED);
  assert.equal(receipt.mergeRotations, 1);
});

test("reattaches both final contexts when the synthetic merge rotates after a success write", async () => {
  const { state, options, latest } = harness();
  state.onStatus = (status) => { if (status.state === "success" && status.sha === MERGE) state.merge = ROTATED; };
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.currentTarget.sha, ROTATED);
  for (const name of ["verify", "style-lint"]) assert.equal(latest(ROTATED, name).state, "success");
  assert.ok(state.writes.some((status) => status.sha === MERGE && status.state === "success"));
  assert.equal(receipt.verified, true);
});

function autoSquashOnSecondSuccess(state, mutate = () => {}) {
  state.onStatus = (status) => {
    if (status.state !== "success" || state.writes.filter((write) => write.state === "success").length !== 2) return;
    state.main = SQUASH; state.merge = SQUASH; state.pullState = "closed"; state.merged = true; state.parents[SQUASH] = [MAIN];
    mutate();
  };
}

test("recognizes exact auto-squash immediately after the second final status instead of falsely failing delivery", async () => {
  const { state, options } = harness();
  autoSquashOnSecondSuccess(state);
  state.onRead = (name, args) => { if (state.merged && name === "getRef" && args.ref.startsWith("heads/bot/")) throw Error("Auto-deleted branch"); };
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.verified, true);
  assert.deepEqual(receipt.delivery, { state: "merged-exact-tested-squash", sha: SQUASH, parent: MAIN, tree: TREE,
    statusIds: [3, 4], runs: [{ id: 11, attempt: 1 }, { id: 22, attempt: 1 }] });
  assert.equal(state.writes.length, 4);
  assert.ok(state.writes.every((write) => write.sha === MERGE));
});

for (const invalid of ["closed-not-merged", "later-main", "wrong-parent", "different-tree", "changed-head", "changed-attempt", "replaced-status"]) {
  test(`does not recognize ${invalid} as the exact tested auto-squash`, async () => {
    const { state, options } = harness();
    autoSquashOnSecondSuccess(state, () => {
      if (invalid === "closed-not-merged") state.merged = false;
      if (invalid === "later-main") state.main = OTHER;
      if (invalid === "wrong-parent") state.parents[SQUASH] = [OTHER];
      if (invalid === "different-tree") state.mergeTrees[SQUASH] = OTHER;
      if (invalid === "changed-head") state.head = OTHER;
      if (invalid === "changed-attempt") state.attempts[11] = 2;
      if (invalid === "replaced-status") state.statuses.unshift({ sha: MERGE, context: "verify", id: 9000, state: "success" });
    });
    await assert.rejects(attachAutomatedPrStatuses(options), (error) => {
      assert.equal(error.receipt.verified, false); assert.equal(error.receipt.delivery, undefined); return true;
    });
    assert.equal(state.writes.length, 4);
  });
}

test("bounds repeated same-content merge rotations and cannot report completion", async () => {
  const { state, options } = harness();
  let counter = 1;
  state.onStatus = () => { state.merge = String(counter++).repeat(40); };
  await assert.rejects(attachAutomatedPrStatuses(options), (error) => {
    assert.match(error.message, /rotation limit/); assert.equal(error.receipt.verified, false); return true;
  });
  assert.ok(state.writes.length <= 4);
});

for (const field of ["main", "bot", "head", "base"]) test(`rejects ${field} movement during the pre-write content read`, async () => {
  const { state, options } = harness();
  state.onRead = (name) => { if (name === "getCommit") state[field] = OTHER; };
  await assert.rejects(attachAutomatedPrStatuses(options), /changed|moved/);
  assert.equal(state.writes.length, 0);
});

test("a base movement after a success never projects results onto its new merge", async () => {
  const { state, options } = harness();
  state.onStatus = (status) => { if (status.state === "success") { state.main = OTHER; state.base = OTHER; state.merge = ROTATED; } };
  await assert.rejects(attachAutomatedPrStatuses(options), /changed|moved/);
  assert.ok(state.writes.every((status) => status.sha === MERGE));
});

test("a rerun before publication cannot inherit the pinned attempt's green result", async () => {
  const { state, options, latest } = harness();
  let ciReads = 0;
  state.onRead = (name, args) => { if (name === "getRun" && args.run_id === 11 && ++ciReads === 2) state.attempts[11] = 2; };
  await assert.rejects(attachAutomatedPrStatuses(options), /attempt changed/);
  assert.ok(state.writes.every((status) => status.state === "error"));
  assert.equal(latest(MERGE, "verify").state, "error");
});

test("a rerun immediately after a success demotes the still-current target and records fresh attempts", async () => {
  const { state, options, latest } = harness();
  state.onStatus = (status) => { if (status.state === "success") state.attempts[11] = 2; };
  await assert.rejects(attachAutomatedPrStatuses(options), (error) => {
    assert.equal(error.receipt.verified, false);
    assert.deepEqual(error.receipt.writes.at(-1).runs, [{ id: 11, attempt: 2 }, { id: 22, attempt: 1 }]); return true;
  });
  for (const name of ["verify", "style-lint"]) assert.equal(latest(MERGE, name).state, "error");
});

test("rejects a current merge tree that differs from the tested head", async () => {
  const { state, options } = harness(); state.mergeTrees[MERGE] = OTHER;
  await assert.rejects(attachAutomatedPrStatuses(options), /tree differs/);
  assert.equal(state.writes.length, 0);
});

test("rejects a rotated target with different content instead of copying the first target's success", async () => {
  const { state, options } = harness(); state.mergeTrees[ROTATED] = OTHER;
  state.onStatus = (status) => { if (status.state === "success") state.merge = ROTATED; };
  await assert.rejects(attachAutomatedPrStatuses(options), /tree differs/);
  assert.ok(state.writes.every((status) => status.sha === MERGE));
});

test("requires exactly the tested main/head parents", async () => {
  const { state, options } = harness(); state.parents[MERGE] = [HEAD, MAIN];
  await assert.rejects(attachAutomatedPrStatuses(options), /does not combine/);
  assert.equal(state.writes.length, 0);
});

for (const [field, value] of [["path", ".github/workflows/other.yml"], ["display_title", "CI / automated other"], ["head_sha", OTHER], ["head_branch", "bot/other"], ["event", "push"], ["head_repository", { full_name: "fork/radius" }]]) {
  test(`refuses a mismatched exact run ${field}`, async () => {
    const { state, options } = harness(); state.runOverrides[11] = { [field]: value };
    await assert.rejects(attachAutomatedPrStatuses(options), /run identity/); assert.equal(state.writes.length, 0);
  });
}

test("publishes a real failed job as failure rather than converting the whole gate to green", async () => {
  const { state, options, latest } = harness(); state.conclusions[22] = "failure";
  assert.equal((await attachAutomatedPrStatuses(options)).verified, true);
  assert.equal(latest(MERGE, "verify").state, "success"); assert.equal(latest(MERGE, "style-lint").state, "failure");
});

test("does not treat a completed run with a missing required job as a pass", async () => {
  const { state, options } = harness(); state.jobsMissing = true;
  await assert.rejects(attachAutomatedPrStatuses(options), /without its required job/);
  assert.ok(state.writes.every((status) => status.state !== "success"));
});

test("rejects a success conclusion/completed timestamp whose job status is still in progress", async () => {
  const { state, options } = harness(); state.jobStatus[11] = "in_progress";
  await assert.rejects(attachAutomatedPrStatuses(options), /Inconsistent required workflow job/);
  assert.equal(state.writes.length, 0);
});

test("a completed job changing on the same attempt after publication invalidates the current target", async () => {
  const { state, options, latest } = harness();
  state.onStatus = (status) => { if (status.state === "success") state.conclusions[11] = "failure"; };
  await assert.rejects(attachAutomatedPrStatuses(options), /completed required job changed/);
  for (const name of ["verify", "style-lint"]) assert.equal(latest(MERGE, name).state, "error");
});

for (const change of ["behind", "outside-path", "rename-from-code", "excess-files", "fork", "draft", "closed", "conflict"]) test(`fails closed on ${change} before any status write`, async () => {
  const { state, options } = harness();
  if (change === "behind") state.behind = 1;
  if (change === "outside-path") state.files = [{ filename: "src/app/page.tsx" }];
  if (change === "rename-from-code") state.files = [{ filename: "hours.json", previous_filename: "src/app/page.tsx" }];
  if (change === "excess-files") state.files = [{ filename: "hours.json" }, { filename: "hours.json" }];
  if (change === "fork") state.headRepo = "fork/radius";
  if (change === "draft") state.draft = true;
  if (change === "closed") state.pullState = "closed";
  if (change === "conflict") state.mergeable = false;
  await assert.rejects(attachAutomatedPrStatuses(options)); assert.equal(state.writes.length, 0);
});

test("verifies the actual latest status IDs instead of trusting the write response", async () => {
  const { state, options, latest } = harness();
  state.onStatus = (status) => { if (status.state === "success") state.statuses.unshift({ ...status, id: 9000, state: "pending" }); };
  await assert.rejects(attachAutomatedPrStatuses(options), /latest contexts/);
  for (const name of ["verify", "style-lint"]) assert.equal(latest(MERGE, name).state, "error");
});

test("the stale reconciler stays failure-only and preserves completed contexts", async () => {
  const { state, options, latest } = harness();
  state.statuses.push({ sha: MERGE, id: 70, context: "verify", state: "success" });
  const receipt = await reconcileStaleAutomatedPrStatuses(options);
  assert.equal(receipt.pulls[0].verified, true);
  assert.equal(latest(MERGE, "verify").state, "success"); assert.equal(latest(MERGE, "style-lint").state, "error");
  assert.equal(state.writes.length, 1); assert.ok(state.writes.every((status) => status.state === "error" && status.sha !== HEAD));
  assert.equal(state.calls.filter((call) => call.name === "getRun").length, 0);
});

test("a conflicting stale PR is left untouched instead of receiving recycled statuses", async () => {
  const { state, options } = harness(); state.mergeable = false;
  const receipt = await reconcileStaleAutomatedPrStatuses(options);
  assert.equal(receipt.pulls[0].verified, false); assert.equal(state.writes.length, 0);
});
