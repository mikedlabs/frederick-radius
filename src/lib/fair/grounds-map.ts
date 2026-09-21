import { z } from "zod";

export const FAIR_GROUNDS_MAP_URL =
  "/data/fair/great-frederick-fair-2026-map.geojson";

export const fairGroundsMapKindSchema = z.enum([
  "fairgrounds",
  "gate",
  "ticket",
  "restroom",
  "building",
  "animal",
  "stage",
  "parking",
  "service",
  "transit",
]);

export const fairGroundsMapFilterSchema = z.enum([
  "essentials",
  "animals",
  "buildings",
  "arrival",
  "food",
]);

const informationSourceSchema = z
  .object({
    publisher: z.string().trim().min(2).max(80),
    title: z.string().trim().min(2).max(120),
    url: z.string().url().startsWith("https://"),
    checkedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const coordinateSchema = z.tuple([
  z.number().finite().min(-77.41).max(-77.38),
  z.number().finite().min(39.4).max(39.43),
]);

const propertiesSchema = z
  .object({
    id: z
      .string()
      .regex(/^(?:osm-(?:node|way)-\d+|fair-(?:arrival|service)-[a-z0-9-]+|transit-stop-\d+)$/),
    name: z.string().trim().min(2).max(100),
    kind: fairGroundsMapKindSchema,
    sourceUrl: z.string().url().startsWith("https://"),
    sourceUpdatedAt: z.string().datetime({ offset: true }).nullable(),
    scheduleAliases: z.array(z.string().trim().min(2).max(80)).max(8),
    anchor: coordinateSchema,
    detail: z.string().trim().min(2).max(360).optional(),
    keywords: z.array(z.string().trim().min(2).max(80)).max(24).optional(),
    informationSource: informationSourceSchema.optional(),
    locationPrecision: z
      .enum(["mapped-feature", "official-pin", "published-area", "static-transit-stop"])
      .optional(),
    directionsEnabled: z.boolean().optional(),
    filterIds: z.array(fairGroundsMapFilterSchema).max(3).optional(),
  })
  .strict()
  .superRefine((properties, context) => {
    if (
      properties.id.startsWith("osm-") &&
      !properties.sourceUrl.startsWith("https://www.openstreetmap.org/")
    ) {
      context.addIssue({
        code: "custom",
        message: "OpenStreetMap feature ids must link to their OpenStreetMap source",
        path: ["sourceUrl"],
      });
    }
    if (!properties.id.startsWith("osm-") && !properties.informationSource) {
      context.addIssue({
        code: "custom",
        message: "Non-OpenStreetMap features require a checked information source",
        path: ["informationSource"],
      });
    }
  });

const pointFeatureSchema = z
  .object({
    type: z.literal("Feature"),
    geometry: z
      .object({ type: z.literal("Point"), coordinates: coordinateSchema })
      .strict(),
    properties: propertiesSchema,
  })
  .strict();

const polygonFeatureSchema = z
  .object({
    type: z.literal("Feature"),
    geometry: z
      .object({
        type: z.literal("Polygon"),
        coordinates: z.array(z.array(coordinateSchema).min(4)).min(1),
      })
      .strict(),
    properties: propertiesSchema,
  })
  .strict();

export const fairGroundsMapSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    id: z.literal("great-frederick-fair-2026-grounds-map"),
    reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z
      .object({
        publisher: z.literal("OpenStreetMap contributors"),
        url: z.literal("https://www.openstreetmap.org/copyright"),
        license: z.literal("ODbL 1.0"),
        snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    features: z.array(z.union([pointFeatureSchema, polygonFeatureSchema])).min(1),
  })
  .strict()
  .superRefine((map, context) => {
    const ids = new Set<string>();
    map.features.forEach((feature, index) => {
      if (ids.has(feature.properties.id)) {
        context.addIssue({
          code: "custom",
          message: "Fair map feature ids must be unique",
          path: ["features", index, "properties", "id"],
        });
      }
      ids.add(feature.properties.id);
      if (
        feature.geometry.type === "Polygon" &&
        feature.geometry.coordinates.some((ring) => {
          const first = ring[0];
          const last = ring.at(-1);
          return first[0] !== last?.[0] || first[1] !== last?.[1];
        })
      ) {
        context.addIssue({
          code: "custom",
          message: "Fair map polygon rings must be closed",
          path: ["features", index, "geometry", "coordinates"],
        });
      }
    });
  });

export type FairGroundsMap = z.infer<typeof fairGroundsMapSchema>;
export type FairGroundsMapFeature = FairGroundsMap["features"][number];
export type FairGroundsMapKind = z.infer<typeof fairGroundsMapKindSchema>;
export type FairGroundsMapFilter = z.infer<typeof fairGroundsMapFilterSchema>;
export type FairGroundsMapView = FairGroundsMapFilter | "program";

export type FairGroundsMapFeaturePatch = {
  targetId: string;
  properties: Partial<
    Pick<
      FairGroundsMapFeature["properties"],
      | "name"
      | "scheduleAliases"
      | "anchor"
      | "detail"
      | "keywords"
      | "informationSource"
      | "locationPrecision"
      | "directionsEnabled"
      | "filterIds"
    >
  >;
};

export function parseFairGroundsMap(candidate: unknown): FairGroundsMap {
  return fairGroundsMapSchema.parse(candidate);
}

export function enrichFairGroundsMap(
  map: FairGroundsMap,
  patches: readonly FairGroundsMapFeaturePatch[],
  additions: readonly FairGroundsMapFeature[],
): FairGroundsMap {
  const patchById = new Map(patches.map((patch) => [patch.targetId, patch]));
  if (patchById.size !== patches.length) {
    throw new Error("Fair map feature patches must target unique ids");
  }

  const knownIds = new Set(map.features.map((feature) => feature.properties.id));
  for (const targetId of patchById.keys()) {
    if (!knownIds.has(targetId)) {
      throw new Error(`Fair map feature patch targets missing id: ${targetId}`);
    }
  }

  return parseFairGroundsMap({
    ...map,
    features: [
      ...map.features.map((feature) => {
        const patch = patchById.get(feature.properties.id);
        return patch
          ? {
              ...feature,
              properties: {
                ...feature.properties,
                ...patch.properties,
              },
            }
          : feature;
      }),
      ...additions,
    ],
  });
}

export function fairGroundsFeatureMatchesFilter(
  feature: FairGroundsMapFeature,
  filter: FairGroundsMapFilter,
): boolean {
  // Reviewed booth coordinates belong to the separate schematic vendor map,
  // not geographic positions. Never use the grounds boundary as a food pin.
  if (filter === "food") return false;
  if (feature.properties.kind === "fairgrounds") return true;
  if (feature.properties.filterIds?.includes(filter)) return true;
  if (filter === "essentials") {
    return ["gate", "ticket", "restroom", "stage", "service"].includes(
      feature.properties.kind,
    );
  }
  if (filter === "animals") return feature.properties.kind === "animal";
  if (filter === "buildings") return feature.properties.kind === "building";
  return ["parking", "transit"].includes(feature.properties.kind);
}

function normalizedLocation(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/^published place:\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function fairGroundsFeatureMatchesPlace(
  feature: FairGroundsMapFeature,
  placeLabel: string,
): boolean {
  const location = ` ${normalizedLocation(placeLabel)} `;
  return feature.properties.scheduleAliases.some((alias) =>
    location.includes(` ${normalizedLocation(alias)} `),
  );
}

/**
 * Resolve only a single reviewed venue match. Multiple matches stay unresolved
 * so a program-to-map handoff can never guess which marker a visitor needs.
 */
export function resolveFairGroundsFeatureId(
  features: readonly FairGroundsMapFeature[],
  candidateStrings: readonly string[],
): string | null {
  const matches = features.filter((feature) =>
    candidateStrings.some((candidate) =>
      fairGroundsFeatureMatchesPlace(feature, candidate),
    ),
  );
  return matches.length === 1 ? matches[0].properties.id : null;
}

export function fairGroundsMapKindLabel(kind: FairGroundsMapKind): string {
  return {
    fairgrounds: "Fairgrounds",
    gate: "Gate",
    ticket: "Ticket booth",
    restroom: "Restroom",
    building: "Fair building",
    animal: "Animal area",
    stage: "Show area",
    parking: "Parking",
    service: "Guest service",
    transit: "Transit stop",
  }[kind];
}
