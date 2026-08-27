/**
 * Lighthouse audit runner.
 *
 *   npm run perf
 *     audits the default URL set against http://localhost:3000
 *
 *   npm run perf -- --url=https://frederickradius.app --label=baseline
 *     overrides the base URL and names the snapshot
 *
 *   npm run perf -- --label=after-a1
 *     same default base, named snapshot for before/after comparison
 *
 *   npm run perf -- --label=release --enforce
 *     exits non-zero when a key route breaches the release budgets
 *
 *   npm run perf -- --label=release --runs=3 --enforce
 *     enforces the median of three runs per route to reduce lab variance
 *
 *   npm run perf -- --url=https://frederickradius.app --label=production-monitor \
 *     --audit-code-revision=<sha> --require-stable-deployment --runs=3 --enforce
 *     records the audit implementation separately and rejects production
 *     evidence if the target deployment cannot be identified or changes
 *
 * Assumes a server is already running at the base URL. The script
 * does not start npm start itself because that is flaky to manage
 * from a child process. Run the build + start in another shell,
 * then run this.
 *
 * Output:
 *   .perf/<isoDate>-<label>/*.report.json  full JSON reports
 *   .perf/<isoDate>-<label>/summary.md     markdown table
 *
 * What we capture per page:
 *   Performance, Accessibility, Best Practices, SEO scores (0 to 100)
 *   FCP, LCP, CLS, TBT, Speed Index, TTFB
 *
 * Real INP comes from production users via Vercel Speed Insights
 * (wired in src/app/layout.tsx). This script is for synthetic lab
 * measurement so the team can iterate without waiting for field data.
 * TBT is the closest lab proxy for INP.
 *
 * Throttling: emulated mobile (Lighthouse default, 4x CPU, slow 4G).
 * That is the experience that matters; desktop scores hide real
 * problems.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  deploymentRevisionChange,
  fetchDeploymentRevision,
} from "./lib/lighthouse-deployment";

type Args = {
  base: string;
  urls: string[];
  label: string;
  enforce: boolean;
  runs: number;
  auditCodeRevision: string | null;
  requireStableDeployment: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const baseFlag = argv.find((a) => a.startsWith("--url="));
  const base = baseFlag
    ? baseFlag.slice("--url=".length).replace(/\/$/, "")
    : "http://localhost:3000";
  const labelFlag = argv.find((a) => a.startsWith("--label="));
  const label = labelFlag ? labelFlag.slice("--label=".length) : "snapshot";
  const enforce =
    argv.includes("--enforce") || process.env.PERF_ENFORCE === "1";
  const runsFlag = argv.find((a) => a.startsWith("--runs="));
  const runs = runsFlag ? Number(runsFlag.slice("--runs=".length)) : 1;
  if (!Number.isInteger(runs) || runs < 1 || runs > 5) {
    throw new Error("--runs must be an integer from 1 through 5");
  }
  const auditCodeRevisionFlag = argv.find((a) =>
    a.startsWith("--audit-code-revision="),
  );
  const auditCodeRevisionValue = auditCodeRevisionFlag
    ?.slice("--audit-code-revision=".length)
    .trim()
    .toLowerCase();
  const auditCodeRevision = auditCodeRevisionValue || null;
  if (auditCodeRevision && !/^[a-f0-9]{7,64}$/.test(auditCodeRevision)) {
    throw new Error("--audit-code-revision must be a Git commit SHA");
  }
  const requireStableDeployment = argv.includes(
    "--require-stable-deployment",
  );

  // The set is intentionally narrow: the primary decision surfaces, the
  // computationally distinct transit and Ask experiences, and one dynamic
  // place route. Add more URLs sparingly so the weekly pass stays useful.
  //
  // Canonical routes only. Measuring redirects hides the destination's
  // real navigation cost and can make a retired alias look like a supported
  // product surface.
  const urls = [
    "/today",
    "/map",
    "/events",
    "/ask",
    "/transit",
    "/places/carroll-creek-linear-park-frederick",
  ];
  return {
    base,
    urls,
    label,
    enforce,
    runs,
    auditCodeRevision,
    requireStableDeployment,
  };
}

type Score = {
  url: string;
  perf: number | null;
  a11y: number | null;
  bp: number | null;
  seo: number | null;
  fcp_ms: number | null;
  lcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  si_ms: number | null;
  ttfb_ms: number | null;
  error?: string;
};

// These are release guardrails, not the finish line. They intentionally flag
// a plainly degraded mobile experience without turning normal Lighthouse
// variance into permanent CI noise. The summary also prints the stronger
// product targets so optimization work keeps moving in the right direction.
const RELEASE_BUDGETS = {
  perf: 0.75,
  a11y: 0.95,
  bp: 0.9,
  seo: 0.9,
  fcp_ms: 3_000,
  lcp_ms: 4_000,
  cls: 0.1,
  tbt_ms: 600,
  ttfb_ms: 800,
} as const;

const LIGHTHOUSE_RUN_TIMEOUT_MS = 60_000;

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return String(Math.round(n * 100));
}
function ms(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
  return `${Math.round(n)} ms`;
}
function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(3);
}

function emoji(score: number | null): string {
  if (score == null) return "❓";
  if (score >= 0.9) return "🟢";
  if (score >= 0.5) return "🟡";
  return "🔴";
}

function runOne(
  base: string,
  path: string,
  outDir: string,
  runNumber: number,
  runCount: number,
): Score {
  const url = base + path;
  const slug = path.replace(/\//g, "_").replace(/^_/, "") || "root";
  const suffix = runCount > 1 ? `.run-${runNumber}` : "";
  const jsonPath = join(outDir, `${slug}${suffix}.report.json`);

  console.log(
    `\n→ ${url}${runCount > 1 ? ` (run ${runNumber}/${runCount})` : ""}`,
  );
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "lighthouse",
      url,
      "--output=json",
      `--output-path=${jsonPath}`,
      "--quiet",
      "--only-categories=performance,accessibility,best-practices,seo",
      // Headless Chrome with the new headless mode. Mobile form factor
      // is Lighthouse's default + the one that matters here.
      "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
      "--form-factor=mobile",
      // The /welcome middleware redirects / and /today to onboarding
      // when fr_onboarded is missing. We're auditing the post-onboard
      // experience, so set the cookie via extra-headers.
      '--extra-headers={"Cookie":"fr_onboarded=1"}',
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: LIGHTHOUSE_RUN_TIMEOUT_MS,
      killSignal: "SIGKILL",
    },
  );

  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").slice(-400);
    const error = result.error instanceof Error
      ? result.error.message
      : stderr || `Lighthouse exited with status ${String(result.status)}`;
    return { url, perf: null, a11y: null, bp: null, seo: null, fcp_ms: null, lcp_ms: null, cls: null, tbt_ms: null, si_ms: null, ttfb_ms: null, error };
  }

  try {
    const j = JSON.parse(readFileSync(jsonPath, "utf8")) as {
      categories: Record<string, { score: number | null }>;
      audits: Record<string, { numericValue?: number }>;
    };
    return {
      url,
      perf: j.categories.performance?.score ?? null,
      a11y: j.categories.accessibility?.score ?? null,
      bp: j.categories["best-practices"]?.score ?? null,
      seo: j.categories.seo?.score ?? null,
      fcp_ms: j.audits["first-contentful-paint"]?.numericValue ?? null,
      lcp_ms: j.audits["largest-contentful-paint"]?.numericValue ?? null,
      cls: j.audits["cumulative-layout-shift"]?.numericValue ?? null,
      tbt_ms: j.audits["total-blocking-time"]?.numericValue ?? null,
      si_ms: j.audits["speed-index"]?.numericValue ?? null,
      ttfb_ms: j.audits["server-response-time"]?.numericValue ?? null,
    };
  } catch (e) {
    return { url, perf: null, a11y: null, bp: null, seo: null, fcp_ms: null, lcp_ms: null, cls: null, tbt_ms: null, si_ms: null, ttfb_ms: null, error: String(e) };
  }
}

const SCORE_FIELDS = [
  "perf",
  "a11y",
  "bp",
  "seo",
  "fcp_ms",
  "lcp_ms",
  "cls",
  "tbt_ms",
  "si_ms",
  "ttfb_ms",
] as const satisfies readonly (keyof Score)[];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function medianScore(url: string, runs: Score[]): Score {
  const error = runs.find((score) => score.error)?.error;
  if (error) {
    return {
      url,
      perf: null,
      a11y: null,
      bp: null,
      seo: null,
      fcp_ms: null,
      lcp_ms: null,
      cls: null,
      tbt_ms: null,
      si_ms: null,
      ttfb_ms: null,
      error,
    };
  }

  const score = { url } as Score;
  for (const field of SCORE_FIELDS) {
    const values = runs
      .map((run) => run[field])
      .filter((value): value is number => value != null);
    score[field] = values.length === runs.length ? median(values) : null;
  }
  return score;
}

function budgetFailures(scores: Score[]): string[] {
  const failures: string[] = [];
  for (const score of scores) {
    const route = score.url.replace(/^https?:\/\/[^/]+/, "");
    if (score.error) {
      failures.push(`${route}: Lighthouse failed`);
      continue;
    }
    const minimums = [
      ["performance", score.perf, RELEASE_BUDGETS.perf],
      ["accessibility", score.a11y, RELEASE_BUDGETS.a11y],
      ["best practices", score.bp, RELEASE_BUDGETS.bp],
      ["SEO", score.seo, RELEASE_BUDGETS.seo],
    ] as const;
    for (const [label, value, threshold] of minimums) {
      if (value == null || value < threshold) {
        failures.push(
          `${route}: ${label} ${pct(value)} < ${Math.round(threshold * 100)}`,
        );
      }
    }
    const maximums = [
      ["FCP", score.fcp_ms, RELEASE_BUDGETS.fcp_ms, "ms"],
      ["LCP", score.lcp_ms, RELEASE_BUDGETS.lcp_ms, "ms"],
      ["CLS", score.cls, RELEASE_BUDGETS.cls, ""],
      ["TBT", score.tbt_ms, RELEASE_BUDGETS.tbt_ms, "ms"],
      ["TTFB", score.ttfb_ms, RELEASE_BUDGETS.ttfb_ms, "ms"],
    ] as const;
    for (const [label, value, threshold, unit] of maximums) {
      if (value == null || value > threshold) {
        failures.push(
          `${route}: ${label} ${value == null ? "missing" : `${value.toFixed(unit ? 0 : 3)}${unit}`} > ${threshold}${unit}`,
        );
      }
    }
  }
  return failures;
}

function summarize(
  scores: Score[],
  label: string,
  base: string,
  violations: string[],
  runs: number,
  deployment: {
    required: boolean;
    auditCodeRevision: string | null;
    before: string | null;
    after: string | null;
    errors: string[];
  },
): string {
  const lines: string[] = [];
  lines.push(`# Lighthouse audit: ${label}`);
  lines.push("");
  lines.push(`Run at ${new Date().toISOString()}`);
  lines.push(`Base: ${base}`);
  lines.push(
    `Audit code revision: ${deployment.auditCodeRevision ?? "not supplied"} (workflow and audit implementation only)`,
  );
  if (deployment.required) {
    lines.push(
      `Target deployment revision before sampling: ${deployment.before ?? "unavailable"}`,
    );
    lines.push(
      `Target deployment revision after sampling: ${deployment.after ?? "unavailable"}`,
    );
    lines.push(
      `Evidence integrity: ${deployment.errors.length === 0 ? "stable" : "FAILED"}`,
    );
  } else {
    lines.push("Evidence integrity: not requested");
  }
  if (scores.length === 0 && deployment.errors.length > 0) {
    lines.push(
      `Runs per page: ${runs} planned; sampling skipped because starting evidence was incomplete`,
    );
  } else {
    lines.push(
      `Runs per page: ${runs}${runs > 1 ? " (median shown and enforced)" : ""}`,
    );
  }
  lines.push("");
  lines.push(`| Page | Perf | A11y | Best | SEO | TTFB | LCP | CLS | TBT | FCP |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const s of scores) {
    const routeLabel = s.url.replace(/^https?:\/\/[^/]+/, "");
    if (s.error) {
      lines.push(`| \`${routeLabel}\` | error | error | error | error | error | error | error | error | error |`);
      continue;
    }
    lines.push(
      `| \`${routeLabel}\` | ${emoji(s.perf)} ${pct(s.perf)} | ${emoji(s.a11y)} ${pct(s.a11y)} | ${emoji(s.bp)} ${pct(s.bp)} | ${emoji(s.seo)} ${pct(s.seo)} | ${ms(s.ttfb_ms)} | ${ms(s.lcp_ms)} | ${num(s.cls)} | ${ms(s.tbt_ms)} | ${ms(s.fcp_ms)} |`,
    );
  }
  lines.push("");
  lines.push(
    "Release budgets: Perf >= 75, A11y >= 95, BP >= 90, SEO >= 90; FCP <= 3s, LCP <= 4s, CLS <= 0.1, TBT <= 600ms, TTFB <= 800ms.",
  );
  lines.push(
    "Product targets: Perf >= 90; LCP < 2.5s, CLS < 0.1, TBT < 200ms, TTFB < 200ms.",
  );
  lines.push("");
  if (deployment.errors.length > 0) {
    lines.push("## Evidence integrity failures");
    lines.push("");
    for (const error of deployment.errors) {
      lines.push(`- ${error}`);
    }
    lines.push("");
  }
  const errors = scores.filter((s) => s.error);
  if (errors.length > 0) {
    lines.push("## Failures");
    lines.push("");
    for (const e of errors) {
      lines.push(`- \`${e.url}\``);
      lines.push("");
      lines.push("```");
      lines.push((e.error ?? "").trim());
      lines.push("```");
      lines.push("");
    }
  }
  if (violations.length > 0) {
    lines.push("## Budget violations");
    lines.push("");
    for (const violation of violations) {
      lines.push(`- ${violation}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const {
    base,
    urls,
    label,
    enforce,
    runs,
    auditCodeRevision,
    requireStableDeployment,
  } = parseArgs();
  // Snapshots write to .perf/<isoDate>-<label>/ at the repo root so
  // before/after runs do not overwrite each other and so the script
  // agrees with the gitignore entry in repo root (`.perf/`).
  const isoDate = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(process.cwd(), ".perf", `${isoDate}-${label}`);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`Lighthouse audit "${label}" against ${base}`);
  console.log(`Reports -> ${outDir}`);
  const deployment = {
    required: requireStableDeployment,
    auditCodeRevision,
    before: null as string | null,
    after: null as string | null,
    errors: [] as string[],
  };
  if (requireStableDeployment && !auditCodeRevision) {
    deployment.errors.push(
      "Audit code revision was not supplied separately from the production target",
    );
  }
  if (requireStableDeployment) {
    try {
      deployment.before = await fetchDeploymentRevision(base);
    } catch (error) {
      deployment.errors.push(
        `Before-sample deployment probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const scores: Score[] = [];
  // Without complete starting evidence, route scores cannot be attributed to
  // one production release. Fail quickly while still writing a summary that
  // explains why no Lighthouse sample was accepted.
  if (!requireStableDeployment || deployment.errors.length === 0) {
    for (const path of urls) {
      const routeRuns: Score[] = [];
      for (let runNumber = 1; runNumber <= runs; runNumber += 1) {
        routeRuns.push(runOne(base, path, outDir, runNumber, runs));
      }
      scores.push(medianScore(base + path, routeRuns));
    }
  }

  if (requireStableDeployment) {
    try {
      deployment.after = await fetchDeploymentRevision(base);
    } catch (error) {
      deployment.errors.push(
        `After-sample deployment probe failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (deployment.before && deployment.after) {
      const changed = deploymentRevisionChange(
        deployment.before,
        deployment.after,
      );
      if (changed) deployment.errors.push(changed);
    }
  }

  const violations = budgetFailures(scores);
  const md = summarize(scores, label, base, violations, runs, deployment);
  const summaryPath = join(outDir, "summary.md");
  writeFileSync(summaryPath, md);

  console.log(`\n${md}`);
  console.log(`\nSaved -> ${summaryPath}`);
  if (deployment.errors.length > 0) {
    console.error(
      `\nPerformance evidence rejected: ${deployment.errors.length} integrity failure(s).\n`,
    );
    process.exitCode = 1;
  } else if (enforce && violations.length > 0) {
    console.error(
      `\nPerformance gate failed: ${violations.length} budget violation(s).\n`,
    );
    process.exitCode = 1;
  } else if (enforce) {
    console.log("\nPerformance gate passed.\n");
  } else if (violations.length > 0) {
    console.log(
      `\nObserved ${violations.length} budget violation(s); rerun with --enforce to gate the result.\n`,
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
