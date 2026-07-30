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

    expect(workflow).toContain('cron: "17 9 * * *"');
    expect(workflow).toContain(
      "NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}",
    );
    expect(workflow).toContain(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}",
    );
    // The Vercel hours writer already retrieves businessStatus in the same
    // paid Place Details call. The GitHub materializer must not repeat a
    // status-only Google sweep over the same catalog.
    expect(workflow).not.toContain("run: npm run refresh:business-status");
    expect(workflow).not.toContain(
      "GOOGLE_PLACES_API_KEY: ${{ secrets.GOOGLE_PLACES_API_KEY }}",
    );
    expect(workflow).not.toContain("secrets.DATABASE_URL");
  });

  it("builds the pre-status identity snapshot before materializing hours and status", () => {
    const workflow = workflowText("data-steward.yml");
    const identityBuild = workflow.indexOf(
      "run: npm run build:place-refresh-identities",
    );
    const hoursPull = workflow.indexOf("run: npm run refresh:hours");

    expect(identityBuild).toBeGreaterThan(-1);
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

  it("does not schedule the non-persisting paid business-status reporter", () => {
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path?: string }> };

    expect(vercel.crons ?? []).not.toContainEqual(
      expect.objectContaining({ path: "/api/cron/business-status" }),
    );
    expect(vercel.crons ?? []).toContainEqual(
      expect.objectContaining({ path: "/api/cron/hours-refresh" }),
    );
  });

  it.each([
    [
      "ingest-business-info.yml",
      "ANTHROPIC_BUSINESS_INFO_API_KEY",
      'cron: "0 8 * * *"',
    ],
    [
      "ingest-civic.yml",
      "ANTHROPIC_CIVIC_API_KEY",
      'cron: "30 8 * * *"',
    ],
    [
      "ingest-venues.yml",
      "ANTHROPIC_VENUE_EVENTS_API_KEY",
      'cron: "30 9 * * *"',
    ],
  ])(
    "%s isolates its Anthropic key in the Data Enrichment environment",
    (name, secretName, schedule) => {
      const workflow = workflowText(name);

      expect(workflow).toContain('environment: "Data Enrichment"');
      expect(workflow).toContain(
        `ANTHROPIC_API_KEY: \${{ secrets.${secretName} }}`,
      );
      expect(workflow).toContain(schedule);
      expect(workflow).toContain(
        "github.event_name != 'schedule' || github.ref == 'refs/heads/main'",
      );
      expect(workflow).not.toContain("secrets.ANTHROPIC_API_KEY");
      expect(workflow).not.toContain("ANTHROPIC_ADMIN_API_KEY");
    },
  );

  it.each([
    "ingest-business-info.yml",
    "ingest-civic.yml",
    "ingest-venues.yml",
  ])(
    "%s fails closed when its optional Firecrawl fallback is misconfigured",
    (name) => {
      const workflow = workflowText(name);

      expect(workflow).toContain("Verify optional Firecrawl fallback");
      expect(workflow).toContain(
        "FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}",
      );
      expect(workflow).toContain(
        "FIRECRAWL_FETCH_FALLBACK: ${{ vars.FIRECRAWL_FETCH_FALLBACK || '0' }}",
      );
      expect(workflow).toContain(
        "FIRECRAWL_FALLBACK_MAX_REQUESTS: ${{ vars.FIRECRAWL_FALLBACK_MAX_REQUESTS || '6' }}",
      );
      expect(workflow).toContain('if [ -z "$FIRECRAWL_API_KEY" ]; then');
      expect(workflow).toContain('"$FIRECRAWL_FALLBACK_MAX_REQUESTS" -gt 20');
    },
  );

  it("does not splice workflow input into a secret-bearing shell command", () => {
    const workflow = workflowText("ingest-business-info.yml");

    expect(workflow).toContain(
      "INGEST_LIMIT: ${{ inputs.limit || '60' }}",
    );
    expect(workflow).toContain('--limit="$INGEST_LIMIT"');
    expect(workflow).not.toContain("--limit=${{");
  });

  it("caps normal business runs at 60 and reviewed backfills at 100", () => {
    const workflow = workflowText("ingest-business-info.yml");

    expect(workflow).toContain("reviewed_backfill:");
    expect(workflow).toContain(
      "REVIEWED_BACKFILL: ${{ inputs.reviewed_backfill || 'false' }}",
    );
    expect(workflow).toContain('"$INGEST_LIMIT" -gt 100');
    expect(workflow).toContain(
      '[ "$INGEST_LIMIT" -gt 60 ] && [ "$REVIEWED_BACKFILL" != "true" ]',
    );
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
