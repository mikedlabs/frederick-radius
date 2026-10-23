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
    clock: Date.parse("2026-10-21T12:00:00Z"), statuses: [], writes: [], checks: [], checkWrites: [], checkCreates: [], checkUpdates: [], checkOverrides: {}, calls: [], onRead: null, onStatus: null, onCheck: null };
  const clone = (value) => structuredClone(value);
  const pull = () => ({ number: 7, state: state.pullState, draft: state.draft, mergeable: state.mergeable,
    mergeable_state: state.mergeable === false ? "dirty" : "clean", merge_commit_sha: state.merge, merged: state.merged,
    merged_at: state.merged ? "2026-10-21T12:00:00Z" : null, html_url: "https://github.com/owner/radius/pull/7",
    head: { ref: branch, sha: state.head, repo: { full_name: state.headRepo } },
    base: { ref: "main", sha: state.base, repo: { full_name: "owner/radius" } } });
  const api = (name, fn) => async (args) => {
    state.calls.push({ name, args: clone(args) });
    state.evaluateRules?.();
    state.onRead?.(name, args);
    return { data: clone(await fn(args)) };
  };
  const github = { rest: { git: {}, repos: {}, pulls: {}, actions: {}, checks: {} } };
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
  github.rest.checks.create = api("writeCheck", (args) => {
    const check = { ...args, id: 1001 + state.checkCreates.length, app: { id: 15368 },
      conclusion: null, completed_at: null, ...args, ...state.checkOverrides };
    state.checks.unshift(check); state.checkWrites.push(check); state.checkCreates.push(check); state.onCheck?.(check);
    return check;
  });
  github.rest.checks.update = api("updateCheck", (args) => {
    const index = state.checks.findIndex((row) => row.id === args.check_run_id);
    assert.ok(index >= 0, "Only an existing check can update");
    const check = { ...state.checks[index], ...args, ...state.checkOverrides };
    state.checks[index] = check; state.checkWrites.push(check); state.checkUpdates.push(check); state.onCheck?.(check);
    return check;
  });
  github.rest.checks.listForRef = api("getChecks", ({ ref, check_name }) => ({ check_runs:
    state.checks.filter((check) => check.head_sha === ref && check.name === check_name) }));
  github.paginate = async (method, args) => { const data = (await method(args)).data; return data.check_runs || data; };
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
  let statusTriggered = false;
  state.onStatus = (status) => {
    if (status.state === "success" && state.writes.filter((write) => write.state === "success").length === 2) statusTriggered = true;
  };
  // A legacy status can trigger rules evaluation, but the same-name app-bound
  // checks must also pass. Do not model an impossible protected merge while
  // the second existing check is still in progress.
  state.evaluateRules = () => {
    if (!statusTriggered || state.merged || !["verify", "style-lint"].every((name) => {
      const check = state.checks.filter((row) => row.head_sha === MERGE && row.name === name && row.app.id === 15368).sort((a, b) => b.id - a.id)[0];
      return check?.status === "completed" && check.conclusion === "success";
    })) return;
    state.main = SQUASH; state.merge = SQUASH; state.pullState = "closed"; state.merged = true; state.parents[SQUASH] = [MAIN];
    mutate();
  };
}

test("recognizes exact status-triggered auto-squash once both required forms pass instead of falsely failing delivery", async () => {
  const { state, options } = harness();
  autoSquashOnSecondSuccess(state);
  state.onRead = (name, args) => {
    if (!state.merged) return;
    if (name === "getRef" && args.ref.startsWith("heads/bot/")) throw Error("Auto-deleted branch");
    assert.ok(!["write", "writeCheck", "updateCheck"].includes(name), "No write is allowed after the protected squash");
  };
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.verified, true);
  assert.deepEqual(receipt.delivery, { state: "merged-exact-tested-squash", sha: SQUASH, parent: MAIN, tree: TREE,
    statusIds: [3, 4], checkIds: [1001, 1002], appId: 15368, runs: [{ id: 11, attempt: 1 }, { id: 22, attempt: 1 }] });
  assert.equal(state.writes.length, 4);
  assert.ok(state.writes.every((write) => write.sha === MERGE));
});

