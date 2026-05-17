import { z } from "zod";

/**
 * Runtime validator for the City of Frederick Tax Parcel layer queried
 * as GeoJSON. Geometry passes through untouched because parcels are
 * polygons and the transform keeps the source geometry. Only the
 * property fields the transform reads are named; ArcGIS adds many more.
 */
export const schema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .object({
        type: z.literal("Feature"),
        geometry: z.unknown(),
        properties: z
          .object({
            TAX_ACCT: z.string().nullable().optional(),
            ACCT: z.string().nullable().optional(),
            PIN: z.string().nullable().optional(),
            ADDRESS: z.string().nullable().optional(),
            ZONING: z.string().nullable().optional(),
            OVERLAY_1: z.string().nullable().optional(),
            OVERLAY_2: z.string().nullable().optional(),
            LandUse: z.string().nullable().optional(),
            CALC_ACRE: z.number().nullable().optional(),
            Sub: z.string().nullable().optional(),
            NAC: z.string().nullable().optional(),
            ElectionDistrict: z.number().nullable().optional(),
            ELEM_DIST: z.string().nullable().optional(),
            MID_DIST: z.string().nullable().optional(),
            HIGH_DIST: z.string().nullable().optional(),
          })
          .passthrough(),
      })
      .passthrough()
      .array(),
  })
  .passthrough();

export type CofParcelsRaw = z.infer<typeof schema>;
