import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("legacy tools route", () => {
  it("sends /tools to the intent-led Compass workspace", async () => {
    const redirects = await config.redirects?.();
    expect(redirects).toContainEqual({
      source: "/tools",
      destination: "/compass",
      permanent: true,
    });
  });
});
