import type {
  FairScheduleParseResult,
  FairScheduleSourceDay,
  FairScheduleSourceItem,
} from "@/lib/fair/schedule";
import { z } from "zod";

export type FairScheduleCandidateRow = Pick<
  FairScheduleSourceItem,
  | "id"
  | "fairDate"
  | "sourcePosition"
  | "text"
  | "timeLabel"
  | "inheritedTimeLabel"
  | "startsAt"
  | "endsAt"
>;

export type FairScheduleCandidateDiff = {
  status: "same" | "source-revision-only" | "content-changed";
  reviewedSourceRevision: string | null;
  candidateSourceRevision: string | null;
  reviewedDayCount: number;
  candidateDayCount: number;
  reviewedItemCount: number;
  candidateItemCount: number;
  added: FairScheduleCandidateRow[];
  removed: FairScheduleCandidateRow[];
  changedDayCounts: Array<{
    date: string;
    reviewed: number;
    candidate: number;
  }>;
};

export type EventHubExhibitorCandidate = {
  profileId: string;
  name: string;
  booths: string[];
  duplicateBoothReferences: string[];
  media: {
    state: "provided" | "placeholder";
    sourceUrl: string | null;
  };
};

export type EventHubFloorplanCandidate = {
  mapId: string;
  name: string;
  sourceUrl: string;
};

export type EventHubBoothCandidate = {
  mapId: string;
  boothId: string;
  elementId: string;
  label: string;
  sourceTypeId: string | null;
  sourceState: "open" | "closed" | "unspecified";
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  normalizedBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type EventHubMapCandidate = {
  mapId: string;
  width: number;
  height: number;
  backgroundImageUrl: string;
  booths: EventHubBoothCandidate[];
  sourceWarnings: string[];
};

export type EventHubExhibitorMapIndexItem = EventHubExhibitorCandidate & {
  locations: Array<{
    boothLabel: string;
    resolution: "matched" | "ambiguous" | "unmatched";
    matches: Array<{
      mapId: string;
      boothId: string;
      elementId: string;
      normalizedBounds: EventHubBoothCandidate["normalizedBounds"];
    }>;
  }>;
};

export type OfficialFairPageCandidate = {
  id: number;
  slug: string;
  modifiedAt: string;
  sourceUrl: string;
  title: string;
  visibleText: string;
  outboundUrls: string[];
};

const officialPageSchema = z
  .object({
    id: z.number().int().positive(),
    slug: z.string().trim().min(1).max(120),
    modified_gmt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
    link: z.string().url(),
    title: z.object({ rendered: z.string() }).passthrough(),
    content: z.object({ rendered: z.string() }).passthrough(),
  })
  .passthrough();

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

function visibleText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function parseOfficialFairPages(
  jsonText: string,
  expectedPageIds: readonly number[],
): OfficialFairPageCandidate[] {
  const parsed = z.array(officialPageSchema).parse(JSON.parse(jsonText));
  const expected = new Set(expectedPageIds);
  const found = new Set<number>();
  const pages = parsed.map((page) => {
    if (!expected.has(page.id)) {
      throw new Error(`The Fair page API returned unexpected page ${page.id}.`);
    }
    if (found.has(page.id)) {
      throw new Error(`The Fair page API repeated page ${page.id}.`);
    }
    found.add(page.id);
    const sourceUrl = new URL(page.link);
    if (
      sourceUrl.protocol !== "https:" ||
      canonicalHost(sourceUrl.hostname) !== "thegreatfrederickfair.com" ||
      sourceUrl.username ||
      sourceUrl.password
    ) {
      throw new Error(`The Fair page API returned an unsafe link for page ${page.id}.`);
    }
    const outboundUrls = Array.from(
      new Set(
        Array.from(
          page.content.rendered.matchAll(/\bhref=["']([^"']+)["']/gi),
          (match) => decodeHtmlEntities(match[1]),
        ).flatMap((href) => {
          try {
            const url = new URL(href, sourceUrl);
            return url.protocol === "https:" ? [url.href] : [];
          } catch {
            return [];
          }
        }),
      ),
    ).sort();
    return {
      id: page.id,
      slug: page.slug,
      modifiedAt: `${page.modified_gmt}Z`,
      sourceUrl: sourceUrl.href,
      title: visibleText(page.title.rendered),
      visibleText: visibleText(page.content.rendered),
      outboundUrls,
    };
  });
  const missing = expectedPageIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`The Fair page API omitted expected pages: ${missing.join(", ")}.`);
  }
  return pages.sort((left, right) => left.id - right.id);
}

