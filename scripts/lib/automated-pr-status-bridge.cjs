"use strict";

// Trusted-main helper only. It never checks out or executes the bot's files.
const SHA = /^[0-9a-f]{40}$/;
const CONTEXTS = ["verify", "style-lint"];
const MAX_MERGE_ROTATIONS = 3;
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const jobIdentity = (job) => job && JSON.stringify([job.id, job.name, job.status, job.completed_at, job.conclusion]);

async function prepare({ github, context, allowedByBranch, branch, headSha, pullNumber }) {
  requireThat(context.ref === "refs/heads/main", "The automated status bridge must run from main.");
  const allowlist = allowedByBranch[branch];
  requireThat(Array.isArray(allowlist) && SHA.test(headSha || ""), "Unexpected automated branch or head.");
  const { owner, repo } = context.repo;
  const main = await github.rest.git.getRef({ owner, repo, ref: "heads/main" });
  const mainSha = main.data.object.sha;
  requireThat(SHA.test(mainSha), "Invalid main revision.");
  const bot = await github.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
  requireThat(bot.data.object.sha === headSha, "The bot branch moved. Regenerate its checks.");
  const pulls = pullNumber ? [await github.rest.pulls.get({ owner, repo, pull_number: pullNumber })].map((r) => r.data)
    : (await github.rest.pulls.list({ owner, repo, state: "open", base: "main", head: `${owner}:${branch}`, per_page: 10 })).data;
  requireThat(pulls.length === 1, "Expected exactly one open automated PR.");
  const identity = { owner, repo, branch, headSha, mainSha, pullNumber: pulls[0].number };
  validatePull(pulls[0], identity);
  const comparison = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${mainSha}...${headSha}`, per_page: 100 });
  requireThat(comparison.data.behind_by === 0, "The bot PR is behind main. Regenerate it.");
  const files = comparison.data.files || [];
  requireThat(Array.isArray(files) && files.length > 0 && files.length <= allowlist.length
    && new Set(files.map((file) => file.filename)).size === files.length
    && files.every((file) => allowlist.includes(file.filename)
    && (!file.previous_filename || allowlist.includes(file.previous_filename))), "The bot PR changed files outside its allowlist.");
  return identity;
}

function validatePull(pull, identity) {
  requireThat(pull.number === identity.pullNumber && pull.state === "open" && !pull.draft
    && pull.head.ref === identity.branch && pull.head.sha === identity.headSha
    && pull.head.repo?.full_name === `${identity.owner}/${identity.repo}`
    && pull.base.ref === "main" && pull.base.sha === identity.mainSha
    && pull.base.repo?.full_name === `${identity.owner}/${identity.repo}`, "The PR identity, base, head or state changed.");
  requireThat(pull.mergeable !== false && pull.mergeable_state !== "dirty", "The automated PR conflicts with main.");
}

function makeBridge({ github, identity, readRuns, now, sleep }) {
  const { owner, repo, branch, headSha, mainSha, pullNumber } = identity;
  const receipt = { schema_version: 1, mode: "attach", pull: pullNumber, branch, base: mainSha, head: headSha,
    mergeRotations: 0, targets: [], writes: [], verified: false };
  let lastMerge = null, mergeWaits = 0;
  const observe = (sha) => {
    if (!SHA.test(sha || "") || sha === lastMerge) return;
    if (lastMerge) requireThat(++receipt.mergeRotations <= MAX_MERGE_ROTATIONS, "Synthetic merge rotation limit exceeded.");
    lastMerge = sha;
  };
  async function currentPull() {
    const [main, bot, pull] = await Promise.all([
      github.rest.git.getRef({ owner, repo, ref: "heads/main" }),
      github.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }),
      github.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
    ]);
    requireThat(main.data.object.sha === mainSha && bot.data.object.sha === headSha, "Main or bot head moved. Regenerate its checks.");
    validatePull(pull.data, identity);
    return pull.data;
  }
  async function target(stage) {
    for (;;) {
      const pull = await currentPull();
      if (pull.mergeable !== true || !SHA.test(pull.merge_commit_sha || "")) {
        requireThat(++mergeWaits <= 12, "GitHub did not produce a current mergeable revision.");
        await sleep(2000); continue;
      }
      const mergeSha = pull.merge_commit_sha;
      observe(mergeSha);
      const [merge, head] = await Promise.all([
        github.rest.git.getCommit({ owner, repo, commit_sha: mergeSha }),
        github.rest.git.getCommit({ owner, repo, commit_sha: headSha }),
      ]);
      const parents = merge.data.parents.map((parent) => parent.sha);
      requireThat(parents.length === 2 && parents[0] === mainSha && parents[1] === headSha,
        "The merge does not combine the validated main and tested head.");
      requireThat(SHA.test(head.data.tree?.sha || "") && merge.data.tree?.sha === head.data.tree.sha,
        "The current merge tree differs from the tested head tree.");
      // Read current attempts/jobs after the immutable content proof, then
      // re-read mutable PR/ref identities immediately before the write.
      const runs = await readRuns(stage);
      const latest = await currentPull();
      observe(latest.merge_commit_sha);
      if (latest.mergeable !== true || latest.merge_commit_sha !== mergeSha) continue;
      const result = { sha: mergeSha, tree: head.data.tree.sha, pullUrl: latest.html_url, runs };
      receipt.targets.push({ at: new Date(now()).toISOString(), stage, sha: result.sha, tree: result.tree,
        runs: runs.map(({ id, attempt, jobs }) => ({ id, attempt, jobs })) });
      return result;
    }
  }
  const statuses = (sha) => github.paginate(github.rest.repos.listCommitStatusesForRef, { owner, repo, ref: sha, per_page: 100 });
  async function publish(stage, description, onlyUnfinished = false) {
    publishRound: for (;;) {
      let expected = null;
      const written = new Map();
      for (const contextName of CONTEXTS) {
        let before = await target(stage);
        if (expected && expected !== before.sha) continue publishRound;
        expected = before.sha;
        if (onlyUnfinished) {
          const latest = (await statuses(before.sha)).find((status) => status.context === contextName);
          before = await target(stage);
          if (before.sha !== expected) continue publishRound;
          if (latest && latest.state !== "pending") continue;
        }
        const job = before.runs.flatMap((run) => run.jobs).find((candidate) => candidate?.name === contextName);
        const state = stage === "final" ? job.conclusion === "success" ? "success" : job.conclusion === "failure" ? "failure" : "error"
          : stage === "pending" ? "pending" : "error";
        const response = await github.rest.repos.createCommitStatus({ owner, repo, sha: before.sha, state, context: contextName,
          description: description || (state === "success" ? "Passed in the trusted automated-data gate" : `Automated-data gate concluded: ${job.conclusion || "unknown"}`),
          target_url: stage === "final" ? job.html_url : before.pullUrl });
        requireThat(Number.isSafeInteger(response.data.id) && response.data.id > 0, "Status publication returned no receipt ID.");
        receipt.writes.push({ id: response.data.id, sha: before.sha, context: contextName, stage, state,
          runs: before.runs.map((run) => ({ id: run.id, attempt: run.attempt })) });
        written.set(contextName, { id: response.data.id, state });
        const after = await target(stage);
        if (after.sha !== before.sha) continue publishRound;
      }
      const actual = await statuses(expected);
      const after = await target(stage);
      if (after.sha !== expected) continue;
      requireThat([...written].every(([name, status]) => {
        const latest = actual.find((candidate) => candidate.context === name);
        return latest?.id === status.id && latest.state === status.state;
      }), "Published statuses are not the current target's latest contexts.");
      receipt.currentTarget = { sha: after.sha, tree: after.tree };
      receipt.verified = true;
      return;
    }
  }
  async function verifyMerged() {
    const successes = CONTEXTS.map((name) => receipt.writes.findLast((write) => write.context === name));
    if (!successes.every((write) => write?.stage === "final" && write.state === "success")
      || successes[0].sha !== successes[1].sha) return false;
    try {
      // Auto-squash can complete as soon as the second required status lands.
      // Recognize only that exact tested delivery, never arbitrary PR closure
      // or an unrelated main advance. No status is written on this path.
      const mergedIdentity = async () => {
        const [main, response] = await Promise.all([
          github.rest.git.getRef({ owner, repo, ref: "heads/main" }),
          github.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
        ]);
        const pull = response.data;
        requireThat(pull.number === pullNumber && pull.state === "closed" && pull.merged === true
          && Number.isFinite(Date.parse(pull.merged_at)) && !pull.draft
          && pull.head.ref === branch && pull.head.sha === headSha && pull.head.repo?.full_name === `${owner}/${repo}`
          && pull.base.ref === "main" && pull.base.repo?.full_name === `${owner}/${repo}`
          && SHA.test(pull.merge_commit_sha || "") && main.data.object.sha === pull.merge_commit_sha,
        "The closed PR is not the exact newly merged current-main delivery.");
        return pull.merge_commit_sha;
      };
      const squashSha = await mergedIdentity();
      const [squash, head] = await Promise.all([
        github.rest.git.getCommit({ owner, repo, commit_sha: squashSha }),
        github.rest.git.getCommit({ owner, repo, commit_sha: headSha }),
      ]);
      requireThat(squash.data.parents.length === 1 && squash.data.parents[0].sha === mainSha
        && SHA.test(head.data.tree?.sha || "") && squash.data.tree?.sha === head.data.tree.sha,
      "The merged squash parent or tree differs from the validated content.");
      const runs = await readRuns("final");
      const published = await statuses(successes[0].sha);
      requireThat(successes.every((write) => {
        const latest = published.find((status) => status.context === write.context);
        return latest?.id === write.id && latest.state === "success";
      }), "The merged delivery's exact success status IDs are not current.");
      requireThat(await mergedIdentity() === squashSha, "The merged delivery moved while it was being verified.");
      await readRuns("final");
      receipt.currentTarget = { sha: successes[0].sha, tree: head.data.tree.sha };
      receipt.delivery = { state: "merged-exact-tested-squash", sha: squashSha, parent: mainSha, tree: head.data.tree.sha,
        statusIds: successes.map((write) => write.id), runs: runs.map((run) => ({ id: run.id, attempt: run.attempt })) };
      receipt.verified = true;
      return true;
    } catch (error) { receipt.mergedVerificationFailure = error.message; return false; }
  }
  return { receipt, publish, verifyMerged };
}

async function attachAutomatedPrStatuses(options) {
  const { github, context, ciRunId, styleRunId, dispatchToken } = options;
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const receipt = { schema_version: 1, mode: "attach", verified: false, writes: [] };
  let bridge;
  try {
    requireThat(Number.isSafeInteger(ciRunId) && ciRunId > 0 && Number.isSafeInteger(styleRunId) && styleRunId > 0
      && ciRunId !== styleRunId && /^[0-9a-f-]{36}$/.test(dispatchToken || ""), "Invalid exact workflow run identities.");
    const identity = await prepare(options);
    const specs = [
      { runId: ciRunId, workflowId: "ci.yml", displayTitle: `CI / automated ${dispatchToken}`, contexts: ["verify"] },
      { runId: styleRunId, workflowId: "style.yml", displayTitle: `style / automated ${dispatchToken}`, contexts: ["style-lint"] },
    ];
    const attempts = new Map(), completedJobs = new Map();
    async function readRuns(stage) {
      return Promise.all(specs.map(async (spec) => {
        const { owner, repo } = context.repo;
        const candidate = (await github.rest.actions.getWorkflowRun({ owner, repo, run_id: spec.runId })).data;
        requireThat(candidate.id === spec.runId && candidate.path?.split("@")[0] === `.github/workflows/${spec.workflowId}`
          && candidate.display_title === spec.displayTitle && candidate.event === "workflow_dispatch"
          && candidate.head_sha === identity.headSha && candidate.head_branch === identity.branch
          && candidate.head_repository?.full_name === `${owner}/${repo}`, "Exact workflow run identity did not match.");
        requireThat(Number.isSafeInteger(candidate.run_attempt) && candidate.run_attempt > 0, "Invalid workflow run attempt.");
        if (!attempts.has(spec.runId)) attempts.set(spec.runId, candidate.run_attempt);
        requireThat(stage === "error" || attempts.get(spec.runId) === candidate.run_attempt, "A workflow run attempt changed during attachment.");
        const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
          owner, repo, run_id: candidate.id, attempt_number: candidate.run_attempt, per_page: 100,
        });
        const required = spec.contexts.map((name) => {
          const matches = jobs.filter((job) => job.name === name);
          requireThat(matches.length <= 1, "Ambiguous required workflow job.");
          const job = matches[0];
          if (stage === "final") requireThat(job && job.completed_at && jobIdentity(job) === completedJobs.get(name), "A completed required job changed or disappeared.");
          if (job) requireThat(Number.isSafeInteger(job.id) && job.id > 0
            && (job.completed_at ? job.status === "completed" && Number.isFinite(Date.parse(job.completed_at)) && typeof job.conclusion === "string"
              : job.status !== "completed" && job.conclusion == null), "Inconsistent required workflow job completion.");
          return job ? { id: job.id, name: job.name, status: job.status, completed_at: job.completed_at, conclusion: job.conclusion, html_url: job.html_url } : null;
        });
        return { id: candidate.id, attempt: candidate.run_attempt, status: candidate.status, jobs: required };
      }));
    }
    await readRuns("observe"); // Pin exact attempts before publishing even pending contexts.
    bridge = makeBridge({ github, identity, readRuns, now, sleep });
    await bridge.publish("pending", "Trusted automated-data checks are running");
    const completionDeadline = now() + 5 * 60_000;
    for (;;) {
      const runs = await readRuns("observe");
      for (const run of runs) {
        for (const job of run.jobs) if (job?.completed_at) {
          const previous = completedJobs.get(job.name);
          requireThat(!previous || previous === jobIdentity(job), "A completed required job changed while waiting.");
          completedJobs.set(job.name, jobIdentity(job));
        }
        requireThat(run.status !== "completed" || run.jobs.every((job) => job?.completed_at), "A workflow completed without its required job.");
      }
      if (completedJobs.size === CONTEXTS.length) break;
      requireThat(now() < completionDeadline, "Trusted automated-data checks timed out.");
      await sleep(10_000);
    }
    await bridge.publish("final");
    return bridge.receipt;
  } catch (error) {
    if (bridge) {
      if (await bridge.verifyMerged()) return bridge.receipt;
      bridge.receipt.verified = false;
      try {
        // A rerun can only invalidate a still-current content-validated target,
        // never transfer the preceding attempt's success to the new attempt.
        await bridge.publish("error", "Checks changed or could not be attached safely");
      } catch (invalidation) { bridge.receipt.invalidationBlocked = invalidation.message; }
      bridge.receipt.verified = false;
    }
    error.receipt = bridge?.receipt || receipt;
    error.receipt.failure = error.message;
    throw error;
  }
}

async function reconcileStaleAutomatedPrStatuses(options) {
  const { github, context, allowedByBranch } = options;
  requireThat(context.ref === "refs/heads/main", "The automated status bridge must run from main.");
  const now = options.now || Date.now, sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const { owner, repo } = context.repo;
  const staleBefore = now() - 90 * 60_000;
  const pulls = await github.paginate(github.rest.pulls.list, { owner, repo, state: "open", base: "main", per_page: 100 });
  const receipt = { schema_version: 1, mode: "reconcile-stale", pulls: [] };
  for (const pull of pulls) {
    if (!Object.hasOwn(allowedByBranch, pull.head.ref) || pull.head.repo?.full_name !== `${owner}/${repo}`) continue;
    try {
      const head = (await github.rest.repos.getCommit({ owner, repo, ref: pull.head.sha })).data;
      const updated = Date.parse(head.commit.committer?.date || head.commit.author?.date || "");
      if (!Number.isFinite(updated) || updated > staleBefore) continue;
      const identity = await prepare({ ...options, branch: pull.head.ref, headSha: pull.head.sha, pullNumber: pull.number });
      const bridge = makeBridge({ github, identity, readRuns: async () => [], now, sleep });
      bridge.receipt.mode = "reconcile-stale";
      // Failure-only reconciliation does not discover or project run results.
      await bridge.publish("error", "Automated check did not finish; rerun its data workflow", true);
      receipt.pulls.push(bridge.receipt);
    } catch (error) { receipt.pulls.push({ pull: pull.number, verified: false, failure: error.message }); }
  }
  return receipt;
}

module.exports = { attachAutomatedPrStatuses, reconcileStaleAutomatedPrStatuses };
