import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
const read = (name: string) => readFileSync(`.github/workflows/${name}`, "utf8");
const expectedPaths = ["docs/coverage-scorecard.md", "docs/hours-refresh-review.md", "src/data/data-release.json", "src/data/event-venue-photo-credits.json", "src/data/place-refresh-identities.json", "src/data/places-client-hours.json", "src/data/places-client.json", "src/data/places-official-hours.json"].sort();
describe("official library hours delivery boundary", () => {
  it("reuses the existing schedule and credential-isolated publication with a fail-closed semantic gate", () => {
    const workflow = parse(read("data-steward.yml"));
    const producer = workflow.jobs["official-hours"];
    expect(producer.if).toBe("${{ github.ref == 'refs/heads/main' }}");
    expect(producer["runs-on"]).toBe("ubuntu-latest");
    expect(producer.permissions).toEqual({ contents: "read" });
    expect(producer.steps.some((step: { with?: Record<string, unknown> }) => step.with?.["node-version"] === 24)).toBe(true);
    const refresh = producer.steps.find((step: { id?: string }) => step.id === "refresh");
    expect(refresh.run).toBe("npm run refresh:official-hours");
    expect(refresh["continue-on-error"]).toBeUndefined();
    expect(producer.outputs.review_required).toBe("${{ steps.refresh.outputs.review_required != 'false' || steps.catalog-review.outputs.review_required != 'false' }}");
    expect(producer.steps.find((step: { id?: string }) => step.id === "catalog-review").run).toBe("npm run review:hours-refresh");
    const publisher = workflow.jobs["official-hours-publish"];
    expect(publisher.needs).toBe("official-hours");
    expect(publisher.uses).toBe("./.github/workflows/publish-automated-pr.yml");
    expect(publisher.with.allowed_paths.trim().split(/\s+/).sort()).toEqual(expectedPaths);
    expect(publisher.with.auto_merge).toBe("${{ needs.official-hours.outputs.review_required == 'false' }}");
    const checks = workflow.jobs["official-hours-checks"];
    expect(checks.uses).toBe("./.github/workflows/automated-pr-checks.yml");
    expect(checks.with.head_sha).toBe("${{ needs.official-hours-publish.outputs.pr_head_sha }}");
    expect(JSON.stringify(producer)).not.toMatch(/secrets\.|DATABASE_URL|GOOGLE_PLACES|self-hosted/);
  });
  it("permits exactly the same eight output paths in both existing trusted check boundaries", () => {
    for (const name of ["automated-pr-checks.yml", "automated-pr-status-bridge.yml"]) {
      const text = read(name);
      const match = text.match(/'bot\/official-library-hours':\s*\[([^\]]+)\]/);
      expect(match, name).not.toBeNull();
      const paths = [...match![1].matchAll(/'([^']+)'/g)].map((part) => part[1]).sort();
      expect(paths, name).toEqual(expectedPaths);
    }
    expect(read("automated-pr-status-bridge.yml").match(/'bot\/official-library-hours'/g)).toHaveLength(2);
  });
});


