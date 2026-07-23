import { z } from "zod";

const event = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    incidentType: z.string().optional(),
    description: z.string().optional(),
    name: z.string().optional(),
    county: z.string().optional(),
    direction: z.string().optional(),
    lat: z.union([z.string(), z.number()]).optional(),
    lon: z.union([z.string(), z.number()]).optional(),
    startDateTime: z.union([z.string(), z.number()]).optional(),
    lanesStatus: z.string().optional(),
    closed: z.boolean().optional(),
    trafficAlert: z.boolean().optional(),
    additionalData: z
      .object({
        actionTypes: z
          .array(
            z.object({ actionType: z.string().optional() }).passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** CHART's current export wraps the statewide event array under `data`. */
export const schema = z
  .object({
    data: z.array(event),
  })
  .passthrough();

export type MdotChartRaw = z.infer<typeof schema>;
