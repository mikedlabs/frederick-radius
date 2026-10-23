import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKFLOW_DIR = resolve(process.cwd(), ".github/workflows");
const NAS_RUNNER_DIR = resolve(process.cwd(), "ops/nas-runner");
const PINNED_CREATE_PR =
  "peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1";

function workflowText(name: string): string {
  return readFileSync(resolve(WORKFLOW_DIR, name), "utf8");
}

function nasRunnerText(name: string): string {
  return readFileSync(resolve(NAS_RUNNER_DIR, name), "utf8");
}

type WorkflowDocument = {
  on?: {
    schedule?: Array<{ cron: string }>;
    workflow_dispatch?: unknown;
  };
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
      if?: string;
      "timeout-minutes"?: number | string;
      "runs-on"?: string | string[];
      env?: Record<string, unknown>;
      secrets?: unknown;
      steps?: Array<{
        name?: string;
        uses?: string;
        run?: string;
        with?: Record<string, unknown>;
        env?: Record<string, unknown>;
      }>;
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
  it("closes the production health issue on the endpoint's real recovery status", () => {
    const workflow = workflowText("production-health-alert.yml");

    expect(workflow).toContain('if [ "$STATUS" = "operational" ]');
    expect(workflow).not.toContain('if [ "$STATUS" = "ok" ]');
    expect(workflow).toContain("h.products?.hours");
    expect(workflow).toContain("readiness.searchIndex");
  });

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

  it("routes only reviewed trusted-main generators to the repository NAS runner", () => {
    const workflowNames = readdirSync(WORKFLOW_DIR).filter((name) =>
      /\.ya?ml$/.test(name),
    );
    const radiusDataJobs: string[] = [];

    for (const name of workflowNames) {
      const workflow = parse(workflowText(name)) as WorkflowDocument;
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        const labels = Array.isArray(job["runs-on"])
          ? job["runs-on"]
          : [job["runs-on"]];
        if (labels.includes("radius-data")) {
          radiusDataJobs.push(`${name}:${jobName}`);
        }
      }
    }

    const trustedGenerators = [
      [
        "data-steward.yml",
        "steward",
        "${{ github.ref == 'refs/heads/main' && vars.HOURS_REFRESH_CRON == '1' && vars.GOOGLE_MAPS_PLATFORM_POLICY_APPROVAL == 'written-google-authorization-confirmed' && vars.GOOGLE_MAPS_PLATFORM_RUNTIME_ENABLED == '1' }}",
      ],
      [
        "fair-data-steward.yml",
        "collect",
        "${{ github.ref == 'refs/heads/main' }}",
      ],
    ] as const;
    expect(radiusDataJobs.sort()).toEqual(
      trustedGenerators
        .map(([name, jobName]) => `${name}:${jobName}`)
        .sort(),
    );

    for (const [name, jobName, expectedCondition] of trustedGenerators) {
      const workflowTextValue = workflowText(name);
      const workflow = parse(workflowTextValue) as WorkflowDocument;
      expect(workflowTextValue).toContain("workflow_dispatch:");
      expect(workflowTextValue).toContain("schedule:");
      expect(workflowTextValue).not.toContain("pull_request:");
      expect(workflowTextValue).not.toContain("\n  push:");
      expect(workflow.jobs?.[jobName]?.["runs-on"]).toEqual([
        "self-hosted",
        "radius-data",
      ]);
      expect(workflow.jobs?.[jobName]?.if).toBe(expectedCondition);
      expect(workflow.jobs?.[jobName]?.permissions).toEqual({ contents: "read" });
    }

    const hostedJobs = [
      ["build-marc-schedule.yml", "build"],
      ["transit-steward.yml", "transit"],
      ["publish-automated-pr.yml", "publish"],
      ["automated-pr-checks.yml", "dispatch"],
      ["ci.yml", "verify"],
      ["ci.yml", "attach-automated-pr-checks"],
      ["style.yml", "style-lint"],
    ] as const;
    for (const [name, jobName] of hostedJobs) {
      const workflow = parse(workflowText(name)) as WorkflowDocument;
      expect(
        workflow.jobs?.[jobName]?.["runs-on"],
        `${name}:${jobName} must stay on an isolated hosted runner`,
      ).toBe(name === "ci.yml" && jobName === "verify" ? "ubuntu-24.04" : "ubuntu-latest");
    }
  });

  it("keeps hosted public GTFS generation main-only, keyless, bounded and review-gated", () => {
    const source = workflowText("transit-steward.yml");
    const workflow = parse(source) as WorkflowDocument;
    const producer = workflow.jobs?.transit;

    expect(Object.keys(workflow.on ?? {}).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(workflow.on?.schedule).toEqual([{ cron: "23 7 * * *" }]);
    expect(workflow.permissions).toEqual({});
    expect(workflow.concurrency).toEqual({
      group: "transit-steward",
      "cancel-in-progress": false,
    });
    expect(producer?.["runs-on"]).toBe("ubuntu-latest");
    expect(producer?.if).toBe("${{ github.ref == 'refs/heads/main' }}");
    expect(producer?.permissions).toEqual({ contents: "read" });
    expect(producer?.["timeout-minutes"]).toBe(30);
    expect(producer?.env ?? {}).toEqual({});
    expect(producer?.secrets).toBeUndefined();
    expect(source).not.toMatch(/\bsecrets\s*:|\bsecrets[.\[]/);

    const steps = producer?.steps ?? [];
    const checkout = steps.find((step) => step.name === "Checkout");
    expect(checkout?.with).toMatchObject({
      ref: "${{ github.sha }}",
      "persist-credentials": false,
    });
    const gates = [
      "npm run build:transit",
      "npm run validate:transit-data -- --frederick",
      "npx vitest run tests/transit-static-snapshot.spec.ts",
      "npm run data:release:write -- --stream transit",
    ].map((run) => steps.findIndex((step) => step.run === run));
    expect(gates.every((index) => index >= 0)).toBe(true);
    expect(gates.every((index, position) => position === 0 || index > gates[position - 1]))
      .toBe(true);
    const upload = steps.find((step) => step.name === "Upload exact transit outputs");
    expect(upload?.with).toMatchObject({
      "if-no-files-found": "error",
      "retention-days": 1,
    });

    expect(workflow.jobs?.["transit-publish"]?.permissions).toEqual({
      actions: "read", contents: "write", "pull-requests": "write",
    });
    expect(workflow.jobs?.["transit-checks"]?.permissions).toEqual({
      actions: "write", contents: "read",
    });
  });

  it("caps the persistent NAS data runner so it cannot take over the appliance", () => {
    const compose = parse(nasRunnerText("compose.yaml")) as {
      services?: Record<
        string,
        {
          cpuset?: string;
          mem_limit?: string;
        }
      >;
    };
    const dataRunner = compose.services?.["radius-data-runner"];

    expect(dataRunner?.mem_limit).toBe("4g");
    expect(dataRunner?.cpuset).toBe("0,1");
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

  it("does not schedule the duplicate paid business-status reporter", () => {
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path?: string; schedule?: string }> };

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
    ["ingest-civic.yml", "ANTHROPIC_CIVIC_API_KEY", 'cron: "30 8 * * *"'],
    [
      "ingest-venues.yml",
      "ANTHROPIC_VENUE_EVENTS_API_KEY",
      'cron: "7 11 * * *"',
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
      if (name === "ingest-venues.yml") {
        const jobs = (parse(workflow) as WorkflowDocument).jobs;
        for (const owner of ["native", "review-gate"]) expect(jobs?.[owner].if).toContain("github.ref == 'refs/heads/main'");
      } else expect(workflow).toContain("if: ${{ github.ref == 'refs/heads/main' }}");
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
      if (name === "ingest-venues.yml") {
        // Native ticks report zero; the paid mode keeps the authenticated title
        // used by the shared reservation ledger (behavior covered separately).
        expect(workflow).toContain("run-name: Ingest venue events");
        expect(parse(workflow)["run-name"]).toContain("inputs.include_model_sources");
      } else {
        expect(workflow).toContain(
          "run-name: " + (name === "ingest-business-info.yml" ? "Ingest business deep-info" : "Ingest municipal civic data") +
          ` (firecrawl=\${{ vars.${scope}_FIRECRAWL_FETCH_FALLBACK || '0' }}, cap=\${{ vars.${scope}_FIRECRAWL_FALLBACK_MAX_REQUESTS || '1' }})`,
        );
      }
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
    const paidVenueSteps = (parse(venue) as WorkflowDocument).jobs?.ingest.steps ?? [];
    const configuration = paidVenueSteps.findIndex((step) => step.name === "Require venue extraction configuration");
    expect(configuration).toBeGreaterThanOrEqual(0);
    expect(configuration).toBeLessThan(paidVenueSteps.findIndex((step) => step.run === "npm ci"));
    expect(configuration).toBeLessThan(paidVenueSteps.findIndex((step) => step.name === "Install Chromium"));
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

  it.each([
    ["ingest-business-info.yml", "bot/business-info-refresh"],
    ["ingest-civic.yml", "bot/municipal-civic-refresh"],
    ["ingest-venues.yml", "bot/venue-event-refresh"],
  ])("pauses paid extraction in %s while its review PR is open", (name, branch) => {
    const workflow = workflowText(name);

    expect(workflow).toContain("refresh_open_review:");
    expect(workflow).toContain("Pause paid extraction while its review is open");
    expect(workflow).toContain(`const branch = '${branch}';`);
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain(
      "if: ${{ needs.review-gate.outputs.should_run == 'true' }}",
    );
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

  it("does not repeat paid business extraction while its review PR is open", () => {
    const workflow = workflowText("ingest-business-info.yml");

    expect(workflow).toContain("refresh_open_review:");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain("github.rest.pulls.list");
    expect(workflow).toContain("pull.head?.ref === branch");
    expect(workflow).toContain(
      "pull.head?.repo?.full_name === `${context.repo.owner}/${context.repo.repo}`",
    );
    expect(workflow).toContain("if (review && !override)");
    expect(workflow).toContain("core.setOutput('should_run', 'false')");
    expect(workflow).toContain("needs: review-gate");
    expect(workflow).toContain(
      "if: ${{ needs.review-gate.outputs.should_run == 'true' }}",
    );

    const reviewGate = workflow.indexOf("Pause paid extraction while its review is open");
    const paidExtraction = workflow.indexOf("npm run ingest:business");
    expect(reviewGate).toBeGreaterThan(-1);
    expect(paidExtraction).toBeGreaterThan(reviewGate);
  });

  it("does not repeat paid Google enrichment while its review PR is open", () => {
    const workflow = workflowText("enrich-places.yml");

    expect(workflow).toContain("refresh_open_review:");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain("const branch = 'bot/curated-place-enrichment'");
    expect(workflow).toContain("if (review && !override)");
    expect(workflow).toContain("core.setOutput('should_run', 'false')");
    expect(workflow).toContain("needs: review-gate");
    expect(workflow).toContain(
      "if: ${{ needs.review-gate.outputs.should_run == 'true' }}",
    );

    const reviewGate = workflow.indexOf("Pause paid enrichment while its review is open");
    const paidEnrichment = workflow.indexOf("npm run enrich --");
    expect(reviewGate).toBeGreaterThan(-1);
    expect(paidEnrichment).toBeGreaterThan(reviewGate);
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

  it.each([
    ["data-steward.yml", "steward", "steward-publish"],
    // Transit moved to its own workflow on 2026-08-18: sharing a run made a
    // failing transit snapshot paint the hours pipeline red for six days.
    // Same generator -> publisher contract, different file.
    ["transit-steward.yml", "transit", "transit-publish"],
    ["ingest-business-info.yml", "ingest", "publish"],
    ["ingest-civic.yml", "ingest", "publish"],
    ["ingest-venues.yml", "ingest", "publish"],
    ["ingest-venues.yml", "native", "publish"],
    ["refresh-commerce-links.yml", "refresh", "publish"],
    ["data-refresh.yml", "refresh", "publish"],
  ])(
    "%s carries the exact %s artifact name into %s",
    (name, generatorName, publisherName) => {
      type ArtifactStep = {
        id?: string;
        uses?: string;
        with?: { name?: string };
      };
      type ArtifactJob = {
        outputs?: { artifact_name?: string };
        steps?: ArtifactStep[];
        with?: { artifact?: string };
      };
      type ArtifactWorkflow = { jobs?: Record<string, ArtifactJob> };

      const workflow = parse(workflowText(name)) as ArtifactWorkflow;
      const generator = workflow.jobs?.[generatorName];
      const publisher = workflow.jobs?.[publisherName];
      const upload = generator?.steps?.find((step) =>
        step.uses?.startsWith("actions/upload-artifact@") && step.with?.name === "${{ steps.artifact-name.outputs.name }}",
      );

      expect(generator?.outputs?.artifact_name).toBe(
        "${{ steps.artifact-name.outputs.name }}",
      );
      expect(generator?.steps?.some((step) => step.id === "artifact-name")).toBe(
        true,
      );
      expect(upload?.with?.name).toBe("${{ steps.artifact-name.outputs.name }}");
      expect(publisher?.with?.artifact).toBe(name === "ingest-venues.yml"
        ? "${{ needs.native.outputs.artifact_name || needs.ingest.outputs.artifact_name }}"
        : `\${{ needs.${generatorName}.outputs.artifact_name }}`);
      expect(publisher?.with?.artifact).not.toContain("github.run_attempt");
    },
  );

  it("carries data-refresh diagnostic artifact names across failed-job reruns", () => {
    const refresh = workflowText("data-refresh.yml");
    const publisher = workflowText("publish-data-snapshot.yml");

    expect(refresh).toContain(
      "logs_artifact_name: ${{ steps.artifact-name.outputs.logs }}",
    );
    expect(refresh).toContain(
      "name: ${{ needs.refresh.outputs.logs_artifact_name }}",
    );
    expect(refresh).toContain(
      "name: ${{ needs.publish.outputs.logs_artifact_name }}",
    );
    expect(publisher).toContain(
      "value: ${{ jobs.publish.outputs.logs_artifact_name }}",
    );
    expect(publisher).toContain(
      "name: ${{ steps.artifact-name.outputs.name }}",
    );
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

    // 9 since transit-steward.yml split out of data-steward.yml (2026-08-18).
    // Every producer still routes through the same credentialed publisher, so
    // the guarantees below apply unchanged to the new file.
    expect(producerWorkflows.length).toBe(9);
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
        text.match(
          /if: \$\{\{ github\.ref == 'refs\/heads\/main'(?: && [^}\n]+)? \}\}/g,
        ) ?? [];
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
      // Venue native/paid producers are mutually exclusive. Commerce retains
      // compact outcomes plus private originals, separate from its publisher.
      // Official hours separately retain original pages for offline review;
      // their artifact name is not an input to either exact publisher.
      expect(
        artifactUploads.length,
        `${name} must stage every producer through its exact artifact`,
      ).toBe(name === "data-steward.yml" ? publishers.length + 1 : name === "refresh-commerce-links.yml" ? publishers.length + 2 : name === "ingest-venues.yml" ? 2 : publishers.length);
      if (name === "refresh-commerce-links.yml") {
        const commerce = parse(text) as WorkflowDocument;
        const steps = commerce.jobs?.refresh.steps ?? [];
        const originals = steps.find((step) => step.name === "Preserve original native pages and held listing candidates");
        const outcomes = steps.find((step) => step.name === "Preserve source-specific collection outcomes");
        expect(originals?.with).toMatchObject({ name: "official-commerce-source-evidence-${{ github.run_id }}-${{ github.run_attempt }}", path: "${{ runner.temp }}/native-commerce-evidence", "retention-days": 7 });
        expect(outcomes?.with?.["retention-days"]).toBe(30);
        expect(text).not.toMatch(/artifact:\s+official-commerce-source-evidence/);
        expect(text).not.toMatch(/allowed_paths:[\s\S]*?\n\s+native-commerce-evidence\//);
      }
      if (name === "data-steward.yml") {
        expect(text).not.toMatch(/artifact:\s+official-hours-review-evidence/);
        expect(text).not.toMatch(/allowed_paths:[\s\S]*?\n\s+official-hours-review-evidence\//);
      }
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
    // The stale-main guard is SURFACE-AWARE, not SHA-exact. The old exact-SHA
    // rule aborted the whole nightly delivery whenever ANY merge landed during
    // the generation hour, which starved the bot PRs (Aug 4-19) and let the
    // hours artifact expire county-wide. The rule now aborts only when main's
    // movement touched a file this publish would overwrite, and it must FAIL
    // CLOSED when it cannot prove the movement safe.
    expect(publisherText).toContain(
      "Resolve a main revision this output may publish onto",
    );
    expect(publisherText).toContain(
      "Recheck main immediately before publication",
    );
    // The conflict test and each of its fail-closed exits.
    expect(publisherText).toContain("touched the publish surface");
    expect(publisherText).toContain("could not be read to prove the movement safe");
    expect(publisherText).toContain("too much to prove the movement safe");
    // The manifest widens the surface beyond allowed_paths when it is itself
    // being published, so a digest-tracked file cannot be silently clobbered.
    expect(publisherText).toContain("src/data/data-release.json");
    // The worktree is the RESOLVED revision, so a benign merge no longer
    // births a branch that is already behind main.
    expect(publisherText).toContain(
      "ref: ${{ steps.resolve_ref.outputs.publish_ref }}",
    );
    expect(publisherText).not.toContain("ref: ${{ inputs.base_sha }}");
    expect(publisherText).toContain(
      "Artifact files do not exactly match the reviewed allowlist.",
    );
    expect(publisherText).not.toContain("npm ci");

    const ciText = workflowText("ci.yml");
    expect(ciText).toContain("workflow_dispatch:");
    expect(ciText).toContain("CI / automated {0}");
    expect(ciText).toContain("automated_pr_head_sha:");
    expect(ciText).toContain("automated_pr_style_run_id:");
    expect(ciText).toContain("automated_pr_token:");
    expect(ciText).toContain("ci_run_id: String(context.runId)");
    expect(ciText).not.toContain("\n  push:");
    expect(ciText).toContain("e2e/critical-dependency-chaos.spec.ts");
    expect(ciText).toContain("e2e/service-worker-upgrade-contract.spec.ts");
    expect(ciText).not.toContain("\n  browser-chaos:");
    expect(ciText).toContain("needs: verify");
    expect(ciText).toContain(
      "workflow_id: 'automated-pr-status-bridge.yml'",
    );
    const uxText = workflowText("ux-audit.yml");
    expect(uxText).toContain("workflow_dispatch:");
    expect(uxText).not.toContain("\n  schedule:");
    expect(uxText).toContain("--workers=2");
    expect(uxText).not.toContain("matrix:");
    expect(uxText).not.toContain("--shard=");
    expect(workflowText("style.yml")).not.toContain("\n  push:");
    expect(workflowText("style.yml")).toContain("style / automated {0}");
    const dispatcher = workflowText("automated-pr-checks.yml");
    expect(dispatcher).toContain("actions: write");
    expect(dispatcher).toContain("contents: read");
    expect(dispatcher).toContain("workflow_id: 'ci.yml'");
    expect(dispatcher).toContain("workflow_id: 'style.yml'");
    expect(dispatcher).toContain(
      "actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3",
    );
    expect(dispatcher).toContain("ref.data.object.sha !== expectedHead");
    expect(dispatcher).toContain("compareCommitsWithBasehead");
    expect(dispatcher).toContain("comparison.data.behind_by !== 0");
    expect(dispatcher).toContain("allowedByBranch");
    expect(dispatcher).toContain("automated_pr_head_sha: expectedHead");
    expect(dispatcher).toContain("automated_pr_style_run_id: String(styleRun.id)");
    expect(dispatcher).toContain("run.display_title === `style / automated ${dispatchToken}`");
    expect(dispatcher).not.toContain(
      "workflow_id: 'automated-pr-status-bridge.yml'",
    );
    expect(dispatcher).not.toContain("actions/checkout");

    // GITHUB_TOKEN can start workflow_dispatch runs, but their completion does
    // not reliably create another workflow_run hop. The bridge must therefore
    // be explicitly dispatched on trusted main after CI finishes. The bridge
    // receives the exact paired run IDs and a one-time run-name token, while a
    // cheap schedule fails a whole-workflow cancellation closed.
    const bridgeText = workflowText("automated-pr-status-bridge.yml");
    const bridge = parse(bridgeText) as WorkflowDocument;
    expect(bridge.permissions).toEqual({
      actions: "read",
      contents: "read",
      "pull-requests": "read",
      statuses: "write",
      checks: "write",
    });
    expect(bridgeText).toContain("workflow_dispatch:");
    expect(bridgeText).not.toContain("workflow_run:");
    expect(bridgeText).toContain('cron: "23 */6 * * *"');
    expect(bridgeText).toContain("context.ref !== 'refs/heads/main'");
    // The dependency-free runtime is loaded only from the exact trusted main
    // workflow revision. Its mutable GitHub behavior is covered offline by the
    // mocked API tests, rather than source-substring substitutes for that proof.
    expect(bridgeText).toContain("path: helperPath, ref: context.sha");
    expect(bridgeText).toContain("file.size > 65536");
    expect(bridgeText).toContain("source.length !== file.size");
    expect(bridgeText).toContain("scripts/lib/automated-pr-status-bridge.cjs");
    expect(bridgeText).toContain("trusted.exports.attachAutomatedPrStatuses");
    expect(bridgeText).toContain("trusted.exports.reconcileStaleAutomatedPrStatuses");
    expect(bridgeText).toContain("core.summary.addHeading");
    expect(bridgeText).not.toContain("acceptedAfter");
    expect(bridgeText).not.toContain("actions/checkout");
    expect(bridge.jobs?.attach?.["timeout-minutes"]).toBe(8);
    expect(bridgeText).toContain("Fail stale automated PR checks closed");

    // Validation attachment does not broaden the publication policy: only a
    // caller that deliberately passes auto_merge may queue a reviewed-safe PR.
    expect(publisherText).toContain(
      "if: ${{ inputs.auto_merge && steps.review_pr.outputs.pull-request-number != '' }}",
    );
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
    expect(publisherText).toContain(
      "TRUSTED_PREVIEW_IGNORE: ${{ github.workspace }}/trusted-base/scripts/vercel-ignore-preview.sh",
    );
    expect(publisherText).toContain(
      '[ ! -f "$TRUSTED_PREVIEW_IGNORE" ] || [ -L "$TRUSTED_PREVIEW_IGNORE" ]',
    );
    expect(publisherText).toContain(
      "data/sources\\.yaml$|data/clean/|data/raw/|scripts/vercel-ignore-preview\\.sh$",
    );
    expect(publisherText).toContain(
      'install -D -m 0755 "$TRUSTED_PREVIEW_IGNORE" scripts/vercel-ignore-preview.sh',
    );
    expect(
      publisherText.indexOf("rm -f scripts/vercel-ignore-preview.sh"),
    ).toBeLessThan(
      publisherText.indexOf(
        'install -D -m 0755 "$TRUSTED_PREVIEW_IGNORE" scripts/vercel-ignore-preview.sh',
      ),
    );
    expect(publisherText).toContain(
      "git add -f data scripts/vercel-ignore-preview.sh",
    );
    expect(publisherText).toContain(
      "grep -Ev '^(data/|scripts/vercel-ignore-preview\\.sh$)'",
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

  it("allows only bounded data paths and the trusted Vercel helper on the snapshot branch", () => {
    const publisherText = workflowText("publish-data-snapshot.yml");
    const allowlistLine = publisherText
      .split("\n")
      .find((line) => line.includes("unexpected=$(git ls-files"));
    const allowlistPattern = allowlistLine?.match(/grep -Ev '([^']+)'/)?.[1];

    expect(allowlistPattern).toBeDefined();
    const allowed = new RegExp(allowlistPattern!);
    expect(allowed.test("data/sources.yaml")).toBe(true);
    expect(allowed.test("data/clean/nws_forecast.json")).toBe(true);
    expect(allowed.test("data/raw/nws_forecast/2026-08-02.json")).toBe(true);
    expect(allowed.test("scripts/vercel-ignore-preview.sh")).toBe(true);
    expect(allowed.test("data/sources.yaml.backup")).toBe(false);
    expect(allowed.test("scripts/another-helper.sh")).toBe(false);
    expect(allowed.test("scripts/vercel-ignore-preview.sh.backup")).toBe(false);
    expect(allowed.test("package.json")).toBe(false);
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

  it("repairs only the runner's exact Azure HTTP mirror while keeping signed browser setup and its bounds", () => {
    const ci = parse(workflowText("ci.yml")) as WorkflowDocument;
    const job = ci.jobs!.verify;
    const step = job.steps!.find((candidate) => candidate.name === "Install browsers") as {
      run: string;
      if: string;
      "timeout-minutes": number;
    };
    expect(job["timeout-minutes"]).toBe(45);
    expect(step["timeout-minutes"]).toBe(10);
    expect(step.if).toBe("${{ env.AUTOMATED_DATA_PR != '1' }}");
    expect(step.run).toContain("if [ -f /etc/apt/apt-mirrors.txt ]; then");
    expect(step.run.trim().endsWith("npx playwright install --with-deps chromium webkit")).toBe(true);
    expect(step.run).not.toMatch(/trusted=yes|allow-unauthenticated|AllowInsecure|sources\.list|keyrings|curl|wget|\bwhile\b|\buntil\b/);
    const expression = step.run.match(/sudo sed -E -i '([^']+)' \/etc\/apt\/apt-mirrors\.txt/)?.[1];
    expect(expression).toBeDefined();
    const input = "# CI\nhttp://azure.archive.ubuntu.com/ubuntu priority:1\nhttp://archive.ubuntu.com/ubuntu priority:2\nhttp://security.ubuntu.com/ubuntu priority:3\n";
    expect(Buffer.byteLength(input)).toBe(144);
    const transform = (value: string) => execFileSync("sed", ["-E", expression!], { input: value, encoding: "utf8" });
    const expected = input.replace("http://azure.archive.ubuntu.com/ubuntu", "https://archive.ubuntu.com/ubuntu");
    expect(transform(input)).toBe(expected);
    expect(transform(expected)).toBe(expected);
    const edgeCases = [
      "  http://azure.archive.ubuntu.com/ubuntu/\tpriority:5",
      "https://azure.archive.ubuntu.com/ubuntu priority:1",
      "http://azureXarchiveXubuntuXcom/ubuntu priority:1",
      "http://azure.archive.ubuntu.com/ubuntu-other priority:1",
      "# http://azure.archive.ubuntu.com/ubuntu priority:1",
      "http://security.ubuntu.com/ubuntu priority:3",
    ].join("\n") + "\n";
    expect(transform(edgeCases)).toBe(edgeCases.replace("  http://azure.archive.ubuntu.com/ubuntu/", "  https://archive.ubuntu.com/ubuntu/"));
  });

  it("pins the six direct Playwright installer jobs to supported Ubuntu without changing other hosted jobs", () => {
    const expected = ["ci.yml:verify", "ux-audit.yml:mobile-ux", "ingest-business-info.yml:ingest", "refresh-commerce-links.yml:refresh", "visual-contract.yml:chromium", "ingest-venues.yml:ingest"].sort();
    const browserJobs: string[] = [];
    for (const name of readdirSync(WORKFLOW_DIR).filter((name) => /\.ya?ml$/.test(name))) {
      const workflow = parse(workflowText(name)) as WorkflowDocument;
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        if (!job.steps?.some((step) => typeof step.run === "string" && /\bnpx playwright install\b/.test(step.run))) continue;
        browserJobs.push(`${name}:${jobName}`);
        expect(job["runs-on"], `${name}:${jobName} must use a Playwright-supported browser image`).toBe("ubuntu-24.04");
        expect(job.env ?? {}).not.toHaveProperty("PLAYWRIGHT_HOST_PLATFORM_OVERRIDE");
      }
    }
    expect(browserJobs.sort()).toEqual(expected);
    for (const name of new Set(expected.map((entry) => entry.split(":")[0]))) {
      const workflow = parse(workflowText(name)) as WorkflowDocument;
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        if (job["runs-on"] && !expected.includes(`${name}:${jobName}`)) expect(job["runs-on"]).toBe("ubuntu-latest");
      }
    }
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
        const timeout = job["timeout-minutes"];
        if (typeof timeout === "string") {
          // Evaluate the one reviewed conditional ceiling in both real modes;
          // a template string alone is not evidence of a finite time budget.
          expect(`${name}:${jobName}`).toBe("refresh-commerce-links.yml:refresh");
          const expression = timeout.replace(/^\$\{\{|\}\}$/g, "").trim();
          for (const [event, native, expected] of [["schedule", true, 15], ["workflow_dispatch", true, 15], ["workflow_dispatch", false, 40]] as const) {
            expect(runInNewContext(`(${expression})`, { github: { event_name: event }, inputs: { native_daily: native } }, { timeout: 1000 })).toBe(expected);
          }
        } else {
          expect(timeout, `${name}:${jobName} needs an explicit timeout`).toBeGreaterThan(0);
        }
      }
    }
  });
});
