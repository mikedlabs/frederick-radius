import { z } from "zod";

/**
 * Runtime validator for the parsed Frederick County TransIT GTFS feed.
 *
 * The worker unzips the static GTFS and hands the transform the parsed
 * routes.txt and stops.txt rows. Only the GTFS primary keys are
 * required; everything else is optional and `.passthrough()` keeps
 * unknown GTFS columns so a spec-compliant feed never fails validation.
 */
const route = z
  .object({
    route_id: z.string(),
    route_short_name: z.string().nullable().optional(),
    route_long_name: z.string().nullable().optional(),
    route_type: z.union([z.number(), z.string()]).nullable().optional(),
    route_color: z.string().nullable().optional(),
    route_text_color: z.string().nullable().optional(),
  })
  .passthrough();

const stop = z
  .object({
    stop_id: z.string(),
    stop_code: z.string().nullable().optional(),
    stop_name: z.string().nullable().optional(),
    stop_lat: z.union([z.number(), z.string()]).nullable().optional(),
    stop_lon: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export const schema = z
  .object({
    routes: z.array(route),
    stops: z.array(stop),
  })
  .passthrough();

export type FcTransitGtfsRaw = z.infer<typeof schema>;
