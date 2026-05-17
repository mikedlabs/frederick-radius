import { z } from "zod";

/**
 * Runtime validator for the CHART incident feed. The casing of CHART
 * fields has changed before, so every field is optional and the object
 * passes through unknown keys. The transform is responsible for
 * rejecting rows that lack usable coordinates.
 */
export const schema = z
  .object({
    Id: z.union([z.string(), z.number()]).optional(),
    EventType: z.string().optional(),
    Description: z.string().optional(),
    County: z.string().optional(),
    Road: z.string().optional(),
    Direction: z.string().optional(),
    Location: z.string().optional(),
    Lat: z.union([z.string(), z.number()]).optional(),
    Lng: z.union([z.string(), z.number()]).optional(),
    Long: z.union([z.string(), z.number()]).optional(),
    Started: z.string().optional(),
    EstimatedClearance: z.string().optional(),
    Severity: z.string().optional(),
    LanesAffected: z.string().optional(),
  })
  .passthrough()
  .array();

export type MdotChartRaw = z.infer<typeof schema>;
