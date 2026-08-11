import { z } from "zod";

/**
 * Runtime validator for the resolved NWS forecast document. The worker
 * follows properties.forecast from the points response first, so this
 * validates the forecast itself.
 */
export const schema = z
  .object({
    properties: z
      .object({
        updated: z.string().optional(),
        generatedAt: z.string().optional(),
        updateTime: z.string().optional(),
        periods: z
          .object({
            number: z.number().optional(),
            name: z.string().optional(),
            startTime: z.string(),
            endTime: z.string().optional(),
            isDaytime: z.boolean().optional(),
            temperature: z.number(),
            temperatureUnit: z.string().optional(),
            windSpeed: z.string().optional(),
            windDirection: z.string().optional(),
            shortForecast: z.string().optional(),
            detailedForecast: z.string().optional(),
            icon: z.string().optional(),
            probabilityOfPrecipitation: z
              .object({ value: z.number().nullable() })
              .passthrough()
              .nullable()
              .optional(),
          })
          .passthrough()
          .array(),
      })
      .passthrough(),
  })
  .passthrough();

export type NwsForecastRaw = z.infer<typeof schema>;
