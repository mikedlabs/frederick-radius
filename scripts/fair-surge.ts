/**
 * Bounded, loopback-only Fair Day surge harness.
 *
 * This is deliberately not a general load-testing CLI. It has one target
 * route, fixed stages, a hard request ceiling, GET-only allowlisted resources,
 * and no authentication, cookies, query strings, redirects, or external links.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  FAIR_CANONICAL_PATH,
  FAIR_POINTER_PATH,
  FAIR_SURGE_HTTP_METHOD,
  FAIR_SURGE_MARKERS,
  FAIR_SURGE_STAGES,
  HARD_REQUEST_CAP,
  MAX_CRITICAL_RESOURCES,
  RequestBudget,
  applyFairScaleGate,
  createLoopbackRequester,
  criticalContentType,
  extractCriticalResourcePaths,
  fairHtmlSignature,
  parseFairPointer,
  parseLoopbackTarget,
  resolveLoopbackTarget,
  responseContentType,
  safeRequestUrl,
  summarizeFairStage,
  validateFairRelease,
  type FairHtmlSignature,
  type FairStageResult,
  type FairSurgeStage,
  type LoopbackGet,
  type LoopbackResponse,
  type ResolvedLoopbackTarget,
} from "./lib/fair-surge";

type CliOptions = {
  target: string;
  through: 100 | 500 | 1000;
  dryRun: boolean;
  help: boolean;
};

type CriticalEvidence = {
  path: string;
  status: number;
  contentType: string;
  bytes: number;
  durationMs: number;
};

type FairSurgeReport = {
  schemaVersion: 1;
  generatedAt: string;
  completedAt: string | null;
  outcome: "running" | "pass" | "fail";
  failure: string | null;
  target: {
    origin: string;
    resolvedAddress: string;
    family: 4 | 6;
    fairPath: typeof FAIR_CANONICAL_PATH;
  };
  safety: {
    method: typeof FAIR_SURGE_HTTP_METHOD;
    credentials: "omitted";
    cookies: "not stored or replayed";
    redirects: "not followed";
    queryStrings: "forbidden";
    externalLinks: "not requested";
    hardRequestCap: number;
    requestsAttempted: number;
    criticalResourceCap: number;
    fixedStages: typeof FAIR_SURGE_STAGES;
  };
  preflight: null | {
    pageStatus: number;
    pageBytes: number;
    pageDurationMs: number;
    markerHash: string;
    packRevision: string;
    markers: readonly string[];
    criticalResources: CriticalEvidence[];
  };
  stages: FairStageResult[];
};

const DEFAULT_TARGET = "http://127.0.0.1:3000";

function usage(): string {
  return [
    "Fair Day local surge harness",
    "",
    "Usage:",
    "  npm run perf:fair:surge -- [--target http://127.0.0.1:3000] [--through 100|500|1000]",
    "  npm run perf:fair:surge -- --dry-run [--through 100|500|1000]",
    "",
    "The target must be localhost or a numeric loopback address. Public, Vercel,",
    "NAS LAN, and remote hosts are refused. Stages and ceilings cannot be raised.",
  ].join("\n");
}

function optionValue(args: string[], index: number, label: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${label} requires a value.`);
  }
  return value;
}

function parseThrough(value: string): 100 | 500 | 1000 {
  const parsed = Number(value);
  if (parsed !== 100 && parsed !== 500 && parsed !== 1000) {
    throw new Error("--through must be exactly 100, 500, or 1000.");
  }
  return parsed;
}

export function parseFairSurgeArgs(args: string[]): CliOptions {
  let target = DEFAULT_TARGET;
  let through: 100 | 500 | 1000 = 1000;
  let dryRun = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--target") {
      target = optionValue(args, index, "--target");
      index += 1;
    } else if (arg.startsWith("--target=")) {
      target = arg.slice("--target=".length);
    } else if (arg === "--through") {
      through = parseThrough(optionValue(args, index, "--through"));
      index += 1;
    } else if (arg.startsWith("--through=")) {
      through = parseThrough(arg.slice("--through=".length));
    } else {
      throw new Error(`Unknown Fair surge option: ${arg}`);
    }
  }

  return { target, through, dryRun, help };
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function assertResponse(
  response: LoopbackResponse,
  expectedContentType: string,
): void {
  if (response.status !== 200) {
    throw new Error(`${response.path} returned HTTP ${response.status}.`);
  }
  if (response.headers.location) {
    throw new Error(`${response.path} attempted a redirect.`);
  }
  if (response.headers["set-cookie"]) {
    throw new Error(`${response.path} set a cookie on the public Fair path.`);
  }
  const contentType = responseContentType(response.headers).toLowerCase();
  if (expectedContentType && !contentType.includes(expectedContentType)) {
    throw new Error(
      `${response.path} returned ${contentType || "no content type"}; expected ${expectedContentType}.`,
    );
  }
  if (response.body.length === 0) {
    throw new Error(`${response.path} returned an empty body.`);
  }
}

function parseJsonResponse(response: LoopbackResponse): unknown {
  assertResponse(response, "application/json");
  try {
    return JSON.parse(response.body.toString("utf8")) as unknown;
  } catch {
    throw new Error(`${response.path} returned invalid JSON.`);
  }
}

function criticalEvidence(response: LoopbackResponse): CriticalEvidence {
  return {
    path: response.path,
    status: response.status,
    contentType: responseContentType(response.headers),
    bytes: response.body.length,
    durationMs: rounded(response.durationMs),
  };
}

function selectCriticalPaths(
  pointerPath: string,
  htmlPaths: readonly string[],
): string[] {
  const selected = [FAIR_POINTER_PATH, pointerPath];
  const firstCss = htmlPaths.find((path) => path.endsWith(".css"));
  const firstJs = htmlPaths.find((path) => path.endsWith(".js"));
  const firstImage = htmlPaths.find((path) => path.startsWith("/images/fair/"));
  for (const required of [firstCss, firstJs, firstImage]) {
    if (required && !selected.includes(required)) selected.push(required);
  }
  for (const path of htmlPaths) {
    if (selected.length >= MAX_CRITICAL_RESOURCES) break;
    if (!selected.includes(path)) selected.push(path);
  }
  return selected.slice(0, MAX_CRITICAL_RESOURCES);
}

async function runPreflight(
  target: ResolvedLoopbackTarget,
  get: LoopbackGet,
): Promise<NonNullable<FairSurgeReport["preflight"]>> {
  const page = await get(FAIR_CANONICAL_PATH, "text/html");
  assertResponse(page, "text/html");
  const html = page.body.toString("utf8");
  const signature = fairHtmlSignature(html, target.origin);

  const pointerResponse = await get(FAIR_POINTER_PATH, "application/json");
  const pointer = parseFairPointer(parseJsonResponse(pointerResponse));
  if (signature.revision !== pointer.revision) {
    throw new Error("Fair HTML pack revision does not match current.json.");
  }

  const selectedPaths = selectCriticalPaths(
    pointer.assetPath,
    extractCriticalResourcePaths(html, target.origin),
  );
  const criticalResources: CriticalEvidence[] = [
    criticalEvidence(pointerResponse),
  ];

  for (const path of selectedPaths.slice(1)) {
    safeRequestUrl(target, path);
    const response = await get(
      path,
      path.endsWith(".json") ? "application/json" : "*/*",
    );
    assertResponse(response, criticalContentType(path));
    if (path === pointer.assetPath) {
      if (response.body.length !== pointer.byteLength) {
        throw new Error(
          `Fair release length ${response.body.length} did not match pointer ${pointer.byteLength}.`,
        );
      }
      validateFairRelease(parseJsonResponse(response), pointer);
    }
    criticalResources.push(criticalEvidence(response));
  }

  return {
    pageStatus: page.status,
    pageBytes: page.body.length,
    pageDurationMs: rounded(page.durationMs),
    markerHash: signature.hash,
    packRevision: signature.revision,
    markers: FAIR_SURGE_MARKERS,
    criticalResources,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function validateStagePage(
  response: LoopbackResponse,
  target: ResolvedLoopbackTarget,
  reference: FairHtmlSignature,
): void {
  assertResponse(response, "text/html");
  const signature = fairHtmlSignature(response.body.toString("utf8"), target.origin);
  if (signature.hash !== reference.hash || signature.revision !== reference.revision) {
    throw new Error(
      `Fair HTML changed during the stage (${reference.hash} -> ${signature.hash}).`,
    );
  }
}

async function runStage(
  stage: FairSurgeStage,
  target: ResolvedLoopbackTarget,
  reference: FairHtmlSignature,
  get: LoopbackGet,
): Promise<FairStageResult> {
  const stageStarted = performance.now();
  const latenciesMs: number[] = [];
  let bytes = 0;
  let completed = 0;
  let requestErrors = 0;
  let nextUser = 0;
  let stopped = false;
  let fatalError: string | null = null;

  const stageDeadline = setTimeout(() => {
    stopped = true;
    fatalError = `Stage exceeded its ${stage.stageTimeoutMs}ms deadline.`;
  }, stage.stageTimeoutMs);

  const worker = async () => {
    while (!stopped) {
      const userIndex = nextUser;
      nextUser += 1;
      if (userIndex >= stage.users) return;

      const launchAt = stageStarted + (stage.rampMs * userIndex) / stage.users;
      const waitMs = launchAt - performance.now();
      if (waitMs > 0) await sleep(waitMs);
      if (stopped) return;

      try {
        const response = await get(FAIR_CANONICAL_PATH, "text/html");
        validateStagePage(response, target, reference);
        latenciesMs.push(response.durationMs);
        bytes += response.body.length;
        completed += 1;
      } catch (error) {
        requestErrors += 1;
        stopped = true;
        fatalError = error instanceof Error ? error.message : String(error);
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: stage.maxConcurrency }, () => worker()),
    );
  } finally {
    clearTimeout(stageDeadline);
  }

  return summarizeFairStage(stage, {
    completed,
    requestErrors,
    durationMs: performance.now() - stageStarted,
    bytes,
    latenciesMs,
    fatalError,
  });
}

