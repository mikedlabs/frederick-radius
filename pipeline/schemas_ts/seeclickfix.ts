import { z } from "zod";

/**
 * Runtime validator for the SeeClickFix v2 issues response. The fields
 * the transform depends on are required; everything else is optional
 * and unknown keys pass through.
 */
export const schema = z
  .object({
    issues: z
      .object({
        id: z.number(),
        summary: z.string().optional(),
        description: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        lat: z.number(),
        lng: z.number(),
        status: z.string(),
        request_type: z
          .object({ title: z.string().optional() })
          .passthrough()
          .nullable()
          .optional(),
        created_at: z.string(),
        url: z.string().optional(),
        html_url: z.string().optional(),
      })
      .passthrough()
      .array(),
  })
  .passthrough();

export type SeeClickFixRaw = z.infer<typeof schema>;
