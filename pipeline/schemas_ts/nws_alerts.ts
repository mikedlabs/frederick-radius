import { z } from "zod";

/**
 * Runtime validator for the NWS active alerts FeatureCollection. Only
 * the alert properties the transform reads are required.
 */
export const schema = z
  .object({
    features: z
      .object({
        properties: z
          .object({
            id: z.string().optional(),
            areaDesc: z.string(),
            event: z.string(),
            severity: z.string().optional(),
            certainty: z.string().optional(),
            urgency: z.string().optional(),
            headline: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            effective: z.string().optional(),
            expires: z.string().optional(),
          })
          .passthrough(),
      })
      .passthrough()
      .array(),
  })
  .passthrough();

export type NwsAlertsRaw = z.infer<typeof schema>;
