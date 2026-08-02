"use strict";

// github-script loads this CommonJS module directly on the Actions runner.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require("node:crypto");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { publicHttpUrlDomain } = require("./public-http-url.cjs");

const LABEL_NAME = "source-scout-review";
const LABEL_COLOR = "1d76db";
const LABEL_DESCRIPTION = "Bot-owned Source Scout review queue";
const TRUSTED_BOT_LOGIN = "github-actions[bot]";
const MARKER_PREFIX = "<!-- source-scout:";
const FINGERPRINT_MARKER_PREFIX = "<!-- source-scout-fingerprint:";
const ALERT_MARKER_PREFIX = "<!-- source-scout-alert:";
const ATTEMPT_MARKER_PREFIX = "<!-- source-scout-attempt:";
const TITLE_PREFIX = "[source-scout:";
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_ITEMS = 50;
const MAX_CANDIDATES_PER_ITEM = 20;
const REVIEW_EXPIRY_MS = 30 * 24 * 60 * 60 * 1_000;
const QUERY_RESULT_STATUSES = new Set(["fetched", "cache"]);
const SKIPPED_STATUSES = new Set(["skipped-budget", "skipped-terminal-error"]);

function exactKeys(value, required) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === required.length &&
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function validIsoTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function validId(value) {
  return (
    typeof value === "string" && value.length <= 80 && ID_PATTERN.test(value)
  );
}

function normalizedPublicDomain(value) {
  return publicHttpUrlDomain(value);
}

function candidateFingerprint(candidates) {
  const identities = candidates
    .map(({ url, domain }) => ({ url, domain }))
    .sort(
      (left, right) =>
        left.url.localeCompare(right.url) ||
        left.domain.localeCompare(right.domain),
    );
  return createHash("sha256").update(JSON.stringify(identities)).digest("hex");
}

function validNullableCredits(value) {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1_000)
  );
}

function validCandidate(candidate) {
  if (!exactKeys(candidate, ["url", "domain", "score"])) return false;
  const domain = normalizedPublicDomain(candidate.url);
  return (
    domain !== undefined &&
    candidate.domain === domain &&
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    Math.abs(candidate.score) <= 1_000_000
  );
}

function validIssueItem(item, generatedAt) {
  const keys = [
    "profileId",
    "queryId",
    "observedAt",
    "expiresAt",
    "status",
    "candidateFingerprint",
    "candidateCount",
    "candidates",
    "estimatedCredits",
    "requestId",
    "apiReportedCredits",
    "errorCode",
    "errorStatus",
  ];
  if (
    !exactKeys(item, keys) ||
    !validId(item.profileId) ||
    !validId(item.queryId) ||
    !validIsoTimestamp(item.observedAt) ||
    Date.parse(item.observedAt) > Date.parse(generatedAt) ||
    !validIsoTimestamp(item.expiresAt) ||
    Date.parse(item.expiresAt) - Date.parse(generatedAt) !== REVIEW_EXPIRY_MS ||
    !Array.isArray(item.candidates) ||
    item.candidates.length > MAX_CANDIDATES_PER_ITEM ||
    item.candidates.some((candidate) => !validCandidate(candidate)) ||
    new Set(item.candidates.map(({ url }) => url)).size !==
      item.candidates.length ||
    !Number.isInteger(item.candidateCount) ||
    item.candidateCount !== item.candidates.length ||
    !HASH_PATTERN.test(item.candidateFingerprint) ||
    candidateFingerprint(item.candidates) !== item.candidateFingerprint ||
    !Number.isInteger(item.estimatedCredits) ||
    item.estimatedCredits < 1 ||
    item.estimatedCredits > 2 ||
    !(
      item.requestId === null ||
      (typeof item.requestId === "string" &&
        REQUEST_ID_PATTERN.test(item.requestId))
    ) ||
    !validNullableCredits(item.apiReportedCredits)
  ) {
    return false;
  }

  if (QUERY_RESULT_STATUSES.has(item.status)) {
    return item.errorCode === null && item.errorStatus === null;
  }
  if (item.status === "error") {
    return (
      item.candidateCount === 0 &&
      typeof item.errorCode === "string" &&
      ERROR_CODE_PATTERN.test(item.errorCode) &&
      (item.errorStatus === null ||
        (Number.isInteger(item.errorStatus) &&
          item.errorStatus >= 100 &&
          item.errorStatus <= 599))
    );
  }
  if (SKIPPED_STATUSES.has(item.status)) {
    return (
      item.candidateCount === 0 &&
      item.requestId === null &&
      item.apiReportedCredits === null &&
      item.errorCode === null &&
      item.errorStatus === null
    );
  }
  return false;
}