test("recognizes immediate app-bound auto-squash before the bot ref is auto-deleted without post-merge writes", async () => {
  const { state, options } = harness();
  let mergedWriteCounts;
  state.onCheck = (check) => {
    if (check.conclusion !== "success" || state.checkUpdates.filter((row) => row.conclusion === "success").length !== 2) return;
    state.main = SQUASH; state.merge = SQUASH; state.pullState = "closed"; state.merged = true; state.parents[SQUASH] = [MAIN];
    mergedWriteCounts = { statuses: state.writes.length, checks: state.checkWrites.length };
  };
  state.onRead = (name, args) => {
    if (!state.merged) return;
    if (name === "getRef" && args.ref.startsWith("heads/bot/")) throw Error("Auto-deleted branch");
    assert.ok(!["write", "writeCheck", "updateCheck"].includes(name), "No write is allowed after the protected squash");
  };
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.verified, true);
  assert.deepEqual(receipt.delivery, { state: "merged-exact-tested-squash", sha: SQUASH, parent: MAIN, tree: TREE,
    statusIds: [3, 4], checkIds: [1001, 1002], appId: 15368, runs: [{ id: 11, attempt: 1 }, { id: 22, attempt: 1 }] });
  assert.deepEqual(mergedWriteCounts, { statuses: 4, checks: 4 });
  assert.equal(state.writes.length, mergedWriteCounts.statuses);
  assert.equal(state.checkWrites.length, mergedWriteCounts.checks);
  assert.ok(state.writes.every((write) => write.sha === MERGE));
  assert.ok(state.checkWrites.every((check) => check.head_sha === MERGE));
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


test("attests exact app-bound checks while retaining legacy contexts and explicit eligibility boundary", async () => {
  const { state, options } = harness();
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.verified, true);
  assert.equal(receipt.eligibility, "unproven-until-protected-merge");
  assert.equal(receipt.requiredAppId, 15368);
  assert.equal(state.checkWrites.length, 4);
  assert.equal(state.writes.length, 4);
  assert.ok(state.checkWrites.every((row) => row.head_sha === MERGE && row.app.id === 15368 && row.head_sha !== HEAD));
  for (const name of ["verify", "style-lint"]) {
    const check = state.checks.find((row) => row.name === name);
    const proof = receipt.attestations.findLast((row) => row.context === name);
    assert.equal(proof.id, check.id); assert.equal(proof.appId, 15368); assert.equal(proof.sha, MERGE);
    assert.equal(proof.accepted, true); assert.equal(proof.conclusion, "success");
    assert.equal(proof.at, "2026-10-21T12:00:00.000Z");
    assert.match(check.external_id, /11\.1,22\.1/); assert.ok(check.external_id.endsWith(token));
    assert.equal(check.status, "completed"); assert.equal(check.conclusion, "success");
    assert.equal(check.external_id, proof.externalId);
  }
});

for (const [field, value] of [["app", { id: 999 }], ["head_sha", OTHER], ["name", "not-verify"], ["external_id", "different-attempt"], ["conclusion", "success"], ["status", "completed"], ["id", null]]) {
  test(`fails closed on a wrong Checks API response ${field}`, async () => {
    const { state, options } = harness(); state.checkOverrides[field] = value;
    await assert.rejects(attachAutomatedPrStatuses(options), (error) => {
      assert.equal(error.receipt.verified, false);
      assert.equal(error.receipt.attestations[0].accepted, false);
      return true;
    });
    assert.ok(state.writes.every((row) => row.state !== "success"));
  });
}

test("missing Checks permission cannot fall back to status-only success", async () => {
  const { state, options } = harness();
  options.github.rest.checks.create = async () => { throw Error("Resource not accessible by integration"); };
  await assert.rejects(attachAutomatedPrStatuses(options), /not accessible/);
  assert.ok(state.writes.every((row) => row.state === "error"));
  assert.equal(state.checkCreates.length, 0);
});

test("rejects superseded check IDs even when the replacement says success", async () => {
  const { state, options } = harness();
  state.onCheck = (check) => { if (check.conclusion === "success") state.checks.unshift({ ...check, id: 9001, external_id: "unrelated-green" }); };
  await assert.rejects(attachAutomatedPrStatuses(options), /latest attestations/);
  assert.ok(state.writes.some((row) => row.state === "error"));
});

test("cannot transfer an attestation after the exact source attempt changes between its two transports", async () => {
  const { state, options } = harness();
  state.onStatus = (status) => { if (status.state === "success") state.attempts[11] = 2; };
  await assert.rejects(attachAutomatedPrStatuses(options), /attempt changed/);
  assert.ok(state.checkWrites.every((row) => row.conclusion !== "success"));
  for (const name of ["verify", "style-lint"]) assert.equal(state.statuses.find((row) => row.context === name).state, "error");
  assert.ok(state.checkWrites.filter((row) => row.conclusion === "failure").every((row) => row.external_id.includes("11.2")));
});

