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

  it.each([
    "ingest-business-info.yml",
    "ingest-civic.yml",
    "ingest-venues.yml",
  ])("%s passes the Anthropic repository secret to its extraction step", (name) => {
    expect(workflowText(name)).toContain(
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
