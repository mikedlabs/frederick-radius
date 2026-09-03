/**
 * Acquire a normalized, review-only candidate from the Fair's current public
 * sources. The detailed candidate stays outside git and never changes the app.
 * A human must review source changes and confirm EventHub reuse permission
 * before any vendor or booth data can be promoted to a public Radius release.
 *
 *   npm run fair:data:collect
 *   npm run fair:data:collect -- --live
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  assertOfficialVendorPageReferencesShow,
  buildEventHubExhibitorMapIndex,
  diffFairScheduleCandidates,
  parseEventHubExhibitors,
  parseEventHubFloorplans,
  parseEventHubMap,
  parseOfficialFairPages,
} from "../src/lib/fair/data-candidate";
import { parseGreatFrederickFair2026Schedule } from "../src/lib/fair/schedule";

const CONFIG_PATH = resolve("config/fair-data-collector.json");
const DEFAULT_REPORT_DIRECTORY = resolve("scripts/reports/fair-data");
const REVIEWED_SCHEDULE_PATH = resolve(
  "src/lib/fair/__fixtures__/great-frederick-fair-2026.ics",
);
const USER_AGENT =
  "FrederickRadiusFairData/1.0 (review-only local guide; hello@frederickradius.app)";
export const FAIR_SOURCE_REDIRECT_POLICY = "error" as const;

const EXACT_SCHEDULE_URL =
  "https://calendar.google.com/calendar/ical/gffcal%40gmail.com/public/basic.ics";
const EXACT_OFFICIAL_PAGES_URL =
  "https://thegreatfrederickfair.com/wp-json/wp/v2/pages?include=1722%2C2711%2C2862%2C3081%2C3140%2C3175%2C3224%2C3262%2C3662%2C7698&per_page=10&context=view&_fields=id%2Cslug%2Cmodified_gmt%2Clink%2Ctitle%2Ccontent";
const EXACT_EXHIBITORS_URL =
  "https://mobile.map-dynamics.com/exhibitors-g2app.php?Show_ID=18209";
const EXACT_FLOORPLANS_URL =
  "https://mobile.map-dynamics.com/floorplans-g2app.php?Show_ID=18209";

const configSchema = z
  .object({
    _doc: z.string().optional(),
    version: z.literal(1),
    eventHubShowId: z.literal("18209"),
    officialPageIds: z.tuple([
      z.literal(1722),
      z.literal(2711),
      z.literal(2862),
      z.literal(3081),
      z.literal(3140),
      z.literal(3175),
      z.literal(3224),
      z.literal(3262),
      z.literal(3662),
      z.literal(7698),
    ]),
    limits: z
      .object({
        timeoutMs: z.number().int().min(1_000).max(30_000),
        maxCalendarBytes: z.number().int().min(100_000).max(5_000_000),
        maxHtmlBytes: z.number().int().min(100_000).max(5_000_000),
        maxFloorplans: z.number().int().min(1).max(12),
      })
      .strict(),
    sources: z
      .object({
        scheduleCalendarUrl: z.literal(EXACT_SCHEDULE_URL),
        officialPagesUrl: z.literal(EXACT_OFFICIAL_PAGES_URL),
        eventHubExhibitorsUrl: z.literal(EXACT_EXHIBITORS_URL),
        eventHubFloorplansUrl: z.literal(EXACT_FLOORPLANS_URL),
      })
      .strict(),
  })
  .strict();

type Config = z.infer<typeof configSchema>;
type SourceKind =
  | "schedule"
  | "official-pages"
  | "eventhub-exhibitors"
  | "eventhub-floorplans"
  | "eventhub-map";

type FetchedSource = {
  sourceUrl: string;
  finalUrl: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  text: string;
};

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function canonicalHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function validateFinalUrl(
  kind: SourceKind,
  finalUrl: string,
  config: Config,
  expectedMapId?: string,
): void {
  const url = new URL(finalUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${kind} returned an unsafe final URL.`);
  }
  if (kind === "schedule") {
    if (
      url.hostname !== "calendar.google.com" ||
      url.pathname !== "/calendar/ical/gffcal%40gmail.com/public/basic.ics" ||
      url.search
    ) {
      throw new Error("The Fair calendar redirected outside its exact public feed.");
    }
    return;
  }
  if (kind === "official-pages") {
    if (
      canonicalHost(url.hostname) !== "thegreatfrederickfair.com" ||
      url.pathname !== "/wp-json/wp/v2/pages" ||
      url.searchParams.get("include") !== config.officialPageIds.join(",") ||
      url.searchParams.get("per_page") !== String(config.officialPageIds.length) ||
      url.searchParams.get("context") !== "view" ||
      url.searchParams.get("_fields") !==
        "id,slug,modified_gmt,link,title,content"
    ) {
      throw new Error("The Fair page API redirected outside its exact read-only query.");
    }
    return;
  }
  if (url.hostname !== "mobile.map-dynamics.com") {
    throw new Error("EventHub redirected to an unapproved host.");
  }
  const expectedPath =
    kind === "eventhub-exhibitors"
      ? "/exhibitors-g2app.php"
      : kind === "eventhub-floorplans"
        ? "/floorplans-g2app.php"
        : "/floorplan-g2app.php";
  if (
    url.pathname !== expectedPath ||
    url.searchParams.get("Show_ID") !== config.eventHubShowId
  ) {
    throw new Error("EventHub returned a different show or endpoint.");
  }
  if (
    kind === "eventhub-map" &&
    url.searchParams.get("Map_ID") !== expectedMapId
  ) {
    throw new Error("EventHub returned a different floorplan.");
  }
}

async function readBoundedBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("Source response exceeds the configured byte limit.");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new Error("Source response exceeds the configured byte limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function decodeSource(bytes: Uint8Array, contentType: string): string {
  const charset = contentType.match(/charset\s*=\s*([^;]+)/i)?.[1]
    ?.trim()
    .replace(/^"|"$/g, "")
    .toLowerCase();
  const encoding =
    charset === "iso-8859-1" || charset === "latin1"
      ? "windows-1252"
      : "utf-8";
  return new TextDecoder(encoding).decode(bytes);
}

async function fetchSource(
  kind: SourceKind,
  sourceUrl: string,
  config: Config,
  maxBytes: number,
  expectedMapId?: string,
): Promise<FetchedSource> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.limits.timeoutMs);
  try {
    const response = await fetch(sourceUrl, {
      // This job runs inside the NAS network. Never let an allowlisted public
      // source redirect the request to a private or metadata address before we
      // can validate it. Each currently approved endpoint is direct.
      redirect: FAIR_SOURCE_REDIRECT_POLICY,
      signal: controller.signal,
      headers: {
        Accept:
          kind === "schedule"
            ? "text/calendar,text/plain;q=0.9"
            : "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`${kind} returned HTTP ${response.status}.`);
    validateFinalUrl(kind, response.url, config, expectedMapId);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      kind === "schedule"
        ? !/(?:text\/calendar|text\/plain|application\/octet-stream)/.test(contentType)
        : kind === "official-pages"
          ? !/application\/json/.test(contentType)
          : !/(?:text\/html|application\/xhtml\+xml)/.test(contentType)
    ) {
      throw new Error(`${kind} returned an unexpected content type: ${contentType || "missing"}.`);
    }
    const bytes = await readBoundedBytes(response, maxBytes);
    if (bytes.byteLength === 0) throw new Error(`${kind} returned an empty response.`);
    return {
      sourceUrl,
      finalUrl: response.url,
      contentType,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      text: decodeSource(bytes, contentType),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function sourceEvidence(source: FetchedSource) {
  return {
    sourceUrl: source.sourceUrl,
    finalUrl: source.finalUrl,
    contentType: source.contentType,
    byteLength: source.byteLength,
    sha256: source.sha256,
  };
}

function mapCoverage(
  exhibitors: ReturnType<typeof parseEventHubExhibitors>,
  maps: ReturnType<typeof parseEventHubMap>[],
) {
  const mapIdsByLabel = new Map<string, Set<string>>();
  for (const map of maps) {
    for (const booth of map.booths) {
      const mapIds = mapIdsByLabel.get(booth.label) ?? new Set<string>();
      mapIds.add(map.mapId);
      mapIdsByLabel.set(booth.label, mapIds);
    }
  }
  const references = exhibitors.flatMap((exhibitor) =>
    exhibitor.booths.map((booth) => ({ exhibitorId: exhibitor.profileId, booth })),
  );
  const matched = references.filter((reference) =>
    mapIdsByLabel.has(reference.booth),
  );
  const ambiguous = matched.filter(
    (reference) => (mapIdsByLabel.get(reference.booth)?.size ?? 0) > 1,
  );
  return {
    exhibitorBoothReferenceCount: references.length,
    matchedBoothReferenceCount: matched.length,
    ambiguousBoothReferenceCount: ambiguous.length,
    unmatchedBoothReferenceCount: references.length - matched.length,
  };
}

function qualityReview(
  exhibitors: ReturnType<typeof parseEventHubExhibitors>,
  maps: ReturnType<typeof parseEventHubMap>[],
  schedule: ReturnType<typeof parseGreatFrederickFair2026Schedule>,
) {
  const exhibitorsByBooth = new Map<string, Set<string>>();
  exhibitors.forEach((exhibitor) => {
    exhibitor.booths.forEach((booth) => {
      const profileIds = exhibitorsByBooth.get(booth) ?? new Set<string>();
      profileIds.add(exhibitor.profileId);
      exhibitorsByBooth.set(booth, profileIds);
    });
  });
  const scheduleRows = schedule.days.flatMap((day) => day.items);
  return {
    placeholderImageCount: exhibitors.filter(
      (exhibitor) => exhibitor.media.state === "placeholder",
    ).length,
    providedImageCount: exhibitors.filter(
      (exhibitor) => exhibitor.media.state === "provided",
    ).length,
    exhibitorWithRepeatedOwnBoothCount: exhibitors.filter(
      (exhibitor) => exhibitor.duplicateBoothReferences.length > 0,
    ).length,
    boothLabelsSharedByExhibitors: Array.from(exhibitorsByBooth)
      .filter(([, profileIds]) => profileIds.size > 1)
      .map(([boothLabel, profileIds]) => ({
        boothLabel,
        exhibitorCount: profileIds.size,
      }))
      .sort((left, right) => left.boothLabel.localeCompare(right.boothLabel)),
    mapSourceWarnings: maps.flatMap((map) =>
      map.sourceWarnings.map((warning) => ({ mapId: map.mapId, warning })),
    ),
    scheduleSourceWarnings: scheduleRows.flatMap((item) => {
      const warnings: string[] = [];
      if (/\bTBA\b/i.test(item.text)) warnings.push("contains-tba");
      if (/\bE\+D\d+/i.test(item.text)) {
        warnings.push("contains-suspected-source-encoding-residue");
      }
      return warnings.map((warning) => ({
        scheduleId: item.id,
        fairDate: item.fairDate,
        warning,
      }));
    }),
  };
}

export function crossSourceScheduleConflicts(
  schedule: ReturnType<typeof parseGreatFrederickFair2026Schedule>,
  officialPages: ReturnType<typeof parseOfficialFairPages>,
) {
  const scheduleRows = schedule.days.flatMap((day) => day.items);
  const calendarText = scheduleRows.map((item) => item.text).join("\n");
  const schedulePage =
    officialPages.find((page) => page.slug === "schedule")?.visibleText ?? "";
  const grandstandPage =
    officialPages.find((page) => page.slug === "grandstand")?.visibleText ?? "";
  const conflicts: Array<{
    id: string;
    issue: string;
    evidence: Record<string, string | boolean>;
    resolution: string;
  }> = [];

  if (
    calendarText.includes("Jeff Timmons") &&
    schedulePage.includes("Chris Kirkpatrick")
  ) {
    conflicts.push({
      id: "pop-2000-performer",
      issue: "The official calendar and official schedule page name different POP 2000 performers.",
      evidence: {
        calendarHasJeffTimmons: true,
        schedulePageHasChrisKirkpatrick: true,
        grandstandPageHasJeffTimmons: grandstandPage.includes("Jeff Timmons"),
      },
      resolution:
        "Review the newest official Grandstand page and confirm the billed performer before promotion.",
    });
  }
  if (
    /Warren Zeiders[^\n]*\bTBA\b/i.test(calendarText) &&
    (schedulePage.includes("Chris Darlington") ||
      grandstandPage.includes("Chris Darlington"))
  ) {
    conflicts.push({
      id: "warren-zeiders-opener",
      issue: "The official calendar says TBA while official web pages name an opener.",
      evidence: {
        calendarHasTba: true,
        schedulePageHasChrisDarlington:
          schedulePage.includes("Chris Darlington"),
        grandstandPageHasChrisDarlington:
          grandstandPage.includes("Chris Darlington"),
      },
      resolution:
        "Confirm the opener against the newest official Grandstand page before promotion.",
    });
  }
  if (
    schedulePage.includes("PeeWee & Open Class Dairy Showmanship") &&
    !calendarText.includes("PeeWee & Open Class Dairy Showmanship")
  ) {
    conflicts.push({
      id: "peewee-dairy-row",
      issue: "The official schedule page contains a dairy-show row missing from the official calendar.",
      evidence: {
        schedulePageHasRow: true,
        calendarHasRow: false,
      },
      resolution:
        "Ask the Fair whether the row is current, then add it through the reviewed schedule override lane if confirmed.",
    });
  }
  if (/Mark's E\+D\d+quipment/i.test(calendarText)) {
    conflicts.push({
      id: "equipment-source-encoding",
      issue: "The official calendar contains a visibly corrupted sponsor name.",
      evidence: {
        calendarHasEncodingResidue: true,
        schedulePageHasCleanName:
          schedulePage.includes("Mark’s Equipment") ||
          schedulePage.includes("Mark's Equipment"),
      },
      resolution:
        "Preserve the source row privately and use a reviewed correction for visitor-facing copy.",
    });
  }
  return conflicts;
}

async function collect(config: Config, reportDirectory: string): Promise<void> {
  const checkedAt = new Date().toISOString();
  const [schedule, officialPagesSource, exhibitorsSource, floorplansSource] =
    await Promise.all([
      fetchSource(
        "schedule",
        config.sources.scheduleCalendarUrl,
        config,
        config.limits.maxCalendarBytes,
      ),
      fetchSource(
        "official-pages",
        config.sources.officialPagesUrl,
        config,
        config.limits.maxHtmlBytes,
      ),
      fetchSource(
        "eventhub-exhibitors",
        config.sources.eventHubExhibitorsUrl,
        config,
        config.limits.maxHtmlBytes,
      ),
      fetchSource(
        "eventhub-floorplans",
        config.sources.eventHubFloorplansUrl,
        config,
        config.limits.maxHtmlBytes,
      ),
    ]);

  const officialPages = parseOfficialFairPages(
    officialPagesSource.text,
    config.officialPageIds,
  );
  const vendorPage = officialPages.find((page) => page.slug === "vendors");
  if (!vendorPage) throw new Error("The official Fair page set has no vendor page.");
  assertOfficialVendorPageReferencesShow(
    vendorPage.outboundUrls.join("\n"),
    config.eventHubShowId,
  );
  const reviewedSchedule = parseGreatFrederickFair2026Schedule(
    await readFile(REVIEWED_SCHEDULE_PATH, "utf8"),
  );
  const candidateSchedule = parseGreatFrederickFair2026Schedule(schedule.text);
  if (!candidateSchedule.ok || !candidateSchedule.sourceRevision) {
    const diagnostic = candidateSchedule.diagnostics
      .map((item) => `${item.code}: ${item.message}`)
      .join("\n");
    throw new Error(`The live Fair calendar failed closed.\n${diagnostic}`);
  }
  const scheduleDiff = diffFairScheduleCandidates(
    reviewedSchedule,
    candidateSchedule,
  );
  const exhibitors = parseEventHubExhibitors(exhibitorsSource.text);
  const floorplans = parseEventHubFloorplans(
    floorplansSource.text,
    config.eventHubShowId,
  );
  if (floorplans.length > config.limits.maxFloorplans) {
    throw new Error("EventHub returned more floorplans than the reviewed limit.");
  }
  const mapSources = await Promise.all(
    floorplans.map((floorplan) =>
      fetchSource(
        "eventhub-map",
        floorplan.sourceUrl,
        config,
        config.limits.maxHtmlBytes,
        floorplan.mapId,
      ),
    ),
  );
  const maps = floorplans.map((floorplan, index) => ({
    ...parseEventHubMap(mapSources[index].text, floorplan.mapId),
    name: floorplan.name,
    source: sourceEvidence(mapSources[index]),
  }));
  const totalBooths = maps.reduce((total, map) => total + map.booths.length, 0);
  const coverage = mapCoverage(exhibitors, maps);
  const exhibitorMapIndex = buildEventHubExhibitorMapIndex(exhibitors, maps);
  const quality = qualityReview(exhibitors, maps, candidateSchedule);
  const scheduleConflicts = crossSourceScheduleConflicts(
    candidateSchedule,
    officialPages,
  );

  const candidate = {
    schemaVersion: 1,
    checkedAt,
    reviewOnly: true,
    noPublicWrites: true,
    rights: {
      publicationStatus: "blocked-pending-organizer-permission",
      reason:
        "The official Fair page links to this public EventHub guide, but public access alone does not grant Frederick Radius permission to republish its exhibitor inventory or floorplan artwork.",
      allowedNow:
        "Use this normalized candidate for private source assessment and keep linking to the official guide.",
      promotionRequirement:
        "Obtain an organizer-approved EventHub CSV, JSON, or API export plus explicit reuse permission before public promotion.",
    },
    sources: {
      schedule: sourceEvidence(schedule),
      officialPages: sourceEvidence(officialPagesSource),
      eventHubExhibitors: sourceEvidence(exhibitorsSource),
      eventHubFloorplans: sourceEvidence(floorplansSource),
    },
    schedule: {
      sourceRevision: candidateSchedule.sourceRevision,
      stats: candidateSchedule.stats,
      diagnostics: candidateSchedule.diagnostics,
      diff: scheduleDiff,
      days: candidateSchedule.days,
    },
    officialPages: officialPages.map((page) => ({
      ...page,
      visibleTextSha256: createHash("sha256")
        .update(page.visibleText)
        .digest("hex"),
    })),
    crossSourceReview: {
      conflictCount: scheduleConflicts.length,
      conflicts: scheduleConflicts,
    },
    eventHub: {
      showId: config.eventHubShowId,
      sourceStateNote:
        "Booth open/closed values are source CSS classes only. Radius must not present them as business hours, occupancy, or live operating status.",
      exhibitors,
      exhibitorMapIndex,
      floorplans,
      maps,
      coverage,
      quality,
    },
  };
  const summary = {
    schemaVersion: 1,
    checkedAt,
    reviewOnly: true,
    noPublicWrites: true,
    schedule: {
      status: scheduleDiff.status,
      sourceRevision: candidateSchedule.sourceRevision,
      dayCount: candidateSchedule.stats.dayCount,
      itemCount: candidateSchedule.stats.itemCount,
      addedCount: scheduleDiff.added.length,
      removedCount: scheduleDiff.removed.length,
    },
    officialPages: {
      pageCount: officialPages.length,
      latestModifiedAt: officialPages
        .map((page) => page.modifiedAt)
        .sort()
        .at(-1),
    },
    crossSourceReview: {
      conflictCount: scheduleConflicts.length,
      requiresHumanReview: scheduleConflicts.length > 0,
    },
    eventHub: {
      showId: config.eventHubShowId,
      publicationStatus: candidate.rights.publicationStatus,
      exhibitorCount: exhibitors.length,
      floorplanCount: floorplans.length,
      boothShapeCount: totalBooths,
      ...coverage,
      placeholderImageCount: quality.placeholderImageCount,
      providedImageCount: quality.providedImageCount,
      exhibitorWithRepeatedOwnBoothCount:
        quality.exhibitorWithRepeatedOwnBoothCount,
      boothLabelsSharedByExhibitorsCount:
        quality.boothLabelsSharedByExhibitors.length,
      mapSourceWarningCount: quality.mapSourceWarnings.length,
      scheduleSourceWarningCount: quality.scheduleSourceWarnings.length,
    },
  };

  const candidatePath = resolve(reportDirectory, "candidate-latest.json");
  const summaryPath = resolve(reportDirectory, "summary-latest.json");
  await writeJsonAtomic(candidatePath, candidate);
  await writeJsonAtomic(summaryPath, summary);
  console.log(
    `Fair data candidate: ${candidateSchedule.stats.itemCount} schedule rows (${scheduleDiff.status}), ${exhibitors.length} exhibitors, ${floorplans.length} floorplans, ${totalBooths} booth shapes, ${scheduleConflicts.length} cross-source conflicts. Review ${candidatePath}.`,
  );
}

async function main(): Promise<void> {
  const live = process.argv.includes("--live");
  const config = configSchema.parse(
    JSON.parse(await readFile(CONFIG_PATH, "utf8")),
  );
  const reportDirectory = resolve(
    process.env.FAIR_DATA_REPORT_DIR ?? DEFAULT_REPORT_DIRECTORY,
  );
  if (!live) {
    console.log(
      `Fair Data Collector plan: one official calendar, ${config.officialPageIds.length} official Fair pages in one read-only API request, one EventHub exhibitor index, and up to ${config.limits.maxFloorplans} current floorplans; review-only; no public writes. Add --live to fetch.`,
    );
    return;
  }
  await collect(config, reportDirectory);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