function validateSignal(signal) {
  if (
    !exactKeys(signal, ["schemaVersion", "generatedAt", "items"]) ||
    signal.schemaVersion !== 1 ||
    !validIsoTimestamp(signal.generatedAt) ||
    !Array.isArray(signal.items) ||
    signal.items.length < 1 ||
    signal.items.length > MAX_ITEMS
  ) {
    return false;
  }
  const identities = new Set();
  for (const item of signal.items) {
    const identity = `${item?.profileId}/${item?.queryId}`;
    if (identities.has(identity) || !validIssueItem(item, signal.generatedAt)) {
      return false;
    }
    identities.add(identity);
  }
  return true;
}

function stableMarker(profileId, queryId) {
  return `${MARKER_PREFIX}${profileId}:${queryId} -->`;
}

function fingerprintMarker(item) {
  return `${FINGERPRINT_MARKER_PREFIX}${item.profileId}:${item.queryId}:${item.candidateFingerprint}:${item.expiresAt} -->`;
}

function alertMarker(item) {
  return `${ALERT_MARKER_PREFIX}${item.profileId}:${item.queryId}:${item.expiresAt} -->`;
}

function attemptMarker(item, runId, runAttempt) {
  return `${ATTEMPT_MARKER_PREFIX}${runId}:${runAttempt}:${item.profileId}:${item.queryId} -->`;
}

function titleForItem(item) {
  return `${TITLE_PREFIX}${item.profileId}/${item.queryId}] Candidate sources need review`;
}

function labelsContain(issue, labelName) {
  return (
    Array.isArray(issue.labels) &&
    issue.labels.some((label) =>
      typeof label === "string"
        ? label === labelName
        : label?.name === labelName,
    )
  );
}

function bodyHasExactLine(body, line) {
  return (
    typeof body === "string" &&
    body.split(/\r?\n/).some((candidate) => candidate === line)
  );
}

function botAuthored(value, trustedBotLogin) {
  return value?.user?.login === trustedBotLogin && value.user.type === "Bot";
}

function trustedStableIssue(issue, item, trustedBotLogin) {
  return (
    !issue.pull_request &&
    botAuthored(issue, trustedBotLogin) &&
    labelsContain(issue, LABEL_NAME) &&
    issue.title === titleForItem(item) &&
    bodyHasExactLine(issue.body, stableMarker(item.profileId, item.queryId))
  );
}

function escapedPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function latestFingerprintState(bodies, profileId, queryId) {
  if (!validId(profileId) || !validId(queryId)) return undefined;
  const pattern = new RegExp(
    `^${escapedPattern(FINGERPRINT_MARKER_PREFIX)}${escapedPattern(profileId)}:${escapedPattern(queryId)}:([a-f0-9]{64}):(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z) -->$`,
  );
  let latest;
  for (const body of bodies) {
    if (typeof body !== "string") continue;
    for (const line of body.split(/\r?\n/)) {
      const match = pattern.exec(line);
      if (!match) continue;
      const expiresAt = match[2];
      if (
        validIsoTimestamp(expiresAt) &&
        (!latest || Date.parse(expiresAt) >= Date.parse(latest.expiresAt))
      ) {
        latest = { fingerprint: match[1], expiresAt };
      }
    }
  }
  return latest;
}

function latestAlertExpiry(bodies, profileId, queryId) {
  if (!validId(profileId) || !validId(queryId)) return undefined;
  const pattern = new RegExp(
    `^${escapedPattern(ALERT_MARKER_PREFIX)}${escapedPattern(profileId)}:${escapedPattern(queryId)}:(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z) -->$`,
  );
  let latest;
  for (const body of bodies) {
    if (typeof body !== "string") continue;
    for (const line of body.split(/\r?\n/)) {
      const match = pattern.exec(line);
      if (!match) continue;
      const expiresAt = match[1];
      if (
        validIsoTimestamp(expiresAt) &&
        (!latest || Date.parse(expiresAt) > Date.parse(latest))
      ) {
        latest = expiresAt;
      }
    }
  }
  return latest;
}

function issueEvidenceLines(item, runUrl) {
  const lines = [
    `- Profile ID: \`${item.profileId}\``,
    `- Query ID: \`${item.queryId}\``,
    `- Observed: ${item.observedAt}`,
    `- Status: \`${item.status}\``,
    `- Candidate fingerprint: \`${item.candidateFingerprint}\``,
    `- Candidate count: ${item.candidateCount}`,
    `- Estimated credits: ${item.estimatedCredits}`,
  ];
  if (item.requestId) lines.push(`- Tavily request ID: \`${item.requestId}\``);
  if (item.apiReportedCredits !== null) {
    lines.push(`- API-reported credits: ${item.apiReportedCredits}`);
  }
  if (item.errorCode) lines.push(`- Error code: \`${item.errorCode}\``);
  if (item.errorStatus !== null) {
    lines.push(`- Error HTTP status: ${item.errorStatus}`);
  }
  lines.push(`- Workflow evidence: ${runUrl}`);
  return lines;
}

