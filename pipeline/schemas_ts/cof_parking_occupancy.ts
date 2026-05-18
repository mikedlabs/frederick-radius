import { z } from "zod";

/**
 * SCAFFOLD validator for City of Frederick parking deck occupancy.
 *
 * The live endpoint is NOT confirmed (see data/sources.yaml: this row
 * is pending_review with url null). This shape is a scaffold modeled on
 * the common deck / available / capacity pattern and must be
 * revalidated against the real feed before activation. Everything is
 * optional and `.passthrough()` so the real response, whatever its
 * exact shape, validates and the transform degrades to nulls instead
 * of inventing counts.
 */
const deck = z
  .object({
    name: z.string(),
    available: z.number().nullable().optional(),
    occupied: z.number().nullable().optional(),
    capacity: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    updated: z.string().nullable().optional(),
  })
  .passthrough();

export const schema = z
  .object({
    as_of: z.string().nullable().optional(),
    decks: z.array(deck),
  })
  .passthrough();

export type CofParkingOccupancyRaw = z.infer<typeof schema>;
