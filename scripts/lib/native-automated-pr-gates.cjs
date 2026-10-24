"use strict";

const AUTOMATED_PR_ALLOWED_PATHS = {
  'bot/marc-schedule-refresh': ['src/data/marc-schedule.json'],
  'bot/official-library-hours': [
    'docs/coverage-scorecard.md',
    'docs/hours-refresh-review.md',
    'src/data/data-release.json',
    'src/data/event-venue-photo-credits.json',
    'src/data/place-refresh-identities.json',
    'src/data/places-client-hours.json',
    'src/data/places-client.json',
    'src/data/places-official-hours.json',
    'src/data/places-merchant-hours.json',
  ],
  'bot/data-steward': [
    'docs/coverage-scorecard.md',
    'docs/hours-refresh-review.md',
    'src/data/data-release.json',
    'src/data/event-venue-photo-credits.json',
    'src/data/place-refresh-identities.json',
    'src/data/places-client-hours.json',
    'src/data/places-client.json',
    'src/data/places-hours-refresh.json',
  ],
  'bot/transit-steward': [
    'src/data/data-release.json',
    'src/data/transit-network.json',
    'src/data/transit-trips.json',
    'src/data/transit.json',
  ],
  'bot/curated-place-enrichment': [
    'audit/google-enrichment-attempts.json',
    'src/data/data-release.json',
    'src/data/event-venue-photo-credits.json',
    'src/data/place-refresh-identities.json',
    'src/data/places-client-hours.json',
    'src/data/places-client.json',
    'src/data/places-enrichment.json',
  ],
  'bot/business-info-refresh': [
    'src/data/business-info.json',
    'src/data/data-release.json',
    'src/data/descriptions.json',
    'src/data/event-venue-photo-credits.json',
    'src/data/places-client-hours.json',
    'src/data/places-client.json',
  ],
  'bot/municipal-civic-refresh': ['src/data/municipal-civic.json'],
  'bot/venue-event-refresh': [
    'src/data/data-release.json',
    'src/data/venue-event-source-inventory.json',
    'src/data/venue-event-source-state.json',
    'src/data/venue-events.json',
  ],
  'bot/venue-native-refresh': [
    'src/data/data-release.json',
    'src/data/venue-event-source-inventory.json',
    'src/data/venue-event-source-state.json',
    'src/data/venue-events.json',
  ],
  'bot/google-photo-attribution-backfill': [
    'docs/coverage-scorecard.md',
    'src/data/data-release.json',
    'src/data/event-venue-photo-credits.json',
    'src/data/place-refresh-identities.json',
    'src/data/places-client-hours.json',
    'src/data/places-client.json',
    'src/data/places-enrichment.json',
  ],
  'bot/official-commerce-link-refresh': [
    'src/data/business-info.json',
    'src/data/data-release.json',
    'src/data/event-venue-photo-credits.json',
    'src/data/places-client-hours.json',
    'src/data/places-client.json',
  ],
};

for (const paths of Object.values(AUTOMATED_PR_ALLOWED_PATHS)) Object.freeze(paths);
Object.freeze(AUTOMATED_PR_ALLOWED_PATHS);

const SHA = /^[0-9a-f]{40}$/;
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const safeId = (value) => Number.isSafeInteger(value) && value > 0;
const workflowSpecs = ["ci.yml", "style.yml"];
const runningStates = new Set(["queued", "in_progress"]);
const knownBotHint = (options) => [options.branch, options.context?.payload?.pull_request?.head?.ref]
  .some((value) => typeof value === "string" && value.startsWith("bot/"));

