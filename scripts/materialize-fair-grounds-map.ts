import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { XMLParser } from "fast-xml-parser";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  Position,
} from "geojson";

type OsmTag = { k: string; v: string };
type OsmNode = {
  id: string;
  lat: string;
  lon: string;
  timestamp?: string;
  tag?: OsmTag | OsmTag[];
};
type OsmWay = {
  id: string;
  timestamp?: string;
  nd?: { ref: string } | Array<{ ref: string }>;
  tag?: OsmTag | OsmTag[];
};

type FairMapKind =
  | "fairgrounds"
  | "gate"
  | "ticket"
  | "restroom"
  | "building"
  | "animal"
  | "stage"
  | "parking";

type FairMapProperties = {
  id: string;
  name: string;
  kind: FairMapKind;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  scheduleAliases: string[];
  anchor: [number, number];
};

type FairGroundsMap = FeatureCollection<Geometry, FairMapProperties> & {
  id: "great-frederick-fair-2026-grounds-map";
  reviewedOn: string;
  source: {
    publisher: "OpenStreetMap contributors";
    url: "https://www.openstreetmap.org/copyright";
    license: "ODbL 1.0";
    snapshotSha256: string;
  };
};

export type FairGroundsMapReviewSet = {
  nodeIds: ReadonlySet<string>;
  wayIds: ReadonlySet<string>;
};

const REVIEWED_FEATURES: FairGroundsMapReviewSet = {
  nodeIds: new Set([
    "14099608925",
    "14099608928",
    "14099608931",
    "14099608935",
    "14099608937",
    "14099608940",
    "14099608957",
    "14099608982",
    "3124269595",
  ]),
  wayIds: new Set([
    "103615596",
    "103615600",
    "103615601",
    "106918950",
    "1548624421",
    "1550204782",
    "1550204781",
    "1550204790",
    "1550204791",
    "1550204795",
    "1550204796",
    "1550204797",
    "305093779",
    "305093780",
    "305093781",
    "307321830",
    "307321832",
    "307321833",
    "307321834",
    "307321838",
    "307321839",
    "307321840",
    "307321841",
    "307321842",
    "307321843",
    "307321844",
    "307321845",
    "307321846",
    "307321847",
    "307321848",
    "307321849",
    "307321850",
    "307321852",
    "307321854",
    "307321855",
  ]),
};

const SCHEDULE_ALIASES: Record<string, string[]> = {
  "way-103615596": ["grandstand"],
  "way-1548624421": [
    "bldg. 28",
    "building 28",
    "small livestock arena",
    "farmer's cooperative small livestock arena",
  ],
  "way-1550204782": [
    "infield",
    "pleasants' horse park",
    "pleasants’ horse park",
    "outdoor equine arena",
    "horse expo tent",
  ],
  "way-307321832": ["bldg. 14a", "building 14a", "farm and garden"],
  "way-307321842": [
    "bldg. 18",
    "building 18",
    "south side tire & auto show arena",
    "south side tire & auto beef show arena",
  ],
  "way-307321846": [
    "bldg. 44",
    "building 44",
    "city streets country roads",
  ],
  "way-307321847": [
    "bldg. 25",
    "building 25",
    "middletown valley bank arena",
  ],
  "way-307321848": ["bldg. 14", "building 14", "poultry and rabbits"],
  "way-307321849": [
    "bldg. 32",
    "building 32",
    "south mt. creamery large arena",
    "large livestock show arena",
  ],
  "way-307321839": ["bldg. 12", "building 12"],
  "way-307321845": ["horse barns", "bldg. 23", "building 23"],
  "way-307321854": ["bldg. 13", "building 13"],
};

const PUBLIC_NAME_OVERRIDES: Record<string, string> = {
  "way-1548624421": "Small Livestock Show Arena",
  "way-1550204782": "Pleasants' Horse Park",
  "way-307321832": "Farm & Garden",
  "way-307321846": "City Streets Country Roads",
  "way-307321847": "Middletown Valley Bank Arena",
  "way-307321848": "Poultry & Rabbits",
  "way-307321849": "Large Livestock Show Arena",
};

const KIND_OVERRIDES: Partial<Record<string, FairMapKind>> = {
  "way-1548624421": "animal",
  "way-1550204782": "animal",
  "way-307321832": "building",
  "way-307321846": "building",
  "way-307321847": "animal",
  "way-307321848": "animal",
  "way-307321849": "animal",
};

const REVIEW_BOUNDS = [-77.401, 39.409, -77.389, 39.418] as const;

function insideReviewBounds([longitude, latitude]: [number, number]): boolean {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= REVIEW_BOUNDS[0] &&
    longitude <= REVIEW_BOUNDS[2] &&
    latitude >= REVIEW_BOUNDS[1] &&
    latitude <= REVIEW_BOUNDS[3]
  );
}

function list<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function tags(value: OsmTag | OsmTag[] | undefined): Record<string, string> {
  return Object.fromEntries(list(value).map((tag) => [tag.k, tag.v]));
}

function mapKind(name: string, entityTags: Record<string, string>): FairMapKind {
  if (name === "Frederick Fairgrounds") return "fairgrounds";
  if (/^(?:Gate \d|Life Member Gate)/i.test(name)) return "gate";
  if (entityTags.shop === "ticket") return "ticket";
  if (
    entityTags.amenity === "toilets" ||
    entityTags.building === "toilets"
  ) {
    return "restroom";
  }
  if (/lot\s+a/i.test(name)) return "parking";
  if (/stage|grandstand/i.test(name)) return "stage";
  if (/barn|livestock|sheep|swine|milking|dairy|tack/i.test(name)) {
    return "animal";
  }
  return "building";
}

