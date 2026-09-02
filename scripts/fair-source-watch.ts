/**
 * Free, NAS-friendly change detection for a fixed set of official Fair pages.
 *
 * The command stores only content hashes, URLs, timestamps, response sizes,
 * and review statuses under the gitignored scripts/reports directory. It does
 * not store page prose, call a paid provider, change public data, or publish.
 *
 *   npm run fair:source-watch
 *   npm run fair:source-watch -- --live --fail-on-change
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import {
  hashSourceContent,
  normalizeSourceContent,
} from "./lib/source-content-fingerprint";

const DEFAULT_CONFIG_PATH = resolve("config/fair-source-watch.json");
const DEFAULT_STATE_PATH = resolve(
  "scripts/reports/fair-source-watch-state.json",
);
const DEFAULT_REPORT_PATH = resolve(
  "scripts/reports/fair-source-watch-latest.json",
);
const EXTRACTOR_VERSION = "fair-visible-text-v1";
const USER_AGENT =
  "FrederickRadiusFairWatch/1.0 (review-only local guide; hello@frederickradius.app)";

const sourceSchema = z
  .object({
    id: z.string().regex(/^fair-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(3).max(120),
    url: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          canonicalHost(url.hostname) === "thegreatfrederickfair.com" &&
          url.username === "" &&
          url.password === ""
        );
      }, "must be an exact public Fair HTTPS page"),
  })
  .strict();

const configSchema = z
  .object({
    _doc: z.string().optional(),
    version: z.literal(1),
    limits: z
      .object({
        maxSources: z.number().int().min(1).max(10),
        timeoutMs: z.number().int().min(1000).max(30000),
        maxResponseBytes: z.number().int().min(100000).max(5000000),
      })
      .strict(),
    sources: z.array(sourceSchema).min(1).max(10),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.sources.length > config.limits.maxSources) {
      ctx.addIssue({
        code: "custom",
        message: "source count exceeds the tracked maximum",
        path: ["sources"],
      });
    }
    const ids = new Set<string>();
    const urls = new Set<string>();
    config.sources.forEach((source, index) => {
      if (ids.has(source.id)) {
        ctx.addIssue({
          code: "custom",
          message: "source ids must be unique",
          path: ["sources", index, "id"],
        });
      }
      if (urls.has(source.url)) {
        ctx.addIssue({
          code: "custom",
          message: "source URLs must be unique",
          path: ["sources", index, "url"],
        });
      }
      ids.add(source.id);
      urls.add(source.url);
    });
  });

type FairSourceWatchConfig = z.infer<typeof configSchema>;
type FairSource = z.infer<typeof sourceSchema>;
type ObservationStatus = "new" | "same" | "changed" | "error";

type StoredObservation = {
  id: string;
  url: string;
  finalUrl: string;
  contentHash: string;
  extractorVersion: typeof EXTRACTOR_VERSION;
  firstSeenAt: string;
  lastCheckedAt: string;
  lastChangedAt: string;
  characterCount: number;
};

type WatchState = {
  schemaVersion: 1;
  observations: Record<string, StoredObservation>;
};

type ReportItem = {
  id: string;
  name: string;
  url: string;
  finalUrl: string | null;
  status: ObservationStatus;
  contentHash: string | null;
  previousContentHash: string | null;
  characterCount: number | null;
  error: string | null;
};

function canonicalHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    );
}

/** Pure, conservative visible-text extraction used by the watcher and tests. */
export function extractFairSourceText(html: string): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  const withoutNoise = main
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|form|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|li|div|section|article|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return normalizeSourceContent(decodeHtmlEntities(withoutNoise));
}

