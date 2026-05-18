import { z } from "zod";

/**
 * Runtime validator for the USDA Local Food Portal farmers market feed
 * (https://www.usdalocalfoodportal.com/api/farmersmarket/).
 *
 * The response is an object with a `data` array. Only the listing id is
 * required; coordinates arrive as strings under USDA's location_x
 * (longitude) and location_y (latitude) convention. Everything is
 * optional and `.passthrough()` keeps unknown columns so an upstream
 * addition does not fail validation.
 */
const market = z
  .object({
    listing_id: z.union([z.string(), z.number()]),
    listing_name: z.string().nullable().optional(),
    location_address: z.string().nullable().optional(),
    location_x: z.union([z.number(), z.string()]).nullable().optional(),
    location_y: z.union([z.number(), z.string()]).nullable().optional(),
    listing_desc: z.string().nullable().optional(),
    media_website: z.string().nullable().optional(),
    contact_phone: z.string().nullable().optional(),
    updatetime: z.string().nullable().optional(),
  })
  .passthrough();

export const schema = z
  .object({
    data: z.array(market),
  })
  .passthrough();

export type UsdaFarmersMarketsRaw = z.infer<typeof schema>;
