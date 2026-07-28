import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("legacy Apple icon fallbacks", () => {
  it("rewrites both root probes to the canonical generated icon", async () => {
    const configured = await config.rewrites?.();
    const rewrites = Array.isArray(configured)
      ? configured
      : [
          ...(configured?.beforeFiles ?? []),
          ...(configured?.afterFiles ?? []),
          ...(configured?.fallback ?? []),
        ];

    expect(rewrites).toEqual(
      expect.arrayContaining([
        {
          source: "/apple-touch-icon.png",
          destination: "/apple-icon.png",
        },
        {
          source: "/apple-touch-icon-precomposed.png",
          destination: "/apple-icon.png",
        },
      ]),
    );
  });
});
