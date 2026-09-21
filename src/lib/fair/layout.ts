import { z } from "zod";

export const FAIR_LAYOUT_URL = "/fair/layouts/great-frederick-fair-2026.json";
export const FAIR_LAYOUT_GUIDE_URL = "https://mobile.eventhub-floorplan.net/?Show_ID=18209";

const sourceId = z.string().regex(/^\d+$/);
const boothId = z.string().regex(/^\d+:\d+$/);
const vendorId = z.string().regex(/^eventhub-\d+$/);
const dimension = z.number().finite().positive().max(20_000);
const position = z.number().finite().nonnegative().max(20_000);
const text = z.string().trim().min(1).max(300);

const boothSchema = z.object({
  id: boothId,
  // One official source rectangle is unlabeled. Never invent its booth number.
  label: z.string().trim().max(300),
  x: position,
  y: position,
  width: dimension,
  height: dimension,
  // The publisher rotates around the rectangle's top-left corner.
  rotationDeg: z.number().finite().min(-360).max(360),
  vendorIds: z.array(vendorId).max(100),
}).strict();

const vendorSchema = z.object({
  id: vendorId,
  profileId: sourceId,
  name: text,
  boothIds: z.array(boothId).min(1).max(1_000),
  richProfileId: z.string().regex(/^vendor-[a-z0-9-]+$/).optional(),
}).strict();

const mapSchema = z.object({
  id: sourceId,
  name: text,
  shortName: text,
  width: dimension,
  height: dimension,
  imageWidth: dimension,
  imageHeight: dimension,
  // Only same-origin reviewed assets can enter the public renderer.
  backgroundUrl: z.string().regex(/^\/fair\/layouts\/[a-z0-9-]+\.(png|jpg|webp)$/),
  annotations: z.array(z.object({
    text,
    x: position,
    y: position,
    rotationDeg: z.number().finite().min(-360).max(360),
    // Zero-sized source labels stay invisible; they are not enlarged into claims.
    fontSize: z.number().finite().nonnegative().max(200),
  }).strict()).max(100).optional(),
  booths: z.array(boothSchema).min(1).max(2_000),
}).strict();

export const fairLayoutSchema = z.object({
  schemaVersion: z.literal(1),
  showId: z.literal("18209"),
  checkedAt: z.string().datetime(),
  permission: z.object({
    basis: z.literal("owner-attestation"),
    attestedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scope: text,
  }).strict(),
  provenance: z.object({
    guideUrl: z.literal(FAIR_LAYOUT_GUIDE_URL),
    collectorCheckedAt: z.string().datetime(),
    reviewedAt: z.string().datetime(),
  }).strict(),
  maps: z.array(mapSchema).min(1).max(12),
  vendors: z.array(vendorSchema).min(1).max(2_000),
}).strict().superRefine((data, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const mapIds = new Set<string>();
  const booths = new Map<string, z.infer<typeof boothSchema>>();
  const vendors = new Map<string, z.infer<typeof vendorSchema>>();
  for (const map of data.maps) {
    if (mapIds.has(map.id)) fail(`Duplicate map ${map.id}.`);
    mapIds.add(map.id);
    for (const booth of map.booths) {
      if (!booth.id.startsWith(`${map.id}:`)) fail(`Booth ${booth.id} belongs to another map.`);
      if (booths.has(booth.id)) fail(`Duplicate booth ${booth.id}.`);
      if (booth.x + booth.width > map.width + 1 || booth.y + booth.height > map.height + 1) {
        fail(`Booth ${booth.id} exceeds its source canvas.`);
      }
      if (new Set(booth.vendorIds).size !== booth.vendorIds.length) fail(`Duplicate vendor reference on ${booth.id}.`);
      booths.set(booth.id, booth);
    }
  }
  for (const vendor of data.vendors) {
    if (vendors.has(vendor.id)) fail(`Duplicate vendor ${vendor.id}.`);
    if (vendor.id !== `eventhub-${vendor.profileId}`) fail(`Vendor ${vendor.id} has an inconsistent profile ID.`);
    if (new Set(vendor.boothIds).size !== vendor.boothIds.length) fail(`Duplicate booth reference on ${vendor.id}.`);
    vendors.set(vendor.id, vendor);
  }
  for (const vendor of data.vendors) {
    for (const id of vendor.boothIds) {
      if (!booths.get(id)?.vendorIds.includes(vendor.id)) fail(`Unresolved booth ${id} for ${vendor.id}.`);
    }
  }
  for (const booth of booths.values()) {
    for (const id of booth.vendorIds) {
      if (!vendors.get(id)?.boothIds.includes(booth.id)) fail(`Unresolved vendor ${id} for ${booth.id}.`);
    }
  }
});

type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
export type FairLayoutBooth = DeepReadonly<z.infer<typeof boothSchema>>;
export type FairLayoutVendor = DeepReadonly<z.infer<typeof vendorSchema>>;
export type FairLayoutMap = DeepReadonly<z.infer<typeof mapSchema>>;
export type FairLayoutData = DeepReadonly<z.infer<typeof fairLayoutSchema>>;

/** Validate the network boundary before rendering source artwork or booth data. */
export function parseFairLayoutData(input: unknown): FairLayoutData {
  return fairLayoutSchema.parse(input);
}

export function findFairLayoutBooth(data: FairLayoutData, id: string): { map: FairLayoutMap; booth: FairLayoutBooth } | undefined {
  for (const map of data.maps) {
    const booth = map.booths.find((item) => item.id === id);
    if (booth) return { map, booth };
  }
  return undefined;
}

function searchText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Search names and official booth labels across all sections, without guessed categories. */
export function searchFairLayoutVendors(data: FairLayoutData, query: string): FairLayoutVendor[] {
  const terms = searchText(query).split(" ").filter((term) => term && term !== "booth" && term !== "booths");
  if (!terms.length) return [...data.vendors];
  const labels = new Map(data.maps.flatMap((map) => map.booths.map((booth) => [booth.id, booth.label] as const)));
  return data.vendors.filter((vendor) => {
    const boothLabels = vendor.boothIds.map((id) => searchText(labels.get(id) ?? ""));
    const haystack = searchText(`${vendor.name} ${boothLabels.join(" ")}`);
    return terms.every((term) => /^\d+$/.test(term) ? boothLabels.includes(term) : haystack.includes(term));
  });
}