function markdown(report: FairSurgeReport): string {
  const lines = [
    "# Fair Day local surge evidence",
    "",
    `- Outcome: **${report.outcome.toUpperCase()}**`,
    `- Generated: ${report.generatedAt}`,
    `- Target: \`${report.target.origin}${report.target.fairPath}\``,
    `- Resolved loopback: \`${report.target.resolvedAddress}\` (IPv${report.target.family})`,
    `- Requests attempted: ${report.safety.requestsAttempted} / ${report.safety.hardRequestCap}`,
    `- Method: ${report.safety.method}; credentials omitted; redirects and queries forbidden`,
    "",
  ];

  if (report.failure) lines.push(`Failure: ${report.failure}`, "");
  if (report.preflight) {
    lines.push(
      "## Preflight",
      "",
      `- Stable marker hash: \`${report.preflight.markerHash}\``,
      `- Reviewed pack: \`${report.preflight.packRevision}\``,
      `- HTML: ${report.preflight.pageStatus}, ${report.preflight.pageBytes} bytes, ${report.preflight.pageDurationMs}ms`,
      `- Critical resources validated: ${report.preflight.criticalResources.length}`,
      "",
    );
  }

  if (report.stages.length > 0) {
    lines.push(
      "## Stages",
      "",
      "| Users | Completed | p50 | p95 | p99 | Requests/s | Result |",
      "| ---: | ---: | ---: | ---: | ---: | ---: | :--- |",
    );
    for (const stage of report.stages) {
      lines.push(
        `| ${stage.users} | ${stage.completed} | ${stage.latencyMs.p50}ms | ${stage.latencyMs.p95}ms | ${stage.latencyMs.p99}ms | ${stage.requestsPerSecond} | ${stage.passed ? "pass" : "fail"} |`,
      );
      for (const failure of stage.gateFailures) lines.push(`\nStage ${stage.users}: ${failure}`);
    }
    lines.push("");
  }

  lines.push(
    "This evidence covers the local application origin only. Public scale remains a Vercel CDN/ISR responsibility; the NAS is not a public origin.",
    "",
  );
  return lines.join("\n");
}

