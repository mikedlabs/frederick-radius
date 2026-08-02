import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKFLOW_DIR = resolve(process.cwd(), ".github/workflows");
const PINNED_CREATE_PR =
  "peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1";

function workflowText(name: string): string {
  return readFileSync(resolve(WORKFLOW_DIR, name), "utf8");
}

type WorkflowDocument = {
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean;
  };
  permissions?: {
    actions?: string;
    contents?: string;
    issues?: string;
    "pull-requests"?: string;
  };
  jobs?: Record<
    string,
    {
      "timeout-minutes"?: number;
      "runs-on"?: string;
      permissions?: {
        actions?: string;
        contents?: string;
        issues?: string;
        "pull-requests"?: string;
      };
    }
  >;
};

describe("scheduled data workflow contracts", () => {
  it("pins every external workflow action to an immutable commit", () => {
    const workflowNames = readdirSync(WORKFLOW_DIR).filter((name) =>
      /\.ya?ml$/.test(name),
    );
    let checkedActions = 0;

    for (const name of workflowNames) {
      const actionUses = workflowText(name).matchAll(
        /^\s*(?:-\s*)?uses:\s*([^\s#]+)@([^\s#]+)/gm,
      );
      for (const [, action, revision] of actionUses) {
        checkedActions += 1;
        expect(
          revision,
          `${name} must pin ${action} to an immutable commit`,
        ).toMatch(/^[0-9a-f]{40}$/);
      }
    }

    expect(checkedActions).toBeGreaterThan(0);
  });

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

  it("puts an inspectable hours-change manifest and current scorecard in every steward PR", () => {
    const workflow = workflowText("data-steward.yml");
    const clientBuild = workflow.indexOf("run: npm run build:client-places");
    const scorecard = workflow.indexOf("run: npm run coverage:scorecard");
    const review = workflow.indexOf("run: npm run review:hours-refresh");
    const stageArtifact = workflow.indexOf("Stage exact core outputs");
    const publish = workflow.indexOf("steward-publish:");

    expect(clientBuild).toBeGreaterThan(-1);
    expect(scorecard).toBeGreaterThan(clientBuild);
    expect(review).toBeGreaterThan(scorecard);
    expect(stageArtifact).toBeGreaterThan(review);
    expect(publish).toBeGreaterThan(stageArtifact);
    expect(workflow).toContain("id: hours-review");
    expect(workflow).toContain(
      "steps.hours-review.outputs.review_required == 'true'",
    );
    expect(workflow).toContain("docs/hours-refresh-review.md");
    expect(workflow).toContain(
      'cat docs/hours-refresh-review.md >> "$GITHUB_STEP_SUMMARY"',
    );
    expect(workflow).toContain(
      "Public additions: ${{ needs.steward.outputs.public_additions }}",
    );
    expect(workflow).toContain(
      "Public removals: ${{ needs.steward.outputs.public_removals }}",
    );
    expect(workflow).toContain(
      "Newly closed provider statuses: ${{ needs.steward.outputs.newly_closed }}",
    );
    expect(workflow).toContain(
      "- [ ] I checked every public addition and removal in the manifest.",
    );
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

  it("schedules the explicitly gated paid business-status reporter", () => {
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path?: string; schedule?: string }> };

    expect(vercel.crons ?? []).toContainEqual(
      expect.objectContaining({
        path: "/api/cron/business-status",
        schedule: "0 7 * * *",
      }),
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
    ["ingest-civic.yml", "ANTHROPIC_CIVIC_API_KEY", 'cron: "30 8 * * *"'],
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
      expect(workflow).toContain("if: ${{ github.ref == 'refs/heads/main' }}");
      expect(workflow).not.toContain("secrets.ANTHROPIC_API_KEY");
      expect(workflow).not.toContain("ANTHROPIC_ADMIN_API_KEY");
    },
  );

  it.each([
    ["ingest-business-info.yml", "BUSINESS"],
    ["ingest-civic.yml", "CIVIC"],
    ["ingest-venues.yml", "VENUE"],
  ])(
    "%s fails closed when its optional Firecrawl fallback is misconfigured",
    (name, scope) => {
      const workflow = workflowText(name);

      expect(workflow).toMatch(
        /Validate optional Firecrawl fallback|Require venue extraction configuration/,
      );
      expect(workflow).toContain(
        "FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}",
      );
      expect(workflow).toContain(
        `FIRECRAWL_FETCH_FALLBACK: \${{ vars.${scope}_FIRECRAWL_FETCH_FALLBACK || '0' }}`,
      );
      expect(workflow).toContain(
        `FIRECRAWL_FALLBACK_MAX_REQUESTS: \${{ vars.${scope}_FIRECRAWL_FALLBACK_MAX_REQUESTS || '1' }}`,
      );
      expect(workflow).toContain('if [ -z "$FIRECRAWL_API_KEY" ]; then');
      expect(workflow).toContain('"$FIRECRAWL_FALLBACK_MAX_REQUESTS" -gt 2');
      expect(workflow).toContain(
        "group: ${{ vars." +
          scope +
          "_FIRECRAWL_FETCH_FALLBACK == '1' && 'operator-firecrawl-fallback-budget'",
      );
      expect(workflow).toContain(
        "run-name: " +
          (name === "ingest-venues.yml"
            ? "Ingest venue events"
            : name === "ingest-business-info.yml"
              ? "Ingest business deep-info"
              : "Ingest municipal civic data") +
          ` (firecrawl=\${{ vars.${scope}_FIRECRAWL_FETCH_FALLBACK || '0' }}, cap=\${{ vars.${scope}_FIRECRAWL_FALLBACK_MAX_REQUESTS || '1' }})`,
      );
      expect(workflow).toContain("actions: read");
      expect(workflow).toContain(
        "FIRECRAWL_LEGACY_DISABLED_RUN_IDS: ${{ vars.FIRECRAWL_LEGACY_DISABLED_RUN_IDS || '' }}",
      );
      expect(workflow).toContain("Enforce shared Firecrawl fallback budget");
      expect(workflow).toContain(
        'require("./scripts/lib/firecrawl-fallback-budget.cjs")',
      );
      expect(workflow).toContain(
        "steps.firecrawl-budget.outputs.allowed == 'true'",
      );
      expect(workflow).toContain(
        "if: ${{ success() && steps.firecrawl-budget.outputs.allowed == 'true' && steps.firecrawl-budget.outputs.enabled == 'true' }}",
      );
      expect(workflow).toContain(
        "FIRECRAWL_API_KEY: ${{ steps.firecrawl-budget.outputs.allowed == 'true' && steps.firecrawl-budget.outputs.enabled == 'true' && secrets.FIRECRAWL_API_KEY || '' }}",
      );
      expect(
        workflow.indexOf("Enforce shared Firecrawl fallback budget"),
      ).toBeLessThan(
        workflow.indexOf("FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}"),
      );
      expect(
        workflow.indexOf("Enforce shared Firecrawl fallback budget"),
      ).toBeLessThan(
        workflow.indexOf(
          "FIRECRAWL_API_KEY: ${{ steps.firecrawl-budget.outputs.allowed",
        ),
      );
    },
  );

  it("does not publish a venue refresh when extraction or verification fails", () => {
    const workflow = workflowText("ingest-venues.yml");

    expect(workflow).toContain(
      "if: ${{ always() && steps.extract.outcome == 'success' && steps.verify.outcome == 'success' }}",
    );
  });

  it("keeps the business Firecrawl request behind the browser fallback", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/ingest-business-info.ts"),
      "utf8",
    );
    const plainFetch = script.indexOf("firecrawlFallback: false");
    const renderedFetch = script.indexOf("render: true", plainFetch);

    expect(plainFetch).toBeGreaterThan(-1);
    expect(renderedFetch).toBeGreaterThan(plainFetch);
  });

  it("fails paid enrichment jobs before installation when their required key is missing", () => {
    const google = workflowText("enrich-places.yml");
    const venue = workflowText("ingest-venues.yml");

    expect(
      google.indexOf("Require Google enrichment configuration"),
    ).toBeLessThan(google.indexOf("run: npm ci"));
    expect(google).toContain("Missing GOOGLE_PLACES_API_KEY");
    expect(google).not.toContain("skipping enrichment");
    expect(
      venue.indexOf("Require venue extraction configuration"),
    ).toBeLessThan(venue.indexOf("run: npm ci"));
    expect(
      venue.indexOf("Require venue extraction configuration"),
    ).toBeLessThan(venue.indexOf("Install Chromium"));
    expect(venue).toContain("Missing ANTHROPIC_VENUE_EVENTS_API_KEY");
  });

  it("does not publish a steward refresh without a valid hours configuration and snapshot", () => {
    const workflow = workflowText("data-steward.yml");

    expect(workflow).toContain(
      "if: ${{ steps.hours-config.outcome == 'success' && steps.hours-snapshot.outcome == 'success' }}",
    );
  });

  it.each(["data-refresh.yml", "freshness-check.yml"])(
    "%s mutates production automation state only from main",
    (name) => {
      expect(workflowText(name)).toContain(
        "if: ${{ github.ref == 'refs/heads/main' }}",
      );
    },
  );

  it("reports restore failures without erasing the last-known-good snapshot", () => {
    const workflow = workflowText("data-refresh.yml");

    expect(workflow).toContain("ref: data-snapshots");
    expect(workflow).toContain(
      "cp -R .last-good-snapshot/data/clean data/clean",
    );
    expect(workflow).toContain("cp -R .last-good-snapshot/data/raw data/raw");
    expect(workflow).toContain("PUBLISH_OUTCOME: ${{ needs.publish.result }}");
    expect(workflow).toContain(
      "A failed source keeps its last-known-good normalized output while successful sources may still advance.",
    );
    expect(workflow).toContain("finalization=${outcomes.finalization}");
    expect(workflowText("publish-data-snapshot.yml")).toContain(
      "git push origin HEAD:data-snapshots",
    );
  });

  it("does not splice workflow input into a secret-bearing shell command", () => {
    const workflow = workflowText("ingest-business-info.yml");

    expect(workflow).toContain("INGEST_LIMIT: ${{ inputs.limit || '60' }}");
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

  it("bounds manual official commerce scans to the workflow runtime budget", () => {
    const workflow = workflowText("refresh-commerce-links.yml");

    expect(workflow).toContain("Maximum official websites to check (1-200)");
    expect(workflow).toContain('[ "$REFRESH_LIMIT" -gt 200 ]');
  });

  it("checks the business copy boundary before any paid extraction", () => {
    const workflow = workflowText("ingest-business-info.yml");
    const copyBoundary = workflow.indexOf(
      "npm test -- tests/business-info-copy.spec.ts tests/style-lint.spec.ts",
    );
    const extraction = workflow.indexOf("npm run ingest:business");

    expect(copyBoundary).toBeGreaterThan(-1);
    expect(extraction).toBeGreaterThan(copyBoundary);
  });

  it("isolates rollback-capable production canaries by trigger type", () => {
    const workflow = parse(
      workflowText("production-canary.yml"),
    ) as WorkflowDocument;

    expect(workflow.concurrency).toEqual({
      group: "production-apex-canary-${{ github.event_name }}",
      "cancel-in-progress": true,
    });
  });

  it("runs the normal required checks for every automated review PR", () => {
    const workflowNames = readdirSync(WORKFLOW_DIR).filter((name) =>
      /\.ya?ml$/.test(name),
    );
    const producerWorkflows = workflowNames.filter((name) =>
      workflowText(name).includes(
        "uses: ./.github/workflows/publish-automated-pr.yml",
      ),
    );

    expect(producerWorkflows.length).toBe(8);
    for (const name of producerWorkflows) {
      const workflow = parse(workflowText(name)) as WorkflowDocument;
      expect(
        workflow.permissions,
        `${name} must default to no token access`,
      ).toEqual({});
      const text = workflowText(name);
      const publishers =
        text.match(
          /uses: \.\/\.github\/workflows\/publish-automated-pr\.yml/g,
        ) ?? [];
      const checkDispatches =
        text.match(
          /uses: \.\/\.github\/workflows\/automated-pr-checks\.yml/g,
        ) ?? [];
      const allowlists = text.match(/\n\s+allowed_paths:/g) ?? [];
      const baseShas =
        text.match(/\n\s+base_sha: \$\{\{ github\.sha \}\}/g) ?? [];
      const artifactUploads =
        text.match(
          /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/g,
        ) ?? [];
      const mainGuards =
        text.match(/if: \$\{\{ github\.ref == 'refs\/heads\/main' \}\}/g) ?? [];
      const exactHeads =
        text.match(
          /head_sha: \$\{\{ needs\.[^}]+\.outputs\.pr_head_sha \}\}/g,
        ) ?? [];
      expect(
        checkDispatches.length,
        `${name} must call the isolated check dispatcher once per publisher`,
      ).toBe(publishers.length);
      expect(
        allowlists.length,
        `${name} needs one strict file allowlist per PR`,
      ).toBe(publishers.length);
      expect(
        baseShas.length,
        `${name} must bind every artifact to its generation commit`,
      ).toBe(publishers.length);
      expect(
        artifactUploads.length,
        `${name} must stage each PR through an artifact`,
      ).toBe(publishers.length);
      expect(
        exactHeads.length,
        `${name} must dispatch checks for the exact published head`,
      ).toBe(publishers.length);
      expect(
        mainGuards.length,
        `${name} must publish only from main`,
      ).toBeGreaterThanOrEqual(publishers.length);
      expect(text).toContain("persist-credentials: false");
      expect(text).not.toContain("peter-evans/create-pull-request");
      expect(text).not.toContain("pull_request_target");
    }

    const publisherText = workflowText("publish-automated-pr.yml");
    const publisher = parse(publisherText) as WorkflowDocument;
    expect(publisher.permissions).toEqual({});
    expect(publisher.jobs?.publish?.permissions).toEqual({
      actions: "read",
      contents: "write",
      "pull-requests": "write",
    });
    expect(publisherText).toContain(`uses: ${PINNED_CREATE_PR}`);
    expect(
      publisherText.match(/peter-evans\/create-pull-request@/g),
    ).toHaveLength(1);
    expect(publisherText).toContain(
      "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    );
    expect(publisherText).toContain("persist-credentials: false");
    expect(publisherText).toContain(
      "Refuse output generated from a stale main revision",
    );
    expect(publisherText).toContain(
      "Recheck main immediately before publication",
    );
    expect(publisherText).toContain("branch.data.commit.sha !== expected");
    expect(publisherText).toContain("ref: ${{ inputs.base_sha }}");
    expect(publisherText).toContain(
      "Artifact files do not exactly match the reviewed allowlist.",
    );
    expect(publisherText).not.toContain("npm ci");

    expect(workflowText("ci.yml")).toContain("workflow_dispatch: {}");
    const dispatcher = workflowText("automated-pr-checks.yml");
    expect(dispatcher).toContain("actions: write");
    expect(dispatcher).toContain("contents: read");
    expect(dispatcher).toContain("['ci.yml', 'style.yml']");
    expect(dispatcher).toContain(
      "actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3",
    );
    expect(dispatcher).toContain("ref.data.object.sha !== expectedHead");
    expect(dispatcher).toContain("compareCommitsWithBasehead");
    expect(dispatcher).toContain("comparison.data.behind_by !== 0");
    expect(dispatcher).toContain("allowedByBranch");
    expect(dispatcher).not.toContain("actions/checkout");
  });

  it("keeps source fetching separate from snapshot publication and issue writes", () => {
    const refresh = parse(workflowText("data-refresh.yml")) as WorkflowDocument;
    expect(refresh.permissions).toEqual({});
    expect(refresh.jobs?.refresh?.permissions).toEqual({ contents: "read" });
    expect(refresh.jobs?.publish?.permissions).toEqual({
      actions: "read",
      contents: "write",
    });
    expect(refresh.jobs?.report?.permissions).toEqual({
      actions: "read",
      contents: "read",
      issues: "write",
    });

    const publisherText = workflowText("publish-data-snapshot.yml");
    const publisher = parse(publisherText) as WorkflowDocument;
    expect(publisher.permissions).toEqual({});
    expect(publisher.jobs?.publish?.permissions).toEqual({
      actions: "read",
      contents: "write",
    });
    expect(publisherText).not.toContain("npm ci");
    expect(publisherText).not.toContain("pipeline:fetch");
    expect(publisherText).toContain("Unexpected snapshot path");
    expect(publisherText).toContain("base_sha:");
    expect(publisherText).toContain("ref: ${{ inputs.base_sha }}");
    expect(publisherText).toContain("path: trusted-base");
    expect(publisherText).toContain(
      "Refuse snapshot generated from a stale main revision",
    );
    expect(publisherText).toContain("branch.data.commit.sha !== expected");
    expect(publisherText).toContain(
      "git ls-remote --refs origin refs/heads/main",
    );
    expect(publisherText).toContain('current_main" != "$BASE_SHA');
    expect(publisherText).toContain(
      "Candidate manifest changed the trusted source set",
    );
    expect(publisherText).toContain("changed trusted source configuration");
    expect(publisherText).toContain(
      "STATE_FIELDS = %w[last_success last_validated last_changed last_payload_sha256]",
    );
    expect(publisherText).toContain("regressed last_success");
    expect(publisherText).toContain(
      "Normalized outputs do not match active pipeline sources",
    );
    expect(publisherText).toContain("git push origin HEAD:data-snapshots");
    expect(workflowText("data-refresh.yml")).toContain(
      "PIPELINE_FINALIZATION_MARKER: /tmp/frederick-radius-pipeline-finalized.json",
    );
    expect(workflowText("data-refresh.yml")).toContain(
      "steps.finalization.outcome == 'success'",
    );
    expect(workflowText("data-refresh.yml")).toContain(
      "base_sha: ${{ github.sha }}",
    );
    expect(
      workflowText("data-refresh.yml").match(/ref: \$\{\{ github\.sha \}\}/g),
    ).toHaveLength(2);
    expect(
      workflowText("freshness-check.yml").match(
        /ref: \$\{\{ github\.sha \}\}/g,
      ),
    ).toHaveLength(2);
    expect(publisherText).toContain('tee "$RUNNER_TEMP/snapshot-publish.log"');
  });

  it("pins the required CI and voice-gate actions and bounds the voice job", () => {
    const ci = workflowText("ci.yml");
    const style = workflowText("style.yml");
    const mutableOfficialAction =
      /actions\/(?:checkout|setup-node|upload-artifact)@v\d+/;

    expect(ci).not.toMatch(mutableOfficialAction);
    expect(style).not.toMatch(mutableOfficialAction);
    expect(style).toContain("timeout-minutes: 15");
    expect(ci).toContain(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
    );
    expect(style).toContain(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    );
  });

  it("pins the scheduled discovery boundary and does not persist credentials", () => {
    const discovery = workflowText("discovery.yml");

    expect(discovery).not.toMatch(
      /actions\/(?:checkout|setup-node|upload-artifact)@v\d+/,
    );
    expect(discovery).toContain("persist-credentials: false");
  });

  it("puts a finite runtime ceiling on scheduled and paid data jobs", () => {
    const workflowNames = readdirSync(WORKFLOW_DIR).filter((name) =>
      /\.ya?ml$/.test(name),
    );

    for (const name of workflowNames) {
      const text = workflowText(name);
      const scheduled = /\bschedule:\s*(?:\n|\{)/.test(text);
      const paid =
        /(ANTHROPIC|FIRECRAWL|GOOGLE_PLACES_API_KEY|APIFY|TAVILY)/.test(text);
      if (!scheduled && !paid) continue;

      const workflow = parse(text) as WorkflowDocument;
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        if (!job["runs-on"]) continue;
        expect(
          job["timeout-minutes"],
          `${name}:${jobName} needs an explicit timeout`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
