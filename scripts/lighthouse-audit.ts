/**
 * Lighthouse audit runner.
 *
 *   npm run perf            → audits the default URL set against http://localhost:3000
 *   npm run perf -- --url=… → override the base URL
 *
 * Assumes a server is already running at the base URL. The script
 * doesn't start `npm start` itself because that's flaky to manage from
 * a child process — run the build + start in another shell, then this.
 *
 * Output:
 *   - scripts/.lighthouse/*.report.json     full JSON reports (one per URL)
 *   - scripts/.lighthouse/summary.md        markdown table of scores + key metrics
 *
 * What we capture per page:
 *   - Performance, Accessibility, Best Practices, SEO scores (0–100)
 *   - FCP, LCP, CLS, TBT, Speed Index (Core Web Vitals + cousins)
 *
 * Throttling: emulated mobile (Lighthouse default — 4× CPU, slow 4G).
 * That's the experience that matters; desktop scores hide real problems.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Args = { base: string; urls: string[] };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const baseFlag = argv.find((a) => a.startsWith("--url="));
  const base = baseFlag
    ? baseFlag.slice("--url=".length).replace(/\/$/, "")
    : "http://localhost:3000";

  // The set is intentionally narrow — 6 routes that span the visual /
  // computational range. Keeping it small means a full pass is < 4 min;
  // add more URLs sparingly.
  const urls = [
    "/today",
    "/map",
    "/events",
    "/radius",
    "/discover",
    "/places/carroll-creek-linear-park-frederick",
  ];
  return { base, urls };
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
  error?: string;
};

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

function runOne(base: string, path: string, outDir: string): Score {
  const url = base + path;
  const slug = path.replace(/\//g, "_").replace(/^_/, "") || "root";
  const jsonPath = join(outDir, `${slug}.report.json`);

  console.log(`\n→ ${url}`);
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
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").slice(-400);
    return { url, perf: null, a11y: null, bp: null, seo: null, fcp_ms: null, lcp_ms: null, cls: null, tbt_ms: null, si_ms: null, error: stderr };
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
    };
  } catch (e) {
    return { url, perf: null, a11y: null, bp: null, seo: null, fcp_ms: null, lcp_ms: null, cls: null, tbt_ms: null, si_ms: null, error: String(e) };
  }
}

function summarize(scores: Score[]): string {
  const lines: string[] = [];
  lines.push(`# Lighthouse audit — ${new Date().toISOString()}\n`);
  lines.push(
    `| Page | Perf | A11y | Best | SEO | LCP | CLS | TBT | FCP |`,
  );
  lines.push(
    `|---|---|---|---|---|---|---|---|---|`,
  );
  for (const s of scores) {
    const label = s.url.replace(/^https?:\/\/[^/]+/, "");
    if (s.error) {
      lines.push(`| \`${label}\` | ❌ | — | — | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| \`${label}\` | ${emoji(s.perf)} ${pct(s.perf)} | ${emoji(s.a11y)} ${pct(s.a11y)} | ${emoji(s.bp)} ${pct(s.bp)} | ${emoji(s.seo)} ${pct(s.seo)} | ${ms(s.lcp_ms)} | ${num(s.cls)} | ${ms(s.tbt_ms)} | ${ms(s.fcp_ms)} |`,
    );
  }
  lines.push("");
  lines.push("Targets to clear: Perf ≥ 90, A11y ≥ 95, BP ≥ 95, SEO ≥ 95.");
  lines.push("LCP < 2.5s, CLS < 0.1, TBT < 200ms.");
  lines.push("");
  const errors = scores.filter((s) => s.error);
  if (errors.length > 0) {
    lines.push("## Failures\n");
    for (const e of errors) {
      lines.push(`- \`${e.url}\``);
      lines.push(`\n\`\`\``);
      lines.push((e.error ?? "").trim());
      lines.push("```\n");
    }
  }
  return lines.join("\n");
}

const { base, urls } = parseArgs();
const outDir = resolve(__dirname, ".lighthouse");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

console.log(`Lighthouse audit against ${base}`);
console.log(`Reports → ${outDir}`);
const scores: Score[] = [];
for (const path of urls) {
  scores.push(runOne(base, path, outDir));
}

const md = summarize(scores);
const summaryPath = join(outDir, "summary.md");
writeFileSync(summaryPath, md);

console.log(`\n${md}`);
console.log(`\nSaved → ${summaryPath}`);