async function prepare(options, native) {
  const { github, context, trustedMainSha } = options;
  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`;
  const eventPull = context.payload?.pull_request;
  const branch = options.branch || eventPull?.head?.ref;
  const headSha = options.headSha || eventPull?.head?.sha;
  requireThat(Object.hasOwn(AUTOMATED_PR_ALLOWED_PATHS, branch || "") && SHA.test(headSha || "")
    && SHA.test(trustedMainSha || ""), "Unexpected publisher branch, head or trusted main revision.");
  if (native) requireThat(context.eventName === "pull_request", "Only a native pull_request can select data-only gates.");
  else requireThat(context.ref === "refs/heads/main" && context.sha === trustedMainSha,
    "Approval must execute from the exact trusted main revision.");
  let pullNumber = options.pullNumber || eventPull?.number;
  if (!pullNumber) {
    const rows = (await github.rest.pulls.list({ owner, repo, state: "open", base: "main", head: `${owner}:${branch}`, per_page: 2 })).data;
    requireThat(Array.isArray(rows) && rows.length === 1 && safeId(rows[0]?.number), "Expected one unambiguous existing publisher PR.");
    pullNumber = rows[0].number;
  }
  requireThat(safeId(pullNumber), "Invalid publisher PR number.");
  if (native) requireThat(context.ref === `refs/pull/${pullNumber}/merge` && eventPull?.number === pullNumber
    && eventPull.head?.ref === branch && eventPull.head.sha === headSha
    && eventPull.head.repo?.full_name === repository && eventPull.base?.repo?.full_name === repository
    && eventPull.base.ref === "main" && eventPull.base.sha === trustedMainSha,
  "Native PR event identity does not match the expected publisher.");
  const currentPull = async () => {
    const [main, bot, response] = await Promise.all([
      github.rest.git.getRef({ owner, repo, ref: "heads/main" }),
      github.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }),
      github.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
    ]);
    const pull = response.data;
    requireThat(main.data.object.sha === trustedMainSha && bot.data.object.sha === headSha,
      "Current main or the publisher head moved. Reconcile before running data gates.");
    requireThat(pull.number === pullNumber && pull.state === "open" && pull.draft === false
      && pull.head?.ref === branch && pull.head.sha === headSha && pull.head.repo?.full_name === repository
      && pull.base?.ref === "main" && pull.base.sha === trustedMainSha && pull.base.repo?.full_name === repository,
    "The publisher PR base, head, repository or state changed.");
    requireThat(pull.mergeable === true && pull.mergeable_state !== "dirty" && SHA.test(pull.merge_commit_sha || ""),
      "A current mergeable publisher target is unavailable.");
    return pull;
  };
  const pull = await currentPull();
  const comparison = (await github.rest.repos.compareCommitsWithBasehead({ owner, repo,
    basehead: `${trustedMainSha}...${headSha}`, per_page: 100 })).data;
  const files = comparison.files;
  const allowlist = AUTOMATED_PR_ALLOWED_PATHS[branch];
  requireThat(comparison.status === "ahead" && comparison.behind_by === 0 && safeId(comparison.ahead_by)
    && safeId(comparison.total_commits) && comparison.total_commits <= 100,
  "The publisher is not an unambiguous current-main descendant.");
  requireThat(Array.isArray(files) && files.length > 0 && files.length <= allowlist.length
    && files.length === pull.changed_files && new Set(files.map((file) => file.filename)).size === files.length
    && files.every((file) => allowlist.includes(file.filename) && ["added", "modified"].includes(file.status)
      && file.previous_filename == null), "Publisher changes are incomplete, ambiguous or outside the exact existing data allowlist.");
  const [head, merge] = await Promise.all([
    github.rest.git.getCommit({ owner, repo, commit_sha: headSha }),
    github.rest.git.getCommit({ owner, repo, commit_sha: pull.merge_commit_sha }),
  ]);
  requireThat(SHA.test(head.data.tree?.sha || "") && head.data.tree.sha === merge.data.tree?.sha
    && merge.data.parents?.length === 2 && merge.data.parents[0].sha === trustedMainSha && merge.data.parents[1].sha === headSha,
  "The synthetic merge parents or tree differ from the reviewed current-main data head.");
  const identity = { owner, repo, branch, pullNumber, mainSha: trustedMainSha, headSha,
    mergeSha: pull.merge_commit_sha, treeSha: head.data.tree.sha };
  const revalidate = async () => {
    const current = await currentPull();
    requireThat(current.merge_commit_sha === identity.mergeSha && current.changed_files === files.length,
      "The current publisher target rotated or its changed-file evidence moved.");
    if (native) requireThat(context.sha === identity.mergeSha, "Native CI is not checking the exact current content-proven merge.");
  };
  await revalidate();
  return { identity, files: files.map(({ filename, status }) => ({ filename, status })), revalidate };
}

async function classifyNativeAutomatedPr(options) {
  const receipt = { schema_version: 1, mode: knownBotHint(options) ? "held" : "full", verified: false,
    semanticAcceptance: false, changesAutoMerge: false };
  if (receipt.mode === "full") { receipt.reason = "Ordinary non-publisher PR requires full application gates."; return receipt; }
  try {
    const candidate = await prepare(options, true);
    receipt.identity = candidate.identity; receipt.files = candidate.files;
    receipt.mode = "data-only"; receipt.verified = true;
  } catch (error) { receipt.reason = error.message; }
  return receipt;
}

function validateRunSource(run, workflow, identity) {
  const repository = `${identity.owner}/${identity.repo}`;
  requireThat(safeId(run.id) && run.workflow_id === workflow.id && run.path?.split("@")[0] === workflow.path
    && run.event === "pull_request" && run.head_sha === identity.headSha && run.head_branch === identity.branch
    && run.head_repository?.full_name === repository && run.repository?.full_name === repository
    && safeId(run.run_attempt) && safeId(run.check_suite_id), "Native workflow source, event, repository, head or attempt is invalid.");
}
function associationState(run, identity) {
  const associations = run.pull_requests;
  if (!Object.hasOwn(run, "pull_requests")) return "missing-field";
  if (!Array.isArray(associations)) return "not-array";
  if (associations.length === 0) return "empty-array";
  if (associations.length !== 1) return "multiple-associations";
  const repository = `${identity.owner}/${identity.repo}`;
  const sameRepository = (record) => record && (!record.full_name || record.full_name === repository)
    && (!record.url || record.url === `https://api.github.com/repos/${repository}`)
    && (record.full_name === repository || record.url === `https://api.github.com/repos/${repository}`);
  return associations[0]?.number === identity.pullNumber
    && associations[0].head?.sha === identity.headSha && associations[0].head.ref === identity.branch
    && sameRepository(associations[0].head.repo)
    && associations[0].base?.sha === identity.mainSha && associations[0].base.ref === "main"
    && sameRepository(associations[0].base.repo) ? "exact" : "mismatched-association";
}
function validateRun(run, workflow, identity) {
  validateRunSource(run, workflow, identity);
  requireThat(associationState(run, identity) === "exact",
    "Native run does not have one exact current publisher PR association.");
}
const observeRun = (run, file) => ({ workflow: file, id: run.id, attempt: run.run_attempt, event: run.event,
  headSha: run.head_sha, suiteId: run.check_suite_id, status: run.status, conclusion: run.conclusion ?? null,
  htmlUrl: run.html_url, action: "unselected" });
