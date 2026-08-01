"use strict";

const FAMILIES = {
  refresh: {
    marker: "<!-- automated-data-issue:refresh -->",
    legacyTitlePattern: /^Data refresh failure \d{4}-\d{2}-\d{2}$/,
    activeTitle: "Data refresh failure · active",
    labels: ["data-pipeline", "automated"],
  },
  freshness: {
    marker: "<!-- automated-data-issue:freshness -->",
    legacyTitlePattern: /^Stale data sources \d{4}-\d{2}-\d{2}$/,
    activeTitle: "Stale data sources · active",
    labels: ["data-pipeline", "automated", "stale-source"],
  },
};

function familyConfig(family) {
  const config = FAMILIES[family];
  if (!config) throw new Error(`Unknown automated issue family: ${family}`);
  return config;
}

function runUrl(context) {
  return `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
}

function belongsToFamily(issue, config) {
  if (issue.pull_request) return false;
  if (typeof issue.body === "string" && issue.body.includes(config.marker)) {
    return true;
  }
  const author = issue.user;
  const automationAuthor =
    author?.type === "Bot" || author?.login === "github-actions[bot]";
  return automationAuthor && config.legacyTitlePattern.test(issue.title);
}

async function listOpenFamilyIssues({ github, context, config }) {
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: "open",
    labels: "data-pipeline,automated",
    per_page: 100,
  });

  return issues
    .filter((issue) => belongsToFamily(issue, config))
    .sort((a, b) => b.number - a.number);
}

function currentBody({ config, context, body }) {
  return [
    config.marker,
    body.trim(),
    "",
    `Latest failing run: ${runUrl(context)}`,
    "",
    "This issue is maintained by automation. A clean run closes it automatically.",
  ].join("\n");
}

async function upsertFailure({ github, context, family, body }) {
  const config = familyConfig(family);
  const matches = await listOpenFamilyIssues({ github, context, config });
  const renderedBody = currentBody({ config, context, body });
  let primary;

  if (matches.length === 0) {
    const response = await github.rest.issues.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: config.activeTitle,
      body: renderedBody,
      labels: config.labels,
    });
    primary = response.data;
  } else {
    primary = matches[0];
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: primary.number,
      title: config.activeTitle,
      body: renderedBody,
    });
  }

  for (const duplicate of matches.slice(1)) {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: duplicate.number,
      body: `Superseded by #${primary.number}. Future failures are consolidated into one active issue.`,
    });
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: duplicate.number,
      state: "closed",
      state_reason: "duplicate",
      duplicate_issue_id: primary.id,
    });
  }

  return primary;
}

async function closeRecovered({ github, context, family, recoveryMessage }) {
  const config = familyConfig(family);
  const matches = await listOpenFamilyIssues({ github, context, config });

  for (const issue of matches) {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: `${recoveryMessage}\n\nSuccessful run: ${runUrl(context)}`,
    });
    await github.rest.issues.update({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      state: "closed",
      state_reason: "completed",
    });
  }

  return matches.length;
}

module.exports = {
  closeRecovered,
  upsertFailure,
};