test("an attempt changing after an API success invalidates both transports before the other context can pass", async () => {
  const { state, options, latest } = harness();
  state.onCheck = (check) => { if (check.conclusion === "success") state.attempts[11] = 2; };
  await assert.rejects(attachAutomatedPrStatuses(options), /attempt changed/);
  assert.equal(state.checkWrites.filter((row) => row.conclusion === "success").length, 1);
  for (const name of ["verify", "style-lint"]) {
    assert.equal(latest(MERGE, name).state, "error");
    assert.equal(state.checks.find((row) => row.name === name).conclusion, "failure");
  }
});

test("rechecks exact latest ownership after the final legacy write before updating its app-bound check", async () => {
  const { state, options, latest } = harness();
  state.onStatus = (status) => {
    if (status.state !== "success") return;
    const check = state.checks.find((row) => row.name === status.context);
    state.checks.unshift({ ...check, id: 9001, external_id: "unrelated-newer-check" });
  };
  await assert.rejects(attachAutomatedPrStatuses(options), /owned check changed/);
  assert.ok(state.checkUpdates.every((row) => row.conclusion !== "success"));
  assert.equal(latest(MERGE, "verify").state, "error");
  assert.equal(state.checks.find((row) => row.id === 9001).status, "in_progress");
  assert.ok(state.checkUpdates.every((row) => row.id !== 9001));
});

test("checks-source failure remains a failed check and legacy status", async () => {
  const { state, options, latest } = harness(); state.conclusions[22] = "failure";
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.verified, true); assert.equal(receipt.eligibility, "unproven-until-protected-merge");
  assert.equal(state.checks.find((row) => row.name === "style-lint").conclusion, "failure");
  assert.equal(latest(MERGE, "style-lint").state, "failure");
});

test("stale reconciliation preserves completed checks while failing only unfinished transports", async () => {
  const { state, options, latest } = harness();
  state.statuses.push({ sha: MERGE, id: 70, context: "verify", state: "success" });
  state.checks.push({ id: 700, head_sha: MERGE, app: { id: 15368 }, name: "verify", status: "completed", conclusion: "success", external_id: "previous-reviewed-attempt" });
  await reconcileStaleAutomatedPrStatuses(options);
  assert.equal(state.checks.find((row) => row.name === "verify").id, 700);
  assert.equal(latest(MERGE, "verify").id, 70);
  assert.equal(state.checkWrites.length, 0); // No radius-owned pending API check exists here.
  assert.ok(state.writes.every((row) => row.context === "style-lint" && row.state === "error"));
  assert.equal(state.calls.filter((row) => row.name === "getRun").length, 0);
});

for (const invalid of ["app", "external_id", "head_sha", "id"]) {
  test(`a completed squash must still prove the current app-bound check ${invalid}`, async () => {
    const { state, options } = harness();
    autoSquashOnSecondSuccess(state, () => {
      const check = state.checks.find((row) => row.name === "verify");
      if (invalid === "app") check.app = { id: 999 };
      else if (invalid === "id") check.id = 9001;
      else check[invalid] = "unrelated";
    });
    await assert.rejects(attachAutomatedPrStatuses(options), (error) => {
      assert.equal(error.receipt.delivery, undefined); assert.equal(error.receipt.verified, false); return true;
    });
  });
}


test("detects a completed check edited in place after its API receipt", async () => {
  const { state, options } = harness();
  state.onRead = (name, args) => {
    const check = state.checks.find((row) => row.name === "verify" && row.conclusion === "success");
    if (name === "getChecks" && args.check_name === "verify" && check) check.completed_at = "2026-10-21T12:01:00Z";
  };
  await assert.rejects(attachAutomatedPrStatuses(options), /latest attestations/);
  assert.ok(state.writes.some((row) => row.state === "error"));
});

test("a foreign-app green check cannot substitute for the expected app's latest check", async () => {
  const { state, options } = harness();
  state.onCheck = (check) => {
    if (check.conclusion === "success") {
      state.checks = state.checks.filter((row) => row.id !== check.id);
      state.checks.unshift({ ...check, app: { id: 999 } });
    }
  };
  await assert.rejects(attachAutomatedPrStatuses(options), /latest attestations/);
});


test("settles the two original pending check IDs without orphaning current-target runs", async () => {
  const { state, options } = harness();
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(state.checkCreates.length, 2); assert.equal(state.checkUpdates.length, 2);
  assert.deepEqual(state.checkCreates.map((row) => row.id), state.checkUpdates.map((row) => row.id));
  assert.equal(state.checks.length, 2);
  assert.ok(state.checks.every((row) => row.status === "completed" && row.conclusion === "success"));
  assert.ok(state.checkUpdates.every((row) => row.external_id.endsWith(token)));
  assert.deepEqual(receipt.abandonedTargets, []);
});