const alreadyRunningOrPassed = (run) => runningStates.has(run.status) && run.conclusion == null
  || run.status === "completed" && run.conclusion === "success";
const heldForApproval = (run) => run.status === "completed" && run.conclusion === "action_required";

async function approveNativeAutomatedPrRuns(options) {
  const { github } = options;
  const receipt = { schema_version: 1, mode: "approve-native-runs", state: "held", verified: false,
    semanticAcceptance: false, changesAutoMerge: false, manualApprovalRequired: true, runs: [], approvalWrites: [],
    associationReads: [],
    transportEligibility: "unproven-until-next-reviewed-native-batch" };
  try {
    const candidate = await prepare(options, false);
    receipt.identity = candidate.identity; receipt.files = candidate.files;
    const { owner, repo, branch, headSha } = candidate.identity;
    const workflows = [];
    for (const file of workflowSpecs) {
      const workflow = (await github.rest.actions.getWorkflow({ owner, repo, workflow_id: file })).data;
      requireThat(safeId(workflow.id) && workflow.path === `.github/workflows/${file}` && workflow.state === "active",
        "The existing native workflow identity is unavailable or changed.");
      workflows.push({ ...workflow, file });
    }
    const noteAssociations = (workflow, phase, rows, read) => {
      receipt.associationReads.push({ workflow: workflow.file, phase, read,
        runs: rows.map((run) => ({ id: run.id, attempt: run.run_attempt, suiteId: run.check_suite_id,
          associationState: associationState(run, candidate.identity),
          associationCount: Array.isArray(run.pull_requests) ? run.pull_requests.length : null })) });
    };
    const latest = async (workflow, discovery = false) => {
      let pinnedIdentity;
      // Retry only an explicitly empty discovery association array. It is never
      // approval evidence: both workflows must eventually provide exact PR
      // associations, and every later independent read retains that requirement.
      for (let read = 1; read <= (discovery ? 4 : 1); read += 1) {
        await candidate.revalidate();
        const response = (await github.rest.actions.listWorkflowRuns({ owner, repo, workflow_id: workflow.id,
          branch, head_sha: headSha, event: "pull_request", exclude_pull_requests: false, per_page: 100 })).data;
        const rows = response.workflow_runs;
        requireThat(Array.isArray(rows) && safeId(response.total_count) && response.total_count === rows.length
          && rows.length < 100 && new Set(rows.map((row) => row.id)).size === rows.length,
        `Missing, ambiguous or incomplete native runs for ${workflow.file}. Manual owner approval is required.`);
        noteAssociations(workflow, discovery ? "discovery" : "pre-approval", rows, read);
        rows.forEach((run) => validateRunSource(run, workflow, candidate.identity));
        const identity = rows.map((run) => `${run.id}:${run.run_attempt}:${run.check_suite_id}`).sort().join(",");
        requireThat(pinnedIdentity === undefined || pinnedIdentity === identity,
          "The native discovery run IDs, attempts or check suites changed while waiting for association metadata.");
        pinnedIdentity = identity;
        const states = rows.map((run) => associationState(run, candidate.identity));
        requireThat(states.every((state) => state === "exact" || state === "empty-array"),
          "Native run does not have one exact current publisher PR association.");
        if (states.every((state) => state === "exact")) {
          rows.forEach((run) => validateRun(run, workflow, candidate.identity));
          return rows.sort((a, b) => b.id - a.id)[0];
        }
        requireThat(discovery && read < 4,
          "Native run PR association metadata remains empty; exact owner-reviewed native runs remain held.");
        await candidate.revalidate();
        await (options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(4000);
        await candidate.revalidate();
      }
    };
    const pinned = [];
    // Discover both native gates before changing either one. A missing second
    // run cannot justify dispatching or approving a substitute first gate.
    for (const workflow of workflows) {
      const run = await latest(workflow, true);
      pinned.push({ workflow, run }); receipt.runs.push(observeRun(run, workflow.file));
    }
    requireThat(new Set(pinned.map(({ run }) => run.id)).size === pinned.length, "Native gate IDs overlap.");
    for (const { run } of pinned) requireThat(heldForApproval(run) || alreadyRunningOrPassed(run),
      "An existing native gate failed, was cancelled, skipped or has an uncertain state. Owner attention is required.");
    for (const [index, { workflow, run }] of pinned.entries()) {
      await candidate.revalidate();
      const current = await latest(workflow);
      requireThat(current.id === run.id && current.run_attempt === run.run_attempt && current.check_suite_id === run.check_suite_id,
        "The latest native run ID, attempt or check suite changed before approval.");
      const independent = (await github.rest.actions.getWorkflowRun({ owner, repo, run_id: run.id })).data;
      noteAssociations(workflow, "independent-pre-approval", [independent], 1);
      validateRun(independent, workflow, candidate.identity);
      requireThat(independent.id === run.id && independent.run_attempt === run.run_attempt && independent.check_suite_id === run.check_suite_id,
        "Independent native run ID, attempt or check suite changed before approval.");
      await candidate.revalidate();
      if (alreadyRunningOrPassed(independent)) {
        receipt.runs[index] = { ...observeRun(independent, workflow.file), action: "observed" }; continue;
      }
      requireThat(heldForApproval(run) && heldForApproval(current) && heldForApproval(independent), "The exact native run is no longer the originally selected held approval.");
      const write = { id: run.id, workflow: workflow.file, attempt: run.run_attempt, suiteId: run.check_suite_id,
        headSha, at: new Date((options.now || Date.now)()).toISOString(), responseStatus: null,
        observationReads: 0, transitionVerified: false };
      receipt.approvalWrites.push(write);
      let response;
      try { response = await github.rest.actions.approveWorkflowRun({ owner, repo, run_id: run.id }); }
      catch (error) { write.responseStatus = error.status ?? null; throw error; }
      write.responseStatus = response.status;
      requireThat(response.status === 201, "Native approval did not return the documented 201 response. Manual owner approval is required.");
      let after;
      // A status read may lag accepted approval. Observe only this approved ID and
      // attempt, without another write, for at most 2.25 seconds of waiting.
      for (let observation = 0; observation < 4; observation += 1) {
        await candidate.revalidate();
        write.observationReads += 1;
        after = (await github.rest.actions.getWorkflowRun({ owner, repo, run_id: run.id })).data;
        noteAssociations(workflow, "approval-observation", [after], write.observationReads);
        validateRun(after, workflow, candidate.identity);
        requireThat(after.id === run.id && after.run_attempt === run.run_attempt && after.check_suite_id === run.check_suite_id,
          "The exact native run ID, attempt or check suite changed during approval observation.");
        if (alreadyRunningOrPassed(after)) break;
        requireThat(heldForApproval(after) && observation < 3,
          "Approval transition is not independently verified for the exact native run and attempt. Do not retry automatically.");
        await (options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(750);
      }
      write.transitionVerified = true;
      receipt.runs[index] = { ...observeRun(after, workflow.file), action: "approved" };
    }
    await candidate.revalidate();
    receipt.state = receipt.approvalWrites.length ? "approved" : "observed";
    receipt.manualApprovalRequired = false; receipt.verified = true;
  } catch (error) { receipt.failure = error.message; receipt.errorStatus = error.status ?? null; }
  return receipt;
}

module.exports = { AUTOMATED_PR_ALLOWED_PATHS, classifyNativeAutomatedPr, approveNativeAutomatedPrRuns };
