import { z } from "zod";

/**
 * Runtime validator for the Open Brewery DB v1 response. It mirrors
 * schemas/open_brewery_db.json. passthrough is used because the API
 * adds fields the transform does not read, and cosmetic additions
 * should not fail validation.
 */
export const schema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    brewery_type: z.string().optional(),
    address_1: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state_province: z.string().nullable().optional(),
    postal_code: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    longitude: z.union([z.string(), z.number()]).nullable().optional(),
    latitude: z.union([z.string(), z.number()]).nullable().optional(),
    phone: z.string().nullable().optional(),
    website_url: z.string().nullable().optional(),
  })
  .passthrough()
  .array();

export type OpenBreweryDbRaw = z.infer<typeof schema>;
