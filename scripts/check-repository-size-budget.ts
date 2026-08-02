import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPOSITORY_FILE_CATEGORIES,
  auditRepositorySizeBudget,
  parseRepositorySizeBudgetPolicy,
  readTrackedWorkingTreeSizes,
} from "./lib/repository-size-budget";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = path.join(ROOT, "config", "repository-size-budget.json");

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

function main(): void {
  const policy = parseRepositorySizeBudgetPolicy(
    JSON.parse(readFileSync(POLICY_PATH, "utf8")) as unknown,
  );
  const audit = auditRepositorySizeBudget(
    readTrackedWorkingTreeSizes(ROOT),
    policy,
  );

  console.log(
    `Repository size: ${audit.trackedFiles} tracked files, `
    + `${megabytes(audit.trackedBytes)} / ${megabytes(policy.totalMaxBytes)}.`,
  );
  console.log(
    `Large-file rule: ${megabytes(policy.defaultMaxBytes)} default; `
    + `${audit.oversizedFiles} classified exception(s).`,
  );
  for (const category of REPOSITORY_FILE_CATEGORIES) {
    console.log(
      `  ${category}: ${megabytes(audit.categoryBytes[category])} / `
      + megabytes(policy.categoryBudgets[category]),
    );
  }

  if (audit.violations.length === 0) {
    console.log("Repository size budget passed.");
    return;
  }
  for (const violation of audit.violations) {
    console.error(`[${violation.code}] ${violation.message}`);
    if (process.env.GITHUB_ACTIONS === "true") {
      const file = violation.path
        ? ` file=${violation.path},`
        : "";
      console.error(
        `::error${file} title=Repository size budget::${violation.message}`,
      );
    }
  }
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(
    "Repository size budget could not be evaluated:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
}
