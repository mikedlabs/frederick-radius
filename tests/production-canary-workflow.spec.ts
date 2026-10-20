import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type GitHubContext = {
  event_name: string;
  event: {
    deployment?: { environment: string; creator: { login: string } };
    deployment_status?: { state: string; creator: { login?: string } };
  };
};

function canaryAdmitted(github: GitHubContext): unknown {
  const workflow = parse(readFileSync(resolve(
    process.cwd(), ".github/workflows/production-canary.yml",
  ), "utf8")) as { jobs: { apex: { if: string } } };
  // Evaluate the actual comparison/boolean gate, rather than copying its policy
  // into a helper that could pass while the deployed workflow still skips.
  return runInNewContext(`(${workflow.jobs.apex.if})`, { github }, { timeout: 1000 });
}

function statusContext({
  state = "success",
  environment = "Production",
  deploymentCreator = "mikedlabs",
  statusCreator = "vercel[bot]",
}: {
  state?: string;
  environment?: string;
  deploymentCreator?: string;
  statusCreator?: string;
} = {}): GitHubContext {
  return {
    event_name: "deployment_status",
    event: {
      deployment: { environment, creator: { login: deploymentCreator } },
      deployment_status: { state, creator: { login: statusCreator } },
    },
  };
}

describe("production canary deployment-status admission", () => {
  it.each(["success", "failure", "error"])(
    "checks Vercel %s even when another workflow created the Production record",
    (state) => {
      expect(canaryAdmitted(statusContext({ state }))).toBe(true);
    },
  );

  it("still checks a Vercel-created record with a Vercel completion status", () => {
    expect(canaryAdmitted(statusContext({ deploymentCreator: "vercel[bot]" }))).toBe(true);
  });

  it.each(["mikedlabs", "github-actions[bot]", "another-integration[bot]"])(
    "rejects a status authored by %s even on a Vercel-created record",
    (statusCreator) => {
      expect(canaryAdmitted(statusContext({
        deploymentCreator: "vercel[bot]", statusCreator,
      }))).toBe(false);
    },
  );

  it("rejects the owner-created record's own completion status", () => {
    expect(canaryAdmitted(statusContext({ statusCreator: "mikedlabs" }))).toBe(false);
  });

  it.each(["Preview", "Staging", ""])("rejects the %s environment", (environment) => {
    expect(canaryAdmitted(statusContext({ environment }))).toBe(false);
  });

  it.each(["queued", "pending", "in_progress", "inactive", ""])(
    "does not run on a nonterminal %s status", (state) => {
      expect(canaryAdmitted(statusContext({ state }))).toBe(false);
    },
  );

  it("rejects a completion with no identified status author", () => {
    const github = statusContext();
    github.event.deployment_status!.creator = {};
    expect(canaryAdmitted(github)).toBe(false);
  });

  it("preserves explicit manual dispatch without deployment event fields", () => {
    expect(canaryAdmitted({ event_name: "workflow_dispatch", event: {} })).toBe(true);
  });
});