async function writeEvidence(
  report: FairSurgeReport,
  outputDirectory: string,
): Promise<void> {
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "fair-surge.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDirectory, "fair-surge.md"),
      markdown(report),
      "utf8",
    ),
  ]);
}

function timestampPath(iso: string): string {
  return iso.replaceAll(":", "-").replaceAll(".", "-");
}

async function main(): Promise<void> {
  const options = parseFairSurgeArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const parsedTarget = parseLoopbackTarget(options.target);
  const selectedStages = FAIR_SURGE_STAGES.filter(
    (stage) => stage.users <= options.through,
  );
  if (options.dryRun) {
    console.log(JSON.stringify({
      mode: "dry-run",
      target: parsedTarget.origin,
      fairPath: FAIR_CANONICAL_PATH,
      stages: selectedStages,
      hardRequestCap: HARD_REQUEST_CAP,
      requestMethod: FAIR_SURGE_HTTP_METHOD,
    }, null, 2));
    return;
  }

  const target = await resolveLoopbackTarget(options.target);
  const generatedAt = new Date().toISOString();
  const outputDirectory = resolve(
    process.cwd(),
    ".perf",
    "fair-surge",
    timestampPath(generatedAt),
  );
  await mkdir(outputDirectory, { recursive: true });

  const budget = new RequestBudget();
  const requester = createLoopbackRequester(target, budget);
  const report: FairSurgeReport = {
    schemaVersion: 1,
    generatedAt,
    completedAt: null,
    outcome: "running",
    failure: null,
    target: {
      origin: target.origin,
      resolvedAddress: target.address,
      family: target.family,
      fairPath: FAIR_CANONICAL_PATH,
    },
    safety: {
      method: FAIR_SURGE_HTTP_METHOD,
      credentials: "omitted",
      cookies: "not stored or replayed",
      redirects: "not followed",
      queryStrings: "forbidden",
      externalLinks: "not requested",
      hardRequestCap: HARD_REQUEST_CAP,
      requestsAttempted: 0,
      criticalResourceCap: MAX_CRITICAL_RESOURCES,
      fixedStages: FAIR_SURGE_STAGES,
    },
    preflight: null,
    stages: [],
  };

  try {
    report.preflight = await runPreflight(target, requester.get);
    report.safety.requestsAttempted = budget.used;
    await writeEvidence(report, outputDirectory);

    const reference: FairHtmlSignature = {
      hash: report.preflight.markerHash,
      revision: report.preflight.packRevision,
      criticalPaths: report.preflight.criticalResources.map((row) => row.path),
    };
    for (const [index, stage] of selectedStages.entries()) {
      console.log(
        `Fair surge: ${stage.users} one-shot users, max ${stage.maxConcurrency} concurrent.`,
      );
      const result = applyFairScaleGate(
        await runStage(stage, target, reference, requester.get),
        report.stages[0],
      );
      report.stages.push(result);
      report.safety.requestsAttempted = budget.used;
      await writeEvidence(report, outputDirectory);
      if (!result.passed) {
        throw new Error(
          `Stage ${stage.users} failed; higher stages were not started.`,
        );
      }
      if (stage.dwellAfterMs > 0 && index < selectedStages.length - 1) {
        await sleep(stage.dwellAfterMs);
      }
    }

    report.outcome = "pass";
  } catch (error) {
    report.outcome = "fail";
    report.failure = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    requester.close();
    report.completedAt = new Date().toISOString();
    report.safety.requestsAttempted = budget.used;
    await writeEvidence(report, outputDirectory);
    console.log(`Fair surge evidence: ${outputDirectory}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