function actionableBody(item, runUrl, runId, runAttempt) {
  const lines = [
    stableMarker(item.profileId, item.queryId),
    attemptMarker(item, runId, runAttempt),
    alertMarker(item),
  ];
  if (item.status !== "error") lines.push(fingerprintMarker(item));
  lines.push(
    "## Source Scout review",
    "",
    "This issue retains only the structured discovery evidence shown below and no provider-derived prose or page payload. It cannot write canonical Radius data.",
    "",
    ...issueEvidenceLines(item, runUrl),
  );
  if (item.candidates.length > 0) {
    lines.push("", "Candidate public URLs:");
    for (const candidate of item.candidates) {
      lines.push(
        `- <${candidate.url}> (domain: \`${candidate.domain}\`, score: ${candidate.score})`,
      );
    }
  }
  lines.push(
    "",
    `Review expiry: ${item.expiresAt}`,
    "",
    "Open each public URL and verify it manually. This queue cannot publish or edit Radius data.",
  );
  return lines.join("\n");
}

function closureBody(item, runUrl, runId, runAttempt, expiredAt) {
  return [
    stableMarker(item.profileId, item.queryId),
    attemptMarker(item, runId, runAttempt),
    fingerprintMarker(item),
    "## Source Scout review expired",
    "",
    ...issueEvidenceLines(item, runUrl),
    "",
    `The last actionable signal expired ${expiredAt}, and this fresh search returned no candidates. Closing this review queue as not planned. Canonical Radius data was not changed.`,
  ].join("\n");
}

function validContext(context) {
  return (
    context &&
    typeof context.serverUrl === "string" &&
    /^https:\/\/[^/]+$/.test(context.serverUrl) &&
    context.repo &&
    typeof context.repo.owner === "string" &&
    /^[A-Za-z0-9_.-]+$/.test(context.repo.owner) &&
    typeof context.repo.repo === "string" &&
    /^[A-Za-z0-9_.-]+$/.test(context.repo.repo) &&
    Number.isInteger(Number(context.runId)) &&
    Number(context.runId) > 0 &&
    Number.isInteger(Number(context.runAttempt)) &&
    Number(context.runAttempt) > 0
  );
}

function managedLabel(response) {
  return (
    response?.data?.name === LABEL_NAME &&
    String(response.data.color).toLowerCase() === LABEL_COLOR &&
    response.data.description === LABEL_DESCRIPTION
  );
}

function requireManagedLabel(response) {
  if (!managedLabel(response)) {
    throw new Error(
      `The ${LABEL_NAME} label exists but does not match the bot-owned queue contract.`,
    );
  }
}

async function ensureLabel(github, repo) {
  try {
    const existing = await github.rest.issues.getLabel({
      ...repo,
      name: LABEL_NAME,
    });
    requireManagedLabel(existing);
  } catch (error) {
    if (error?.status !== 404) throw error;
    try {
      const created = await github.rest.issues.createLabel({
        ...repo,
        name: LABEL_NAME,
        color: LABEL_COLOR,
        description: LABEL_DESCRIPTION,
      });
      requireManagedLabel(created);
    } catch (createError) {
      if (createError?.status !== 422) throw createError;
      const raced = await github.rest.issues.getLabel({
        ...repo,
        name: LABEL_NAME,
      });
      requireManagedLabel(raced);
    }
  }
}