function publicName(name: string, kind: FairMapKind): string {
  if (kind === "ticket" && !name) return "Ticket booth";
  if (kind === "restroom" && !name) return "Restroom";
  if (name === "grandstand building 7 and 8") return "Grandstand";
  if (name === "admin building") return "Administration";
  if (name === "4H Building") return "4-H Building";
  return name;
}

function averagePosition(positions: Position[]): [number, number] {
  const unique =
    positions.length > 1 &&
    positions[0][0] === positions.at(-1)?.[0] &&
    positions[0][1] === positions.at(-1)?.[1]
      ? positions.slice(0, -1)
      : positions;
  const [longitude, latitude] = unique.reduce(
    ([longitudeTotal, latitudeTotal], position) => [
      longitudeTotal + position[0],
      latitudeTotal + position[1],
    ],
    [0, 0],
  );
  return [longitude / unique.length, latitude / unique.length];
}

function featureProperties(
  type: "node" | "way",
  id: string,
  name: string,
  kind: FairMapKind,
  timestamp: string | undefined,
  anchor: [number, number],
): FairMapProperties {
  return {
    id: `osm-${type}-${id}`,
    name: publicName(name, kind),
    kind,
    sourceUrl: `https://www.openstreetmap.org/${type}/${id}`,
    sourceUpdatedAt: timestamp ?? null,
    scheduleAliases: SCHEDULE_ALIASES[`${type}-${id}`] ?? [],
    anchor,
  };
}

export function materializeFairGroundsMap(
  xml: string,
  reviewedOn: string,
  reviewSet: FairGroundsMapReviewSet = REVIEWED_FEATURES,
): FairGroundsMap {
  const reviewDate = new Date(`${reviewedOn}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn) ||
    Number.isNaN(reviewDate.getTime()) ||
    reviewDate.toISOString().slice(0, 10) !== reviewedOn
  ) {
    throw new Error("--reviewed-on must be a real YYYY-MM-DD date");
  }
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  }).parse(xml) as {
    osm?: { node?: OsmNode | OsmNode[]; way?: OsmWay | OsmWay[] };
  };
  const nodes = list(parsed.osm?.node);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const features: Array<Feature<Geometry, FairMapProperties>> = [];

  for (const node of nodes) {
    if (!reviewSet.nodeIds.has(node.id)) continue;
    const nodeTags = tags(node.tag);
    const name = nodeTags.name ?? "";
    const isGate = /^(?:Gate [1-6](?:A)?|Life Member Gate)$/i.test(name);
    const isRestroom = nodeTags.amenity === "toilets";
    if (!isGate && !isRestroom) continue;
    const anchor: [number, number] = [Number(node.lon), Number(node.lat)];
    if (!insideReviewBounds(anchor)) continue;
    const kind = mapKind(name, nodeTags);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: anchor },
      properties: featureProperties(
        "node",
        node.id,
        name,
        kind,
        node.timestamp,
        anchor,
      ),
    });
  }

  for (const way of list(parsed.osm?.way)) {
    if (!reviewSet.wayIds.has(way.id)) continue;
    const wayTags = tags(way.tag);
    const sourceId = `way-${way.id}`;
    const name = PUBLIC_NAME_OVERRIDES[sourceId] ?? wayTags.name ?? "";
    const references = list(way.nd);
    if (
      references.length < 3 ||
      references.some((reference) => !nodeById.has(reference.ref))
    ) {
      continue;
    }
    const positions = references.flatMap((reference) => {
      const node = nodeById.get(reference.ref);
      return node ? ([[Number(node.lon), Number(node.lat)]] as Position[]) : [];
    });
    if (
      positions.length < 3 ||
      positions.some(
        (position) =>
          !Number.isFinite(position[0]) || !Number.isFinite(position[1]),
      )
    ) {
      continue;
    }
    if (
      positions[0][0] !== positions.at(-1)?.[0] ||
      positions[0][1] !== positions.at(-1)?.[1]
    ) {
      positions.push([...positions[0]]);
    }
    const kind = KIND_OVERRIDES[sourceId] ?? mapKind(name, wayTags);
    const anchor = averagePosition(positions);
    if (!insideReviewBounds(anchor)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [positions] },
      properties: featureProperties(
        "way",
        way.id,
        name,
        kind,
        way.timestamp,
        anchor,
      ),
    });
  }

  features.sort((left, right) =>
    left.properties.id.localeCompare(right.properties.id),
  );

  if (features.length === 0) {
    throw new Error(
      "The reviewed Fair map contains no usable features; refusing to write an empty artifact.",
    );
  }

  return {
    type: "FeatureCollection",
    id: "great-frederick-fair-2026-grounds-map",
    reviewedOn,
    source: {
      publisher: "OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
      license: "ODbL 1.0",
      snapshotSha256: createHash("sha256").update(xml).digest("hex"),
    },
    features,
  };
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const input = argument("--input");
if (input) {
  const output =
    argument("--output") ??
    "public/data/fair/great-frederick-fair-2026-map.geojson";
  const reviewedOn = argument("--reviewed-on") ?? "2026-09-02";
  const xml = readFileSync(resolve(input), "utf8");
  const map = materializeFairGroundsMap(xml, reviewedOn);
  writeFileSync(resolve(output), `${JSON.stringify(map)}\n`, "utf8");
  process.stdout.write(
    `fair-grounds-map: wrote ${map.features.length} reviewed features to ${output}\n`,
  );
}
