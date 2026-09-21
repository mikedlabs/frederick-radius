import { z } from "zod";

import { parseEventHubMap } from "../../src/lib/fair/data-candidate";
import { FAIR_LAYOUT_GUIDE_URL, parseFairLayoutData, type FairLayoutData } from "../../src/lib/fair/layout";

export const FAIR_LAYOUT_SECTIONS = {
  "9564": "Grandstand & Homegrown",
  "9565": "Grandstand & Farm & Garden",
  "9566": "Machinery Row & West End",
} as const;

/** Reviewed identity matches, never inferred from similarity at runtime. */
export const FAIR_LAYOUT_RICH_PROFILE_IDS: Readonly<Record<string, string>> = {
  "2008147": "vendor-white-rabbit-rad-pies",
  "2017219": "vendor-big-papis-tacos",
  "1963279": "vendor-boxcar-burgers",
  "1639489": "vendor-jb-seafood",
  "1636704": "vendor-south-mountain-creamery",
  "1996033": "vendor-casimir-bakery",
  "1974268": "vendor-brewers-alley",
  "1634453": "vendor-linganore-winecellars",
  "1977864": "vendor-mcclintock-distilling",
  "1636980": "vendor-tenth-ward-distilling",
  "1640293": "vendor-dragon-distillery",
  "1638033": "vendor-altmeyers-western-wear",
};

const rectSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const candidateSchema = z.object({
  checkedAt: z.string().datetime(),
  eventHub: z.object({
    showId: z.literal("18209"),
    exhibitors: z.array(z.object({
      profileId: z.string().regex(/^\d+$/),
      name: z.string().trim().min(1),
      booths: z.array(z.string().trim().min(1)).min(1),
    })).min(1),
    maps: z.array(z.object({
      mapId: z.string().regex(/^\d+$/),
      name: z.string().trim().min(1),
      width: z.number(),
      height: z.number(),
      backgroundImageUrl: z.string().url(),
      booths: z.array(z.object({
        boothId: z.string(),
        label: z.string(),
        bounds: rectSchema,
      })).min(1),
    })).length(3),
  }),
});

export function fairLayoutArtworkSource(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "mapd-client-images.s3.us-east-2.amazonaws.com" ||
    parsed.username || parsed.password || parsed.hash || !/^\/uploads\/[a-zA-Z0-9_-]+\.png$/.test(parsed.pathname)) {
    throw new Error("Unexpected Fair artwork source URL.");
  }
  for (const [key, value] of parsed.searchParams) {
    if (key !== "timestamp" || !/^\d+$/.test(value)) throw new Error("Unexpected Fair artwork source query.");
  }
  parsed.search = "";
  return parsed.href;
}