function scheduleRows(days: readonly FairScheduleSourceDay[]) {
  return days.flatMap((day) => day.items);
}

function candidateRow(item: FairScheduleSourceItem): FairScheduleCandidateRow {
  return {
    id: item.id,
    fairDate: item.fairDate,
    sourcePosition: item.sourcePosition,
    text: item.text,
    timeLabel: item.timeLabel,
    inheritedTimeLabel: item.inheritedTimeLabel,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
  };
}

function visitorScheduleContent(days: readonly FairScheduleSourceDay[]) {
  return days.map((day) => ({
    date: day.date,
    gateStartsAt: day.gateStartsAt,
    gateEndsAt: day.gateEndsAt,
    items: day.items.map(candidateRow),
  }));
}

/**
 * Compare a reviewed Fair schedule with a newly fetched, fully parsed candidate.
 * Stable row IDs make additions and removals exact. Source-only timestamp churn
 * remains distinct from a visitor-visible schedule change.
 */
export function diffFairScheduleCandidates(
  reviewed: FairScheduleParseResult,
  candidate: FairScheduleParseResult,
): FairScheduleCandidateDiff {
  if (!reviewed.ok || !candidate.ok) {
    throw new Error("Fair schedule candidates must pass the publisher-specific parser before diffing.");
  }

  const reviewedRows = scheduleRows(reviewed.days);
  const candidateRows = scheduleRows(candidate.days);
  const reviewedById = new Map(reviewedRows.map((item) => [item.id, item]));
  const candidateById = new Map(candidateRows.map((item) => [item.id, item]));
  const added = candidateRows
    .filter((item) => !reviewedById.has(item.id))
    .map(candidateRow);
  const removed = reviewedRows
    .filter((item) => !candidateById.has(item.id))
    .map(candidateRow);
  const reviewedCountByDate = new Map(
    reviewed.days.map((day) => [day.date, day.items.length]),
  );
  const candidateCountByDate = new Map(
    candidate.days.map((day) => [day.date, day.items.length]),
  );
  const dates = Array.from(
    new Set([...reviewedCountByDate.keys(), ...candidateCountByDate.keys()]),
  ).sort();
  const changedDayCounts = dates.flatMap((date) => {
    const reviewedCount = reviewedCountByDate.get(date) ?? 0;
    const candidateCount = candidateCountByDate.get(date) ?? 0;
    return reviewedCount === candidateCount
      ? []
      : [{ date, reviewed: reviewedCount, candidate: candidateCount }];
  });
  const contentChanged =
    added.length > 0 ||
    removed.length > 0 ||
    changedDayCounts.length > 0 ||
    JSON.stringify(visitorScheduleContent(reviewed.days)) !==
      JSON.stringify(visitorScheduleContent(candidate.days));
  const sourceRevisionChanged =
    reviewed.sourceRevision !== candidate.sourceRevision;

  return {
    status: contentChanged
      ? "content-changed"
      : sourceRevisionChanged
        ? "source-revision-only"
        : "same",
    reviewedSourceRevision: reviewed.sourceRevision,
    candidateSourceRevision: candidate.sourceRevision,
    reviewedDayCount: reviewed.stats.dayCount,
    candidateDayCount: candidate.stats.dayCount,
    reviewedItemCount: reviewed.stats.itemCount,
    candidateItemCount: candidate.stats.itemCount,
    added,
    removed,
    changedDayCounts,
  };
}