async function updateSourceScoutIssues({
  github,
  context,
  core,
  signalPath = "scripts/reports/source-scout-github-issue.json",
  trustedBotLogin = TRUSTED_BOT_LOGIN,
}) {
  let signal;
  try {
    signal = JSON.parse(fs.readFileSync(signalPath, "utf8"));
  } catch {
    core.setFailed("The Source Scout issue signal could not be read as JSON.");
    return;
  }
  if (!validateSignal(signal)) {
    core.setFailed(
      "The Source Scout issue signal failed its compact safe schema check.",
    );
    return;
  }
  if (!validContext(context) || trustedBotLogin !== TRUSTED_BOT_LOGIN) {
    core.setFailed(
      "Source Scout requires trusted repository, run ID, run attempt, and bot context before queue mutation.",
    );
    return;
  }

  const runId = Number(context.runId);
  const runAttempt = Number(context.runAttempt);
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${runId}/attempts/${runAttempt}`;
  await ensureLabel(github, context.repo);

  const allIssues = await github.paginate(github.rest.issues.listForRepo, {
    ...context.repo,
    state: "all",
    labels: LABEL_NAME,
    per_page: 100,
  });
  if (!Array.isArray(allIssues)) {
    core.setFailed(
      "Source Scout received a malformed issue list; no queue mutation was attempted.",
    );
    return;
  }
  const existingByIdentity = new Map();
  const claimedIssueNumbers = new Set();
  for (const item of signal.items) {
    const matches = allIssues.filter((issue) =>
      trustedStableIssue(issue, item, trustedBotLogin),
    );
    if (matches.length > 1) {
      core.setFailed(
        `Source Scout found multiple trusted stable issues for ${item.profileId}/${item.queryId}; no queue mutation was attempted.`,
      );
      return;
    }
    const existing = matches[0];
    if (existing && claimedIssueNumbers.has(existing.number)) {
      core.setFailed(
        "Source Scout found one trusted issue claiming multiple profile/query identities; no queue mutation was attempted.",
      );
      return;
    }
    if (existing) claimedIssueNumbers.add(existing.number);
    existingByIdentity.set(`${item.profileId}/${item.queryId}`, existing);
  }

  for (const item of signal.items) {
    const identity = `${item.profileId}/${item.queryId}`;
    const existing = existingByIdentity.get(identity);
    const hasCandidates =
      QUERY_RESULT_STATUSES.has(item.status) && item.candidateCount > 0;
    const isError = item.status === "error";
    if (!existing) {
      if (hasCandidates || isError) {
        await github.rest.issues.create({
          ...context.repo,
          title: titleForItem(item),
          body: actionableBody(item, runUrl, runId, runAttempt),
          labels: [LABEL_NAME],
        });
      } else {
        core.info(
          `Source Scout ${identity} has no new actionable queue signal.`,
        );
      }
      continue;
    }

    const comments = await github.paginate(github.rest.issues.listComments, {
      ...context.repo,
      issue_number: existing.number,
      per_page: 100,
    });
    if (!Array.isArray(comments)) {
      core.setFailed(
        `Source Scout received malformed comments for ${identity}; no mutation was attempted for that queue.`,
      );
      return;
    }
    const trustedBodies = [
      existing.body,
      ...comments
        .filter((comment) => botAuthored(comment, trustedBotLogin))
        .map((comment) => comment.body),
    ];
    const currentAttemptMarker = attemptMarker(item, runId, runAttempt);
    const attemptRecorded = trustedBodies.some((body) =>
      bodyHasExactLine(body, currentAttemptMarker),
    );
    const fingerprintState = latestFingerprintState(
      trustedBodies,
      item.profileId,
      item.queryId,
    );
    const alertExpiry = latestAlertExpiry(
      trustedBodies,
      item.profileId,
      item.queryId,
    );
    const mayCloseExpired =
      item.status === "fetched" &&
      item.candidateCount === 0 &&
      existing.state === "open" &&
      alertExpiry &&
      Date.parse(signal.generatedAt) >= Date.parse(alertExpiry);

    if (attemptRecorded) {
      if (mayCloseExpired) {
        await github.rest.issues.update({
          ...context.repo,
          issue_number: existing.number,
          state: "closed",
          state_reason: "not_planned",
        });
      } else {
        core.info(`Source Scout attempt evidence for ${identity} is recorded.`);
      }
      continue;
    }

    if (isError) {
      if (existing.state !== "open") {
        await github.rest.issues.update({
          ...context.repo,
          issue_number: existing.number,
          state: "open",
        });
      }
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: existing.number,
        body: actionableBody(item, runUrl, runId, runAttempt),
      });
      continue;
    }

    if (hasCandidates) {
      if (fingerprintState?.fingerprint === item.candidateFingerprint) {
        core.info(
          `Source Scout candidate fingerprint for ${identity} is unchanged; its human issue state was preserved.`,
        );
        continue;
      }
      if (existing.state !== "open") {
        await github.rest.issues.update({
          ...context.repo,
          issue_number: existing.number,
          state: "open",
        });
      }
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: existing.number,
        body: actionableBody(item, runUrl, runId, runAttempt),
      });
      continue;
    }

    if (mayCloseExpired) {
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: existing.number,
        body: closureBody(item, runUrl, runId, runAttempt, alertExpiry),
      });
      await github.rest.issues.update({
        ...context.repo,
        issue_number: existing.number,
        state: "closed",
        state_reason: "not_planned",
      });
      continue;
    }

    core.info(
      `Source Scout quiet/cache/skipped result for ${identity} did not erase its issue state.`,
    );
  }
}

module.exports = {
  ALERT_MARKER_PREFIX,
  ATTEMPT_MARKER_PREFIX,
  FINGERPRINT_MARKER_PREFIX,
  LABEL_NAME,
  MARKER_PREFIX,
  TRUSTED_BOT_LOGIN,
  attemptMarker,
  candidateFingerprint,
  latestAlertExpiry,
  latestFingerprintState,
  stableMarker,
  updateSourceScoutIssues,
  validateSignal,
};
