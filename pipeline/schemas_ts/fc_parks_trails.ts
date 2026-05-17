import { z } from "zod";

/**
 * Runtime validator for the Frederick County "Parks Trails -Cartegraph"
 * FeatureServer layer (layer 0) queried as GeoJSON with outSR=4326.
 *
 * Field names are the EXACT ArcGIS attribute names confirmed from the
 * live layer metadata (not aliases, not guessed) — see
 * gis.frederickco.gov/.../Parks_Trails_Cartegraph/FeatureServer/0.
 * Geometry is esriGeometryPolyline and passes through untouched. Only
 * the fields the transform reads are named; ArcGIS adds many more, so
 * the objects passthrough.
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
            OBJECTID: z.number().nullable().optional(),
            Trail_Name: z.string().nullable().optional(),
            Park_Name: z.string().nullable().optional(),
            Trail_System: z.string().nullable().optional(),
            Trail_Desc: z.string().nullable().optional(),
            Status: z.string().nullable().optional(),
            ADA_Accessible: z.string().nullable().optional(),
            Hiking: z.string().nullable().optional(),
            Road_Cycling: z.string().nullable().optional(),
            Mtn_Biking: z.string().nullable().optional(),
            eBikes: z.string().nullable().optional(),
            Equestrian: z.string().nullable().optional(),
            Dogs_Allowed: z.string().nullable().optional(),
            Motorcycles: z.string().nullable().optional(),
            Surface_Type: z.string().nullable().optional(),
            Paved: z.string().nullable().optional(),
            Trail_Length_FT: z.number().nullable().optional(),
            Trail_SkillLevel: z.string().nullable().optional(),
            Trail_Type: z.string().nullable().optional(),
            Owned_By: z.string().nullable().optional(),
            Maintained_By: z.string().nullable().optional(),
            Notes: z.string().nullable().optional(),
          })
          .passthrough(),
      })
      .passthrough()
      .array(),
  })
  .passthrough();

export type FcParksTrailsRaw = z.infer<typeof schema>;
