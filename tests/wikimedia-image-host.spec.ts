import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("Wikimedia photo rendering", () => {
  it("allows Commons thumbnails returned by Wikipedia without broadening to arbitrary hosts", () => {
    expect(config.images?.remotePatterns).toContainEqual({
      protocol: "https",
      hostname: "thumb.wikimedia.org",
      pathname: "/wikipedia/commons/**",
    });
  });
});
