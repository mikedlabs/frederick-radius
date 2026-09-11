import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditRepositorySizeBudget,
  parseRepositorySizeBudgetPolicy,
  readTrackedWorkingTreeSizes,
  type RepositorySizeBudgetPolicy,
} from "../scripts/lib/repository-size-budget";

function policy(
  overrides: Partial<RepositorySizeBudgetPolicy> = {},
): RepositorySizeBudgetPolicy {
  return {
    version: 1,
    defaultMaxBytes: 100,
    totalMaxBytes: 1_000,
    categoryBudgets: {
      "source-of-truth": 300,
      "deployment-required-snapshot": 300,
      "generated-artifact": 300,
      "design-archive": 300,
    },
    exceptions: [],
    ...overrides,
  };
}

const generatedException = {
  path: "src/data/generated.json",
  category: "generated-artifact" as const,
  maxBytes: 200,
  deploymentRequired: false,
  provenance: "Generated from reviewed source records.",
  regenerationCommand: "npm run build:generated",
};

describe("repository size budget", () => {
  it("keeps every required exception classification in the tracked policy", () => {
    const parsed = parseRepositorySizeBudgetPolicy(JSON.parse(
      readFileSync(
        resolve(process.cwd(), "config/repository-size-budget.json"),
        "utf8",
      ),
    ) as unknown);

    expect(new Set(parsed.exceptions.map((entry) => entry.category))).toEqual(
      new Set([
        "source-of-truth",
        "deployment-required-snapshot",
        "generated-artifact",
        "design-archive",
      ]),
    );
    expect(
      parsed.exceptions.every(
        (entry) => entry.provenance && (
          entry.category === "source-of-truth"
          || entry.regenerationCommand
        ),
      ),
    ).toBe(true);
  });

  it("runs the size gate in CI without displacing transit validation", () => {
    const ci = readFileSync(
      resolve(process.cwd(), ".github/workflows/ci.yml"),
      "utf8",
    );
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["audit:repo-size"]).toContain(
      "scripts/check-repository-size-budget.ts",
    );
    expect(ci).toContain("run: npm run audit:repo-size");
    expect(ci).toContain("run: npm run validate:transit-data");
  });

  it("accepts a classified file within file, category, and repository budgets", () => {
    const result = auditRepositorySizeBudget(
      [
        { path: "src/index.ts", bytes: 80 },
        { path: generatedException.path, bytes: 180 },
      ],
      policy({ exceptions: [generatedException] }),
    );

    expect(result).toMatchObject({
      trackedFiles: 2,
      trackedBytes: 260,
      oversizedFiles: 1,
      categoryBytes: { "generated-artifact": 180 },
      violations: [],
    });
  });

  it("rejects a new oversized tracked file without an explicit classification", () => {
    const result = auditRepositorySizeBudget(
      [{ path: "src/data/new-dump.json", bytes: 101 }],
      policy(),
    );

    expect(result.violations).toContainEqual(expect.objectContaining({
      code: "unclassified_oversized_file",
      path: "src/data/new-dump.json",
    }));
  });

  it("rejects both per-file and aggregate category regressions", () => {
    const result = auditRepositorySizeBudget(
      [{ path: generatedException.path, bytes: 220 }],
      policy({
        categoryBudgets: {
          "source-of-truth": 300,
          "deployment-required-snapshot": 300,
          "generated-artifact": 210,
          "design-archive": 300,
        },
        exceptions: [generatedException],
      }),
    );

    expect(result.violations.map((row) => row.code)).toEqual([
      "category_budget_exceeded",
      "file_budget_exceeded",
    ]);
  });

  it("rejects total tracked growth even when every individual file is small", () => {
    const result = auditRepositorySizeBudget(
      Array.from({ length: 11 }, (_, index) => ({
        path: `src/small-${index}.ts`,
        bytes: 100,
      })),
      policy(),
    );

    expect(result.violations).toContainEqual(expect.objectContaining({
      code: "tracked_total_budget_exceeded",
      path: null,
    }));
  });

  it("requires stale or missing exceptions to be cleaned up", () => {
    const stale = auditRepositorySizeBudget(
      [{ path: generatedException.path, bytes: 100 }],
      policy({ exceptions: [generatedException] }),
    );
    expect(stale.violations).toContainEqual(expect.objectContaining({
      code: "exception_no_longer_oversized",
    }));

    const missing = auditRepositorySizeBudget(
      [],
      policy({ exceptions: [generatedException] }),
    );
    expect(missing.violations).toContainEqual(expect.objectContaining({
      code: "exception_file_missing",
    }));
  });

  it("handles ordinary unstaged deletions while retaining missing-exception enforcement", () => {
    const repositoryRoot = mkdtempSync(
      resolve(tmpdir(), "radius-repository-size-budget-"),
    );
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: repositoryRoot });
      mkdirSync(resolve(repositoryRoot, "src/data"), { recursive: true });
      writeFileSync(resolve(repositoryRoot, "src/keep.ts"), "export {};\n");
      writeFileSync(
        resolve(repositoryRoot, generatedException.path),
        "x".repeat(150),
      );
      writeFileSync(resolve(repositoryRoot, "src/deleted.ts"), "export {};\n");
      execFileSync("git", ["add", "."], { cwd: repositoryRoot });
      unlinkSync(resolve(repositoryRoot, "src/deleted.ts"));
      unlinkSync(resolve(repositoryRoot, generatedException.path));

      const trackedFiles = readTrackedWorkingTreeSizes(repositoryRoot);
      expect(trackedFiles).toEqual([{
        path: "src/keep.ts",
        bytes: 11,
      }]);

      const result = auditRepositorySizeBudget(
        trackedFiles,
        policy({ exceptions: [generatedException] }),
      );
      expect(result.violations).toEqual([
        expect.objectContaining({
          code: "exception_file_missing",
          path: generatedException.path,
        }),
      ]);
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("fails closed on duplicate paths and incomplete provenance policy", () => {
    expect(() => parseRepositorySizeBudgetPolicy({
      ...policy(),
      exceptions: [
        generatedException,
        { ...generatedException },
      ],
    })).toThrow(/duplicate exception/);

    expect(() => parseRepositorySizeBudgetPolicy({
      ...policy(),
      exceptions: [{
        ...generatedException,
        regenerationCommand: null,
      }],
    })).toThrow(/requires a regenerationCommand/);

    expect(() => parseRepositorySizeBudgetPolicy({
      ...policy(),
      exceptions: [{
        ...generatedException,
        category: "deployment-required-snapshot",
        deploymentRequired: false,
      }],
    })).toThrow(/must set deploymentRequired true/);
  });
});
