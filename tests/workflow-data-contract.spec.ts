import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKFLOW_DIR = resolve(process.cwd(), ".github/workflows");

function workflowText(name: string): string {
  return readFileSync(resolve(WORKFLOW_DIR, name), "utf8");
}

type WorkflowDocument = {
  permissions?: {
    contents?: string;
    "pull-requests"?: string;
  };
};

describe("scheduled data workflow contracts", () => {
  it("uses the read-only Supabase Data API handoff for the hours snapshot", () => {
    const workflow = workflowText("data-steward.yml");

    expect(workflow).toContain(
      "NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}",
    );
    expect(workflow).toContain(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}",
    );
    expect(workflow).toContain(
      "GOOGLE_PLACES_API_KEY: ${{ secrets.GOOGLE_PLACES_API_KEY }}",
    );
    expect(workflow).not.toContain("secrets.DATABASE_URL");
  });

  it("builds the pre-status identity snapshot before either paid place refresh", () => {
    const workflow = workflowText("data-steward.yml");
    const identityBuild = workflow.indexOf(
      "run: npm run build:place-refresh-identities",
    );
    const statusRefresh = workflow.indexOf(
      "run: npm run refresh:business-status",
    );
    const hoursPull = workflow.indexOf("run: npm run refresh:hours");

    expect(identityBuild).toBeGreaterThan(-1);
    expect(statusRefresh).toBeGreaterThan(identityBuild);
    expect(hoursPull).toBeGreaterThan(identityBuild);
  });

  it("rebuilds canonical identities for direct local refresh commands", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(pkg.scripts["refresh:business-status"]).toMatch(
      /^npm run build:place-refresh-identities && /,
    );
    expect(pkg.scripts["refresh:hours"]).toMatch(
      /^npm run build:place-refresh-identities && /,
    );
    expect(pkg.scripts["build:client-places"]).toMatch(
      /^npm run build:place-refresh-identities && /,
    );
  });

  it.each([
    "ingest-business-info.yml",
    "ingest-civic.yml",
    "ingest-venues.yml",
  ])("%s uses the Production environment's Anthropic secret", (name) => {
    const workflow = workflowText(name);
    expect(workflow).toContain("environment: Production");
    expect(workflow).toContain(
      "ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}",
    );
  });

  it("does not splice workflow input into a secret-bearing shell command", () => {
    const workflow = workflowText("ingest-business-info.yml");

    expect(workflow).toContain(
      "INGEST_LIMIT: ${{ github.event.inputs.limit || '60' }}",
    );
    expect(workflow).toContain('--limit="$INGEST_LIMIT"');
    expect(workflow).not.toContain("--limit=${{");
  });

  it("grants explicit write permissions to every workflow that opens a PR", () => {
    const workflowNames = readdirSync(WORKFLOW_DIR).filter((name) =>
      /\.ya?ml$/.test(name),
    );
    const prWorkflows = workflowNames.filter((name) =>
      workflowText(name).includes("peter-evans/create-pull-request"),
    );

    expect(prWorkflows.length).toBeGreaterThan(0);
    for (const name of prWorkflows) {
      const workflow = parse(workflowText(name)) as WorkflowDocument;
      expect(
        workflow.permissions,
        `${name} must explicitly grant the bot permission to create its review PR`,
      ).toMatchObject({
        contents: "write",
        "pull-requests": "write",
      });
    }
  });
});
