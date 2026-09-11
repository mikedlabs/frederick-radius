import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/signals", () => {
  it("returns the connected review state without publishing unapproved values", async () => {
    const response = await GET();
    const payload = (await response.json()) as {
      signals: unknown[];
      sourceHealth: Array<{
        status: string;
        acceptedRecords: number;
        lastObservedAt: string | null;
        window: unknown;
      }>;
      quality: {
        inputRecords: number;
        acceptedRecords: number;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.signals).toEqual([]);
    expect(payload.sourceHealth[0]).toMatchObject({
      status: "review-required",
      acceptedRecords: 0,
      lastObservedAt: null,
      window: null,
    });
    expect(payload.quality).toMatchObject({
      inputRecords: 0,
      acceptedRecords: 0,
    });
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
  });
});