test("source failure settles existing IDs instead of creating additional completed checks", async () => {
  const { state, options } = harness(); state.conclusions[22] = "failure";
  await attachAutomatedPrStatuses(options);
  assert.equal(state.checkCreates.length, 2); assert.equal(state.checkUpdates.length, 2);
  assert.ok(state.checks.every((row) => row.status === "completed"));
  assert.equal(state.checks.find((row) => row.name === "style-lint").conclusion, "failure");
});

test("rotation settles only the current target and never mutates abandoned pending runs", async () => {
  const { state, options } = harness();
  state.onStatus = (status) => { if (status.state === "pending" && status.sha === MERGE) state.merge = ROTATED; };
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.currentTarget.sha, ROTATED);
  assert.deepEqual(receipt.abandonedTargets, [MERGE]);
  const current = state.checks.filter((row) => row.head_sha === ROTATED);
  assert.equal(current.length, 2); assert.ok(current.every((row) => row.status === "completed"));
  assert.ok(state.checkUpdates.every((row) => row.head_sha === ROTATED));
  assert.ok(state.checks.filter((row) => row.head_sha === MERGE).every((row) => row.status === "in_progress"));
});

test("stale reconciliation settles only a radius-owned pending check for this exact identity", async () => {
  const { state, options } = harness();
  state.checks.push({ id: 701, head_sha: MERGE, app: { id: 15368 }, name: "verify", status: "in_progress", conclusion: null, completed_at: null,
    external_id: `radius-bridge-v2:7:${HEAD}:verify:11.1,22.1:${token}` });
  await reconcileStaleAutomatedPrStatuses(options);
  assert.equal(state.checkCreates.length, 0); assert.equal(state.checkUpdates.length, 1);
  assert.equal(state.checkUpdates[0].id, 701); assert.equal(state.checkUpdates[0].conclusion, "failure");
  assert.equal(state.calls.filter((row) => row.name === "getRun").length, 0);
});

for (const externalId of ["native-workflow-job", `radius-bridge-v2:8:${HEAD}:verify:11.1,22.1:${token}`, `radius-bridge-v2:7:${OTHER}:verify:11.1,22.1:${token}`]) {
  test(`stale reconciliation leaves an unrelated pending check untouched: ${externalId}`, async () => {
    const { state, options } = harness();
    state.checks.push({ id: 702, head_sha: MERGE, app: { id: 15368 }, name: "verify", status: "in_progress", conclusion: null, completed_at: null, external_id: externalId });
    await reconcileStaleAutomatedPrStatuses(options);
    assert.equal(state.checkWrites.length, 0);
    assert.equal(state.checks[0].status, "in_progress");
  });
}

for (const raw of ["neutral", "skipped", "stale", "startup_failure", "cancelled", "timed_out"]) test(`${raw} is retained as source evidence but never becomes a passing API attestation`, async () => {
  const { state, options, latest } = harness(); state.conclusions[11] = raw;
  const receipt = await attachAutomatedPrStatuses(options);
  assert.equal(receipt.verified, true); // Attachment, never source success or ruleset eligibility.
  assert.equal(state.checkCreates.length, 2);
  const verify = state.checks.find((row) => row.name === "verify");
  assert.equal(verify.status, "completed"); assert.equal(verify.conclusion, "failure");
  assert.equal(latest(MERGE, "verify").state, "error");
  assert.ok(state.checkWrites.filter((row) => row.name === "verify").every((row) => row.conclusion === null || row.conclusion === "failure"));
  const proof = receipt.attestations.findLast((row) => row.context === "verify");
  assert.equal(proof.sourceConclusion, raw); assert.equal(proof.conclusion, "failure");
  assert.ok(verify.output.summary.includes(`Actual source conclusion: ${raw}.`));
  assert.equal(receipt.eligibility, "unproven-until-protected-merge");
});

test("a non-successful source cannot inherit a previous attempt's passing check", async () => {
  const { state, options, latest } = harness();
  state.checks.push({ id: 700, head_sha: MERGE, app: { id: 15368 }, name: "verify", status: "completed", conclusion: "success", completed_at: "2026-10-21T11:00:00Z",
    external_id: `radius-bridge-v2:7:${HEAD}:verify:9.1,10.1:${token}` });
  state.statuses.push({ sha: MERGE, id: 70, context: "verify", state: "success" });
  state.conclusions[11] = "neutral";
  const receipt = await attachAutomatedPrStatuses(options);
  const current = state.checks.filter((row) => row.name === "verify").sort((a, b) => b.id - a.id)[0];
  assert.notEqual(current.id, 700); assert.equal(current.conclusion, "failure");
  assert.equal(latest(MERGE, "verify").state, "error");
  assert.equal(receipt.attestations.findLast((row) => row.context === "verify").sourceConclusion, "neutral");
});