/** Preserve publisher rotations. Reject a transform the rectangle renderer cannot express. */
export function parseFairLayoutBoothRotations(html: string): Map<string, number> {
  const rotations = new Map<string, number>();
  const pattern = /<a\s+href="javascript:showModal\('[^']*',\s*'[^']*',\s*'\d+'\);"\s+ID='[^']+'\s+class='([^']*\bbooth(\d+)[^']*)'\s+style='([^']+)'/g;
  for (const match of html.matchAll(pattern)) {
    if (/\b(round|circle|polygon)\b/.test(match[1])) throw new Error("Unsupported non-rectangular Fair booth.");
    const declarations = match[3].split(";").map((part) => part.trim()).filter(Boolean);
    const transforms = declarations.filter((part) => /^(?:-\w+-)?transform\s*:/.test(part));
    const angles = transforms.map((part) => {
      const value = part.match(/^[^:]+:\s*rotate\(\s*(-?\d+(?:\.\d+)?)deg\s*\)$/);
      if (!value) throw new Error("Unsupported Fair booth transform.");
      return Number(value[1]);
    });
    if (new Set(angles).size > 1) throw new Error("Conflicting Fair booth transforms.");
    const origins = declarations.filter((part) => /transform-origin\s*:/.test(part));
    if (origins.some((part) => !/:\s*(?:top left|left top|0(?:px|%)? 0(?:px|%)?)$/.test(part))) {
      throw new Error("Unsupported Fair booth rotation origin.");
    }
    if (rotations.has(match[2])) throw new Error(`Duplicate source booth ${match[2]}.`);
    rotations.set(match[2], angles[0] ?? 0);
  }
  return rotations;
}

export function parseFairLayoutAnnotations(html: string) {
  return [...html.matchAll(/<div data-type='text'[^>]*style='([^']+)'[^>]*>([\s\S]*?)<\/div>/g)].flatMap((match) => {
    const text = match[2].replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (text === "Click to edit") return [];
    if (!text || /&(?:#\d+|\w+);/.test(text)) throw new Error("Unreviewed Fair annotation text.");
    const number = (property: string) => {
      const value = match[1].match(new RegExp(`(?:^|;)\\s*${property}:\\s*(-?\\d+(?:\\.\\d+)?)px`));
      if (!value) throw new Error(`Missing annotation ${property}.`);
      return Number(value[1]);
    };
    const rotation = match[1].match(/(?:^|;)\s*transform:\s*rotate\((-?\d+(?:\.\d+)?)deg\)/);
    if (!rotation) throw new Error("Unsupported Fair annotation transform.");
    const padding = match[1].match(/(?:^|;)\s*padding:\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/);
    if (!padding) throw new Error("Unsupported Fair annotation padding.");
    const rotationDeg = Number(rotation[1]);
    const angle = rotationDeg * Math.PI / 180;
    const horizontal = Number(padding[2]);
    const vertical = Number(padding[1]);
    return [{ text,
      x: number("left") + horizontal * Math.cos(angle) - vertical * Math.sin(angle),
      y: number("top") + horizontal * Math.sin(angle) + vertical * Math.cos(angle),
      rotationDeg, fontSize: number("font-size"),
    }];
  });
}

export function buildPublicFairLayout(
  input: unknown,
  htmlByMapId: Readonly<Record<string, string>>,
  artworkByMapId: Readonly<Record<string, { width: number; height: number }>>,
  reviewedAt: string,
): FairLayoutData {
  const candidate = candidateSchema.parse(input);
  if (JSON.stringify(candidate.eventHub.maps.map((map) => map.mapId).sort()) !== JSON.stringify(Object.keys(FAIR_LAYOUT_SECTIONS).sort())) {
    throw new Error("The reviewed Fair floorplan set changed.");
  }
  const boothIdsByLabel = new Map<string, string[]>();
  const maps = candidate.eventHub.maps.map((map) => {
    const html = htmlByMapId[map.mapId];
    if (!html) throw new Error(`Missing original markup for map ${map.mapId}.`);
    const parsed = parseEventHubMap(html, map.mapId);
    const compact = (booths: typeof map.booths) => booths.map((booth) => ({ boothId: booth.boothId, label: booth.label, bounds: booth.bounds }));
    if (parsed.width !== map.width || parsed.height !== map.height ||
      fairLayoutArtworkSource(parsed.backgroundImageUrl) !== fairLayoutArtworkSource(map.backgroundImageUrl) ||
      JSON.stringify(compact(parsed.booths)) !== JSON.stringify(compact(map.booths))) {
      throw new Error(`Map ${map.mapId} changed after the reviewed candidate was collected.`);
    }
    const rotations = parseFairLayoutBoothRotations(html);
    if (rotations.size !== map.booths.length) throw new Error(`Incomplete geometry for map ${map.mapId}.`);
    const artwork = artworkByMapId[map.mapId];
    if (!artwork) throw new Error(`Missing original artwork metadata for map ${map.mapId}.`);
    return {
      id: map.mapId,
      name: map.name,
      shortName: FAIR_LAYOUT_SECTIONS[map.mapId as keyof typeof FAIR_LAYOUT_SECTIONS],
      width: map.width,
      height: map.height,
      imageWidth: artwork.width,
      imageHeight: artwork.height,
      backgroundUrl: `/fair/layouts/fair-floorplan-${map.mapId}.png`,
      annotations: parseFairLayoutAnnotations(html),
      booths: map.booths.map((booth) => {
        const id = `${map.mapId}:${booth.boothId}`;
        boothIdsByLabel.set(booth.label, [...(boothIdsByLabel.get(booth.label) ?? []), id]);
        return { id, label: booth.label, ...booth.bounds, rotationDeg: rotations.get(booth.boothId)!, vendorIds: [] as string[] };
      }),
    };
  });
  const booths = new Map(maps.flatMap((map) => map.booths.map((booth) => [booth.id, booth] as const)));
  const seenVendorIds = new Set<string>();
  const vendors = candidate.eventHub.exhibitors.map((vendor) => {
    if (seenVendorIds.has(vendor.profileId)) throw new Error(`Duplicate exhibitor ${vendor.profileId}.`);
    seenVendorIds.add(vendor.profileId);
    const id = `eventhub-${vendor.profileId}`;
    const boothIds = [...new Set(vendor.booths)].map((label) => {
      const matches = boothIdsByLabel.get(label) ?? [];
      if (matches.length !== 1) throw new Error(`Unresolved or ambiguous booth ${label} for ${id}.`);
      const boothId = matches[0];
      booths.get(boothId)!.vendorIds.push(id);
      return boothId;
    });
    const richProfileId = FAIR_LAYOUT_RICH_PROFILE_IDS[vendor.profileId];
    return { id, profileId: vendor.profileId, name: vendor.name, boothIds, ...(richProfileId ? { richProfileId } : {}) };
  }).sort((left, right) => left.name.localeCompare(right.name));
  return parseFairLayoutData({
    schemaVersion: 1,
    showId: "18209",
    checkedAt: candidate.checkedAt,
    permission: {
      basis: "owner-attestation",
      attestedOn: "2026-09-21",
      scope: "Public exhibitor names, booth assignments, floorplan artwork and image-space geometry.",
    },
    provenance: { guideUrl: FAIR_LAYOUT_GUIDE_URL, collectorCheckedAt: candidate.checkedAt, reviewedAt },
    maps,
    vendors,
  });
}