export function assertOfficialVendorPageReferencesShow(
  html: string,
  expectedShowId: string,
): void {
  const hasApprovedGuide = Array.from(
    html.matchAll(/https:\/\/[^\s"'<>]+/gi),
    (match) => match[0].replaceAll("&amp;", "&"),
  ).some((candidate) => {
    try {
      const url = new URL(candidate);
      return (
        url.protocol === "https:" &&
        url.hostname === "mobile.eventhub-floorplan.net" &&
        url.port === "" &&
        url.pathname === "/" &&
        url.searchParams.get("Show_ID") === expectedShowId
      );
    } catch {
      return false;
    }
  });
  if (!hasApprovedGuide) {
    throw new Error(
      `The official Fair vendor page does not reference the approved EventHub guide for show ${expectedShowId}.`,
    );
  }
}

/** Parse only the repeated public exhibitor tile fields needed for review. */
export function parseEventHubExhibitors(
  html: string,
): EventHubExhibitorCandidate[] {
  const pattern =
    /<div class='nu catch' onClick="loadLink\('https:\/\/mobile\.map-dynamics\.com\/exhibitor-profile-g2app\.php\?ID=(\d+)'\);"[^>]*>[\s\S]*?<div class='exhib-tile-image( placeholder)?' style="background-image:\s*url\('([^']+)'\);"><\/div>[\s\S]*?<div class='exhib-title'>([\s\S]*?)<\/div>[\s\S]*?<span class='exhib-value'>Booths?:\s*([\s\S]*?)<\/span>/g;
  const byProfileId = new Map<string, EventHubExhibitorCandidate>();
  for (const match of html.matchAll(pattern)) {
    const profileId = match[1];
    const placeholder = Boolean(match[2]);
    const rawMediaUrl = visibleText(match[3]);
    const sourceName = visibleText(match[4]);
    const name = sourceName.replace(/\s+\/\s+[A-F0-9]{6}$/i, "").trim();
    const sourceBooths = visibleText(match[5])
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const boothCounts = new Map<string, number>();
    sourceBooths.forEach((booth) =>
      boothCounts.set(booth, (boothCounts.get(booth) ?? 0) + 1),
    );
    const booths = Array.from(new Set(sourceBooths));
    const duplicateBoothReferences = Array.from(boothCounts)
      .filter(([, count]) => count > 1)
      .map(([booth]) => booth)
      .sort();
    let mediaSourceUrl: string | null = null;
    if (!placeholder) {
      const mediaUrl = new URL(rawMediaUrl);
      if (
        mediaUrl.protocol !== "https:" ||
        mediaUrl.hostname !== "mapd-client-images.s3.us-east-2.amazonaws.com"
      ) {
        throw new Error(`EventHub profile ${profileId} uses an unexpected media host.`);
      }
      mediaSourceUrl = mediaUrl.href;
    }
    if (!name || booths.length === 0) continue;
    const media = {
      state: placeholder ? ("placeholder" as const) : ("provided" as const),
      sourceUrl: mediaSourceUrl,
    };
    const existing = byProfileId.get(profileId);
    if (
      existing &&
      (existing.name !== name ||
        existing.booths.join("|") !== booths.join("|") ||
        existing.media.state !== media.state ||
        existing.media.sourceUrl !== media.sourceUrl)
    ) {
      throw new Error(`EventHub profile ${profileId} appears with conflicting public data.`);
    }
    byProfileId.set(profileId, {
      profileId,
      name,
      booths,
      duplicateBoothReferences,
      media,
    });
  }
  const exhibitors = Array.from(byProfileId.values()).sort((left, right) =>
    left.name.localeCompare(right.name) || left.profileId.localeCompare(right.profileId),
  );
  if (exhibitors.length === 0) {
    throw new Error("The EventHub response contains no recognizable exhibitor tiles.");
  }
  return exhibitors;
}

export function parseEventHubFloorplans(
  html: string,
  expectedShowId: string,
): EventHubFloorplanCandidate[] {
  const pattern =
    /<a href='(https:\/\/mobile\.map-dynamics\.com\/floorplan-g2app\.php\?Show_ID=(\d+)&amp;Map_ID=(\d+)|https:\/\/mobile\.map-dynamics\.com\/floorplan-g2app\.php\?Show_ID=(\d+)&Map_ID=(\d+))'[^>]*>([\s\S]*?)<\/a>/g;
  const byMapId = new Map<string, EventHubFloorplanCandidate>();
  for (const match of html.matchAll(pattern)) {
    const showId = match[2] ?? match[4];
    const mapId = match[3] ?? match[5];
    if (showId !== expectedShowId) continue;
    const name = visibleText(match[6]);
    const sourceUrl = `https://mobile.map-dynamics.com/floorplan-g2app.php?Show_ID=${expectedShowId}&Map_ID=${mapId}`;
    if (!name) continue;
    byMapId.set(mapId, { mapId, name, sourceUrl });
  }
  const floorplans = Array.from(byMapId.values()).sort((left, right) =>
    left.mapId.localeCompare(right.mapId),
  );
  if (floorplans.length === 0) {
    throw new Error("The EventHub response contains no floorplans for the expected Fair show.");
  }
  return floorplans;
}

function styleNumber(style: string, property: string): number | null {
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}:\\s*(-?\\d+(?:\\.\\d+)?)px`, "i"));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function roundRatio(value: number): number {
  return Number(value.toFixed(6));
}

export function parseEventHubMap(
  html: string,
  expectedMapId: string,
): EventHubMapCandidate {
  const mapBox = html.match(
    /#mapBox\s*\{[^}]*height:(\d+(?:\.\d+)?)px;\s*width:(\d+(?:\.\d+)?)px;\s*background:url\('([^']+)'\)/i,
  );
  if (!mapBox) {
    throw new Error(`EventHub map ${expectedMapId} is missing its bounded map canvas.`);
  }
  const height = Number(mapBox[1]);
  const width = Number(mapBox[2]);
  const backgroundImageUrl = mapBox[3];
  const background = new URL(backgroundImageUrl);
  if (
    background.protocol !== "https:" ||
    background.hostname !== "mapd-client-images.s3.us-east-2.amazonaws.com"
  ) {
    throw new Error(`EventHub map ${expectedMapId} uses an unexpected background host.`);
  }

  const pattern =
    /<a\s+href="javascript:showModal\('([^']+)',\s*'([^']+)',\s*'([^']+)'\);"\s+ID='([^']+)'\s+class='([^']*\bbooth(\d+)[^']*)'\s+style='([^']+)'/g;
  const booths: EventHubBoothCandidate[] = [];
  const boothIds = new Set<string>();
  for (const match of html.matchAll(pattern)) {
    const mapId = match[3];
    if (mapId !== expectedMapId) {
      throw new Error(`EventHub map ${expectedMapId} contains a booth for map ${mapId}.`);
    }
    const classes = match[5];
    const style = match[7];
    const x = styleNumber(style, "left");
    const y = styleNumber(style, "top");
    const boothWidth = styleNumber(style, "width");
    const boothHeight = styleNumber(style, "height");
    if (
      x === null ||
      y === null ||
      boothWidth === null ||
      boothHeight === null ||
      x < 0 ||
      y < 0 ||
      boothWidth <= 0 ||
      boothHeight <= 0 ||
      x + boothWidth > width + 1 ||
      y + boothHeight > height + 1
    ) {
      throw new Error(`EventHub booth ${match[6]} has invalid map bounds.`);
    }
    const boothId = match[6];
    if (boothIds.has(boothId)) {
      throw new Error(`EventHub map ${expectedMapId} repeats booth id ${boothId}.`);
    }
    boothIds.add(boothId);
    const typeId = classes.match(/\btype(\d+)\b/)?.[1] ?? null;
    const sourceState = /\bopen\b/.test(classes)
      ? "open"
      : /\bclosed\b/.test(classes)
        ? "closed"
        : "unspecified";
    booths.push({
      mapId,
      boothId,
      elementId: match[2],
      label: visibleText(match[1]),
      sourceTypeId: typeId,
      sourceState,
      bounds: { x, y, width: boothWidth, height: boothHeight },
      normalizedBounds: {
        x: roundRatio(x / width),
        y: roundRatio(y / height),
        width: roundRatio(boothWidth / width),
        height: roundRatio(boothHeight / height),
      },
    });
  }
  if (booths.length === 0) {
    throw new Error(`EventHub map ${expectedMapId} contains no recognizable booth geometry.`);
  }
  booths.sort((left, right) => left.boothId.localeCompare(right.boothId));
  const sourceWarnings = /\bClick to edit\b/i.test(visibleText(html))
    ? ["contains-editorial-residue"]
    : [];
  return {
    mapId: expectedMapId,
    width,
    height,
    backgroundImageUrl,
    booths,
    sourceWarnings,
  };
}

/**
 * Join the exhibitor index to map geometry without guessing. A location stays
 * ambiguous or unmatched when the public source cannot resolve it exactly.
 */
export function buildEventHubExhibitorMapIndex(
  exhibitors: readonly EventHubExhibitorCandidate[],
  maps: readonly EventHubMapCandidate[],
): EventHubExhibitorMapIndexItem[] {
  const boothsByLabel = new Map<string, EventHubBoothCandidate[]>();
  for (const map of maps) {
    for (const booth of map.booths) {
      const matches = boothsByLabel.get(booth.label) ?? [];
      matches.push(booth);
      boothsByLabel.set(booth.label, matches);
    }
  }

  return exhibitors.map((exhibitor) => ({
    ...exhibitor,
    locations: exhibitor.booths.map((boothLabel) => {
      const matches = (boothsByLabel.get(boothLabel) ?? []).map((booth) => ({
        mapId: booth.mapId,
        boothId: booth.boothId,
        elementId: booth.elementId,
        normalizedBounds: booth.normalizedBounds,
      }));
      return {
        boothLabel,
        resolution:
          matches.length === 1
            ? "matched"
            : matches.length > 1
              ? "ambiguous"
              : "unmatched",
        matches,
      };
    }),
  }));
}