export function classifyFairObservation(
  previous: StoredObservation | undefined,
  current: Pick<StoredObservation, "url" | "finalUrl" | "contentHash" | "extractorVersion">,
): Exclude<ObservationStatus, "error"> {
  if (!previous) return "new";
  return previous.url === current.url &&
    previous.finalUrl === current.finalUrl &&
    previous.contentHash === current.contentHash &&
    previous.extractorVersion === current.extractorVersion
    ? "same"
    : "changed";
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

async function fetchSource(
  source: FairSource,
  config: FairSourceWatchConfig,
): Promise<{ finalUrl: string; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.limits.timeoutMs);
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const final = new URL(response.url);
    if (
      final.protocol !== "https:" ||
      canonicalHost(final.hostname) !== "thegreatfrederickfair.com"
    ) {
      throw new Error("unexpected cross-host redirect");
    }
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      throw new Error(`unexpected content type: ${type || "missing"}`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > config.limits.maxResponseBytes
    ) {
      throw new Error("response exceeds the configured byte limit");
    }
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > config.limits.maxResponseBytes) {
      throw new Error("response exceeds the configured byte limit");
    }
    const text = extractFairSourceText(html);
    if (text.length < 200) throw new Error("page returned too little visible text");
    return { finalUrl: final.href, text };
  } finally {
    clearTimeout(timeout);
  }
}

function selectedSourceId(argv: readonly string[]): string | null {
  const value = argv.find((argument) => argument.startsWith("--source="));
  return value ? value.slice("--source=".length) : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");
  const failOnChange = argv.includes("--fail-on-change");
  const selectedId = selectedSourceId(argv);
  const config = configSchema.parse(
    JSON.parse(await readFile(DEFAULT_CONFIG_PATH, "utf8")),
  );
  const sources = selectedId
    ? config.sources.filter((source) => source.id === selectedId)
    : config.sources;
  if (selectedId && sources.length === 0) {
    throw new Error(`Unknown Fair source id: ${selectedId}`);
  }
  if (!live) {
    console.log(
      `Fair Source Watch plan: ${sources.length} exact first-party page${sources.length === 1 ? "" : "s"}; $0 provider cost; no public writes. Add --live to fetch.`,
    );
    return;
  }

  const checkedAt = new Date().toISOString();
  const state = await readJson<WatchState>(DEFAULT_STATE_PATH, {
    schemaVersion: 1,
    observations: {},
  });
  const items: ReportItem[] = [];

  for (const source of sources) {
    const previous = state.observations[source.id];
    try {
      const fetched = await fetchSource(source, config);
      const contentHash = hashSourceContent(fetched.text);
      const current = {
        id: source.id,
        url: source.url,
        finalUrl: fetched.finalUrl,
        contentHash,
        extractorVersion: EXTRACTOR_VERSION,
        firstSeenAt: previous?.firstSeenAt ?? checkedAt,
        lastCheckedAt: checkedAt,
        lastChangedAt:
          !previous || previous.contentHash !== contentHash
            ? checkedAt
            : previous.lastChangedAt,
        characterCount: fetched.text.length,
      } satisfies StoredObservation;
      const status = classifyFairObservation(previous, current);
      state.observations[source.id] = current;
      items.push({
        id: source.id,
        name: source.name,
        url: source.url,
        finalUrl: fetched.finalUrl,
        status,
        contentHash,
        previousContentHash: previous?.contentHash ?? null,
        characterCount: fetched.text.length,
        error: null,
      });
    } catch (error) {
      items.push({
        id: source.id,
        name: source.name,
        url: source.url,
        finalUrl: null,
        status: "error",
        contentHash: null,
        previousContentHash: previous?.contentHash ?? null,
        characterCount: null,
        error: safeError(error),
      });
    }
  }

  const counts = Object.fromEntries(
    (["new", "same", "changed", "error"] as const).map((status) => [
      status,
      items.filter((item) => item.status === status).length,
    ]),
  );
  await writeJsonAtomic(DEFAULT_STATE_PATH, state);
  await writeJsonAtomic(DEFAULT_REPORT_PATH, {
    schemaVersion: 1,
    reviewOnly: true,
    noPublicWrites: true,
    providerCostUsd: 0,
    extractorVersion: EXTRACTOR_VERSION,
    checkedAt,
    counts,
    items,
  });
  console.log(
    `Fair Source Watch: ${counts.same} same, ${counts.new} new, ${counts.changed} changed, ${counts.error} errors. Review ${DEFAULT_REPORT_PATH}.`,
  );
  if (counts.error > 0) process.exitCode = 1;
  else if (failOnChange && counts.changed > 0) process.exitCode = 3;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
