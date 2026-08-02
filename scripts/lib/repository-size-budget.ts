import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";

export const REPOSITORY_FILE_CATEGORIES = [
  "source-of-truth",
  "deployment-required-snapshot",
  "generated-artifact",
  "design-archive",
] as const;

export type RepositoryFileCategory =
  (typeof REPOSITORY_FILE_CATEGORIES)[number];

export type RepositorySizeException = {
  path: string;
  category: RepositoryFileCategory;
  maxBytes: number;
  deploymentRequired: boolean;
  provenance: string;
  regenerationCommand: string | null;
};

export type RepositorySizeBudgetPolicy = {
  version: 1;
  defaultMaxBytes: number;
  totalMaxBytes: number;
  categoryBudgets: Record<RepositoryFileCategory, number>;
  exceptions: RepositorySizeException[];
};

export type TrackedFileSize = {
  path: string;
  bytes: number;
};

export type RepositorySizeBudgetViolation = {
  code:
    | "duplicate_tracked_path"
    | "tracked_total_budget_exceeded"
    | "unclassified_oversized_file"
    | "exception_file_missing"
    | "exception_no_longer_oversized"
    | "file_budget_exceeded"
    | "category_budget_exceeded";
  path: string | null;
  message: string;
};

export type RepositorySizeBudgetAudit = {
  trackedFiles: number;
  trackedBytes: number;
  oversizedFiles: number;
  categoryBytes: Record<RepositoryFileCategory, number>;
  violations: RepositorySizeBudgetViolation[];
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function repositoryPath(value: unknown, label: string): string {
  const path = nonEmptyString(value, label);
  if (
    path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a normalized repository-relative path.`);
  }
  return path;
}

function category(
  value: unknown,
  label: string,
): RepositoryFileCategory {
  if (
    typeof value !== "string"
    || !REPOSITORY_FILE_CATEGORIES.includes(
      value as RepositoryFileCategory,
    )
  ) {
    throw new Error(
      `${label} must be one of ${REPOSITORY_FILE_CATEGORIES.join(", ")}.`,
    );
  }
  return value as RepositoryFileCategory;
}

/** Fail closed if a policy edit drops provenance, commands, or a budget. */
export function parseRepositorySizeBudgetPolicy(
  value: unknown,
): RepositorySizeBudgetPolicy {
  const root = record(value, "repository size policy");
  if (root.version !== 1) {
    throw new Error("repository size policy.version must be 1.");
  }
  const defaultMaxBytes = positiveInteger(
    root.defaultMaxBytes,
    "repository size policy.defaultMaxBytes",
  );
  const totalMaxBytes = positiveInteger(
    root.totalMaxBytes,
    "repository size policy.totalMaxBytes",
  );
  if (totalMaxBytes <= defaultMaxBytes) {
    throw new Error(
      "repository size policy.totalMaxBytes must exceed defaultMaxBytes.",
    );
  }

  const rawCategoryBudgets = record(
    root.categoryBudgets,
    "repository size policy.categoryBudgets",
  );
  const categoryBudgets = Object.fromEntries(
    REPOSITORY_FILE_CATEGORIES.map((name) => [
      name,
      positiveInteger(
        rawCategoryBudgets[name],
        `repository size policy.categoryBudgets.${name}`,
      ),
    ]),
  ) as Record<RepositoryFileCategory, number>;

  if (!Array.isArray(root.exceptions)) {
    throw new Error("repository size policy.exceptions must be an array.");
  }
  const seen = new Set<string>();
  const exceptions = root.exceptions.map((entry, index) => {
    const raw = record(entry, `repository size policy.exceptions[${index}]`);
    const path = repositoryPath(
      raw.path,
      `repository size policy.exceptions[${index}].path`,
    );
    if (seen.has(path)) {
      throw new Error(`repository size policy has a duplicate exception: ${path}.`);
    }
    seen.add(path);
    const fileCategory = category(
      raw.category,
      `repository size policy.exceptions[${index}].category`,
    );
    const maxBytes = positiveInteger(
      raw.maxBytes,
      `repository size policy.exceptions[${index}].maxBytes`,
    );
    if (maxBytes <= defaultMaxBytes) {
      throw new Error(`${path}: exception maxBytes must exceed defaultMaxBytes.`);
    }
    if (typeof raw.deploymentRequired !== "boolean") {
      throw new Error(`${path}: deploymentRequired must be boolean.`);
    }
    if (
      fileCategory === "deployment-required-snapshot"
      && raw.deploymentRequired !== true
    ) {
      throw new Error(
        `${path}: deployment-required-snapshot must set deploymentRequired true.`,
      );
    }
    if (
      (fileCategory === "generated-artifact" || fileCategory === "design-archive")
      && raw.deploymentRequired !== false
    ) {
      throw new Error(
        `${path}: ${fileCategory} must set deploymentRequired false.`,
      );
    }
    const provenance = nonEmptyString(raw.provenance, `${path}: provenance`);
    const regenerationCommand = raw.regenerationCommand === null
      ? null
      : nonEmptyString(
          raw.regenerationCommand,
          `${path}: regenerationCommand`,
        );
    if (fileCategory !== "source-of-truth" && !regenerationCommand) {
      throw new Error(
        `${path}: ${fileCategory} requires a regenerationCommand.`,
      );
    }
    return {
      path,
      category: fileCategory,
      maxBytes,
      deploymentRequired: raw.deploymentRequired,
      provenance,
      regenerationCommand,
    } satisfies RepositorySizeException;
  });

  return {
    version: 1,
    defaultMaxBytes,
    totalMaxBytes,
    categoryBudgets,
    exceptions,
  };
}

/**
 * Measure only paths known to Git. This deliberately ignores .next, output,
 * screenshots, and other untracked local files, while still checking unstaged
 * edits to tracked files before a contributor commits them.
 */
export function readTrackedWorkingTreeSizes(
  repositoryRoot: string,
): TrackedFileSize[] {
  const raw = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return raw
    .split("\0")
    .filter(Boolean)
    .map((repositoryPath) => ({
      path: repositoryPath,
      bytes: lstatSync(
        path.join(repositoryRoot, ...repositoryPath.split("/")),
      ).size,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function auditRepositorySizeBudget(
  trackedFiles: readonly TrackedFileSize[],
  policy: RepositorySizeBudgetPolicy,
): RepositorySizeBudgetAudit {
  const violations: RepositorySizeBudgetViolation[] = [];
  const filesByPath = new Map<string, TrackedFileSize>();
  let trackedBytes = 0;
  for (const file of trackedFiles) {
    if (filesByPath.has(file.path)) {
      violations.push({
        code: "duplicate_tracked_path",
        path: file.path,
        message: `${file.path}: tracked file inventory contains a duplicate path.`,
      });
      continue;
    }
    filesByPath.set(file.path, file);
    trackedBytes += file.bytes;
  }
  if (trackedBytes > policy.totalMaxBytes) {
    violations.push({
      code: "tracked_total_budget_exceeded",
      path: null,
      message:
        `Tracked files use ${trackedBytes} bytes; repository budget is `
        + `${policy.totalMaxBytes} bytes.`,
    });
  }

  const exceptionByPath = new Map(
    policy.exceptions.map((entry) => [entry.path, entry]),
  );
  const categoryBytes = Object.fromEntries(
    REPOSITORY_FILE_CATEGORIES.map((name) => [name, 0]),
  ) as Record<RepositoryFileCategory, number>;
  let oversizedFiles = 0;

  for (const file of filesByPath.values()) {
    if (file.bytes <= policy.defaultMaxBytes) continue;
    oversizedFiles += 1;
    const exception = exceptionByPath.get(file.path);
    if (!exception) {
      violations.push({
        code: "unclassified_oversized_file",
        path: file.path,
        message:
          `${file.path} is ${file.bytes} bytes; unclassified tracked files `
          + `must not exceed ${policy.defaultMaxBytes} bytes.`,
      });
      continue;
    }
    categoryBytes[exception.category] += file.bytes;
    if (file.bytes > exception.maxBytes) {
      violations.push({
        code: "file_budget_exceeded",
        path: file.path,
        message:
          `${file.path} is ${file.bytes} bytes; its explicit budget is `
          + `${exception.maxBytes} bytes.`,
      });
    }
  }

  for (const exception of policy.exceptions) {
    const file = filesByPath.get(exception.path);
    if (!file) {
      violations.push({
        code: "exception_file_missing",
        path: exception.path,
        message:
          `${exception.path}: size-budget exception exists but the tracked `
          + "file is missing.",
      });
    } else if (file.bytes <= policy.defaultMaxBytes) {
      violations.push({
        code: "exception_no_longer_oversized",
        path: exception.path,
        message:
          `${exception.path} is now within the default budget; remove its `
          + "exception instead of retaining a stale allowance.",
      });
    }
  }

  for (const fileCategory of REPOSITORY_FILE_CATEGORIES) {
    const used = categoryBytes[fileCategory];
    const budget = policy.categoryBudgets[fileCategory];
    if (used > budget) {
      violations.push({
        code: "category_budget_exceeded",
        path: null,
        message:
          `${fileCategory} exceptions use ${used} bytes; category budget is `
          + `${budget} bytes.`,
      });
    }
  }

  return {
    trackedFiles: filesByPath.size,
    trackedBytes,
    oversizedFiles,
    categoryBytes,
    violations: violations.sort(
      (left, right) =>
        left.code.localeCompare(right.code)
        || (left.path ?? "").localeCompare(right.path ?? ""),
    ),
  };
}