type ReviewPull = {
  id: string;
  number: number;
  state: string;
  headRefName: string;
  baseRefName: string;
  headRepository: { nameWithOwner: string };
  autoMergeRequest: { enabledAt: string } | null;
};
const queuedPull: ReviewPull = {
  id: "PR_official_hours",
  number: 42,
  state: "OPEN",
  headRefName: "bot/official-library-hours",
  baseRefName: "main",
  headRepository: { nameWithOwner: "mikedlabs/frederick-radius" },
  autoMergeRequest: { enabledAt: "2026-10-12T09:30:00Z" },
};
function autoMergeRevokeStep() {
  const workflow = parse(read("publish-automated-pr.yml"));
  const steps = workflow.jobs.publish.steps as {
    name?: string;
    if?: string;
    with?: { script?: string };
  }[];
  const index = steps.findIndex((step) => step.name === "Revoke an existing auto-merge before publishing review-required facts");
  if (index < 0) throw new Error("Missing pre-publication auto-merge revocation guard.");
  return { steps, index, step: steps[index] };
}
async function executeAutoMergeRevoke(options: {
  pulls?: ReviewPull[];
  branch?: string;
  lookupError?: Error;
  mutationError?: Error;
  verificationError?: Error;
  stillQueued?: boolean;
  changedIdentity?: boolean;
} = {}) {
  const failures: string[] = [];
  const operations: string[] = [];
  const pulls = structuredClone(options.pulls ?? [queuedPull]);
  const graphql = vi.fn(async (query: string, variables: Record<string, unknown>) => {
    if (query.includes("ExistingQueuedDataPull")) {
      operations.push("lookup");
      if (options.lookupError) throw options.lookupError;
      expect(variables).toEqual({ owner: "mikedlabs", repo: "frederick-radius", branch: options.branch ?? "bot/official-library-hours" });
      return { repository: { pullRequests: { nodes: pulls } } };
    }
    if (query.includes("DisableQueuedDataPull")) {
      operations.push("disable");
      expect(variables).toEqual({ pullRequestId: queuedPull.id });
      if (options.mutationError) throw options.mutationError;
      if (!options.stillQueued) pulls[0].autoMergeRequest = null;
      return { disablePullRequestAutoMerge: { pullRequest: { id: queuedPull.id } } };
    }
    if (query.includes("VerifyUnqueuedDataPull")) {
      operations.push("verify");
      expect(variables).toEqual({ pullRequestId: queuedPull.id });
      if (options.verificationError) throw options.verificationError;
      return { node: options.changedIdentity ? { ...pulls[0], headRefName: "bot/something-else" } : pulls[0] };
    }
    throw new Error("Unexpected GitHub operation.");
  });
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<void>;
  const execute = new AsyncFunction("github", "context", "core", "process", autoMergeRevokeStep().step.with?.script ?? "");
  await execute(
    { graphql },
    { repo: { owner: "mikedlabs", repo: "frederick-radius" }, ref: "refs/heads/main" },
    { setFailed: (message: unknown) => failures.push(String(message)), notice: () => undefined },
    { env: { AUTOMATED_PR_BRANCH: options.branch ?? "bot/official-library-hours" } },
  );
  return { failures, operations, graphql };
}

describe("review-required refreshes cannot inherit a queued auto-merge", () => {
  it("runs the revocation guard before the only branch-writing PR step, with failure blocking publication", () => {
    const { steps, index, step } = autoMergeRevokeStep();
    const publishIndex = steps.findIndex((candidate) => candidate.name === "Open or update the review PR");
    expect(index).toBeLessThan(publishIndex);
    expect(step.if).toBe("${{ !inputs.auto_merge }}");
    expect(step).not.toHaveProperty("continue-on-error");
    expect(step).not.toHaveProperty("continue_on_error");
  });
  it("revokes a previously queued no-change PR and verifies it is unqueued before semantic publication", async () => {
    const result = await executeAutoMergeRevoke();
    expect(result.failures).toEqual([]);
    expect(result.operations).toEqual(["lookup", "disable", "verify"]);
  });
  it.each([{ pulls: [] }, { pulls: [{ ...queuedPull, autoMergeRequest: null }] }])("does not mutate a missing or already unqueued PR", async ({ pulls }) => {
    const result = await executeAutoMergeRevoke({ pulls });
    expect(result.failures).toEqual([]);
    expect(result.operations).toEqual(["lookup"]);
  });
  it.each([
    { pulls: [queuedPull, queuedPull] },
    { pulls: [{ ...queuedPull, headRepository: { nameWithOwner: "other/frederick-radius" } }] },
    { pulls: [{ ...queuedPull, baseRefName: "release" }] },
    { pulls: [{ ...queuedPull, headRefName: "bot/something-else" }] },
    { pulls: [{ ...queuedPull, state: "CLOSED" }] },
  ])("rejects an ambiguous or mismatched PR without revoking another queue", async ({ pulls }) => {
    const result = await executeAutoMergeRevoke({ pulls });
    expect(result.failures).toHaveLength(1);
    expect(result.operations).toEqual(["lookup"]);
  });
  it("rejects a non-bot branch before any GitHub lookup", async () => {
    const result = await executeAutoMergeRevoke({ branch: "main" });
    expect(result.failures).toHaveLength(1);
    expect(result.graphql).not.toHaveBeenCalled();
  });
  it.each(["lookupError", "mutationError", "verificationError"] as const)("fails the workflow on %s instead of continuing to a branch push", async (field) => {
    await expect(executeAutoMergeRevoke({ [field]: new Error("GitHub unavailable") })).rejects.toThrow("GitHub unavailable");
  });
  it.each([{ stillQueued: true }, { changedIdentity: true }])("fails closed when post-revocation state cannot be confirmed", async (options) => {
    const result = await executeAutoMergeRevoke(options);
    expect(result.failures).toHaveLength(1);
    expect(result.operations).toEqual(["lookup", "disable", "verify"]);
  });
});
