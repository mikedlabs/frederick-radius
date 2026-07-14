import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3108";
const OUT = resolve("design-review/probes/lighthouse");
const CLI = resolve("node_modules/.bin/lighthouse");

const routes = [
  ["today", "/today"],
  ["map", "/map"],
  ["events", "/events"],
  ["saved", "/my-radius"],
  ["search-coffee", "/search?q=coffee"],
  ["place-brewers-alley", "/places/brewers-alley-frederick"],
  ["event-alive-at-five", "/events/alive-at-five-2026-07-16"],
  ["town-frederick", "/m/frederick"],
];

await mkdir(OUT, { recursive: true });

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function audit(lhr, id) {
  const a = lhr.audits[id];
  if (!a) return null;
  return {
    id,
    title: a.title,
    score: a.score,
    numericValue: a.numericValue ?? null,
    numericUnit: a.numericUnit ?? null,
    displayValue: a.displayValue ?? null,
    description: a.description,
  };
}

const results = [];
for (const [name, path] of routes) {
  const jsonPath = resolve(OUT, `${name}.json`);
  const url = `${BASE}${path}`;
  const common = [
    url,
    "--quiet",
    "--only-categories=performance",
    "--form-factor=mobile",
    "--throttling-method=simulate",
    "--screenEmulation.mobile=true",
    "--screenEmulation.width=375",
    "--screenEmulation.height=812",
    "--screenEmulation.deviceScaleFactor=1",
    "--chrome-flags=--headless=new --disable-gpu",
  ];
  await run(CLI, [...common, "--output=json", `--output-path=${jsonPath}`]);
  const lhr = JSON.parse(await readFile(jsonPath, "utf8"));
  const metricIds = [
    "first-contentful-paint",
    "largest-contentful-paint",
    "interaction-to-next-paint",
    "speed-index",
    "total-blocking-time",
    "cumulative-layout-shift",
    "server-response-time",
    "interactive",
    "total-byte-weight",
    "mainthread-work-breakdown",
    "bootup-time",
    "unused-javascript",
    "uses-responsive-images",
    "uses-optimized-images",
    "modern-image-formats",
  ];
  results.push({
    route: name,
    path,
    requestedUrl: lhr.requestedUrl,
    finalDisplayedUrl: lhr.finalDisplayedUrl,
    fetchTime: lhr.fetchTime,
    lighthouseVersion: lhr.lighthouseVersion,
    userAgent: lhr.userAgent,
    performanceScore: Math.round((lhr.categories.performance.score ?? 0) * 100),
    metrics: Object.fromEntries(metricIds.map((id) => [id, audit(lhr, id)])),
    lcpElement: lhr.audits["largest-contentful-paint-element"]?.details ?? null,
    diagnostics: lhr.audits.diagnostics?.details?.items?.[0] ?? null,
    note: "Navigation-mode Lighthouse cannot produce field INP without real-user interactions. TBT is retained as a lab responsiveness proxy.",
  });
  console.log(`Lighthouse ${name}: ${results.at(-1).performanceScore}`);
}

await writeFile(resolve(OUT, "summary.json"), `${JSON.stringify({ base: BASE, results }, null, 2)}\n`);
console.log(`Wrote ${resolve(OUT, "summary.json")}`);
