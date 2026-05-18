import { z } from "zod";

/**
 * Runtime validator for the Aviation Weather Center METAR JSON feed
 * (https://aviationweather.gov/api/data/metar?ids=KFDK&format=json).
 *
 * The endpoint returns an array of observations. Only the station id is
 * structurally required; every measured field is optional and nullable
 * because a sensor that did not report a value must become null, never
 * a fabricated reading. `.passthrough()` keeps unknown fields so an
 * upstream addition does not fail validation.
 */
const cloud = z
  .object({
    cover: z.string().nullable().optional(),
    base: z.number().nullable().optional(),
  })
  .passthrough();

export const schema = z
  .object({
    icaoId: z.string(),
    obsTime: z.number().nullable().optional(),
    reportTime: z.string().nullable().optional(),
    receiptTime: z.string().nullable().optional(),
    temp: z.number().nullable().optional(),
    dewp: z.number().nullable().optional(),
    wdir: z.union([z.number(), z.string()]).nullable().optional(),
    wspd: z.number().nullable().optional(),
    wgst: z.number().nullable().optional(),
    visib: z.union([z.number(), z.string()]).nullable().optional(),
    altim: z.number().nullable().optional(),
    slp: z.number().nullable().optional(),
    wxString: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    lat: z.number().nullable().optional(),
    lon: z.number().nullable().optional(),
    elev: z.number().nullable().optional(),
    rawOb: z.string().nullable().optional(),
    mostRecent: z.number().nullable().optional(),
    clouds: z.array(cloud).nullable().optional(),
  })
  .passthrough()
  .array();

export type KfdkMetarsRaw = z.infer<typeof schema>;
