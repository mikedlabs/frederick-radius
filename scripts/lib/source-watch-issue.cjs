"use strict";

// github-script loads this CommonJS module directly on the Actions runner.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = require("node:net");

const MARKER_PREFIX = "<!-- source-watch:";
const EXPIRY_MARKER_PREFIX = "<!-- source-watch-expires:";
const EVIDENCE_MARKER_PREFIX = "<!-- source-watch-evidence:";
const TITLE_PREFIX = "[source-watch:";
const BOT_LOGIN = "github-actions[bot]";
const QUEUE_LABEL = "source-watch-review";
const QUEUE_LABEL_COLOR = "1d76db";
const QUEUE_LABEL_DESCRIPTION =
  "Automated Source Watch review queue for exact public pages";
const ACTIONABLE_STATUSES = new Set([
  "changed",
  "removed",
  "error",
  "url-baseline",
]);
const QUIET_STATUSES = new Set(["baseline", "same"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_REVIEW_AGE_MS = 14 * 24 * 60 * 60 * 1_000;

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
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

function privateIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function privateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  const version = net.isIP(host);
  if (version === 4) return privateIpv4(host);
  if (version === 6) {
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/.test(host) ||
      host.startsWith("::ffff:")
    );
  }
  return false;
}

function validExactPublicUrl(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      parsed.href === value &&
      !privateHost(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function markerForSource(sourceId) {
  return `${MARKER_PREFIX}${sourceId} -->`;
}

function evidenceMarker(runId, runAttempt) {
  return `${EVIDENCE_MARKER_PREFIX}${runId}:${runAttempt} -->`;
}

function expiryMarker(sourceId, expiresAt) {
  return `${EXPIRY_MARKER_PREFIX}${sourceId}:${expiresAt} -->`;
}

function titleForSource(sourceId) {
  return `${TITLE_PREFIX}${sourceId}] Exact public page needs review`;
}

function hasExactMarker(body, marker) {
  return (
    typeof body === "string" &&
    body.split(/\r?\n/).some((line) => line === marker)
  );
}

function botAuthored(record) {
  return record?.user?.login === BOT_LOGIN;
}

function hasQueueLabel(issue) {
  return (
    Array.isArray(issue?.labels) &&
    issue.labels.some((label) =>
      typeof label === "string"
        ? label === QUEUE_LABEL
        : label?.name === QUEUE_LABEL,
    )
  );
}

function stableQueueIssue(issue, sourceId) {
  return (
    !issue?.pull_request &&
    botAuthored(issue) &&
    issue.title === titleForSource(sourceId) &&
    hasQueueLabel(issue) &&
    hasExactMarker(issue.body, markerForSource(sourceId))
  );
}

function responseHasQueueLabel(response) {
  return response?.data?.name === QUEUE_LABEL;
}

function errorStatus(error) {
  return error && typeof error === "object" ? error.status : undefined;
}

async function ensureQueueLabel(github, repo) {
  const getLabel = () =>
    github.rest.issues.getLabel({
      ...repo,
      name: QUEUE_LABEL,
    });

  try {
    const response = await getLabel();
    if (!responseHasQueueLabel(response)) {
      throw new Error("GitHub returned an unexpected Source Watch label.");
    }
    return;
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
  }

  try {
    const response = await github.rest.issues.createLabel({
      ...repo,
      name: QUEUE_LABEL,
      color: QUEUE_LABEL_COLOR,
      description: QUEUE_LABEL_DESCRIPTION,
    });
    if (!responseHasQueueLabel(response)) {
      throw new Error("GitHub created an unexpected Source Watch label.");
    }
  } catch (error) {
    // Another run may create the label between the guarded read and create.
    // Treat 422 as a race only after re-reading and verifying the exact label.
    if (errorStatus(error) !== 422) throw error;
    const response = await getLabel();
    if (!responseHasQueueLabel(response)) {
      throw new Error("GitHub did not confirm the Source Watch label.");
    }
  }
}

function attemptEvidence(context) {
  const runId = Number(context.runId);
  const runAttempt = Number(context.runAttempt);
  if (
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1
  ) {
    return undefined;
  }
  return {
    marker: evidenceMarker(runId, runAttempt),
    runUrl: `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${runId}/attempts/${runAttempt}`,
  };
}

function latestExpiryFromBodies(bodies, sourceId) {
  if (!SOURCE_ID_PATTERN.test(sourceId)) return undefined;
  let latest;
  const escapedId = sourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<!-- source-watch-expires:${escapedId}:(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z) -->`,
    "g",
  );
  for (const body of bodies) {
    if (typeof body !== "string") continue;
    for (const match of body.matchAll(pattern)) {
      const candidate = match[1];
      if (
        validIsoTimestamp(candidate) &&
        (!latest || Date.parse(candidate) > Date.parse(latest))
      ) {
        latest = candidate;
      }
    }
  }
  return latest;
}

function validCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function validIssueItem(item, generatedAt) {
  const baseKeys = [
    "sourceId",
    "sourceUrl",
    "checkedAt",
    "expiresAt",
    "status",
  ];
  if (
    !exactKeys(item, baseKeys, [
      "previousHash",
      "currentHash",
      "textLength",
      "linkCount",
      "errorCode",
      "httpStatus",
    ])
  ) {
    return false;
  }
  if (
    !SOURCE_ID_PATTERN.test(item.sourceId) ||
    !validExactPublicUrl(item.sourceUrl) ||
    !validIsoTimestamp(item.checkedAt) ||
    item.checkedAt !== generatedAt ||
    !validIsoTimestamp(item.expiresAt)
  ) {
    return false;
  }
  const reviewAge = Date.parse(item.expiresAt) - Date.parse(item.checkedAt);
  if (reviewAge <= 0 || reviewAge > MAX_REVIEW_AGE_MS) return false;

  if (["baseline", "same", "url-baseline"].includes(item.status)) {
    return (
      exactKeys(item, [
        ...baseKeys,
        "currentHash",
        "textLength",
        "linkCount",
      ]) &&
      HASH_PATTERN.test(item.currentHash) &&
      validCount(item.textLength) &&
      validCount(item.linkCount)
    );
  }
  if (item.status === "changed") {
    return (
      exactKeys(item, [
        ...baseKeys,
        "previousHash",
        "currentHash",
        "textLength",
        "linkCount",
      ]) &&
      HASH_PATTERN.test(item.previousHash) &&
      HASH_PATTERN.test(item.currentHash) &&
      item.previousHash !== item.currentHash &&
      validCount(item.textLength) &&
      validCount(item.linkCount)
    );
  }
  if (item.status === "removed" || item.status === "error") {
    if (
      !exactKeys(
        item,
        [...baseKeys, "errorCode"],
        ["previousHash", "httpStatus"],
      ) ||
      !ERROR_CODE_PATTERN.test(item.errorCode) ||
      (item.previousHash !== undefined &&
        !HASH_PATTERN.test(item.previousHash)) ||
      (item.httpStatus !== undefined &&
        (!Number.isInteger(item.httpStatus) ||
          item.httpStatus < 100 ||
          item.httpStatus > 599))
    ) {
      return false;
    }
    return (
      item.status !== "removed" ||
      (item.errorCode === "TARGET_HTTP_ERROR" &&
        (item.httpStatus === 404 || item.httpStatus === 410))
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
    signal.items.length > 15
  ) {
    return false;
  }
  const sourceIds = new Set();
  for (const item of signal.items) {
    if (
      !validIssueItem(item, signal.generatedAt) ||
      sourceIds.has(item.sourceId)
    ) {
      return false;
    }
    sourceIds.add(item.sourceId);
  }
  return true;
}

function evidenceRows(item, runUrl) {
  const rows = [
    `| Source ID | \`${item.sourceId}\` |`,
    `| Exact public URL | ${item.sourceUrl} |`,
    `| Checked | ${item.checkedAt} |`,
    `| Status | \`${item.status}\` |`,
  ];
  if (item.previousHash)
    rows.push(`| Previous hash | \`${item.previousHash}\` |`);
  if (item.currentHash) rows.push(`| Current hash | \`${item.currentHash}\` |`);
  if (item.textLength !== undefined) {
    rows.push(`| Text character count | ${item.textLength} |`);
  }
  if (item.linkCount !== undefined)
    rows.push(`| Link count | ${item.linkCount} |`);
  if (item.errorCode) rows.push(`| Error code | \`${item.errorCode}\` |`);
  if (item.httpStatus !== undefined)
    rows.push(`| HTTP status | ${item.httpStatus} |`);
  rows.push(`| Workflow evidence | ${runUrl} |`);
  return rows;
}

function actionableBody(item, evidence) {
  return [
    markerForSource(item.sourceId),
    expiryMarker(item.sourceId, item.expiresAt),
    evidence.marker,
    "## Source Watch review",
    "",
    "Only compact identity and fingerprint evidence is retained. No publisher prose, page diff, HTML, image, or extracted record is stored here.",
    "",
    "| Field | Evidence |",
    "| --- | --- |",
    ...evidenceRows(item, evidence.runUrl),
    `| Review expiry | ${item.expiresAt} |`,
    "",
    "Review the exact public page and explicitly resolve the signal. This queue cannot publish or edit Radius data.",
  ].join("\n");
}

function quietBody(item, evidence, latestExpiry) {
  return [
    markerForSource(item.sourceId),
    evidence.marker,
    "## Latest Source Watch run was quiet",
    "",
    "| Field | Evidence |",
    "| --- | --- |",
    ...evidenceRows(item, evidence.runUrl),
    "",
    latestExpiry
      ? `The earlier signal remains unresolved through ${latestExpiry}. A successful quiet run does not close it early.`
      : "No valid prior expiry marker was found, so the unresolved issue remains open for human review.",
  ].join("\n");
}

async function updateSourceWatchIssues({
  github,
  context,
  core,
  signalPath = "scripts/reports/source-watch/github-issue.json",
}) {
  const signal = JSON.parse(fs.readFileSync(signalPath, "utf8"));
  if (!validateSignal(signal)) {
    core.setFailed(
      "The Source Watch issue signal failed its compact safe schema check.",
    );
    return;
  }

  const evidence = attemptEvidence(context);
  if (!evidence) {
    core.setFailed(
      "GitHub did not provide a valid Source Watch run ID and attempt.",
    );
    return;
  }

  await ensureQueueLabel(github, context.repo);
  const allIssues = await github.paginate(github.rest.issues.listForRepo, {
    ...context.repo,
    state: "all",
    labels: QUEUE_LABEL,
    per_page: 100,
  });

  const existingBySource = new Map();
  for (const item of signal.items) {
    const matches = allIssues.filter((issue) =>
      stableQueueIssue(issue, item.sourceId),
    );
    if (matches.length > 1) {
      core.setFailed(
        `Source Watch found multiple stable issues for ${item.sourceId}; no queue mutation was attempted.`,
      );
      return;
    }
    existingBySource.set(item.sourceId, matches[0]);
  }

  for (const item of signal.items) {
    const existing = existingBySource.get(item.sourceId);
    if (!existing) {
      if (ACTIONABLE_STATUSES.has(item.status)) {
        await github.rest.issues.create({
          ...context.repo,
          title: titleForSource(item.sourceId),
          body: actionableBody(item, evidence),
          labels: [QUEUE_LABEL],
        });
      } else {
        core.info(
          `Source Watch baseline for ${item.sourceId} is review-visible in workflow evidence; no alert was opened.`,
        );
      }
      continue;
    }

    const comments = await github.paginate(github.rest.issues.listComments, {
      ...context.repo,
      issue_number: existing.number,
      per_page: 100,
    });
    const trustedBodies = [
      existing.body,
      ...comments
        .filter((comment) => botAuthored(comment))
        .map((comment) => comment.body),
    ];
    if (trustedBodies.some((body) => hasExactMarker(body, evidence.marker))) {
      core.info(
        `Source Watch workflow evidence for ${item.sourceId} is already recorded.`,
      );
      continue;
    }

    if (ACTIONABLE_STATUSES.has(item.status)) {
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
        body: actionableBody(item, evidence),
      });
      continue;
    }

    if (!QUIET_STATUSES.has(item.status) || existing.state !== "open") {
      continue;
    }
    const latestExpiry = latestExpiryFromBodies(trustedBodies, item.sourceId);
    if (
      latestExpiry &&
      Date.parse(item.checkedAt) >= Date.parse(latestExpiry)
    ) {
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: existing.number,
        body: [
          quietBody(item, evidence, latestExpiry),
          "",
          `The last actionable signal expired ${latestExpiry}. Closing only this review queue as not planned; canonical Radius data was not changed.`,
        ].join("\n"),
      });
      await github.rest.issues.update({
        ...context.repo,
        issue_number: existing.number,
        state: "closed",
        state_reason: "not_planned",
      });
      continue;
    }
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: existing.number,
      body: quietBody(item, evidence, latestExpiry),
    });
  }
}

module.exports = {
  BOT_LOGIN,
  EVIDENCE_MARKER_PREFIX,
  EXPIRY_MARKER_PREFIX,
  MARKER_PREFIX,
  QUEUE_LABEL,
  TITLE_PREFIX,
  evidenceMarker,
  latestExpiryFromBodies,
  markerForSource,
  updateSourceWatchIssues,
  validateSignal,
};
