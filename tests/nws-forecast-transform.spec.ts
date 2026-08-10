import { describe, expect, it } from "vitest";
import { schema } from "../pipeline/schemas_ts/nws_forecast";
import { transform } from "../transforms/nws_forecast";

const period = {
  startTime: "2026-08-10T07:00:00-04:00",
  temperature: 86,
};

describe("transform(nws_forecast)", () => {
  it("uses the current NWS updateTime when the legacy updated field is absent", () => {
    const raw = {
      properties: {
        generatedAt: "2026-08-10T11:08:59+00:00",
        updateTime: "2026-08-10T08:53:16+00:00",
        periods: [period],
      },
    };

    const parsed = schema.parse(raw);
    const data = transform(parsed).data as { as_of: string | null };

    expect(data.as_of).toBe("2026-08-10T08:53:16.000Z");
  });

  it("falls back to generatedAt without inventing a fetch timestamp", () => {
    const parsed = schema.parse({
      properties: {
        generatedAt: "2026-08-10T11:08:59+00:00",
        periods: [period],
      },
    });
    const data = transform(parsed).data as { as_of: string | null };

    expect(data.as_of).toBe("2026-08-10T11:08:59.000Z");
  });
});
