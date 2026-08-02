"use strict";

// github-script loads this CommonJS module directly on the Actions runner.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");

const MARKER = "<!-- apify-source-change-radar -->";
const EXPIRY_MARKER_PREFIX = "<!-- apify-source-change-radar-expires:";
const TITLE = "[source-radar] First-party venue pages need review";

function safe(value, max = 160) {
  return String(value ?? "")
    .replace(/[|<>\r\n]/g, " ")
    .slice(0, max);
}

function expiryMarker(value) {
  return `${EXPIRY_MARKER_PREFIX}${value} -->`;
}

function validIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function latestExpiryFromBodies(bodies) {
  let latest;
  const pattern =
    /<!-- apify-source-change-radar-expires:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z) -->/g;
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

function validSignal(signal) {
  return (
    signal &&
    typeof signal === "object" &&
    !Array.isArray(signal) &&
    signal.schemaVersion === 1 &&
    signal.marker === MARKER &&
    signal.title === TITLE &&
    Array.isArray(signal.items) &&
    signal.items.length <= 3 &&
    validIsoTimestamp(signal.generatedAt) &&
    validIsoTimestamp(signal.expiresAt) &&
    signal.summary &&
    typeof signal.summary === "object" &&
    !Array.isArray(signal.summary) &&
    typeof signal.actionable === "boolean" &&
    signal.actionable === (signal.items.length > 0)
  );
}

function quietSummary(signal, runUrl) {
  return [
    MARKER,
    "## Latest source-radar run was quiet",
    "",
    `Collected: ${safe(signal.generatedAt, 40)}`,
    `Result: ${Number(signal.summary.baseline ?? 0)} baseline, ${Number(signal.summary.unchanged ?? 0)} unchanged, ${Number(signal.summary.cosmetic ?? 0)} isolated cosmetic, ${Number(signal.summary.changed ?? 0)} changed, ${Number(signal.summary.error ?? 0)} failed.`,
    `Workflow evidence: ${runUrl}`,
    "",
  ];
}

async function updateApifySourceChangeRadarIssue({
  github,
  context,
  core,
  signalPath = "scripts/reports/apify-source-change-radar/github-issue.json",
}) {
  const signal = JSON.parse(fs.readFileSync(signalPath, "utf8"));
  if (!validSignal(signal)) {
    core.setFailed("The radar issue signal failed its safe schema check.");
    return;
  }

  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const openIssues = await github.paginate(github.rest.issues.listForRepo, {
    ...context.repo,
    state: "open",
    per_page: 100,
  });
  const existing = openIssues.find(
    (issue) => !issue.pull_request && issue.body?.includes(MARKER),
  );

  if (!signal.actionable) {
    if (!existing) {
      core.info("No actionable source change and no open radar issue.");
      return;
    }
    const comments = await github.paginate(github.rest.issues.listComments, {
      ...context.repo,
      issue_number: existing.number,
      per_page: 100,
    });
    const latestExpiry = latestExpiryFromBodies([
      existing.body,
      ...comments.map((comment) => comment.body),
    ]);
    const lines = quietSummary(signal, runUrl);
    if (
      latestExpiry &&
      Date.parse(signal.generatedAt) >= Date.parse(latestExpiry)
    ) {
      lines.push(
        `The last actionable signal expired ${safe(latestExpiry, 40)} without a recorded human resolution. Closing only the review queue; canonical Radius data was not changed.`,
      );
      await github.rest.issues.createComment({
        ...context.repo,
        issue_number: existing.number,
        body: lines.join("\n"),
      });
      await github.rest.issues.update({
        ...context.repo,
        issue_number: existing.number,
        state: "closed",
        state_reason: "not_planned",
      });
      return;
    }
    lines.push(
      latestExpiry
        ? `This quiet snapshot does not resolve the earlier actionable signal. The issue remains open for human review through ${safe(latestExpiry, 40)}.`
        : "This quiet snapshot does not resolve the earlier actionable signal. No valid prior expiry marker was found, so the issue remains open for human review.",
      "A reviewer must promote, reject, or correct the signal explicitly; a quiet repeat never closes it early.",
    );
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: existing.number,
      body: lines.join("\n"),
    });
    return;
  }

  const rows = [];
  for (const item of signal.items) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      item.actor !== "apify/website-content-crawler" ||
      !["changed", "error", "warning"].includes(item.status) ||
      !["low", "medium", "high"].includes(item.confidence)
    ) {
      core.setFailed("A radar issue item failed its allowlist check.");
      return;
    }
    let sourceUrl;
    try {
      sourceUrl = new URL(item.sourceUrl);
    } catch {
      core.setFailed("A radar issue item used an invalid source URL.");
      return;
    }
    if (sourceUrl.protocol !== "https:") {
      core.setFailed("A radar issue item used a non-HTTPS source URL.");
      return;
    }
    const warnings = Array.isArray(item.parsingWarnings)
      ? item.parsingWarnings.map((value) => safe(value, 60)).join(", ") ||
        "none"
      : "none";
    const signalText =
      item.status === "error"
        ? `${safe(item.errorCode, 60)}${item.httpStatus ? ` (HTTP ${Number(item.httpStatus)})` : ""}`
        : `${safe(item.changedFields?.join(", ") || item.status, 100)}; dates ${Number(item.dateCount ?? 0)}, times ${Number(item.timeCount ?? 0)}, event links ${Number(item.eventLinkCount ?? 0)}`;
    rows.push(
      `| [${safe(item.sourceName)}](${sourceUrl.toString()}) | ${safe(item.town, 80)} | ${safe(item.status, 20)} | ${safe(item.confidence, 10)} | ${signalText} | ${warnings} | ${Number(item.canonicalCheck?.committedVenueEventCount ?? 0)} |`,
    );
  }

  const body = [
    MARKER,
    expiryMarker(signal.expiresAt),
    "## First-party venue source review",
    "",
    "This is a private-fingerprint review signal. It did not copy publisher prose and cannot publish an event.",
    "",
    `Collected: ${safe(signal.generatedAt, 40)}`,
    `Expires: ${safe(signal.expiresAt, 40)}`,
    "Actor: `apify/website-content-crawler`",
    `Workflow evidence: ${runUrl}`,
    "",
    "| Source | Town | Status | Confidence | Signal | Parsing warnings | Committed venue events checked |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "Review the original page and canonical venue records. Promote, reject, expire, or correct manually; this queue has no publishing permission.",
  ].join("\n");
  if (existing) {
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: existing.number,
      body,
    });
  } else {
    await github.rest.issues.create({ ...context.repo, title: TITLE, body });
  }
}

module.exports = {
  EXPIRY_MARKER_PREFIX,
  MARKER,
  TITLE,
  latestExpiryFromBodies,
  updateApifySourceChangeRadarIssue,
};
