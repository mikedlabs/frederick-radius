#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const WORKFLOW_DIR = resolve(".github/workflows");

function workflow(name) {
  return readFileSync(resolve(WORKFLOW_DIR, name), "utf8");
}

function hasScheduledTrigger(source) {
  return /^  schedule:/m.test(source);
}

export function auditAutomationOwnership({
  workflows = Object.fromEntries(
    readdirSync(WORKFLOW_DIR)
      .filter((name) => name.endsWith(".yml"))
      .map((name) => [name, workflow(name)]),
  ),
  vercel = JSON.parse(readFileSync("vercel.json", "utf8")),
} = {}) {
  const failures = [];
  const scheduledGithub = Object.entries(workflows)
    .filter(([, source]) => hasScheduledTrigger(source))
    .map(([name]) => name)
    .sort();

  // Recurring source health is written by the deployed collectors and read by
  // one nightly reporter. These GitHub workflows remain useful diagnostics,
  // but scheduling them would buy a second probe of the same upstream state.
  for (const name of [
    "data-refresh.yml",
    "feed-health.yml",
    "freshness-check.yml",
    "production-canary.yml",
  ]) {
    if (hasScheduledTrigger(workflows[name] ?? "")) {
      failures.push(`${name} must remain event-driven or manual, not scheduled`);
    }
  }

  if (!hasScheduledTrigger(workflows["production-health-alert.yml"] ?? "")) {
    failures.push("production-health-alert.yml must remain the external uptime backstop");
  }

  // These audits own distinct, secret-free browser questions on the bounded
  // NAS browser runner. Exact times keep them away from each other and from
  // the morning data-generator lane on the same appliance.
  for (const [name, cron] of [
    ["ux-audit.yml", 'cron: "15 5 * * *"'],
    ["performance-budget.yml", 'cron: "15 17 * * *"'],
  ]) {
    const source = workflows[name] ?? "";
    if (!hasScheduledTrigger(source) || !source.includes(cron)) {
      failures.push(`${name} must keep its reviewed NAS browser schedule (${cron})`);
    }
  }
  if (hasScheduledTrigger(workflows["visual-contract.yml"] ?? "")) {
    failures.push(
      "visual-contract.yml must remain dispatch-only until reviewed Linux baselines are committed",
    );
  }
  if (scheduledGithub.length > 16) {
    failures.push(`scheduled GitHub workflows ${scheduledGithub.length} > 16`);
  }

  const ci = workflows["ci.yml"] ?? "";
  if (/^  push:/m.test(ci)) {
    failures.push("ci.yml must not rebuild main after Vercel takes ownership of the post-merge build");
  }
  const style = workflows["style.yml"] ?? "";
  if (!/^concurrency:/m.test(style) || !/cancel-in-progress:\s*true/.test(style)) {
    failures.push("style.yml must cancel superseded PR scans");
  }
  if ((workflows["data-steward.yml"] ?? "").includes("npm run feed:health")) {
    failures.push("data-steward.yml must not duplicate the deployed source-health probes");
  }

  const cronPaths = (vercel.crons ?? []).map((cron) => cron.path);
  const uniqueCronPaths = new Set(cronPaths);
  if (uniqueCronPaths.size !== cronPaths.length) {
    failures.push("vercel.json contains duplicate cron paths");
  }
  if (uniqueCronPaths.has("/api/cron/business-status")) {
    failures.push("business-status must not duplicate the paid hours-refresh sweep");
  }
  if (cronPaths.length > 20) {
    failures.push(`Vercel cron definitions ${cronPaths.length} > 20`);
  }

  return {
    failures,
    summary: {
      githubScheduledWorkflows: scheduledGithub.length,
      scheduledGithub,
      vercelCronDefinitions: cronPaths.length,
    },
  };
}

function main() {
  const result = auditAutomationOwnership();
  console.log("Automation ownership audit");
  console.log(`  GitHub scheduled workflows: ${result.summary.githubScheduledWorkflows}`);
  console.log(`  Vercel cron definitions:    ${result.summary.vercelCronDefinitions}`);
  if (result.failures.length > 0) {
    console.error("\nOwnership policy failed:");
    for (const failure of result.failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("  Duplicate scheduled owners: 0\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
