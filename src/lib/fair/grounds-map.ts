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
]);

const coordinateSchema = z.tuple([
  z.number().finite().min(-77.41).max(-77.38),
  z.number().finite().min(39.4).max(39.43),
]);

const propertiesSchema = z
  .object({
    id: z.string().regex(/^osm-(?:node|way)-\d+$/),
    name: z.string().trim().min(2).max(100),
    kind: fairGroundsMapKindSchema,
    sourceUrl: z.string().url().startsWith("https://www.openstreetmap.org/"),
    sourceUpdatedAt: z.string().datetime({ offset: true }).nullable(),
    scheduleAliases: z.array(z.string().trim().min(2).max(80)).max(8),
    anchor: coordinateSchema,
  })
  .strict();

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
export type FairGroundsMapFilter =
  | "essentials"
  | "animals"
  | "buildings"
  | "parking";

export function parseFairGroundsMap(candidate: unknown): FairGroundsMap {
  return fairGroundsMapSchema.parse(candidate);
}

export function fairGroundsFeatureMatchesFilter(
  feature: FairGroundsMapFeature,
  filter: FairGroundsMapFilter,
): boolean {
  if (feature.properties.kind === "fairgrounds") return true;
  if (filter === "essentials") {
    return ["gate", "ticket", "restroom", "stage"].includes(
      feature.properties.kind,
    );
  }
  if (filter === "animals") return feature.properties.kind === "animal";
  if (filter === "buildings") return feature.properties.kind === "building";
  return feature.properties.kind === "parking";
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
  }[kind];
}
