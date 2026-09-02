/**
 * NAS-friendly discovery of new public r/frederickmd Fair discussions.
 *
 * This reads Reddit's official public Atom search feed. It retains post ids,
 * titles, Reddit permalinks, dates, and broad friction labels in a private,
 * gitignored review report. It never stores author names, post bodies,
 * comments, media, or sentiment, and it never publishes a community claim.
 *
 *   npm run fair:community-watch
 *   npm run fair:community-watch -- --live --fail-on-new
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { parseFairCommunityFeed } from "../src/lib/fair/community-intelligence";

const CONFIG_PATH = resolve("config/fair-community-watch.json");
const STATE_PATH = resolve("scripts/reports/fair-community-watch-state.json");
const REPORT_PATH = resolve("scripts/reports/fair-community-watch-latest.json");
const USER_AGENT =
  "FrederickRadiusFairWatch/1.0 (private review; hello@frederickradius.app)";

const configSchema = z
  .object({
    _doc: z.string().optional(),
    version: z.literal(1),
    feedUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          url.hostname === "www.reddit.com" &&
          url.pathname === "/r/frederickmd/search.rss" &&
          url.searchParams.get("restrict_sr") === "on" &&
          url.searchParams.get("q") === '"Great Frederick Fair"'
        );
      }, "must remain the exact public Frederick Fair search feed"),
    limits: z
      .object({
        timeoutMs: z.number().int().min(1000).max(30000),
        maxResponseBytes: z.number().int().min(100000).max(1000000),
        maxEntries: z.number().int().min(1).max(100),
        maxRememberedIds: z.number().int().min(50).max(2000),
      })
      .strict(),
  })
  .strict();

type CommunityWatchConfig = z.infer<typeof configSchema>;
type CommunityWatchState = {
  schemaVersion: 1;
  initializedAt: string | null;
  lastCheckedAt: string | null;
  seen: Record<
    string,
    { url: string; publishedAt: string; firstObservedAt: string }
  >;
};

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

async function fetchFeed(config: CommunityWatchConfig): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.limits.timeoutMs);
  try {
    const response = await fetch(config.feedUrl, {
      headers: {
        Accept: "application/atom+xml,application/xml,text/xml",
        "User-Agent": USER_AGENT,
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !contentType.includes("xml") &&
      !contentType.includes("application/atom+xml")
    ) {
      throw new Error(`unexpected content type: ${contentType || "missing"}`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > config.limits.maxResponseBytes
    ) {
      throw new Error("feed exceeds the configured byte limit");
    }
    const xml = await response.text();
    if (Buffer.byteLength(xml, "utf8") > config.limits.maxResponseBytes) {
      throw new Error("feed exceeds the configured byte limit");
    }
    return xml;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");
  const failOnNew = argv.includes("--fail-on-new");
  const config = configSchema.parse(
    JSON.parse(await readFile(CONFIG_PATH, "utf8")),
  );
  if (!live) {
    console.log(
      "Fair Community Watch plan: one exact public Reddit RSS search; titles and links only; no paid provider; no public writes. Add --live to fetch.",
    );
    return;
  }

  const checkedAt = new Date().toISOString();
  const state = await readJson<CommunityWatchState>(STATE_PATH, {
    schemaVersion: 1,
    initializedAt: null,
    lastCheckedAt: null,
    seen: {},
  });
  const leads = parseFairCommunityFeed(await fetchFeed(config)).slice(
    0,
    config.limits.maxEntries,
  );
  if (leads.length === 0) {
    throw new Error("the Fair search feed returned no valid post entries");
  }
  const baseline = state.initializedAt === null;
  const newLeads = baseline
    ? []
    : leads.filter((lead) => !Object.hasOwn(state.seen, lead.id));
  for (const lead of leads) {
    state.seen[lead.id] ??= {
      url: lead.url,
      publishedAt: lead.publishedAt,
      firstObservedAt: checkedAt,
    };
  }
  const retained = Object.entries(state.seen)
    .sort(
      ([, left], [, right]) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    )
    .slice(0, config.limits.maxRememberedIds);
  state.seen = Object.fromEntries(retained);
  state.initializedAt ??= checkedAt;
  state.lastCheckedAt = checkedAt;

  await writeJsonAtomic(STATE_PATH, state);
  await writeJsonAtomic(REPORT_PATH, {
    schemaVersion: 1,
    reviewOnly: true,
    noPublicWrites: true,
    storesAuthors: false,
    storesBodies: false,
    storesComments: false,
    providerCostUsd: 0,
    checkedAt,
    baseline,
    feedEntryCount: leads.length,
    newCount: newLeads.length,
    newLeads,
  });
  console.log(
    baseline
      ? `Fair Community Watch established a private baseline of ${leads.length} public post links. No historical post was raised as new.`
      : `Fair Community Watch found ${newLeads.length} new public Fair discussion${newLeads.length === 1 ? "" : "s"}. Review ${REPORT_PATH}.`,
  );
  if (failOnNew && newLeads.length > 0) process.exitCode = 3;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
